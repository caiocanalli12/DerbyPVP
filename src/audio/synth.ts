/**
 * Síntese dos sons da partida com Web Audio, sem nenhum arquivo de áudio.
 *
 * Cada função monta uma "voz" (osciladores, ruído, filtros e envelopes) ligada à entrada `out` e
 * agendada a partir de `t0` (relógio do áudio). A voz sabe quando termina e pode ser cortada antes
 * (limite de vozes), com um corte suave para não estalar.
 */
import {
  AUDIO_FADE_TIME,
  SFX_GOAL_BELL_DECAY,
  SFX_GOAL_BELL_GAIN,
  SFX_GOAL_BELL_HZ,
  SFX_GOAL_BELL_PARTIAL_DECAYS,
  SFX_GOAL_BELL_PARTIAL_GAINS,
  SFX_GOAL_BELL_PARTIALS,
  SFX_GOAL_SLIDE_DELAY,
  SFX_GOAL_SLIDE_FROM,
  SFX_GOAL_SLIDE_GAIN,
  SFX_GOAL_SLIDE_TIME,
  SFX_GOAL_SLIDE_TO,
  SFX_GOAL_SLIDE_VIBRATO_DEPTH,
  SFX_GOAL_SLIDE_VIBRATO_HZ,
  SFX_KICK_CLICK_GAIN,
  SFX_KICK_CLICK_HZ_MAX,
  SFX_KICK_CLICK_HZ_MIN,
  SFX_KICK_CLICK_TIME,
  SFX_KICK_DECAY,
  SFX_KICK_DROP_TIME,
  SFX_KICK_FREQ_END,
  SFX_KICK_FREQ_START,
  SFX_KICK_GAIN_MAX,
  SFX_KICK_GAIN_MIN,
  SFX_PASS_CLICK_GAIN,
  SFX_PASS_CLICK_HZ,
  SFX_PASS_CLICK_TIME,
  SFX_PASS_DECAY,
  SFX_PASS_DROP_TIME,
  SFX_PASS_FREQ_END,
  SFX_PASS_FREQ_START,
  SFX_PASS_GAIN,
  SFX_SAVE_BOING_DELAY,
  SFX_SAVE_BOING_GAIN,
  SFX_SAVE_BOING_HZ,
  SFX_SAVE_BOING_RISE,
  SFX_SAVE_BOING_TIME,
  SFX_SAVE_BOING_WOBBLE_DEPTH,
  SFX_SAVE_BOING_WOBBLE_HZ,
  SFX_SAVE_THUMP_DECAY,
  SFX_SAVE_THUMP_FREQ_END,
  SFX_SAVE_THUMP_FREQ_START,
  SFX_SAVE_THUMP_GAIN,
  SFX_SAVE_THUMP_LOWPASS_HZ,
  SFX_WHISTLE_DETUNE_HZ,
  SFX_WHISTLE_FREQ,
  SFX_WHISTLE_GAIN,
  SFX_WHISTLE_GAP,
  SFX_WHISTLE_LONG,
  SFX_WHISTLE_SHORT,
  SFX_WHISTLE_TRILL_DEPTH_HZ,
  SFX_WHISTLE_TRILL_HZ,
} from '../config/constants';
import type { SoundCue, WhistlePattern } from '../sim/sound';

/** Valor mínimo das rampas exponenciais (não podem chegar a 0). */
const SILENT = 0.0001;

/** Um som em andamento. */
export interface Voice {
  /** Instante (relógio do áudio) em que termina sozinho. */
  readonly end: number;
  /** Corta a voz em `at`, com um corte suave curto. */
  stop(at: number): void;
}

/** Ruído branco (1 s), gerado uma vez e reaproveitado nos estalos. */
export function createNoiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const len = Math.max(1, Math.floor(ctx.sampleRate));
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/**
 * Curva da proteção contra estouro (WaveShaper): a entrada do shaper é o sinal dividido por
 * `headroom`; a saída é o sinal sem mudança até `knee` e, acima, uma curva suave (tanh) que só
 * chega a 1 com o sinal em `headroom`.
 */
