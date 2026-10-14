import { describe, expect, it, vi } from 'vitest';
import {
  AUDIO_DEFAULT_VOLUME,
  AUDIO_MAX_VOICES_PER_TYPE,
  AUDIO_PAN_MAX,
  AUDIO_RADIO_HIGH_HZ,
  AUDIO_RADIO_LOW_HZ,
  SFX_WHISTLE_LONG,
  SFX_WHISTLE_SHORT,
} from '../src/config/constants';
import { AudioManager, masterGainFor, panForX } from '../src/audio/AudioManager';
import { AUDIO_STORAGE_KEY, loadAudioSettings, normalizeVolume, saveAudioSettings } from '../src/audio/settings';
import type { SettingsStorage } from '../src/audio/settings';
import { softClipCurve, whistleSegments } from '../src/audio/synth';
import { VoiceLimiter } from '../src/audio/voices';
import type { SoundCue } from '../src/sim/sound';

// ---------------------------------------------------------------------------
// AudioContext falso, com as mesmas restrições do real que podem lançar exceção.
// ---------------------------------------------------------------------------

function finite(v: number, what: string): void {
  if (!Number.isFinite(v)) throw new TypeError(`${what}: valor não finito ${v}`);
}

class FakeParam {
  value = 0;
  events: [string, number, number][] = [];
  setValueAtTime(v: number, t: number): this {
    finite(v, 'setValueAtTime');
    finite(t, 'setValueAtTime t');
    this.events.push(['set', v, t]);
    return this;
  }
  linearRampToValueAtTime(v: number, t: number): this {
    finite(v, 'linearRamp');
    finite(t, 'linearRamp t');
    this.events.push(['lin', v, t]);
    return this;
  }
  exponentialRampToValueAtTime(v: number, t: number): this {
    finite(v, 'expRamp');
    finite(t, 'expRamp t');
    if (v <= 0) throw new RangeError('rampa exponencial até 0 ou negativo');
    this.events.push(['exp', v, t]);
    return this;
  }
  setTargetAtTime(v: number, t: number, c: number): this {
    finite(v, 'setTarget');
    finite(t, 'setTarget t');
    finite(c, 'setTarget c');
    this.events.push(['target', v, t]);
    return this;
  }
  cancelScheduledValues(t: number): this {
    finite(t, 'cancel');
    return this;
  }
}

class FakeNode {
  readonly outputs: unknown[] = [];
  connect<T>(n: T): T {
    if (n === undefined || n === null) throw new TypeError('connect sem destino');
    this.outputs.push(n);
    return n;
  }
  disconnect(): void {}
}

class FakeSource extends FakeNode {
  started: number | null = null;
  stops: number[] = [];
  constructor(private readonly ctx: FakeContext) {
    super();
    ctx.sources.push(this);
  }
  start(t = 0): void {
    finite(t, 'start');
    if (this.started !== null) throw new Error('InvalidStateError: start duas vezes');
    this.started = t;
  }
  stop(t = 0): void {
    finite(t, 'stop');
    if (this.started === null) throw new Error('InvalidStateError: stop antes de start');
    this.stops.push(t);
  }
  get ctxTime(): number {
    return this.ctx.currentTime;
  }
}

class FakeOsc extends FakeSource {
  type = 'sine';
  frequency = new FakeParam();
  detune = new FakeParam();
}

class FakeBufferSource extends FakeSource {
  buffer: unknown = null;
  loop = false;
}

class FakeGain extends FakeNode {
  gain = new FakeParam();
}

class FakeFilter extends FakeNode {
  type = 'lowpass';
  frequency = new FakeParam();
  Q = new FakeParam();
}

class FakePanner extends FakeNode {
  pan = new FakeParam();
}

class FakeShaper extends FakeNode {
  curve: Float32Array | null = null;
  oversample = 'none';
}

