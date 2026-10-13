/**
 * Jogadores no estilo rubber hose (anos 1930), desenhados por código.
 *
 * - Corpo atlético estilizado; braços e pernas de "mangueira" (Bézier, sem cotovelo/joelho
 *   rígido); cabeça grande, olhos pie-cut, nariz em ponto, sorriso simples.
 * - Chuteiras grandes e arredondadas; goleiro com luvas grandes.
 * - Uniforme em camadas: camisa (padrão, gola, punhos), calção, meias (com faixa), número
 *   nas costas.
 * - Vistas: lateral (espelhada para o outro lado), frente e costas.
 * - Cada pose é desenhada com os pontos de controle levemente deslocados ("boiling line");
 *   animações curtas ganham 3 variações por pose.
 *
 * Coordenadas das poses: metros, vista lateral olhando para +x, y para cima, origem no chão
 * entre os pés.
 */
import type Phaser from 'phaser';
import { BOIL_JITTER, PLAYER_ART_PPM } from '../config/constants';
import { Rng } from '../core/rng';
import type { Kit } from '../data/teams';
import type { Ctx } from './canvas';
import { css, ellipsePath, hose, inkFill, mix, pieEye, quadEndDir, shade } from './brush';
import type { P } from './brush';
import { FONT_TEXT, INK_CSS } from './style';

// ---------------------------------------------------------------------------
// Aparência
// ---------------------------------------------------------------------------

export type HairStyle = 'short' | 'flat' | 'curly' | 'parted' | 'bald';

export interface PlayerLook {
  kit: Kit;
  isKeeper: boolean;
  /** Cor da camisa do goleiro (se for goleiro). */
  keeperColor: number;
  skin: number;
  hair: HairStyle;
  hairColor: number;
  number: number;
  /** Semente das variações (fervura). */
  seed: number;
}

export const SKIN_TONES: readonly number[] = [0xf3cfac, 0xe2b183, 0xc98e5c, 0xa86d43, 0x7f4f2e, 0x5c3920];
export const HAIR_COLORS: readonly number[] = [0x1c1410, 0x3b2416, 0x6b4425, 0xc99a4a, 0x9a3f1e];
export const HAIR_STYLES: readonly HairStyle[] = ['short', 'flat', 'curly', 'parted', 'bald'];

// ---------------------------------------------------------------------------
// Animações e quadros
// ---------------------------------------------------------------------------

export type View = 'side' | 'front' | 'back';

export type AnimName =
  | 'idle'
  | 'run'
  | 'dribble'
  | 'pass'
  | 'kick'
  | 'slide'
  | 'fallen'
  | 'stumble'
  | 'celebrate'
  | 'gkReady'
  | 'gkDive'
  | 'gkHold'
  | 'gkThrow';

export interface AnimSpec {
  frames: number;
  views: readonly View[];
  /** Quadro largo (deitado/deslizando) em vez de alto. */
  wide: boolean;
  /** Animações de 1–2 poses ganham 3 variações de fervura por pose. */
  boilVariants: number;
  keeperOnly: boolean;
}

export const ANIMS: Readonly<Record<AnimName, AnimSpec>> = {
  idle: { frames: 2, views: ['side', 'front', 'back'], wide: false, boilVariants: 3, keeperOnly: false },
  run: { frames: 6, views: ['side', 'front', 'back'], wide: false, boilVariants: 1, keeperOnly: false },
  dribble: { frames: 6, views: ['side'], wide: false, boilVariants: 1, keeperOnly: false },
  pass: { frames: 3, views: ['side'], wide: false, boilVariants: 1, keeperOnly: false },
  kick: { frames: 4, views: ['side'], wide: false, boilVariants: 1, keeperOnly: false },
  slide: { frames: 2, views: ['side'], wide: true, boilVariants: 3, keeperOnly: false },
  fallen: { frames: 2, views: ['side'], wide: true, boilVariants: 3, keeperOnly: false },
  stumble: { frames: 2, views: ['side'], wide: false, boilVariants: 3, keeperOnly: false },
  celebrate: { frames: 5, views: ['front'], wide: false, boilVariants: 1, keeperOnly: false },
  gkReady: { frames: 2, views: ['front', 'side'], wide: false, boilVariants: 3, keeperOnly: true },
  gkDive: { frames: 3, views: ['side'], wide: true, boilVariants: 1, keeperOnly: true },
  gkHold: { frames: 2, views: ['front', 'side'], wide: false, boilVariants: 3, keeperOnly: true },
  gkThrow: { frames: 3, views: ['side'], wide: false, boilVariants: 1, keeperOnly: true },
};

/** Tamanho dos quadros (px da textura) e ponto do chão entre os pés. */
export const TALL = { w: 96, h: 128, ox: 48, oy: 118 } as const;
export const WIDE = { w: 140, h: 84, ox: 70, oy: 76 } as const;

export function frameName(anim: AnimName, view: View, frame: number, variant: number): string {
  return `${anim}:${view}:${frame}:${variant}`;
}

// ---------------------------------------------------------------------------
// Poses
// ---------------------------------------------------------------------------

type V = [number, number];

interface Limb {
  end: V;
  ctrl: V;
}

type Mouth = 'smile' | 'open' | 'grit' | 'o';
type Eyes = 'normal' | 'shut' | 'dizzy' | 'wide';

interface Pose {
  hip: V;
  chest: V;
  head: V;
  /** Perna/braço "de perto" (lateral) ou da direita da tela (frente/costas). */
  legA: Limb;
  legB: Limb;
  armA: Limb;
  armB: Limb;
  /** Inclinação das chuteiras (rad, positivo = bico para cima). */
  footA: number;
  footB: number;
  sx: number;
  sy: number;
  mouth: Mouth;
  eyes: Eyes;
  /** Para onde a fatia do olho aponta (rad, 0 = frente). */
  look: number;
  stars: number | null;
}

function pose(p: Partial<Pose> & Pick<Pose, 'hip' | 'chest' | 'head' | 'legA' | 'legB' | 'armA' | 'armB'>): Pose {
  return { footA: 0, footB: 0, sx: 1, sy: 1, mouth: 'smile', eyes: 'normal', look: 0, stars: null, ...p };
}

const LEG = 0.86;

/** Perna lateral a partir do ângulo (rad, positivo = para a frente) e do levantamento do pé. */
function sideLeg(hip: V, angle: number, lift: number, bend: number): Limb {
  const fx = hip[0] + Math.sin(angle) * LEG * 0.95;
  const fy = Math.max(0.07, hip[1] - Math.cos(angle) * LEG + lift);
  const mx = (hip[0] + fx) / 2;
  const my = (hip[1] + fy) / 2;
  return { end: [fx, fy], ctrl: [mx + bend, my + bend * 0.2] };
}

