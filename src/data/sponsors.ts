/**
 * Placas de patrocínio (cartazes pintados no estilo 1930). Os logos são desenhados do zero
 * em art/sponsor-art.ts, apenas inspirados nas marcas, nunca copiados.
 */
export type SponsorId = 'marlburo' | 'bet366' | 'chopp' | 'asilo' | 'miami';

export interface Sponsor {
  id: SponsorId;
  text: string;
  /** Fundo, cor principal e cor de destaque. */
  bg: number;
  main: number;
  accent: number;
}

export const SPONSORS: readonly Sponsor[] = [
  { id: 'marlburo', text: 'Marlburo', bg: 0xf7f2e6, main: 0xc8102e, accent: 0x1a1410 },
  { id: 'bet366', text: 'bet366', bg: 0x0f6b3a, main: 0xffd23f, accent: 0xffffff },
  { id: 'chopp', text: 'Chopp Brama', bg: 0x7a2e12, main: 0xf7c046, accent: 0xfff1d0 },
  { id: 'asilo', text: 'Asilo do Rods', bg: 0xffffff, main: 0x1f5fbf, accent: 0xff5fa8 },
  { id: 'miami', text: 'Miami Hot', bg: 0x141010, main: 0xe0221b, accent: 0xff9a1f },
];