class FakeContext {
  state: 'running' | 'suspended' = 'running';
  currentTime = 0;
  sampleRate = 8000;
  destination = new FakeNode();
  sources: FakeSource[] = [];
  filters: FakeFilter[] = [];
  panners: FakePanner[] = [];
  gains: FakeGain[] = [];
  resumed = 0;
  createOscillator(): FakeOsc {
    return new FakeOsc(this);
  }
  createBufferSource(): FakeBufferSource {
    return new FakeBufferSource(this);
  }
  createGain(): FakeGain {
    const g = new FakeGain();
    g.gain.value = 1;
    this.gains.push(g);
    return g;
  }
  createBiquadFilter(): FakeFilter {
    const f = new FakeFilter();
    this.filters.push(f);
    return f;
  }
  createWaveShaper(): FakeShaper {
    return new FakeShaper();
  }
  createStereoPanner(): FakePanner {
    const p = new FakePanner();
    this.panners.push(p);
    return p;
  }
  createBuffer(_channels: number, length: number): { getChannelData: () => Float32Array } {
    const data = new Float32Array(length);
    return { getChannelData: () => data };
  }
  resume(): Promise<void> {
    this.resumed++;
    this.state = 'running';
    return Promise.resolve();
  }
}

class MemoryStorage implements SettingsStorage {
  data = new Map<string, string>();
  getItem(k: string): string | null {
    return this.data.get(k) ?? null;
  }
  setItem(k: string, v: string): void {
    this.data.set(k, v);
  }
}

/** Alvo de eventos falso (janela): guarda os ouvintes para disparar teclas e cliques. */
class FakeTarget {
  handlers = new Map<string, ((e: Event) => void)[]>();
  addEventListener(type: string, fn: (e: Event) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: (e: Event) => void): void {
    this.handlers.set(type, (this.handlers.get(type) ?? []).filter((h) => h !== fn));
  }
  fire(type: string, e: Partial<KeyboardEvent> = {}): void {
    for (const h of this.handlers.get(type) ?? []) h(e as Event);
  }
}

function setup(storage: SettingsStorage | null = new MemoryStorage()) {
  const ctx = new FakeContext();
  const factory = vi.fn(() => ctx as unknown as AudioContext);
  const audio = new AudioManager(factory, storage);
  return { ctx, factory, audio };
}

const ALL_CUES: SoundCue[] = [
  { type: 'kick', x: 3, power: 0 },
  { type: 'kick', x: 20, power: 1 },
  { type: 'pass', x: 35 },
  { type: 'whistle', x: 20, pattern: 'short' },
  { type: 'whistle', x: 20, pattern: 'double' },
  { type: 'whistle', x: 20, pattern: 'final' },
  { type: 'goal', x: 40 },
  { type: 'save', x: 0 },
];

// ---------------------------------------------------------------------------

