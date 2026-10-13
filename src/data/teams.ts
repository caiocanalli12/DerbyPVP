/**
 * Os 8 times: nomes reais, siglas, uniformes (titular e reserva) e o desenho do escudo.
 * Os uniformes reproduzem as cores e padrões reais; os escudos são só o contorno do
 * formato real com leves marcas de semelhança (desenhados em art/crest-art.ts).
 *
 * Tudo aqui é fácil de editar: cores em 0xRRGGBB.
 */

export type TeamId = 'PAL' | 'COR' | 'BAR' | 'RMA' | 'INT' | 'MIL' | 'LIV' | 'CHE';

export type ShirtPattern =
  | { kind: 'solid' }
  /** Listras verticais alternando `colors`, com `count` listras na frente. */
  | { kind: 'stripes'; colors: readonly [number, number]; count: number };

export interface Kit {
  /** Cor principal da camisa (também a do indicador e da torcida). */
  shirt: number;
  pattern: ShirtPattern;
  /** Gola e punhos. */
  collar: number;
  cuffs: number;
  /** Detalhe secundário (frisos laterais, faixa da meia). */
  trim: number;
  shorts: number;
  shortsTrim: number;
  socks: number;
  /** Faixa no alto da meia (ou null). */
  socksBand: number | null;
  /** Cor do número nas costas. */
  number: number;
}

export type CrestShape = 'circle' | 'bulb' | 'oval' | 'shield-flames' | 'circle-crown';

export interface CrestDesign {
  shape: CrestShape;
  /** Cores do escudo: fundo, anel/contorno interno, marcas. */
  base: number;
  ring: number;
  mark: number;
  /** Segunda cor das marcas (listras, metades). */
  mark2: number;
  /** Marcas de semelhança dentro do contorno. */
  marks: readonly CrestMark[];
}

export type CrestMark =
  | 'star-top'
  | 'letter-p'
  | 'crossed-oars'
  | 'split-stripes-bottom'
  | 'small-cross-corner'
  | 'crown-top'
  | 'diagonal-band'
  | 'concentric-rings'
  | 'center-dot'
  | 'left-stripes'
  | 'right-cross'
  | 'wing'
  | 'staff';

export interface Team {
  id: TeamId;
  /** Nome real exibido na tela. */
  name: string;
  /** Sigla do placar. */
  short: string;
  home: Kit;
  away: Kit;
  crest: CrestDesign;
}

const WHITE = 0xffffff;
const BLACK = 0x161616;

