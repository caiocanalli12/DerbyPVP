/**
 * Elementos de interface desenhados por código.
 */
import type Phaser from 'phaser';
import { BOIL_JITTER, INDICATOR_TRI_HEIGHT, INDICATOR_WIDTH } from '../config/constants';
import { CREAM_CSS, INK_CSS } from './style';
import { cssColor, jitterer, makeCanvasTexture } from './canvas';

/** Número de variações das linhas que fervem. */
export const BOIL_VARIANTS = 3;

/** Escala de desenho das texturas de interface (nitidez com zoom/FIT). */
const RES = 2;

/** Chave das texturas do indicador de uma cor (uma por variação de fervura). */
export function indicatorKey(color: number, variant: number): string {
  return `indicator-${color.toString(16)}-${variant}`;
}

/**
 * Triângulo apontando para baixo, na cor do uniforme, com contorno escuro de 2 px e um
 * filete creme interno (legível até em camisa branca). Gera BOIL_VARIANTS variações.
 */
export function generateIndicatorTextures(scene: Phaser.Scene, color: number): void {
  const w = INDICATOR_WIDTH * RES;
  const h = INDICATOR_TRI_HEIGHT * RES;
  const pad = 6 * RES;
  for (let v = 0; v < BOIL_VARIANTS; v++) {
    const j = jitterer(0x1d1ca7 + v * 97 + color, BOIL_JITTER * RES);
    const pts: [number, number][] = [
      [j(pad), j(pad)],
      [j(pad + w), j(pad)],
      [j(pad + w / 2), j(pad + h)],
    ];
    makeCanvasTexture(scene, indicatorKey(color, v), w + pad * 2, h + pad * 2, (ctx) => {
      const inset = (d: number): [number, number][] => insetTriangle(pts, d);
      fillPoly(ctx, pts, INK_CSS);
      fillPoly(ctx, inset(2 * RES), CREAM_CSS);
      fillPoly(ctx, inset(3.5 * RES), cssColor(color));
      // Brilho de desenho animado no canto.
      const hi = inset(6 * RES);
      ctx.strokeStyle = 'rgba(255,255,255,0.45)';
      ctx.lineWidth = 1.5 * RES;
      ctx.beginPath();
      ctx.moveTo(hi[0]![0], hi[0]![1]);
      ctx.lineTo(hi[0]![0] + (hi[1]![0] - hi[0]![0]) * 0.45, hi[0]![1] + (hi[1]![1] - hi[0]![1]) * 0.45);
      ctx.stroke();
    });
  }
}

/** Escala de desenho usada nas texturas do indicador (o sprite deve usar 1 / RES). */
export const INDICATOR_TEXTURE_SCALE = 1 / RES;

function fillPoly(ctx: CanvasRenderingContext2D, pts: [number, number][], color: string): void {
  ctx.fillStyle = color;
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y)));
  ctx.closePath();
  ctx.fill();
}

/** Triângulo encolhido de `d` px para dentro (pelo incentro). */
function insetTriangle(pts: [number, number][], d: number): [number, number][] {
  const [a, b, c] = pts as [[number, number], [number, number], [number, number]];
  const la = Math.hypot(b[0] - c[0], b[1] - c[1]);
  const lb = Math.hypot(a[0] - c[0], a[1] - c[1]);
  const lc = Math.hypot(a[0] - b[0], a[1] - b[1]);
  const per = la + lb + lc;
  const ix = (la * a[0] + lb * b[0] + lc * c[0]) / per;
  const iy = (la * a[1] + lb * b[1] + lc * c[1]) / per;
  const s = per / 2;
  const area = Math.sqrt(Math.max(0, s * (s - la) * (s - lb) * (s - lc)));
  const r = area / s;
  const k = Math.max(0, (r - d) / r);
  return pts.map(([x, y]) => [ix + (x - ix) * k, iy + (y - iy) * k]);
}
