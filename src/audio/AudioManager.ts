/**
 * Ponto único de áudio: sons sintetizados com Web Audio, sem nenhum arquivo.
 *
 * - Um só `AudioContext`, criado (ou retomado) no primeiro clique ou tecla do usuário, por causa
 *   da política de autoplay dos navegadores.
 * - Cadeia: cada som → ganho do efeito → pan estéreo leve (X da bola) → filtro "rádio antigo"
 *   (passa-faixa suave, ~150 Hz a ~6 kHz) → ganho master → saída.
 * - No máximo AUDIO_MAX_VOICES_PER_TYPE vozes do mesmo tipo ao mesmo tempo (a mais antiga é cortada).
 * - Volume master e mudo (tecla M e menu de pausa), guardados no `localStorage`.
 * - Os sons da partida vêm só dos eventos da simulação (`playSound`); nada aqui pode lançar
 *   exceção para quem chama nem atrasar a simulação.
 */
import {
  AUDIO_CLIP_HEADROOM,
  AUDIO_CLIP_KNEE,
  AUDIO_FADE_TIME,
  AUDIO_MAX_VOICES_PER_TYPE,
  AUDIO_PAN_MAX,
  AUDIO_RADIO_HIGH_HZ,
  AUDIO_RADIO_LOW_HZ,
  AUDIO_START_DELAY,
  AUDIO_VOLUME_STEP,
  FIELD_LENGTH,
} from '../config/constants';
import type { SoundCue } from '../sim/sound';
import { browserStorage, loadAudioSettings, normalizeVolume, saveAudioSettings } from './settings';
import type { AudioSettings, SettingsStorage } from './settings';
import { createNoiseBuffer, softClipCurve, synthesize } from './synth';
import type { Voice } from './synth';
import { VoiceLimiter } from './voices';

/**
 * Sons de interface (menus, tela VS, resultado). Esta versão só tem os sons da partida
 * (chute, passe, apito, gol e defesa): estes ficam mudos, prontos para entrar depois.
 */
export type UiSound = 'menu-mover' | 'menu-confirmar' | 'menu-voltar' | 'apito' | 'torcida';

/** Pan estéreo pela posição X da bola: -AUDIO_PAN_MAX na ponta esquerda, +AUDIO_PAN_MAX na direita. */
export function panForX(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const t = Math.max(-1, Math.min(1, (x - FIELD_LENGTH / 2) / (FIELD_LENGTH / 2)));
  return t * AUDIO_PAN_MAX;
}

/** Ganho master: curva quadrática (o ouvido percebe volume de forma logarítmica). */
export function masterGainFor(s: AudioSettings): number {
  return s.muted ? 0 : s.volume * s.volume;
}

/** Resolução da curva da proteção contra estouro. */
const CLIP_CURVE_SAMPLES = 2049;

type ContextFactory = () => AudioContext | null;

function defaultContextFactory(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext };
  const Ctor = w.AudioContext ?? w.webkitAudioContext;
  return Ctor ? new Ctor({ latencyHint: 'interactive' }) : null;
}

/** Alvo mínimo de eventos de teclado/ponteiro (facilita os testes). */
interface GestureTarget {
  addEventListener(type: string, fn: (e: Event) => void, opts?: AddEventListenerOptions): void;
  removeEventListener(type: string, fn: (e: Event) => void, opts?: EventListenerOptions): void;
}

export class AudioManager {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  /** Entrada da cadeia comum (filtro "rádio antigo"). */
  private bus: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
  private readonly voices = new VoiceLimiter<Voice>(AUDIO_MAX_VOICES_PER_TYPE);
  private settings: AudioSettings;
  private readonly listeners = new Set<(s: Readonly<AudioSettings>) => void>();
  private attached: GestureTarget | null = null;
  private failed = false;
  private warned = false;
  /** A tecla M liga/desliga o som (desligada enquanto se digita um código de sala). */
  hotkeyEnabled = true;

  constructor(
    private readonly createContext: ContextFactory = defaultContextFactory,
    private readonly storage: SettingsStorage | null = browserStorage(),
  ) {
    this.settings = loadAudioSettings(storage);
  }

  // -------------------------------------------------------------------------
  // Contexto e gestos do usuário
  // -------------------------------------------------------------------------

  private readonly onGesture = (): void => {
    this.unlock();
  };

  private readonly onKeyDown = (e: Event): void => {
    const k = e as KeyboardEvent;
    if (k.code === 'KeyM' && !k.repeat && this.hotkeyEnabled) this.toggleMute();
    this.unlock();
  };

  /** Liga o áudio aos gestos da janela: o primeiro clique ou tecla cria/retoma o contexto. */
  attach(target: GestureTarget): void {
    this.detach();
    this.attached = target;
    target.addEventListener('keydown', this.onKeyDown, { capture: true });
    target.addEventListener('pointerdown', this.onGesture, { capture: true });
    target.addEventListener('touchend', this.onGesture, { capture: true });
  }

  detach(): void {
    const t = this.attached;
    if (!t) return;
    t.removeEventListener('keydown', this.onKeyDown, { capture: true });
    t.removeEventListener('pointerdown', this.onGesture, { capture: true });
    t.removeEventListener('touchend', this.onGesture, { capture: true });
    this.attached = null;
  }