export const TEAMS: readonly Team[] = [
  {
    id: 'PAL',
    name: 'Palmeiras',
    short: 'PAL',
    home: {
      shirt: 0x006437,
      pattern: { kind: 'solid' },
      collar: WHITE,
      cuffs: WHITE,
      trim: WHITE,
      shorts: WHITE,
      shortsTrim: 0x006437,
      socks: 0x006437,
      socksBand: WHITE,
      number: WHITE,
    },
    away: {
      shirt: WHITE,
      pattern: { kind: 'solid' },
      collar: 0x006437,
      cuffs: 0x006437,
      trim: 0x006437,
      shorts: 0x006437,
      shortsTrim: WHITE,
      socks: WHITE,
      socksBand: 0x006437,
      number: 0x006437,
    },
    crest: {
      shape: 'circle',
      base: 0x006437,
      ring: WHITE,
      mark: WHITE,
      mark2: 0xd4202c,
      marks: ['star-top', 'letter-p'],
    },
  },
  {
    id: 'COR',
    name: 'Corinthians',
    short: 'COR',
    home: {
      shirt: WHITE,
      pattern: { kind: 'solid' },
      collar: BLACK,
      cuffs: BLACK,
      trim: BLACK,
      shorts: BLACK,
      shortsTrim: WHITE,
      socks: WHITE,
      socksBand: BLACK,
      number: BLACK,
    },
    away: {
      shirt: BLACK,
      pattern: { kind: 'solid' },
      collar: WHITE,
      cuffs: WHITE,
      trim: WHITE,
      shorts: BLACK,
      shortsTrim: WHITE,
      socks: BLACK,
      socksBand: WHITE,
      number: WHITE,
    },
    crest: {
      shape: 'circle',
      base: WHITE,
      ring: BLACK,
      mark: BLACK,
      mark2: 0xd4202c,
      marks: ['crossed-oars'],
    },
  },
  {
    id: 'BAR',
    name: 'Barcelona',
    short: 'BAR',
    home: {
      shirt: 0x004d98,
      pattern: { kind: 'stripes', colors: [0x004d98, 0xa50044], count: 5 },
      collar: 0x004d98,
      cuffs: 0xa50044,
      trim: 0xedbb00,
      shorts: 0x004d98,
      shortsTrim: 0xa50044,
      socks: 0x004d98,
      socksBand: 0xa50044,
      number: 0xedbb00,
    },
    away: {
      shirt: 0xedbb00,
      pattern: { kind: 'solid' },
      collar: 0xa50044,
      cuffs: 0xa50044,
      trim: 0xa50044,
      shorts: 0xedbb00,
      shortsTrim: 0xa50044,
      socks: 0xedbb00,
      socksBand: 0xa50044,
      number: 0xa50044,
    },
    crest: {
      shape: 'bulb',
      base: 0xedbb00,
      ring: 0x004d98,
      mark: 0x004d98,
      mark2: 0xa50044,
      marks: ['split-stripes-bottom', 'small-cross-corner'],
    },
  },
  {
    id: 'RMA',
    name: 'Real Madrid',
    short: 'RMA',
    home: {
      shirt: WHITE,
      pattern: { kind: 'solid' },
      collar: 0xfebe10,
      cuffs: 0xfebe10,
      trim: 0xfebe10,
      shorts: WHITE,
      shortsTrim: 0xfebe10,
      socks: WHITE,
      socksBand: 0xfebe10,
      number: 0xfebe10,
    },
    away: {
      shirt: 0x4b2e83,
      pattern: { kind: 'solid' },
      collar: 0xfebe10,
      cuffs: 0xfebe10,
      trim: 0xfebe10,
      shorts: 0x4b2e83,
      shortsTrim: 0xfebe10,
      socks: 0x4b2e83,
      socksBand: 0xfebe10,
      number: 0xfebe10,
    },
    crest: {
      shape: 'circle-crown',
      base: WHITE,
      ring: 0xfebe10,
      mark: 0x3d2e8c,
      mark2: 0xfebe10,
      marks: ['crown-top', 'diagonal-band'],
    },
  },
  {
    id: 'INT',
    name: 'Inter de Milão',
    short: 'INT',
    home: {
      shirt: 0x0068a8,
      pattern: { kind: 'stripes', colors: [0x0068a8, BLACK], count: 5 },
      collar: BLACK,
      cuffs: BLACK,
      trim: 0x0068a8,
      shorts: BLACK,
      shortsTrim: 0x0068a8,
      socks: BLACK,
      socksBand: 0x0068a8,
      number: WHITE,
    },
    away: {
      shirt: WHITE,
      pattern: { kind: 'solid' },
      collar: 0x0068a8,
      cuffs: BLACK,
      trim: 0x0068a8,
      shorts: WHITE,
      shortsTrim: 0x0068a8,
      socks: WHITE,
      socksBand: 0x0068a8,
      number: 0x0068a8,
    },
    crest: {
      shape: 'circle',
      base: WHITE,
      ring: 0x0068a8,
      mark: BLACK,
      mark2: 0x0068a8,
      marks: ['concentric-rings', 'center-dot'],
    },
  },
  {
    id: 'MIL',
    name: 'AC Milan',
    short: 'MIL',
    home: {
      shirt: 0xfb090b,
      pattern: { kind: 'stripes', colors: [0xfb090b, BLACK], count: 5 },
      collar: BLACK,
      cuffs: BLACK,
      trim: WHITE,
      shorts: WHITE,
      shortsTrim: BLACK,
      socks: BLACK,
      socksBand: 0xfb090b,
      number: WHITE,
    },
    away: {
      shirt: WHITE,
      pattern: { kind: 'solid' },
      collar: 0xfb090b,
      cuffs: BLACK,
      trim: 0xfb090b,
      shorts: WHITE,
      shortsTrim: 0xfb090b,
      socks: WHITE,
      socksBand: 0xfb090b,
      number: 0xfb090b,
    },
    crest: {
      shape: 'oval',
      base: WHITE,
      ring: BLACK,
      mark: 0xfb090b,
      mark2: BLACK,
      marks: ['left-stripes', 'right-cross'],
    },
  },
  {
    id: 'LIV',
    name: 'Liverpool',
    short: 'LIV',
    home: {
      shirt: 0xc8102e,
      pattern: { kind: 'solid' },
      collar: WHITE,
      cuffs: WHITE,
      trim: WHITE,
      shorts: 0xc8102e,
      shortsTrim: WHITE,
      socks: 0xc8102e,
      socksBand: WHITE,
      number: WHITE,
    },
    away: {
      shirt: WHITE,
      pattern: { kind: 'solid' },
      collar: 0xc8102e,
      cuffs: 0xc8102e,
      trim: 0xc8102e,
      shorts: WHITE,
      shortsTrim: 0xc8102e,
      socks: WHITE,
      socksBand: 0xc8102e,
      number: 0xc8102e,
    },
    crest: {
      shape: 'shield-flames',
      base: 0xc8102e,
      ring: 0xf2c94c,
      mark: 0xf2c94c,
      mark2: WHITE,
      marks: ['wing'],
    },
  },
  {
    id: 'CHE',
    name: 'Chelsea',
    short: 'CHE',
    home: {
      shirt: 0x034694,
      pattern: { kind: 'solid' },
      collar: WHITE,
      cuffs: WHITE,
      trim: WHITE,
      shorts: 0x034694,
      shortsTrim: WHITE,
      socks: WHITE,
      socksBand: 0x034694,
      number: WHITE,
    },
    away: {
      shirt: 0xf3e88e,
      pattern: { kind: 'solid' },
      collar: 0x034694,
      cuffs: 0x034694,
      trim: 0x034694,
      shorts: 0x0b1f4b,
      shortsTrim: 0xf3e88e,
      socks: 0xf3e88e,
      socksBand: 0x034694,
      number: 0x034694,
    },
    crest: {
      shape: 'circle',
      base: 0x034694,
      ring: WHITE,
      mark: 0xf2c94c,
      mark2: WHITE,
      marks: ['staff'],
    },
  },
];

export function getTeam(id: TeamId): Team {
  const t = TEAMS.find((x) => x.id === id);
  if (!t) throw new Error(`Time inexistente: ${id}`);
  return t;
}

export function isTeamId(v: string): v is TeamId {
  return TEAMS.some((t) => t.id === v);
}