export function softClipCurve(samples: number, knee: number, headroom: number): Float32Array<ArrayBuffer> {
  const curve = new Float32Array(samples);
  const span = 1 - knee;
  // Normaliza a tanh para a curva chegar a 1 exatamente em `headroom` (inclinação ~1 no joelho).
  const norm = Math.tanh((headroom - knee) / span);
  for (let i = 0; i < samples; i++) {
    const x = ((i / (samples - 1)) * 2 - 1) * headroom;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (span * Math.tanh((a - knee) / span)) / norm;
    curve[i] = Math.sign(x) * Math.min(1, y);
  }
  return curve;
}

/** Trechos [início, duração] (s) de cada padrão de apito. */
export function whistleSegments(pattern: WhistlePattern): [number, number][] {
  const s = SFX_WHISTLE_SHORT;
  const g = SFX_WHISTLE_GAP;
  switch (pattern) {
    case 'short':
      return [[0, s]];
    case 'double':
      return [
        [0, s],
        [s + g, s],
      ];
    case 'final':
      return [
        [0, s],
        [s + g, s],
        [2 * (s + g), SFX_WHISTLE_LONG],
      ];
  }
}

/** Monta a voz de um som. `out` é a entrada da cadeia (pan → rádio → master). */
export function synthesize(ctx: BaseAudioContext, out: AudioNode, cue: SoundCue, t0: number, noise: AudioBuffer): Voice {
  const v = new VoiceBuilder(ctx, out);
  switch (cue.type) {
    case 'kick':
      kick(v, t0, cue.power, noise);
      break;
    case 'pass':
      pass(v, t0, noise);
      break;
    case 'whistle':
      whistle(v, t0, cue.pattern);
      break;
    case 'goal':
      goal(v, t0);
      break;
    case 'save':
      save(v, t0, noise);
      break;
  }
  return v.finish();
}

/** Junta os nós de uma voz: ganho próprio (para o corte) e as fontes que precisam parar. */
class VoiceBuilder {
  readonly input: GainNode;
  private readonly sources: AudioScheduledSourceNode[] = [];
  private end = 0;

  constructor(
    readonly ctx: BaseAudioContext,
    out: AudioNode,
  ) {
    this.input = ctx.createGain();
    this.input.connect(out);
  }

  /** Oscilador agendado de `start` a `stop`. */
  osc(type: OscillatorType, freq: number, start: number, stop: number): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, start);
    this.track(o, start, stop);
    return o;
  }

  /** Ruído agendado de `start` a `stop`. */
  noise(buffer: AudioBuffer, start: number, stop: number): AudioBufferSourceNode {
    const n = this.ctx.createBufferSource();
    n.buffer = buffer;
    n.loop = true;
    this.track(n, start, stop);
    return n;
  }

  gain(value = 0): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    return g;
  }

  filter(type: BiquadFilterType, freq: number, q = 0.7): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    return f;
  }

  private track(src: AudioScheduledSourceNode, start: number, stop: number): void {
    src.start(start);
    src.stop(stop);
    this.sources.push(src);
    this.end = Math.max(this.end, stop);
  }

  finish(): Voice {
    const input = this.input;
    const sources = this.sources;
    let stopped = false;
    return {
      end: this.end,
      stop(at: number): void {
        if (stopped) return;
        stopped = true;
        input.gain.cancelScheduledValues(at);
        input.gain.setValueAtTime(input.gain.value, at);
        input.gain.linearRampToValueAtTime(0, at + AUDIO_FADE_TIME);
        for (const s of sources) {
          try {
            s.stop(at + AUDIO_FADE_TIME);
          } catch {
            // Já tinha parado.
          }
        }
      },
    };
  }
}

/** Envelope percussivo: sobe em `attack` até `peak` e cai exponencialmente em `decay`. */
function percussive(p: AudioParam, t0: number, peak: number, attack: number, decay: number): void {
  p.setValueAtTime(SILENT, t0);
  p.exponentialRampToValueAtTime(Math.max(SILENT, peak), t0 + attack);
  p.exponentialRampToValueAtTime(SILENT, t0 + attack + decay);
}

