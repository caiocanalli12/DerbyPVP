/**
 * Escolha de uniformes sem conflito de cores (lógica pura).
 *
 * - Cada uniforme tem uma "cor de leitura": média ponderada (em sRGB) da camisa
 *   (listras pela média), do calção e das meias.
 * - Se as cores de leitura dos titulares estiverem próximas demais (CIEDE2000 abaixo do
 *   limite), o J2 usa o reserva; se ainda conflitar, o J1 também usa o reserva.
 * - Mesmo time dos dois lados: o J2 usa o reserva.
 * - Na seleção de times, cada jogador pode fixar o uniforme 1 (titular) ou 2 (reserva), desde que
 *   a combinação não fique com cores parecidas; quem está no automático se ajusta.
 * - Goleiros: cada um recebe uma cor da lista, maximizando a diferença em relação aos dois
 *   uniformes de linha e ao outro goleiro.
 */
import {
  KEEPER_COLORS,
  KIT_CONFLICT_THRESHOLD,
  KIT_WEIGHT_SHIRT,
  KIT_WEIGHT_SHORTS,
  KIT_WEIGHT_SOCKS,
} from '../config/constants';
import { getTeam } from '../data/teams';
import type { Kit, TeamId } from '../data/teams';

export type KitVariant = 'home' | 'away';

export interface Lab {
  L: number;
  a: number;
  b: number;
}

function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

function toLinear(color: number): [number, number, number] {
  return [srgbToLinear((color >> 16) & 0xff), srgbToLinear((color >> 8) & 0xff), srgbToLinear(color & 0xff)];
}

/** sRGB (0xRRGGBB) -> CIE Lab (D65). */
export function toLab(color: number): Lab {
  const [r, g, b] = toLinear(color);
  const x = (r * 0.4124 + g * 0.3576 + b * 0.1805) / 0.95047;
  const y = r * 0.2126 + g * 0.7152 + b * 0.0722;
  const z = (r * 0.0193 + g * 0.1192 + b * 0.9505) / 1.08883;
  const f = (t: number): number => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

/** Diferença de cor perceptual CIEDE2000. */
export function deltaE2000(c1: Lab, c2: Lab): number {
  const deg = Math.PI / 180;
  const C1 = Math.hypot(c1.a, c1.b);
  const C2 = Math.hypot(c2.a, c2.b);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));
  const a1 = (1 + G) * c1.a;
  const a2 = (1 + G) * c2.a;
  const C1p = Math.hypot(a1, c1.b);
  const C2p = Math.hypot(a2, c2.b);
  const h = (b: number, a: number): number => {
    if (a === 0 && b === 0) return 0;
    const v = Math.atan2(b, a) / deg;
    return v < 0 ? v + 360 : v;
  };
  const h1p = h(c1.b, a1);
  const h2p = h(c2.b, a2);
  const dLp = c2.L - c1.L;
  const dCp = C2p - C1p;
  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * deg) / 2);
  const Lbp = (c1.L + c2.L) / 2;
  const Cbp = (C1p + C2p) / 2;
  let hbp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbp += h1p + h2p < 360 ? 360 : -360;
    hbp /= 2;
  }
  const T =
    1 -
    0.17 * Math.cos((hbp - 30) * deg) +
    0.24 * Math.cos(2 * hbp * deg) +
    0.32 * Math.cos((3 * hbp + 6) * deg) -
    0.2 * Math.cos((4 * hbp - 63) * deg);
  const dTheta = 30 * Math.exp(-Math.pow((hbp - 275) / 25, 2));
  const Rc = 2 * Math.sqrt(Math.pow(Cbp, 7) / (Math.pow(Cbp, 7) + Math.pow(25, 7)));
  const Sl = 1 + (0.015 * Math.pow(Lbp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbp - 50, 2));
  const Sc = 1 + 0.045 * Cbp;
  const Sh = 1 + 0.015 * Cbp * T;
  const Rt = -Math.sin(2 * dTheta * deg) * Rc;
  return Math.sqrt(
    Math.pow(dLp / Sl, 2) + Math.pow(dCp / Sc, 2) + Math.pow(dHp / Sh, 2) + Rt * (dCp / Sc) * (dHp / Sh),
  );
}

/** Canal 0..255 de uma cor. */
const ch = (c: number, shift: number): number => (c >> shift) & 0xff;

/**
 * Cor de leitura de um uniforme (0xRRGGBB): média ponderada em sRGB (espaço "gama", mais
 * próximo da percepção que o RGB linear, em que o branco dominaria a mistura).
 * Listras entram pela média das cores.
 */