  /** Cria o contexto (na primeira vez) ou o retoma se estiver suspenso. Chamar dentro de um gesto. */
  unlock(): void {
    if (this.failed) return;
    try {
      if (!this.ctx) this.build();
      const ctx = this.ctx;
      if (ctx && ctx.state === 'suspended') void ctx.resume().catch(() => undefined);
    } catch (err) {
      this.failed = true;
      this.warn('áudio indisponível', err);
    }
  }

  /**
   * Monta o contexto e a cadeia comum: rádio antigo (passa-altas + passa-baixas suaves) → master →
   * proteção contra estouro (linear no uso normal, curva suave só com vários sons fortes juntos) → saída.
   */
  private build(): void {
    const ctx = this.createContext();
    if (!ctx) {
      this.failed = true;
      return;
    }
    const master = ctx.createGain();
    master.gain.value = masterGainFor(this.settings);
    const low = ctx.createBiquadFilter();
    low.type = 'highpass';
    low.frequency.value = AUDIO_RADIO_LOW_HZ;
    low.Q.value = 0.5;
    const high = ctx.createBiquadFilter();
    high.type = 'lowpass';
    high.frequency.value = AUDIO_RADIO_HIGH_HZ;
    high.Q.value = 0.5;
    // A curva recebe o sinal dividido pela folga (o shaper só aceita -1..1 na entrada).
    const pre = ctx.createGain();
    pre.gain.value = 1 / AUDIO_CLIP_HEADROOM;
    const clip = ctx.createWaveShaper();
    clip.curve = softClipCurve(CLIP_CURVE_SAMPLES, AUDIO_CLIP_KNEE, AUDIO_CLIP_HEADROOM);
    clip.oversample = '2x';
    low.connect(high).connect(master).connect(pre).connect(clip).connect(ctx.destination);
    this.ctx = ctx;
    this.master = master;
    this.bus = low;
    this.noise = createNoiseBuffer(ctx);
  }

  /** O contexto existe e está tocando (antes do primeiro gesto, não). */
  get running(): boolean {
    return this.ctx !== null && this.ctx.state === 'running';
  }

  // -------------------------------------------------------------------------
  // Sons
  // -------------------------------------------------------------------------

  /** Toca um som da partida (evento da simulação). Sem contexto, mudo ou com erro: não faz nada. */
  playSound(cue: SoundCue): void {
    const ctx = this.ctx;
    const bus = this.bus;
    const noise = this.noise;
    if (!ctx || !bus || !noise || this.settings.muted || ctx.state !== 'running') return;
    try {
      const now = ctx.currentTime;
      const t0 = now + AUDIO_START_DELAY;
      let out: AudioNode = bus;
      if (typeof ctx.createStereoPanner === 'function') {
        const pan = ctx.createStereoPanner();
        pan.pan.value = panForX(cue.x);
        pan.connect(bus);
        out = pan;
      }
      const voice = synthesize(ctx, out, cue, t0, noise);
      for (const old of this.voices.add(cue.type, now, voice.end, voice)) old.stop(now);
    } catch (err) {
      this.warn('falha ao tocar um som', err);
    }
  }

  /** Sons de interface: mudos nesta versão. */
  play(_sound: UiSound): void {
    // Sem sons de interface nesta versão (só os da partida).
  }

  /** Corta tudo o que estiver tocando (com o corte suave de cada voz). */
  stopAll(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      for (const v of this.voices.drain(now)) v.stop(now);
    } catch (err) {
      this.warn('falha ao cortar os sons', err);
    }
  }

  // -------------------------------------------------------------------------
  // Volume e mudo
  // -------------------------------------------------------------------------

  get volume(): number {
    return this.settings.volume;
  }

  get muted(): boolean {
    return this.settings.muted;
  }

  setVolume(v: number): void {
    const volume = normalizeVolume(v);
    if (volume === this.settings.volume) return;
    this.settings = { ...this.settings, volume };
    this.changed();
  }

  /** Sobe (+1) ou desce (-1) o volume um passo. */
  stepVolume(dir: 1 | -1): void {
    this.setVolume(this.settings.volume + dir * AUDIO_VOLUME_STEP);
  }

  setMuted(muted: boolean): void {
    if (muted === this.settings.muted) return;
    this.settings = { ...this.settings, muted };
    this.changed();
  }

  toggleMute(): void {
    this.setMuted(!this.settings.muted);
  }

  /** Avisa quando o volume ou o mudo mudam. Devolve a função que cancela o aviso. */
  onChange(fn: (s: Readonly<AudioSettings>) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed(): void {
    saveAudioSettings(this.storage, this.settings);
    this.applyMaster();
    for (const fn of [...this.listeners]) {
      try {
        fn(this.settings);
      } catch (err) {
        this.warn('erro num ouvinte do áudio', err);
      }
    }
  }

  private applyMaster(): void {
    const ctx = this.ctx;
    if (!ctx || !this.master) return;
    try {
      const g = this.master.gain;
      g.cancelScheduledValues(ctx.currentTime);
      g.setTargetAtTime(masterGainFor(this.settings), ctx.currentTime, AUDIO_FADE_TIME / 3);
    } catch (err) {
      this.warn('falha ao mudar o volume', err);
    }
  }

  private warn(msg: string, err: unknown): void {
    if (this.warned) return;
    this.warned = true;
    console.warn(`[áudio] ${msg}:`, err);
  }
}

export const audio = new AudioManager();