/** "Tum" grave com queda de afinação + estalo de ruído; volume e brilho crescem com a força. */
function kick(v: VoiceBuilder, t0: number, power: number, noise: AudioBuffer): void {
  const p = Math.max(0, Math.min(1, power));
  const o = v.osc('sine', SFX_KICK_FREQ_START, t0, t0 + SFX_KICK_DECAY + 0.05);
  o.frequency.exponentialRampToValueAtTime(SFX_KICK_FREQ_END, t0 + SFX_KICK_DROP_TIME);
  const g = v.gain();
  percussive(g.gain, t0, SFX_KICK_GAIN_MIN + (SFX_KICK_GAIN_MAX - SFX_KICK_GAIN_MIN) * p, 0.004, SFX_KICK_DECAY);
  o.connect(g).connect(v.input);

  const n = v.noise(noise, t0, t0 + SFX_KICK_CLICK_TIME + 0.03);
  const bp = v.filter('bandpass', SFX_KICK_CLICK_HZ_MIN + (SFX_KICK_CLICK_HZ_MAX - SFX_KICK_CLICK_HZ_MIN) * p, 0.9);
  const ng = v.gain();
  percussive(ng.gain, t0, SFX_KICK_CLICK_GAIN * (0.4 + 0.6 * p), 0.002, SFX_KICK_CLICK_TIME);
  n.connect(bp).connect(ng).connect(v.input);
}

/** Toque leve: mais curto e agudo que o chute, com pouco ruído. */
function pass(v: VoiceBuilder, t0: number, noise: AudioBuffer): void {
  const o = v.osc('sine', SFX_PASS_FREQ_START, t0, t0 + SFX_PASS_DECAY + 0.05);
  o.frequency.exponentialRampToValueAtTime(SFX_PASS_FREQ_END, t0 + SFX_PASS_DROP_TIME);
  const g = v.gain();
  percussive(g.gain, t0, SFX_PASS_GAIN, 0.003, SFX_PASS_DECAY);
  o.connect(g).connect(v.input);

  const n = v.noise(noise, t0, t0 + SFX_PASS_CLICK_TIME + 0.03);
  const bp = v.filter('bandpass', SFX_PASS_CLICK_HZ, 1.2);
  const ng = v.gain();
  percussive(ng.gain, t0, SFX_PASS_CLICK_GAIN, 0.002, SFX_PASS_CLICK_TIME);
  n.connect(bp).connect(ng).connect(v.input);
}

/** Apito de juiz: dois osciladores próximos com trilo, nos trechos do padrão. */
function whistle(v: VoiceBuilder, t0: number, pattern: WhistlePattern): void {
  const segments = whistleSegments(pattern);
  const last = segments[segments.length - 1]!;
  const stop = t0 + last[0] + last[1] + 0.05;

  const env = v.gain();
  env.gain.setValueAtTime(0, t0);
  for (const [start, dur] of segments) {
    const s = t0 + start;
    env.gain.setValueAtTime(0, s);
    env.gain.linearRampToValueAtTime(SFX_WHISTLE_GAIN, s + 0.012);
    env.gain.setValueAtTime(SFX_WHISTLE_GAIN, s + dur - 0.025);
    env.gain.linearRampToValueAtTime(0, s + dur);
  }
  // Trilo: a "bolinha" do apito mexe na afinação e no volume bem rápido.
  const trem = v.gain(0.75);
  const lfo = v.osc('sine', SFX_WHISTLE_TRILL_HZ, t0, stop);
  const depth = v.gain(SFX_WHISTLE_TRILL_DEPTH_HZ);
  const tremDepth = v.gain(0.25);
  lfo.connect(depth);
  lfo.connect(tremDepth).connect(trem.gain);
  for (const f of [SFX_WHISTLE_FREQ, SFX_WHISTLE_FREQ + SFX_WHISTLE_DETUNE_HZ]) {
    const o = v.osc('sine', f, t0, stop);
    depth.connect(o.frequency);
    o.connect(env);
  }
  env.connect(trem).connect(v.input);
}