/** Braço lateral a partir do ângulo (rad, positivo = para a frente). */
function sideArm(shoulder: V, angle: number, length: number, bend: number): Limb {
  const hx = shoulder[0] + Math.sin(angle) * length;
  const hy = shoulder[1] - Math.cos(angle) * length;
  const mx = (shoulder[0] + hx) / 2;
  const my = (shoulder[1] + hy) / 2;
  return { end: [hx, hy], ctrl: [mx - Math.cos(angle) * bend, my - Math.sin(angle) * bend] };
}

function sidePose(anim: AnimName, f: number, n: number): Pose {
  const phi = (f / n) * Math.PI * 2;
  switch (anim) {
    case 'idle': {
      const b = f * 0.012;
      const hip: V = [0, 0.88];
      return pose({
        hip,
        chest: [0.03, 1.38 + b],
        head: [0.06, 1.68 + b * 1.3],
        legA: { end: [0.12, 0.07], ctrl: [0.14, 0.46] },
        legB: { end: [-0.1, 0.07], ctrl: [-0.04, 0.46] },
        armA: { end: [0.12, 0.9 + b], ctrl: [0.16, 1.15] },
        armB: { end: [-0.08, 0.92 + b], ctrl: [-0.1, 1.16] },
      });
    }
    case 'run':
    case 'dribble': {
      const drib = anim === 'dribble';
      const stride = drib ? 0.5 : 0.72;
      const bob = 0.045 * Math.cos(2 * phi);
      const hip: V = [0.04, 0.85 + bob];
      const chest: V = [drib ? 0.22 : 0.17, 1.33 + bob];
      const head: V = [drib ? 0.32 : 0.25, 1.62 + bob];
      const liftA = (drib ? 0.16 : 0.26) * Math.max(0, Math.cos(phi));
      const liftB = (drib ? 0.16 : 0.26) * Math.max(0, -Math.cos(phi));
      const legA = sideLeg(hip, stride * Math.sin(phi), liftA, 0.14 + liftA * 0.6);
      const legB = sideLeg(hip, -stride * Math.sin(phi), liftB, 0.14 + liftB * 0.6);
      const swing = (drib ? 0.6 : 0.95) * Math.sin(phi);
      return pose({
        hip,
        chest,
        head,
        legA,
        legB,
        footA: 0.5 * Math.sin(phi),
        footB: -0.5 * Math.sin(phi),
        armA: sideArm(chest, -swing, 0.6, 0.12),
        armB: sideArm(chest, swing, 0.6, 0.12),
        look: drib ? 0.6 : 0,
        sy: 1 + 0.03 * Math.cos(2 * phi),
        sx: 1 - 0.02 * Math.cos(2 * phi),
      });
    }
    case 'pass': {
      const foot: V[] = [
        [-0.28, 0.16],
        [0.38, 0.12],
        [0.46, 0.3],
      ];
      const lean = [-0.04, 0.06, 0.08][f] ?? 0;
      const hip: V = [0, 0.86];
      const chest: V = [0.04 + lean, 1.37];
      return pose({
        hip,
        chest,
        head: [0.08 + lean, 1.66],
        legA: { end: foot[f]!, ctrl: [(foot[f]![0] + 0.0) / 2 + 0.08, 0.5] },
        legB: { end: [-0.05, 0.07], ctrl: [0.02, 0.46] },
        footA: f === 0 ? -0.3 : 0.2,
        armA: sideArm(chest, f === 0 ? 0.6 : -0.5, 0.6, 0.1),
        armB: sideArm(chest, f === 0 ? -0.6 : 0.7, 0.6, 0.1),
        mouth: f === 1 ? 'open' : 'smile',
      });
    }
    case 'kick': {
      // 0 e 1: antecipação (inclina para trás, perna atrás); 2: estica no chute; 3: acompanha.
      const data = [
        { foot: [-0.44, 0.36], ctrl: [-0.12, 0.5], lean: -0.08, sx: 1.04, sy: 0.96, mouth: 'grit' as Mouth },
        { foot: [-0.52, 0.5], ctrl: [-0.16, 0.56], lean: -0.12, sx: 1.08, sy: 0.92, mouth: 'grit' as Mouth },
        { foot: [0.58, 0.32], ctrl: [0.3, 0.62], lean: 0.02, sx: 0.93, sy: 1.09, mouth: 'open' as Mouth },
        { foot: [0.5, 0.82], ctrl: [0.34, 0.78], lean: -0.1, sx: 0.97, sy: 1.04, mouth: 'open' as Mouth },
      ][f]!;
      const hip: V = [0, 0.86];
      const chest: V = [0.02 + data.lean, 1.37];
      const windup = f < 2;
      return pose({
        hip,
        chest,
        head: [0.05 + data.lean * 1.3, 1.67],
        legA: { end: data.foot as V, ctrl: data.ctrl as V },
        legB: { end: [0.1, 0.07], ctrl: [0.12, 0.46] },
        footA: windup ? -0.6 : 0.5,
        footB: f === 3 ? -0.35 : 0,
        armA: sideArm(chest, windup ? 0.9 : -0.9, 0.6, 0.12),
        armB: sideArm(chest, windup ? -1.0 : 1.1, 0.6, 0.12),
        sx: data.sx,
        sy: data.sy,
        mouth: data.mouth,
      });
    }
    case 'slide': {
      const k = f * 0.04;
      return pose({
        hip: [-0.1, 0.26],
        chest: [-0.52, 0.56 + k],
        head: [-0.74, 0.78 + k],
        legA: { end: [0.78, 0.12], ctrl: [0.34, 0.2] },
        legB: { end: [0.26, 0.07], ctrl: [0.12, 0.42] },
        footA: 0.5,
        armA: { end: [-0.62, 0.08], ctrl: [-0.6, 0.36] },
        armB: { end: [-0.3, 1.0 - k], ctrl: [-0.46, 0.84] },
        mouth: 'open',
        eyes: 'wide',
      });
    }
    case 'fallen': {
      const w = f === 0 ? 0 : 0.06;
      return pose({
        hip: [0.05, 0.2],
        chest: [-0.46, 0.22],
        head: [-0.78, 0.28],
        legA: { end: [0.36 + w, 0.66 - w], ctrl: [0.34, 0.3] },
        legB: { end: [0.56 - w, 0.48 + w], ctrl: [0.36, 0.18] },
        footA: 1.2,
        footB: 0.9,
        armA: { end: [-0.56, 0.62 + w], ctrl: [-0.36, 0.48] },
        armB: { end: [-0.18, 0.07], ctrl: [-0.34, 0.08] },
        mouth: 'o',
        eyes: 'dizzy',
        stars: f,
      });
    }
    case 'stumble': {
      const s = f === 0 ? 1 : -1;
      const hip: V = [0.06, 0.84];
      const chest: V = [0.3, 1.26];
      return pose({
        hip,
        chest,
        head: [0.44, 1.5],
        legA: sideLeg(hip, 0.55, 0.22, 0.18),
        legB: sideLeg(hip, -0.25, 0, 0.1),
        footA: 0.4,
        armA: sideArm(chest, s * 2.4, 0.6, 0.18),
        armB: sideArm(chest, -s * 1.6, 0.6, 0.18),
        mouth: 'o',
        eyes: 'wide',
        sx: 1.03,
        sy: 0.97,
      });
    }
    case 'gkReady': {
      const b = f * 0.02;
      const hip: V = [0, 0.74 - b];
      const chest: V = [0.08, 1.2 - b];
      return pose({
        hip,
        chest,
        head: [0.12, 1.5 - b],
        legA: { end: [0.22, 0.07], ctrl: [0.34, 0.4] },
        legB: { end: [-0.22, 0.07], ctrl: [-0.1, 0.4] },
        armA: { end: [0.42, 1.0], ctrl: [0.36, 1.2] },
        armB: { end: [0.3, 1.08], ctrl: [0.2, 1.24] },
        look: 0,
      });
    }
    case 'gkHold': {
      const b = f * 0.012;
      const chest: V = [0.04, 1.38 + b];
      return pose({
        hip: [0, 0.88],
        chest,
        head: [0.06, 1.68 + b],
        legA: { end: [0.12, 0.07], ctrl: [0.14, 0.46] },
        legB: { end: [-0.1, 0.07], ctrl: [-0.04, 0.46] },
        armA: { end: [0.3, 1.12], ctrl: [0.36, 1.32] },
        armB: { end: [0.24, 1.2], ctrl: [0.2, 1.36] },
      });
    }
    case 'gkThrow': {
      const hand: V[] = [
        [-0.46, 1.78],
        [0.46, 1.8],
        [0.52, 1.12],
      ];
      const lean = [-0.1, 0.06, 0.14][f] ?? 0;
      const chest: V = [0.03 + lean, 1.37];
      return pose({
        hip: [0, 0.87],
        chest,
        head: [0.06 + lean * 1.2, 1.67],
        legA: { end: [0.24, 0.07], ctrl: [0.2, 0.46] },
        legB: { end: [-0.2, 0.07], ctrl: [-0.12, 0.46] },
        armA: { end: hand[f]!, ctrl: [(chest[0] + hand[f]![0]) / 2, (chest[1] + hand[f]![1]) / 2 + 0.12] },
        armB: sideArm(chest, f === 0 ? 0.9 : -0.6, 0.58, 0.1),
        mouth: f === 1 ? 'open' : 'grit',
      });
    }
    case 'gkDive': {
      const data = [
        { hip: [0.0, 0.62], chest: [0.36, 0.96], head: [0.56, 1.12], hA: [0.88, 1.26], hB: [0.78, 1.36], fA: [-0.42, 0.2], fB: [-0.3, 0.07] },
        { hip: [-0.22, 0.56], chest: [0.3, 0.62], head: [0.6, 0.68], hA: [0.98, 0.72], hB: [0.92, 0.62], fA: [-0.78, 0.5], fB: [-0.72, 0.42] },
        { hip: [-0.22, 0.2], chest: [0.3, 0.24], head: [0.6, 0.3], hA: [0.94, 0.2], hB: [0.86, 0.12], fA: [-0.74, 0.12], fB: [-0.68, 0.07] },
      ][f]!;
      const hip = data.hip as V;
      const chest = data.chest as V;
      const mid = (a: V, b: V, dy: number): V => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + dy];
      return pose({
        hip,
        chest,
        head: data.head as V,
        legA: { end: data.fA as V, ctrl: mid(hip, data.fA as V, 0.06) },
        legB: { end: data.fB as V, ctrl: mid(hip, data.fB as V, -0.04) },
        armA: { end: data.hA as V, ctrl: mid(chest, data.hA as V, 0.1) },
        armB: { end: data.hB as V, ctrl: mid(chest, data.hB as V, -0.06) },
        footA: 1.2,
        footB: 1.1,
        mouth: f === 2 ? 'grit' : 'open',
        eyes: 'wide',
      });
    }
    case 'celebrate':
      return frontPose('celebrate', f, n);
  }
}

