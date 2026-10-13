/**
 * Linguagem visual comum (anos 1930): fontes e paleta base.
 * Cores em número (0xRRGGBB) para o Phaser e em string CSS para o Canvas 2D.
 */

export const FONT_TITLE = 'Limelight';
export const FONT_TEXT = 'Oswald';

/** Contorno padrão: marrom quase preto. */
export const INK = 0x1a1410;
export const INK_CSS = '#1A1410';

/** Creme de papel envelhecido. */
export const CREAM = 0xf3e6c4;
export const CREAM_CSS = '#F3E6C4';

export function toCss(color: number): string {
  return '#' + (color & 0xffffff).toString(16).padStart(6, '0');
}