describe('AudioManager', () => {
  it('nada toca antes do primeiro gesto; o gesto cria um único contexto com o rádio antigo', () => {
    const { ctx, factory, audio } = setup();
    audio.playSound({ type: 'kick', x: 20, power: 1 });
    expect(factory).not.toHaveBeenCalled();
    expect(ctx.sources).toHaveLength(0);
    const win = new FakeTarget();
    audio.attach(win);
    win.fire('keydown', { code: 'KeyA', repeat: false });
    win.fire('pointerdown');
    expect(factory).toHaveBeenCalledTimes(1);
    const types = ctx.filters.map((f) => [f.type, f.frequency.value]);
    expect(types).toContainEqual(['highpass', AUDIO_RADIO_LOW_HZ]);
    expect(types).toContainEqual(['lowpass', AUDIO_RADIO_HIGH_HZ]);
    expect(audio.running).toBe(true);
  });

  it('contexto suspenso é retomado no gesto seguinte e não toca enquanto suspenso', () => {
    const { ctx, audio } = setup();
    audio.unlock();
    ctx.state = 'suspended';
    audio.playSound({ type: 'pass', x: 20 });
    expect(ctx.sources).toHaveLength(0);
    audio.unlock();
    expect(ctx.resumed).toBe(1);
    audio.playSound({ type: 'pass', x: 20 });
    expect(ctx.sources.length).toBeGreaterThan(0);
  });

  it('todos os sons montam sem erro, com parâmetros válidos, e cada fonte começa e para', () => {
    const { ctx, audio } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    audio.unlock();
    for (const cue of ALL_CUES) {
      ctx.currentTime += 10; // sem limite de vozes entre eles
      const before = ctx.sources.length;
      audio.playSound(cue);
      const made = ctx.sources.slice(before);
      expect(made.length, cue.type).toBeGreaterThan(0);
      for (const s of made) {
        expect(s.started).not.toBeNull();
        expect(s.stops.length).toBe(1);
        expect(s.stops[0]!).toBeGreaterThan(s.started!);
      }
    }
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('pan estéreo leve pela posição X da bola', () => {
    const { ctx, audio } = setup();
    audio.unlock();
    audio.playSound({ type: 'pass', x: 0 });
    audio.playSound({ type: 'pass', x: 40 });
    expect(ctx.panners.map((p) => p.pan.value)).toEqual([-AUDIO_PAN_MAX, AUDIO_PAN_MAX]);
    expect(panForX(20)).toBe(0);
    expect(panForX(-50)).toBe(-AUDIO_PAN_MAX);
    expect(panForX(500)).toBe(AUDIO_PAN_MAX);
    expect(panForX(Number.NaN)).toBe(0);
  });

  it(`no máximo ${AUDIO_MAX_VOICES_PER_TYPE} vozes do mesmo tipo: a mais antiga é cortada`, () => {
    const { ctx, audio } = setup();
    audio.unlock();
    const voices: FakeSource[][] = [];
    for (let i = 0; i < 3; i++) {
      const before = ctx.sources.length;
      audio.playSound({ type: 'kick', x: 20, power: 1 });
      voices.push(ctx.sources.slice(before));
    }
    // A primeira levou um segundo stop (o corte); as outras duas não.
    expect(voices[0]!.every((s) => s.stops.length === 2)).toBe(true);
    expect(voices[1]!.every((s) => s.stops.length === 1)).toBe(true);
    expect(voices[2]!.every((s) => s.stops.length === 1)).toBe(true);
    // Outro tipo não conta para o limite dos chutes.
    const before = ctx.sources.length;
    audio.playSound({ type: 'pass', x: 20 });
    expect(voices[1]!.every((s) => s.stops.length === 1)).toBe(true);
    expect(ctx.sources.length).toBeGreaterThan(before);
    // Depois que as anteriores terminam, uma nova não corta ninguém.
    ctx.currentTime += 5;
    audio.playSound({ type: 'kick', x: 20, power: 1 });
    expect(voices[2]!.every((s) => s.stops.length === 1)).toBe(true);
  });

  it('mudo não cria vozes; volume e mudo vão para o ganho master (volume²)', () => {
    const { ctx, audio } = setup();
    audio.unlock();
    audio.setMuted(true);
    audio.playSound({ type: 'goal', x: 40 });
    expect(ctx.sources).toHaveLength(0);
    expect(masterGainFor({ volume: 0.5, muted: false })).toBeCloseTo(0.25, 9);
    expect(masterGainFor({ volume: 1, muted: true })).toBe(0);
    audio.setMuted(false);
    audio.setVolume(0.5);
    const targets = ctx.gains.flatMap((g) => g.gain.events.filter((e) => e[0] === 'target').map((e) => e[1]));
    expect(targets).toContain(0);
    expect(targets[targets.length - 1]).toBeCloseTo(0.25, 9);
  });

  it('tecla M liga/desliga (sem repetição); desligável enquanto se digita um código', () => {
    const { audio } = setup();
    const win = new FakeTarget();
    audio.attach(win);
    win.fire('keydown', { code: 'KeyM', repeat: false });
    expect(audio.muted).toBe(true);
    win.fire('keydown', { code: 'KeyM', repeat: true });
    expect(audio.muted).toBe(true);
    win.fire('keydown', { code: 'KeyM', repeat: false });
    expect(audio.muted).toBe(false);
    audio.hotkeyEnabled = false;
    win.fire('keydown', { code: 'KeyM', repeat: false });
    expect(audio.muted).toBe(false);
    audio.hotkeyEnabled = true;
    audio.detach();
    win.fire('keydown', { code: 'KeyM', repeat: false });
    expect(audio.muted).toBe(false);
  });

  it('a preferência é salva no armazenamento e lida de novo', () => {
    const storage = new MemoryStorage();
    const a = new AudioManager(() => null, storage);
    a.setVolume(0.3);
    a.toggleMute();
    expect(JSON.parse(storage.getItem(AUDIO_STORAGE_KEY)!)).toEqual({ volume: 0.3, muted: true });
    const b = new AudioManager(() => null, storage);
    expect(b.volume).toBe(0.3);
    expect(b.muted).toBe(true);
  });

  it('volume em passos, limitado a 0..1', () => {
    const { audio } = setup();
    expect(audio.volume).toBe(AUDIO_DEFAULT_VOLUME);
    for (let i = 0; i < 20; i++) audio.stepVolume(1);
    expect(audio.volume).toBe(1);
    for (let i = 0; i < 3; i++) audio.stepVolume(-1);
    expect(audio.volume).toBe(0.7);
    for (let i = 0; i < 20; i++) audio.stepVolume(-1);
    expect(audio.volume).toBe(0);
  });

  it('avisa os ouvintes; ouvinte com erro não quebra nada; cancelar o aviso funciona', () => {
    const { audio } = setup();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const seen: boolean[] = [];
    const off = audio.onChange((s) => seen.push(s.muted));
    audio.onChange(() => {
      throw new Error('ouvinte quebrado');
    });
    expect(() => audio.toggleMute()).not.toThrow();
    off();
    audio.toggleMute();
    expect(seen).toEqual([true]);
    warn.mockRestore();
  });

  it('erros do Web Audio nunca chegam a quem chama', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    // Sem Web Audio no navegador.
    const none = new AudioManager(() => null, null);
    expect(() => {
      none.unlock();
      none.playSound({ type: 'kick', x: 20, power: 1 });
      none.stopAll();
      none.setVolume(0.2);
    }).not.toThrow();
    // Contexto que falha ao ser criado.
    const boom = new AudioManager(() => {
      throw new Error('sem permissão');
    }, null);
    expect(() => boom.unlock()).not.toThrow();
    // Contexto que falha ao criar nós.
    const { ctx, audio } = setup();
    audio.unlock();
    ctx.createOscillator = () => {
      throw new Error('falhou');
    };
    expect(() => audio.playSound({ type: 'kick', x: 20, power: 1 })).not.toThrow();
    warn.mockRestore();
  });

  it('stopAll corta todas as vozes tocando', () => {
    const { ctx, audio } = setup();
    audio.unlock();
    audio.playSound({ type: 'goal', x: 40 });
    audio.playSound({ type: 'whistle', x: 20, pattern: 'final' });
    audio.stopAll();
    expect(ctx.sources.every((s) => s.stops.length === 2)).toBe(true);
  });
});

describe('preferência de som (localStorage)', () => {
  it('sem nada guardado, JSON inválido ou armazenamento com erro: o padrão', () => {
    const def = { volume: AUDIO_DEFAULT_VOLUME, muted: false };
    expect(loadAudioSettings(null)).toEqual(def);
    expect(loadAudioSettings(new MemoryStorage())).toEqual(def);
    const bad = new MemoryStorage();
    bad.setItem(AUDIO_STORAGE_KEY, '{não é json');
    expect(loadAudioSettings(bad)).toEqual(def);
    const throwing: SettingsStorage = {
      getItem: () => {
        throw new Error('SecurityError');
      },
      setItem: () => {
        throw new Error('QuotaExceeded');
      },
    };
    expect(loadAudioSettings(throwing)).toEqual(def);
    expect(() => saveAudioSettings(throwing, def)).not.toThrow();
  });

  it('campos com tipo errado são ignorados; volume é limitado e arredondado ao passo', () => {
    const s = new MemoryStorage();
    s.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ volume: 'alto', muted: 'sim' }));
    expect(loadAudioSettings(s)).toEqual({ volume: AUDIO_DEFAULT_VOLUME, muted: false });
    s.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ volume: 7, muted: true }));
    expect(loadAudioSettings(s)).toEqual({ volume: 1, muted: true });
    s.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ volume: 0.34 }));
    expect(loadAudioSettings(s).volume).toBe(0.3);
    expect(normalizeVolume(0.1 + 0.2)).toBe(0.3);
    expect(normalizeVolume(-1)).toBe(0);
    expect(normalizeVolume(Number.NaN)).toBe(AUDIO_DEFAULT_VOLUME);
  });
});