/** Poses de frente/costas: x = lateral na tela, legA/armA = lado direito da tela. */
function frontPose(anim: AnimName, f: number, n: number): Pose {
  const phi = (f / n) * Math.PI * 2;
  switch (anim) {
    case 'run': {
      const bob = 0.04 * Math.cos(2 * phi);
      const liftR = 0.24 * Math.max(0, Math.sin(phi));
      const liftL = 0.24 * Math.max(0, -Math.sin(phi));
      const hip: V = [0, 0.86 + bob];
      const chest: V = [0, 1.36 + bob];
      const swing = 0.16 * Math.sin(phi);
      return pose({
        hip,
        chest,
        head: [0, 1.66 + bob],
        legA: { end: [0.15, 0.07 + liftR], ctrl: [0.2, 0.46 + liftR * 1.3] },
        legB: { end: [-0.15, 0.07 + liftL], ctrl: [-0.2, 0.46 + liftL * 1.3] },
        armA: { end: [0.34, 0.95 - swing], ctrl: [0.4, 1.18] },
        armB: { end: [-0.34, 0.95 + swing], ctrl: [-0.4, 1.18] },
        sy: 1 + 0.03 * Math.cos(2 * phi),
      });
    }
    case 'celebrate': {
      const data = [
        { jump: 0, hip: 0.7, rh: [0.3, 0.86], lh: [-0.3, 0.86], legOut: 0.26, sx: 1.08, sy: 0.92, eyes: 'normal' as Eyes },
        { jump: 0.34, hip: 0.86, rh: [0.46, 2.12], lh: [-0.46, 2.12], legOut: 0.12, sx: 0.95, sy: 1.06, eyes: 'shut' as Eyes },
        { jump: 0.26, hip: 0.86, rh: [0.16, 2.26], lh: [-0.3, 1.0], legOut: 0.16, sx: 0.97, sy: 1.04, eyes: 'shut' as Eyes },
        { jump: 0.26, hip: 0.86, rh: [0.3, 1.0], lh: [-0.16, 2.26], legOut: 0.16, sx: 0.97, sy: 1.04, eyes: 'shut' as Eyes },
        { jump: 0.14, hip: 0.86, rh: [0.58, 1.86], lh: [-0.58, 1.1], legOut: 0.2, sx: 1, sy: 1, eyes: 'shut' as Eyes },
      ][f]!;
      const j = data.jump;
      const hip: V = [0, data.hip + j];
      const chest: V = [0, data.hip + 0.5 + j];
      const head: V = [0, data.hip + 0.8 + j];
      const tuck = j > 0 ? 0.16 : 0;
      return pose({
        hip,
        chest,
        head,
        legA: { end: [data.legOut, 0.07 + j + tuck], ctrl: [data.legOut + 0.1, (hip[1] + j) / 2 + 0.1] },
        legB: { end: [-data.legOut, 0.07 + j + tuck * 0.6], ctrl: [-data.legOut - 0.1, (hip[1] + j) / 2 + 0.1] },
        armA: { end: [data.rh[0]!, data.rh[1]! + (data.rh[1]! > 1.5 ? j * 0.2 : j)], ctrl: [data.rh[0]! + 0.2, (chest[1] + data.rh[1]!) / 2] },
        armB: { end: [data.lh[0]!, data.lh[1]! + (data.lh[1]! > 1.5 ? j * 0.2 : j)], ctrl: [data.lh[0]! - 0.2, (chest[1] + data.lh[1]!) / 2] },
        sx: data.sx,
        sy: data.sy,
        mouth: 'open',
        eyes: data.eyes,
      });
    }
    case 'gkReady': {
      const b = f * 0.02;
      return pose({
        hip: [0, 0.72 - b],
        chest: [0, 1.2 - b],
        head: [0, 1.5 - b],
        legA: { end: [0.3, 0.07], ctrl: [0.42, 0.4] },
        legB: { end: [-0.3, 0.07], ctrl: [-0.42, 0.4] },
        armA: { end: [0.44, 1.02 - b], ctrl: [0.5, 1.22] },
        armB: { end: [-0.44, 1.02 - b], ctrl: [-0.5, 1.22] },
      });
    }
    case 'gkHold': {
      const b = f * 0.012;
      return pose({
        hip: [0, 0.88],
        chest: [0, 1.38 + b],
        head: [0, 1.68 + b],
        legA: { end: [0.15, 0.07], ctrl: [0.16, 0.46] },
        legB: { end: [-0.15, 0.07], ctrl: [-0.16, 0.46] },
        armA: { end: [0.1, 1.14], ctrl: [0.4, 1.12] },
        armB: { end: [-0.1, 1.14], ctrl: [-0.4, 1.12] },
      });
    }
    case 'idle':
    default: {
      const b = f * 0.012;
      return pose({
        hip: [0, 0.88],
        chest: [0, 1.38 + b],
        head: [0, 1.68 + b * 1.3],
        legA: { end: [0.15, 0.07], ctrl: [0.17, 0.46] },
        legB: { end: [-0.15, 0.07], ctrl: [-0.17, 0.46] },
        armA: { end: [0.33, 0.92 + b], ctrl: [0.38, 1.16] },
        armB: { end: [-0.33, 0.92 + b], ctrl: [-0.38, 1.16] },
      });
    }
  }
}