export function readingColor(kit: Kit): number {
  const shirt = kit.pattern.kind === 'stripes' ? [...kit.pattern.colors] : [kit.shirt];
  const mix = (shift: number): number => {
    const s = shirt.reduce((acc, c) => acc + ch(c, shift), 0) / shirt.length;
    const v = s * KIT_WEIGHT_SHIRT + ch(kit.shorts, shift) * KIT_WEIGHT_SHORTS + ch(kit.socks, shift) * KIT_WEIGHT_SOCKS;
    return Math.max(0, Math.min(255, Math.round(v)));
  };
  return (mix(16) << 16) | (mix(8) << 8) | mix(0);
}

/** Distância perceptual entre as cores de leitura de dois uniformes. */
export function kitDistance(a: Kit, b: Kit): number {
  return deltaE2000(toLab(readingColor(a)), toLab(readingColor(b)));
}

export function kitsConflict(a: Kit, b: Kit): boolean {
  return kitDistance(a, b) < KIT_CONFLICT_THRESHOLD;
}

export function kitOf(team: TeamId, variant: KitVariant): Kit {
  const t = getTeam(team);
  return variant === 'home' ? t.home : t.away;
}

export interface KitChoice {
  variants: [KitVariant, KitVariant];
  kits: [Kit, Kit];
  /** Cor de cada goleiro. */
  keeperColors: [number, number];
}

/** Monta a escolha com os uniformes dados (e as cores dos goleiros para eles). */
export function kitChoiceFor(t1: TeamId, t2: TeamId, variants: readonly [KitVariant, KitVariant]): KitChoice {
  const kits: [Kit, Kit] = [kitOf(t1, variants[0]), kitOf(t2, variants[1])];
  return { variants: [variants[0], variants[1]], kits, keeperColors: chooseKeeperColors(kits[0], kits[1]) };
}

/** Os dois uniformes podem jogar juntos (não é o mesmo uniforme nem cores de leitura parecidas). */
export function kitsCompatible(t1: TeamId, v1: KitVariant, t2: TeamId, v2: KitVariant): boolean {
  if (t1 === t2 && v1 === v2) return false;
  return !kitsConflict(kitOf(t1, v1), kitOf(t2, v2));
}

/** Uniforme fixado por cada jogador na seleção (null = automático). */
export type KitPrefs = readonly [KitVariant | null, KitVariant | null];

/**
 * Resolve os uniformes respeitando o que cada jogador fixou. Sem escolhas, é a regra automática.
 * Com escolhas, procura na mesma ordem da regra (titulares; J2 reserva; os dois reservas; J1
 * reserva) a primeira combinação compatível que respeita o que foi fixado; null se não houver.
 */
export function chooseKitsWith(t1: TeamId, t2: TeamId, prefs: KitPrefs): KitChoice | null {
  if (prefs[0] === null && prefs[1] === null) return chooseKits(t1, t2);
  const order: readonly [KitVariant, KitVariant][] = [
    ['home', 'home'],
    ['home', 'away'],
    ['away', 'away'],
    ['away', 'home'],
  ];
  for (const [v1, v2] of order) {
    if ((prefs[0] !== null && prefs[0] !== v1) || (prefs[1] !== null && prefs[1] !== v2)) continue;
    if (kitsCompatible(t1, v1, t2, v2)) return kitChoiceFor(t1, t2, [v1, v2]);
  }
  return null;
}

/** Resolve os uniformes da partida (J1 = times[0], J2 = times[1]). */
export function chooseKits(t1: TeamId, t2: TeamId): KitChoice {
  let v1: KitVariant = 'home';
  let v2: KitVariant = 'home';
  if (t1 === t2) {
    v2 = 'away';
  } else if (kitsConflict(kitOf(t1, v1), kitOf(t2, v2))) {
    v2 = 'away';
    if (kitsConflict(kitOf(t1, v1), kitOf(t2, v2))) v1 = 'away';
  }
  return kitChoiceFor(t1, t2, [v1, v2]);
}

/**
 * Escolhe as cores dos dois goleiros na lista, maximizando a menor distância entre:
 * cada goleiro e os dois uniformes de linha, e entre os dois goleiros.
 */
export function chooseKeeperColors(k1: Kit, k2: Kit): [number, number] {
  const r1 = toLab(readingColor(k1));
  const r2 = toLab(readingColor(k2));
  const labs = KEEPER_COLORS.map(toLab);
  let best: [number, number] = [KEEPER_COLORS[0]!, KEEPER_COLORS[1]!];
  let bestScore = -Infinity;
  for (let i = 0; i < KEEPER_COLORS.length; i++) {
    for (let j = 0; j < KEEPER_COLORS.length; j++) {
      if (i === j) continue;
      const gi = labs[i]!;
      const gj = labs[j]!;
      const score = Math.min(
        deltaE2000(gi, r1),
        deltaE2000(gi, r2),
        deltaE2000(gj, r1),
        deltaE2000(gj, r2),
        deltaE2000(gi, gj),
      );
      if (score > bestScore + 1e-9) {
        bestScore = score;
        best = [KEEPER_COLORS[i]!, KEEPER_COLORS[j]!];
      }
    }
  }
  return best;
}
