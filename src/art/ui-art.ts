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

// ---------------------------------------------------------------------------
// Placar de TV e molduras art déco
// ---------------------------------------------------------------------------

export const SB_PLATE_KEY = 'sb-plate';
export const SB_TAB_KEY = 'sb-tab';
export const DECO_FRAME_KEY = 'deco-frame';
export const SB_PLATE_W = 470;
export const SB_PLATE_H = 66;
export const SB_TAB_W = 150;
export const SB_TAB_H = 30;

/** Contorno de retângulo com cantos escalonados (art déco). */
function steppedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, step: number): void {
  ctx.moveTo(x + step * 2, y);
  ctx.lineTo(x + w - step * 2, y);
  ctx.lineTo(x + w - step * 2, y + step);
  ctx.lineTo(x + w - step, y + step);
  ctx.lineTo(x + w - step, y + step * 2);
  ctx.lineTo(x + w, y + step * 2);
  ctx.lineTo(x + w, y + h - step * 2);
  ctx.lineTo(x + w - step, y + h - step * 2);
  ctx.lineTo(x + w - step, y + h - step);
  ctx.lineTo(x + w - step * 2, y + h - step);
  ctx.lineTo(x + w - step * 2, y + h);
  ctx.lineTo(x + step * 2, y + h);
  ctx.lineTo(x + step * 2, y + h - step);
  ctx.lineTo(x + step, y + h - step);
  ctx.lineTo(x + step, y + h - step * 2);
  ctx.lineTo(x, y + h - step * 2);
  ctx.lineTo(x, y + step * 2);
  ctx.lineTo(x + step, y + step * 2);
  ctx.lineTo(x + step, y + step);
  ctx.lineTo(x + step * 2, y + step);
  ctx.closePath();
}

/** Leque de raios (ornamento art déco) num canto. */
function fan(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, a0: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.5;
  for (let i = 0; i <= 4; i++) {
    const a = a0 + (i / 4) * (Math.PI / 2);
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(a) * r, y + Math.sin(a) * r);
    ctx.stroke();
  }
  ctx.beginPath();
  ctx.arc(x, y, r * 0.55, a0, a0 + Math.PI / 2);
  ctx.stroke();
}

export function generateScoreboardTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(SB_PLATE_KEY)) return;
  makeCanvasTexture(scene, SB_PLATE_KEY, SB_PLATE_W + 8, SB_PLATE_H + 8, (ctx) => {
    const x = 4;
    const y = 4;
    const w = SB_PLATE_W;
    const h = SB_PLATE_H;
    ctx.fillStyle = 'rgba(26,20,16,0.4)';
    ctx.beginPath();
    steppedRect(ctx, x + 3, y + 4, w - 3, h - 3, 6);
    ctx.fill();
    ctx.beginPath();
    steppedRect(ctx, x, y, w, h, 6);
    ctx.fillStyle = CREAM_CSS;
    ctx.fill();
    // Papel: leve gradiente quente.
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, 'rgba(255,255,255,0.35)');
    g.addColorStop(1, 'rgba(160,110,60,0.18)');
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke();
    ctx.beginPath();
    steppedRect(ctx, x + 7, y + 7, w - 14, h - 14, 4);
    ctx.lineWidth = 1.2;
    ctx.stroke();
    fan(ctx, x + 9, y + 9, 11, 0, INK_CSS);
    fan(ctx, x + w - 9, y + 9, 11, Math.PI / 2, INK_CSS);
    fan(ctx, x + 9, y + h - 9, 11, -Math.PI / 2, INK_CSS);
    fan(ctx, x + w - 9, y + h - 9, 11, Math.PI, INK_CSS);
    // Divisórias em losango ao lado do placar.
    for (const dx of [-62, 62]) {
      const cx = x + w / 2 + dx;
      ctx.beginPath();
      ctx.moveTo(cx, y + 14);
      ctx.lineTo(cx + 4, y + h / 2);
      ctx.lineTo(cx, y + h - 14);
      ctx.lineTo(cx - 4, y + h / 2);
      ctx.closePath();
      ctx.fillStyle = INK_CSS;
      ctx.fill();
    }
  });
  makeCanvasTexture(scene, SB_TAB_KEY, SB_TAB_W + 6, SB_TAB_H + 6, (ctx) => {
    ctx.beginPath();
    steppedRect(ctx, 3, 0, SB_TAB_W, SB_TAB_H, 4);
    ctx.fillStyle = INK_CSS;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = CREAM_CSS;
    ctx.beginPath();
    steppedRect(ctx, 6, 2, SB_TAB_W - 6, SB_TAB_H - 5, 3);
    ctx.stroke();
  });
}

/** Moldura ornamentada (tela cheia) dos cartões de cinema mudo; centro transparente. */
export function generateDecoFrame(scene: Phaser.Scene, width: number, height: number): void {
  if (scene.textures.exists(DECO_FRAME_KEY)) return;
  makeCanvasTexture(scene, DECO_FRAME_KEY, width, height, (ctx) => {
    const m = 54;
    ctx.strokeStyle = CREAM_CSS;
    ctx.lineWidth = 4;
    ctx.beginPath();
    steppedRect(ctx, m, m, width - m * 2, height - m * 2, 16);
    ctx.stroke();
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    steppedRect(ctx, m + 12, m + 12, width - m * 2 - 24, height - m * 2 - 24, 10);
    ctx.stroke();
    // Leques nos cantos e losangos no meio das bordas.
    for (const [x, y, a] of [
      [m + 12, m + 12, 0],
      [width - m - 12, m + 12, Math.PI / 2],
      [m + 12, height - m - 12, -Math.PI / 2],
      [width - m - 12, height - m - 12, Math.PI],
    ] as const) {
      fan(ctx, x, y, 46, a, CREAM_CSS);
    }
    for (const [x, y] of [
      [width / 2, m],
      [width / 2, height - m],
    ] as const) {
      ctx.beginPath();
      ctx.moveTo(x - 40, y);
      ctx.lineTo(x, y - 10);
      ctx.lineTo(x + 40, y);
      ctx.lineTo(x, y + 10);
      ctx.closePath();
      ctx.fillStyle = CREAM_CSS;
      ctx.fill();
    }
    for (const x of [m, width - m]) {
      ctx.beginPath();
      ctx.moveTo(x, height / 2 - 40);
      ctx.lineTo(x + 8, height / 2);
      ctx.lineTo(x, height / 2 + 40);
      ctx.lineTo(x - 8, height / 2);
      ctx.closePath();
      ctx.fillStyle = CREAM_CSS;
      ctx.fill();
    }
  });
}