export function poseFor(anim: AnimName, view: View, f: number): Pose {
  const n = ANIMS[anim].frames;
  return view === 'side' ? sidePose(anim, f, n) : frontPose(anim, f, n);
}

// ---------------------------------------------------------------------------
// Desenho
// ---------------------------------------------------------------------------

/** Espessuras (m). */
const LEG_W = 0.185;
const ARM_W = 0.125;
const HEAD_R = 0.25;
/** Contorno (px da textura). */
const LINE = 2.6;

interface Palette {
  shirt: number;
  stripes: readonly [number, number] | null;
  stripeCount: number;
  collar: number;
  cuffs: number;
  trim: number;
  shorts: number;
  shortsTrim: number;
  socks: number;
  socksBand: number | null;
  number: number;
  skin: number;
  hair: number;
  glove: number;
}

function paletteOf(look: PlayerLook): Palette {
  const k = look.kit;
  if (look.isKeeper) {
    const c = look.keeperColor;
    const dark = shade(c, 0.45);
    return {
      shirt: c,
      stripes: null,
      stripeCount: 0,
      collar: dark,
      cuffs: dark,
      trim: dark,
      shorts: 0x26262b,
      shortsTrim: c,
      socks: c,
      socksBand: dark,
      number: mix(c, 0x111111, 0.75),
      skin: look.skin,
      hair: look.hairColor,
      glove: 0xf7f3e8,
    };
  }
  return {
    shirt: k.shirt,
    stripes: k.pattern.kind === 'stripes' ? k.pattern.colors : null,
    stripeCount: k.pattern.kind === 'stripes' ? k.pattern.count : 0,
    collar: k.collar,
    cuffs: k.cuffs,
    trim: k.trim,
    shorts: k.shorts,
    shortsTrim: k.shortsTrim,
    socks: k.socks,
    socksBand: k.socksBand,
    number: k.number,
    skin: look.skin,
    hair: look.hairColor,
    glove: 0xf7f3e8,
  };
}

interface DrawCtx {
  ctx: Ctx;
  pal: Palette;
  look: PlayerLook;
  /** Converte metros da pose em px da textura (com fervura). */
  pt: (v: V) => P;
  /** Escala px/m. */
  u: number;
}

/** Ponto de um membro em px. */
function limbPx(d: DrawCtx, root: V, l: Limb): [P, P, P] {
  return [d.pt(root), d.pt(l.ctrl), d.pt(l.end)];
}

function drawLeg(d: DrawCtx, root: V, l: Limb, foot: number, back: boolean, view: View, dark: boolean): void {
  const { ctx, pal, u } = d;
  const [a, c, b] = limbPx(d, root, l);
  const skin = dark ? shade(pal.skin, 0.22) : pal.skin;
  const sock = dark ? shade(pal.socks, 0.25) : pal.socks;
  const band = pal.socksBand === null ? sock : dark ? shade(pal.socksBand, 0.25) : pal.socksBand;
  hose(
    ctx,
    a,
    c,
    b,
    LEG_W * u,
    [
      { to: 0.5, color: skin },
      { to: 0.58, color: band },
      { to: 1, color: sock },
    ],
    LINE,
  );
  drawShoe(d, b, quadEndDir(c, b), foot, view, back, dark);
}

