/**
 * Bola clássica de couro: creme com costuras escuras, contorno fervendo (3 variações).
 */
import type Phaser from 'phaser';
import { BOIL_JITTER } from '../config/constants';
import { makeCanvasTexture } from './canvas';
import type { Ctx } from './canvas';
import { inkFill } from './brush';
import { Rng } from '../core/rng';
import { INK_CSS } from './style';

export const BALL_TEXTURE_SIZE = 30;
export const BALL_TEXTURE_RADIUS = 12;
export const BALL_VARIANTS = 3;

export function ballKey(variant: number): string {
  return `ball-${variant}`;
}

export function generateBallTextures(scene: Phaser.Scene): void {
  const c = BALL_TEXTURE_SIZE / 2;
  const r = BALL_TEXTURE_RADIUS;
  for (let v = 0; v < BALL_VARIANTS; v++) {
    const rng = new Rng(4242 + v * 31);
    const j = (): number => rng.range(-BOIL_JITTER * 0.6, BOIL_JITTER * 0.6);
    makeCanvasTexture(scene, ballKey(v), BALL_TEXTURE_SIZE, BALL_TEXTURE_SIZE, (ctx) => {
      drawBall(ctx, c + j() * 0.3, c + j() * 0.3, r + j() * 0.25, j, 1);
    });
  }
}

/**
 * Desenha a bola com centro (cx, cy) e raio rr. `j` dá o tremor da linha que ferve e `k` escala
 * as espessuras e detalhes (1 = tamanho do jogo).
 */
export function drawBall(ctx: Ctx, cx: number, cy: number, rr: number, j: () => number, k: number): void {
  inkFill(ctx, () => ctx.ellipse(cx, cy, rr, rr, 0, 0, Math.PI * 2), '#efe2c0', 2.4 * k);
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(cx, cy, rr, rr, 0, 0, Math.PI * 2);
  ctx.clip();
  // Sombra fria embaixo à direita.
  ctx.beginPath();
  ctx.ellipse(cx + rr * 0.45, cy + rr * 0.5, rr * 0.95, rr * 0.8, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(70,80,110,0.28)';
  ctx.fill();
  // Gomos: costura do "equador" e dois meridianos.
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = 1.6 * k;
  ctx.beginPath();
  ctx.moveTo(cx - rr, cy + j() * 0.4);
  ctx.quadraticCurveTo(cx, cy + rr * 0.35 + j() * 0.4, cx + rr, cy + j() * 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx - rr * 0.35 + j() * 0.3, cy - rr);
  ctx.quadraticCurveTo(cx - rr * 0.65, cy, cx - rr * 0.3 + j() * 0.3, cy + rr);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + rr * 0.35 + j() * 0.3, cy - rr);
  ctx.quadraticCurveTo(cx + rr * 0.65, cy, cx + rr * 0.3 + j() * 0.3, cy + rr);
  ctx.stroke();
  // Cadarço (pontos de costura no alto).
  ctx.lineWidth = 1.1 * k;
  for (let i = -2; i <= 2; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + (i * 2.2 - 1) * k, cy - rr * 0.62);
    ctx.lineTo(cx + (i * 2.2 + 1) * k, cy - rr * 0.5);
    ctx.stroke();
  }
  ctx.restore();
  // Brilho de desenho animado.
  ctx.beginPath();
  ctx.ellipse(cx - rr * 0.38, cy - rr * 0.42, rr * 0.28, rr * 0.16, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
}

/** Ícone da aba do navegador: a bola do jogo, desenhada por código como todo o resto. */
export function setBallFavicon(): void {
  const S = 64;
  const canvas = document.createElement('canvas');
  canvas.width = S;
  canvas.height = S;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const r = S / 2 - 4;
  drawBall(ctx, S / 2, S / 2, r, () => 0, r / BALL_TEXTURE_RADIUS);
  let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'icon';
    document.head.appendChild(link);
  }
  link.href = canvas.toDataURL('image/png');
}