describe('síntese', () => {
  it('proteção contra estouro: linear até o joelho, suave e monotônica acima, nunca passa de 1', () => {
    const n = 2049;
    const knee = 0.7;
    const head = 2.5;
    const c = softClipCurve(n, knee, head);
    const at = (x: number): number => c[Math.round(((x / head + 1) / 2) * (n - 1))]!;
    for (const x of [0, 0.1, 0.3, 0.5, 0.69, -0.4]) expect(at(x)).toBeCloseTo(x, 2);
    expect(at(head)).toBeCloseTo(1, 3);
    expect(at(-head)).toBeCloseTo(-1, 3);
    expect(at(1.2)).toBeLessThan(1);
    expect(at(1.2)).toBeGreaterThan(knee);
    for (let i = 1; i < n; i++) expect(c[i]!).toBeGreaterThanOrEqual(c[i - 1]!);
    expect(Math.max(...c)).toBeLessThanOrEqual(1);
  });

  it('apito: 1 curto, 2 curtos, ou 3 com o último longo', () => {
    expect(whistleSegments('short')).toEqual([[0, SFX_WHISTLE_SHORT]]);
    const d = whistleSegments('double');
    expect(d).toHaveLength(2);
    expect(d.every(([, len]) => len === SFX_WHISTLE_SHORT)).toBe(true);
    const f = whistleSegments('final');
    expect(f.map(([, len]) => len)).toEqual([SFX_WHISTLE_SHORT, SFX_WHISTLE_SHORT, SFX_WHISTLE_LONG]);
    expect(SFX_WHISTLE_LONG).toBeGreaterThan(SFX_WHISTLE_SHORT * 2);
    // Sem sobreposição entre os trechos.
    for (const segs of [d, f]) for (let i = 1; i < segs.length; i++) expect(segs[i]![0]).toBeGreaterThan(segs[i - 1]![0] + segs[i - 1]![1]);
  });
});

describe('VoiceLimiter', () => {
  it('devolve as mais antigas acima do limite, por tipo, e esquece as que terminaram', () => {
    const l = new VoiceLimiter<string>(2);
    expect(l.add('kick', 0, 1, 'a')).toEqual([]);
    expect(l.add('kick', 0.1, 1, 'b')).toEqual([]);
    expect(l.add('pass', 0.1, 1, 'p')).toEqual([]);
    expect(l.add('kick', 0.2, 1, 'c')).toEqual(['a']);
    expect(l.count('kick', 0.5)).toBe(2);
    expect(l.count('kick', 1)).toBe(0);
    expect(l.add('kick', 2, 3, 'd')).toEqual([]);
    expect(l.drain(2.5)).toEqual(['d']);
    expect(l.count('kick', 2.5)).toBe(0);
  });
});