function drawShoe(d: DrawCtx, at: P, legDir: P, foot: number, view: View, back: boolean, dark: boolean): void {
  const { ctx, u } = d;
  const color = dark ? '#2b2422' : '#1f1a17';
  if (view === 'side') {
    // Bota grande e arredondada: bico para a frente (+x), inclinada por `foot`.
    const ang = -foot;
    ctx.save();
    ctx.translate(at.x + legDir.x * 0.02 * u, at.y + 0.02 * u);
    ctx.rotate(ang);
    const L = 0.34 * u;
    const H = 0.14 * u;
    inkFill(
      ctx,
      () => {
        ctx.moveTo(-0.1 * u, 0);
        ctx.quadraticCurveTo(-0.13 * u, -H, 0.02 * u, -H * 0.95);
        ctx.quadraticCurveTo(L * 0.7, -H * 1.15, L * 0.82, -H * 0.2);
        ctx.quadraticCurveTo(L * 0.88, H * 0.45, L * 0.5, H * 0.45);
        ctx.lineTo(-0.06 * u, H * 0.45);
        ctx.quadraticCurveTo(-0.13 * u, H * 0.4, -0.1 * u, 0);
      },
      color,
      LINE,
    );
    // Brilho de desenho animado.
    ctx.beginPath();
    ctx.ellipse(L * 0.5, -H * 0.55, L * 0.12, H * 0.16, -0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fill();
    ctx.restore();
  } else {
    // De frente/costas: bota oval.
    const w = 0.13 * u;
    const h = 0.085 * u;
    inkFill(ctx, () => ellipsePath(ctx, at.x, at.y + 0.04 * u, w, h), color, LINE);
    if (!back) {
      ctx.beginPath();
      ctx.ellipse(at.x - w * 0.3, at.y + 0.01 * u, w * 0.25, h * 0.3, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.5)';
      ctx.fill();
    }
  }
}

function drawArm(d: DrawCtx, root: V, l: Limb, dark: boolean): void {
  const { ctx, pal, u, look } = d;
  const [a, c, b] = limbPx(d, root, l);
  const sleeve = pal.stripes ? pal.stripes[0] : pal.shirt;
  const s = dark ? shade(sleeve, 0.25) : sleeve;
  const cuff = dark ? shade(pal.cuffs, 0.25) : pal.cuffs;
  const skin = dark ? shade(pal.skin, 0.22) : pal.skin;
  hose(
    ctx,
    a,
    c,
    b,
    ARM_W * u,
    look.isKeeper
      ? [
          { to: 0.62, color: s },
          { to: 0.72, color: cuff },
          { to: 1, color: skin },
        ]
      : [
          { to: 0.34, color: s },
          { to: 0.42, color: cuff },
          { to: 1, color: skin },
        ],
    LINE,
  );
  if (look.isKeeper) {
    const g = dark ? shade(pal.glove, 0.2) : pal.glove;
    const r = 0.115 * u;
    inkFill(ctx, () => ellipsePath(ctx, b.x, b.y, r, r * 0.95), css(g), LINE);
    ctx.beginPath();
    ctx.arc(b.x - r * 0.3, b.y - r * 0.3, r * 0.3, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fill();
    // Punho da luva.
    const dir = quadEndDir(c, b);
    ctx.beginPath();
    ctx.moveTo(b.x - dir.x * r * 0.9 - dir.y * r * 0.7, b.y - dir.y * r * 0.9 + dir.x * r * 0.7);
    ctx.lineTo(b.x - dir.x * r * 0.9 + dir.y * r * 0.7, b.y - dir.y * r * 0.9 - dir.x * r * 0.7);
    ctx.lineWidth = r * 0.45;
    ctx.strokeStyle = css(pal.cuffs);
    ctx.stroke();
  } else {
    const r = 0.068 * u;
    inkFill(ctx, () => ellipsePath(ctx, b.x, b.y, r, r), css(skin), LINE * 0.9);
  }
}

/** Calção: quadril + "mangas" sobre o alto das coxas. */
function drawShorts(d: DrawCtx, hip: V, legs: [V, Limb][], view: View): void {
  const { ctx, pal, u } = d;
  const h = d.pt(hip);
  const color = css(pal.shorts);
  for (const [root, l] of legs) {
    const [a, c, b] = limbPx(d, root, l);
    const end = { x: a.x + (c.x - a.x) * 0.55 + (b.x - c.x) * 0.05, y: a.y + (c.y - a.y) * 0.55 + (b.y - c.y) * 0.05 };
    for (const drop of [0.9, 0]) {
      ctx.beginPath();
      ctx.moveTo(a.x, a.y + drop);
      ctx.lineTo(end.x, end.y + drop);
      ctx.lineWidth = LEG_W * u * 1.55 + LINE * 2;
      ctx.lineCap = 'butt';
      ctx.strokeStyle = INK_CSS;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(end.x, end.y);
    ctx.lineWidth = LEG_W * u * 1.55;
    ctx.strokeStyle = color;
    ctx.stroke();
    // Friso na barra.
    ctx.beginPath();
    const dx = end.x - a.x;
    const dy = end.y - a.y;
    const l2 = Math.hypot(dx, dy) || 1;
    const nx = -dy / l2;
    const ny = dx / l2;
    const half = (LEG_W * u * 1.55) / 2;
    ctx.moveTo(end.x - nx * half - (dx / l2) * 1.5, end.y - ny * half - (dy / l2) * 1.5);
    ctx.lineTo(end.x + nx * half - (dx / l2) * 1.5, end.y + ny * half - (dy / l2) * 1.5);
    ctx.lineWidth = 1.6;
    ctx.strokeStyle = css(pal.shortsTrim);
    ctx.stroke();
    ctx.lineCap = 'round';
  }
  const rx = (view === 'side' ? 0.17 : 0.22) * u;
  const ry = 0.13 * u;
  inkFill(ctx, () => ellipsePath(ctx, h.x, h.y - 0.02 * u, rx, ry), color, LINE);
}

/** Tronco (camisa) com padrão, gola e (nas costas) número. */
function drawTorso(d: DrawCtx, hip: V, chest: V, view: View, back: boolean): void {
  const { ctx, pal, u, look } = d;
  const a = d.pt(hip);
  const b = d.pt(chest);
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const wHip = (view === 'side' ? 0.15 : 0.19) * u;
  const wChest = (view === 'side' ? 0.18 : 0.26) * u;
  // Ombros um pouco acima do peito.
  const top = { x: b.x + ux * 0.07 * u, y: b.y + uy * 0.07 * u };
  const bot = { x: a.x - ux * 0.02 * u, y: a.y - uy * 0.02 * u };
  const path = (): void => {
    ctx.moveTo(bot.x + nx * wHip, bot.y + ny * wHip);
    ctx.quadraticCurveTo(
      (bot.x + top.x) / 2 + nx * wChest * 1.15,
      (bot.y + top.y) / 2 + ny * wChest * 1.15,
      top.x + nx * wChest,
      top.y + ny * wChest,
    );
    ctx.quadraticCurveTo(top.x + ux * 0.08 * u, top.y + uy * 0.08 * u, top.x - nx * wChest, top.y - ny * wChest);
    ctx.quadraticCurveTo(
      (bot.x + top.x) / 2 - nx * wChest * 1.15,
      (bot.y + top.y) / 2 - ny * wChest * 1.15,
      bot.x - nx * wHip,
      bot.y - ny * wHip,
    );
    ctx.quadraticCurveTo(bot.x - ux * 0.05 * u, bot.y - uy * 0.05 * u, bot.x + nx * wHip, bot.y + ny * wHip);
    ctx.closePath();
  };
  inkFill(ctx, path, css(pal.shirt), LINE);

  // Padrão e sombra fria, recortados no formato da camisa.
  ctx.save();
  ctx.beginPath();
  path();
  ctx.clip();
  if (pal.stripes) {
    const count = view === 'side' ? 3 : pal.stripeCount;
    const width = (wChest * 2.4) / count;
    for (let i = -count; i <= count; i++) {
      if (((i % 2) + 2) % 2 !== 0) continue;
      const off = i * width;
      ctx.beginPath();
      const cx = (a.x + b.x) / 2 + nx * off;
      const cy = (a.y + b.y) / 2 + ny * off;
      const L = len * 1.6;
      ctx.moveTo(cx - ux * L - nx * width / 2, cy - uy * L - ny * width / 2);
      ctx.lineTo(cx + ux * L - nx * width / 2, cy + uy * L - ny * width / 2);
      ctx.lineTo(cx + ux * L + nx * width / 2, cy + uy * L + ny * width / 2);
      ctx.lineTo(cx - ux * L + nx * width / 2, cy - uy * L + ny * width / 2);
      ctx.closePath();
      ctx.fillStyle = css(pal.stripes[1]);
      ctx.fill();
    }
  }
  // Sombra fria embaixo e de um lado (luz vindo de cima/esquerda).
  ctx.beginPath();
  ctx.moveTo(bot.x - nx * wHip * 2, bot.y - ny * wHip * 2);
  ctx.lineTo(bot.x + nx * wHip * 2, bot.y + ny * wHip * 2);
  ctx.lineTo(bot.x + nx * wHip * 2 + ux * len * 0.32, bot.y + ny * wHip * 2 + uy * len * 0.32);
  ctx.lineTo(bot.x - nx * wHip * 2 + ux * len * 0.32, bot.y - ny * wHip * 2 + uy * len * 0.32);
  ctx.closePath();
  ctx.fillStyle = 'rgba(43,53,80,0.22)';
  ctx.fill();
  if (view !== 'side') {
    ctx.beginPath();
    ctx.ellipse(b.x + nx * wChest * 0.55, b.y + ny * wChest * 0.2, wChest * 0.25, len * 0.35, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fill();
  }
  ctx.restore();

  // Gola.
  ctx.beginPath();
  if (view === 'front') {
    ctx.moveTo(top.x - nx * wChest * 0.45, top.y - ny * wChest * 0.45);
    ctx.lineTo(top.x + ux * -0.1 * u, top.y + uy * -0.1 * u);
    ctx.lineTo(top.x + nx * wChest * 0.45, top.y + ny * wChest * 0.45);
  } else {
    ctx.moveTo(top.x - nx * wChest * 0.5, top.y - ny * wChest * 0.5);
    ctx.quadraticCurveTo(top.x + ux * 0.03 * u, top.y + uy * 0.03 * u, top.x + nx * wChest * 0.5, top.y + ny * wChest * 0.5);
  }
  ctx.lineWidth = 0.05 * u + 2;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
  ctx.lineWidth = 0.05 * u;
  ctx.strokeStyle = css(pal.collar);
  ctx.stroke();

  // Número nas costas.
  if (back) {
    const size = Math.round(0.36 * u);
    ctx.save();
    ctx.translate((a.x + b.x) / 2, (a.y + b.y) / 2 - 0.02 * u);
    ctx.rotate(Math.atan2(ux, -uy));
    ctx.font = `700 ${size}px "${FONT_TEXT}"`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK_CSS;
    ctx.strokeText(String(look.number), 0, 0);
    ctx.fillStyle = css(pal.number);
    ctx.fillText(String(look.number), 0, 0);
    ctx.restore();
  }
}

function drawHair(d: DrawCtx, h: P, r: number, view: View): void {
  const { ctx, look, pal } = d;
  if (look.hair === 'bald' && view !== 'back') {
    ctx.beginPath();
    ctx.ellipse(h.x - r * 0.25, h.y - r * 0.55, r * 0.28, r * 0.14, -0.4, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fill();
    return;
  }
  const color = css(pal.hair);
  const face = view === 'side' ? 1 : 0;
  inkFill(
    ctx,
    () => {
      if (view === 'back') {
        ctx.arc(h.x, h.y, r * 1.02, Math.PI * 0.92, Math.PI * 2.08);
        ctx.quadraticCurveTo(h.x + r * 0.6, h.y + r * 0.55, h.x, h.y + r * 0.62);
        ctx.quadraticCurveTo(h.x - r * 0.6, h.y + r * 0.55, h.x - r * 1.0, h.y + r * 0.2);
        return;
      }
      if (look.hair === 'flat') {
        ctx.moveTo(h.x - r * 1.02, h.y - r * 0.05);
        ctx.lineTo(h.x - r * 0.95, h.y - r * 0.95);
        ctx.lineTo(h.x + r * (0.7 + 0.25 * face), h.y - r * 1.05);
        ctx.lineTo(h.x + r * (0.95 - 0.1 * face), h.y - r * 0.45);
        ctx.quadraticCurveTo(h.x, h.y - r * 0.6, h.x - r * 0.6, h.y - r * 0.25);
        ctx.closePath();
        return;
      }
      if (look.hair === 'curly') {
        const bumps = 6;
        const a0 = Math.PI * (face ? 0.9 : 0.95);
        const a1 = Math.PI * (face ? 2.2 : 2.05);
        for (let i = 0; i <= bumps; i++) {
          const a = a0 + ((a1 - a0) * i) / bumps;
          const bx = h.x + Math.cos(a) * r * 0.98;
          const by = h.y + Math.sin(a) * r * 0.98;
          if (i === 0) ctx.moveTo(bx, by);
          ctx.arc(bx, by, r * 0.26, a + Math.PI, a + Math.PI * 2.0);
        }
        ctx.quadraticCurveTo(h.x, h.y - r * 0.35, h.x + Math.cos(a0) * r, h.y + Math.sin(a0) * r);
        ctx.closePath();
        return;
      }
      // 'short' e 'parted'.
      const start = view === 'side' ? Math.PI * 0.85 : Math.PI * 1.02;
      const end = view === 'side' ? Math.PI * 1.98 : Math.PI * 1.98;
      ctx.arc(h.x, h.y, r * 1.04, start, end);
      if (look.hair === 'parted') {
        ctx.quadraticCurveTo(h.x + r * 0.3, h.y - r * 0.55, h.x - r * 0.1, h.y - r * 0.82);
        ctx.quadraticCurveTo(h.x - r * 0.4, h.y - r * 0.5, h.x + Math.cos(start) * r, h.y + Math.sin(start) * r);
      } else {
        ctx.quadraticCurveTo(h.x, h.y - r * 0.55, h.x + Math.cos(start) * r * 1.04, h.y + Math.sin(start) * r * 1.04);
      }
      ctx.closePath();
    },
    color,
    LINE * 0.9,
  );
  // Brilho no cabelo.
  ctx.beginPath();
  ctx.arc(h.x - r * 0.2, h.y - r * 0.6, r * 0.35, Math.PI * 1.15, Math.PI * 1.55);
  ctx.lineWidth = 1.4;
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.stroke();
}

function drawHead(d: DrawCtx, p: Pose, view: View, back: boolean): void {
  const { ctx, pal, u } = d;
  const h = d.pt(p.head);
  const r = HEAD_R * u;
  const neckBase = d.pt(p.chest);
  // Pescoço.
  hose(ctx, neckBase, { x: (neckBase.x + h.x) / 2, y: (neckBase.y + h.y) / 2 }, { x: h.x, y: h.y + r * 0.6 }, 0.1 * u, [{ to: 1, color: shade(pal.skin, 0.12) }], LINE * 0.8);

  // Orelhas.
  const ear = (x: number): void => inkFill(ctx, () => ellipsePath(ctx, x, h.y + r * 0.08, r * 0.2, r * 0.25), css(pal.skin), LINE * 0.8);
  if (view === 'side') ear(h.x - r * 0.18);
  else {
    ear(h.x - r * 0.98);
    ear(h.x + r * 0.98);
  }
  // Cabeça (com sombra fria embaixo).
  inkFill(ctx, () => ellipsePath(ctx, h.x, h.y, r, r * 1.02), css(pal.skin), LINE);
  ctx.save();
  ctx.beginPath();
  ellipsePath(ctx, h.x, h.y, r, r * 1.02);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(h.x + r * 0.15, h.y + r * 0.95, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
  ctx.fillStyle = css(shade(pal.skin, 0.25), 0.55);
  ctx.fill();
  ctx.restore();

  drawHair(d, h, r, view);
  if (back) return;

  const line = LINE * 0.8;
  const eyeR = { x: r * 0.2, y: r * 0.31 };
  if (view === 'side') {
    const ex = h.x + r * 0.42;
    const ey = h.y - r * 0.05;
    drawEye(d, ex, ey, eyeR.x, eyeR.y, p, line);
    // Nariz em ponto, na frente.
    inkFill(ctx, () => ellipsePath(ctx, h.x + r * 1.0, h.y + r * 0.12, r * 0.15, r * 0.13), INK_CSS, 0.1);
    drawMouth(d, h.x + r * 0.55, h.y + r * 0.48, r * 0.38, p.mouth, true);
  } else {
    drawEye(d, h.x - r * 0.33, h.y - r * 0.08, eyeR.x, eyeR.y, p, line);
    drawEye(d, h.x + r * 0.33, h.y - r * 0.08, eyeR.x, eyeR.y, p, line);
    inkFill(ctx, () => ellipsePath(ctx, h.x, h.y + r * 0.22, r * 0.14, r * 0.12), INK_CSS, 0.1);
    drawMouth(d, h.x, h.y + r * 0.52, r * 0.42, p.mouth, false);
  }
}

function drawEye(d: DrawCtx, x: number, y: number, rx: number, ry: number, p: Pose, line: number): void {
  const { ctx } = d;
  if (p.eyes === 'dizzy') {
    ctx.beginPath();
    ctx.moveTo(x - rx, y - ry * 0.7);
    ctx.lineTo(x + rx, y + ry * 0.7);
    ctx.moveTo(x + rx, y - ry * 0.7);
    ctx.lineTo(x - rx, y + ry * 0.7);
    ctx.lineWidth = line * 1.1;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke();
    return;
  }
  const scale = p.eyes === 'wide' ? 1.2 : 1;
  pieEye(ctx, x, y, rx * scale, ry * scale, p.look, line, p.eyes === 'shut');
}

function drawMouth(d: DrawCtx, x: number, y: number, w: number, mouth: Mouth, side: boolean): void {
  const { ctx } = d;
  ctx.lineWidth = LINE * 0.8;
  ctx.strokeStyle = INK_CSS;
  const x0 = side ? x - w * 0.35 : x - w * 0.5;
  const x1 = side ? x + w * 0.55 : x + w * 0.5;
  switch (mouth) {
    case 'smile':
      ctx.beginPath();
      ctx.moveTo(x0, y - w * 0.1);
      ctx.quadraticCurveTo(x, y + w * 0.35, x1, y - w * 0.15);
      ctx.stroke();
      break;
    case 'grit':
      inkFill(
        ctx,
        () => {
          ctx.moveTo(x0, y - w * 0.12);
          ctx.lineTo(x1, y - w * 0.12);
          ctx.lineTo(x1, y + w * 0.12);
          ctx.lineTo(x0, y + w * 0.12);
          ctx.closePath();
        },
        '#ffffff',
        LINE * 0.7,
      );
      break;
    case 'open':
      inkFill(
        ctx,
        () => {
          ctx.moveTo(x0, y - w * 0.15);
          ctx.quadraticCurveTo(x, y - w * 0.05, x1, y - w * 0.2);
          ctx.quadraticCurveTo(x1 - w * 0.1, y + w * 0.55, x, y + w * 0.5);
          ctx.quadraticCurveTo(x0, y + w * 0.45, x0, y - w * 0.15);
        },
        '#5a1d1d',
        LINE * 0.7,
      );
      ctx.beginPath();
      ctx.ellipse(x + w * 0.05, y + w * 0.32, w * 0.22, w * 0.12, 0, 0, Math.PI * 2);
      ctx.fillStyle = '#e0605e';
      ctx.fill();
      break;
    case 'o':
      inkFill(ctx, () => ellipsePath(ctx, x + (side ? w * 0.1 : 0), y + w * 0.1, w * 0.18, w * 0.24), '#5a1d1d', LINE * 0.7);
      break;
  }
}

function drawStars(d: DrawCtx, p: Pose): void {
  if (p.stars === null) return;
  const { ctx, u } = d;
  const h = d.pt(p.head);
  for (let i = 0; i < 3; i++) {
    const a = p.stars * 1.1 + (i * Math.PI * 2) / 3;
    const x = h.x + Math.cos(a) * 0.32 * u;
    const y = h.y - 0.3 * u + Math.sin(a) * 0.1 * u;
    inkFill(
      ctx,
      () => {
        for (let k = 0; k < 10; k++) {
          const rr = k % 2 === 0 ? 0.07 * u : 0.03 * u;
          const aa = (k * Math.PI) / 5 - Math.PI / 2;
          const px = x + Math.cos(aa) * rr;
          const py = y + Math.sin(aa) * rr;
          if (k === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
      },
      '#ffd84a',
      1.4,
    );
  }
}

/** Desenha um jogador numa pose, com o ponto do chão em (ox, oy). */
export function drawFigure(ctx: Ctx, look: PlayerLook, p: Pose, view: View, ox: number, oy: number, boilSeed: number): void {
  const u = PLAYER_ART_PPM;
  const rng = new Rng(boilSeed);
  const jit = BOIL_JITTER * (u / 27.2);
  const cache = new Map<V, P>();
  // Cada ponto de controle ganha um pequeno deslocamento (fervura), estável por quadro.
  const pt = (v: V): P => {
    let r = cache.get(v);
    if (!r) {
      const x = v[0] * p.sx;
      const y = v[1] * p.sy;
      r = { x: ox + x * u + rng.range(-jit, jit), y: oy - y * u + rng.range(-jit, jit) };
      cache.set(v, r);
    }
    return r;
  };
  const d: DrawCtx = { ctx, pal: paletteOf(look), look, pt, u };
  const back = view === 'back';
  const hipA: V = view === 'side' ? [p.hip[0] + 0.03, p.hip[1]] : [p.hip[0] + 0.1, p.hip[1]];
  const hipB: V = view === 'side' ? [p.hip[0] - 0.03, p.hip[1]] : [p.hip[0] - 0.1, p.hip[1]];
  const shA: V = view === 'side' ? [p.chest[0] + 0.03, p.chest[1]] : [p.chest[0] + 0.24, p.chest[1] - 0.02];
  const shB: V = view === 'side' ? [p.chest[0] - 0.03, p.chest[1]] : [p.chest[0] - 0.24, p.chest[1] - 0.02];

  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  if (view === 'side') {
    drawArm(d, shB, p.armB, true);
    drawLeg(d, hipB, p.legB, p.footB, back, view, true);
    drawLeg(d, hipA, p.legA, p.footA, back, view, false);
    drawShorts(d, p.hip, [[hipB, p.legB], [hipA, p.legA]], view);
    drawTorso(d, p.hip, p.chest, view, back);
    drawHead(d, p, view, back);
    drawArm(d, shA, p.armA, false);
  } else {
    drawLeg(d, hipB, p.legB, p.footB, back, view, false);
    drawLeg(d, hipA, p.legA, p.footA, back, view, false);
    drawShorts(d, p.hip, [[hipB, p.legB], [hipA, p.legA]], view);
    // Braços: pendurados ao lado do tronco (atrás nas costas, na frente de frente).
    if (back) {
      drawTorso(d, p.hip, p.chest, view, back);
      drawArm(d, shA, p.armA, false);
      drawArm(d, shB, p.armB, false);
      drawHead(d, p, view, back);
    } else {
      drawTorso(d, p.hip, p.chest, view, back);
      drawHead(d, p, view, back);
      drawArm(d, shA, p.armA, false);
      drawArm(d, shB, p.armB, false);
    }
  }
  drawStars(d, p);
}

// ---------------------------------------------------------------------------
// Atlas por jogador
// ---------------------------------------------------------------------------

export interface FrameRef {
  anim: AnimName;
  view: View;
  frame: number;
  variant: number;
  wide: boolean;
}

/** Lista de quadros de um jogador (goleiro tem as animações extras). */
export function framesFor(isKeeper: boolean): FrameRef[] {
  const out: FrameRef[] = [];
  for (const anim of Object.keys(ANIMS) as AnimName[]) {
    const spec = ANIMS[anim];
    if (spec.keeperOnly && !isKeeper) continue;
    for (const view of spec.views) {
      for (let f = 0; f < spec.frames; f++) {
        for (let v = 0; v < spec.boilVariants; v++) out.push({ anim, view, frame: f, variant: v, wide: spec.wide });
      }
    }
  }
  return out;
}

const COLS_TALL = 10;
const COLS_WIDE = 7;

/**
 * Gera a textura (atlas) de um jogador com todos os quadros nomeados por frameName().
 * Recria a textura se já existir (nova partida, novos uniformes).
 */
export function generatePlayerTexture(scene: Phaser.Scene, key: string, look: PlayerLook): void {
  const frames = framesFor(look.isKeeper);
  const tall = frames.filter((f) => !f.wide);
  const wide = frames.filter((f) => f.wide);
  const rowsTall = Math.ceil(tall.length / COLS_TALL);
  const rowsWide = Math.ceil(wide.length / COLS_WIDE);
  const width = Math.max(COLS_TALL * TALL.w, COLS_WIDE * WIDE.w);
  const height = rowsTall * TALL.h + rowsWide * WIDE.h;
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, width, height);
  if (!tex) throw new Error(`Não foi possível criar a textura ${key}`);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, width, height);

  const place = (list: FrameRef[], cols: number, size: { w: number; h: number; ox: number; oy: number }, y0: number): void => {
    list.forEach((fr, i) => {
      const x = (i % cols) * size.w;
      const y = y0 + Math.floor(i / cols) * size.h;
      const p = poseFor(fr.anim, fr.view, fr.frame);
      const seed = look.seed * 7919 + i * 131 + fr.variant * 977 + (fr.wide ? 50000 : 0);
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, size.w, size.h);
      ctx.clip();
      drawFigure(ctx, look, p, fr.view, x + size.ox, y + size.oy, seed);
      ctx.restore();
      tex.add(frameName(fr.anim, fr.view, fr.frame, fr.variant), 0, x, y, size.w, size.h);
    });
  };
  place(tall, COLS_TALL, TALL, 0);
  place(wide, COLS_WIDE, WIDE, rowsTall * TALL.h);
  tex.refresh();
}

/** Origem (0..1) de cada tipo de quadro: o ponto do chão entre os pés. */
export const ORIGIN_TALL = { x: TALL.ox / TALL.w, y: TALL.oy / TALL.h };
export const ORIGIN_WIDE = { x: WIDE.ox / WIDE.w, y: WIDE.oy / WIDE.h };

/** Escala de exibição: px da tela por px da textura (na frente do campo, s = 1). */
export function displayScale(ppm: number): number {
  return ppm / PLAYER_ART_PPM;
}