/** Sino brilhante (parciais inarmônicos) e o apito de êmbolo subindo, cartunesco. */
function goal(v: VoiceBuilder, t0: number): void {
  SFX_GOAL_BELL_PARTIALS.forEach((ratio, i) => {
    const decay = SFX_GOAL_BELL_DECAY * (SFX_GOAL_BELL_PARTIAL_DECAYS[i] ?? 0.3);
    // Os dois parciais mais graves levemente desafinados: o sino "bate".
    const detune = i === 0 ? 1 : i === 1 ? 1.7 : 0;
    const o = v.osc('sine', SFX_GOAL_BELL_HZ * ratio + detune, t0, t0 + decay + 0.05);
    const g = v.gain();
    percussive(g.gain, t0, SFX_GOAL_BELL_GAIN * (SFX_GOAL_BELL_PARTIAL_GAINS[i] ?? 0.3), 0.003, decay);
    o.connect(g).connect(v.input);
  });

  const s = t0 + SFX_GOAL_SLIDE_DELAY;
  const e = s + SFX_GOAL_SLIDE_TIME;
  const slide = v.osc('sine', SFX_GOAL_SLIDE_FROM, s, e + 0.12);
  slide.frequency.exponentialRampToValueAtTime(SFX_GOAL_SLIDE_TO, e);
  const vib = v.osc('sine', SFX_GOAL_SLIDE_VIBRATO_HZ, s, e + 0.12);
  const vibDepth = v.gain(1200 * Math.log2(1 + SFX_GOAL_SLIDE_VIBRATO_DEPTH));
  vib.connect(vibDepth).connect(slide.detune);
  const g = v.gain();
  g.gain.setValueAtTime(0, s);
  g.gain.linearRampToValueAtTime(SFX_GOAL_SLIDE_GAIN, s + 0.05);
  g.gain.setValueAtTime(SFX_GOAL_SLIDE_GAIN, e);
  g.gain.linearRampToValueAtTime(0, e + 0.1);
  slide.connect(g).connect(v.input);
}

/** "Tum" abafado das luvas e um pequeno "boing" de mola. */
function save(v: VoiceBuilder, t0: number, noise: AudioBuffer): void {
  const o = v.osc('sine', SFX_SAVE_THUMP_FREQ_START, t0, t0 + SFX_SAVE_THUMP_DECAY + 0.05);
  o.frequency.exponentialRampToValueAtTime(SFX_SAVE_THUMP_FREQ_END, t0 + SFX_SAVE_THUMP_DECAY * 0.6);
  const lp = v.filter('lowpass', SFX_SAVE_THUMP_LOWPASS_HZ);
  const g = v.gain();
  percussive(g.gain, t0, SFX_SAVE_THUMP_GAIN, 0.004, SFX_SAVE_THUMP_DECAY);
  o.connect(lp).connect(g).connect(v.input);
  // Couro da luva: um sopro de ruído abafado.
  const n = v.noise(noise, t0, t0 + 0.08);
  const nlp = v.filter('lowpass', SFX_SAVE_THUMP_LOWPASS_HZ * 1.6);
  const ng = v.gain();
  percussive(ng.gain, t0, SFX_SAVE_THUMP_GAIN * 0.35, 0.002, 0.05);
  n.connect(nlp).connect(ng).connect(v.input);

  // Boing: a afinação sobe um pouco e balança cada vez menos, como uma mola.
  const b = t0 + SFX_SAVE_BOING_DELAY;
  const end = b + SFX_SAVE_BOING_TIME;
  const spring = v.osc('triangle', SFX_SAVE_BOING_HZ, b, end + 0.05);
  spring.frequency.exponentialRampToValueAtTime(SFX_SAVE_BOING_HZ * SFX_SAVE_BOING_RISE, b + SFX_SAVE_BOING_TIME * 0.6);
  const wobble = v.osc('sine', SFX_SAVE_BOING_WOBBLE_HZ, b, end + 0.05);
  const depth = v.gain();
  depth.gain.setValueAtTime(SFX_SAVE_BOING_HZ * SFX_SAVE_BOING_WOBBLE_DEPTH, b);
  depth.gain.exponentialRampToValueAtTime(1, end);
  wobble.connect(depth).connect(spring.frequency);
  const bg = v.gain();
  percussive(bg.gain, b, SFX_SAVE_BOING_GAIN, 0.006, SFX_SAVE_BOING_TIME);
  spring.connect(bg).connect(v.input);
}
