/**
 * Arte das telas de menu: prévia grande do jogador com o uniforme e a bola de futebol da tela
 * inicial.
 */
import type Phaser from 'phaser';
import type { Kit } from '../data/teams';
import { ellipsePath, inkFill } from './brush';
import { makeCanvasTexture } from './canvas';
import type { Ctx } from './canvas';
import { drawFigure, poseFor, TALL } from './player-art';
import type { PlayerLook } from './player-art';
import { INK_CSS } from './style';

/** Escala da prévia (o desenho é o mesmo do jogo, só maior). */
const PREVIEW_SCALE = 2;

export function previewKey(kitId: string): string {
  return `preview-${kitId}`;
}

/**
 * Prévia do jogador de frente, parado. Um desenho só: a tela dá o movimento (respiração e balanço
 * suaves); trocar entre variações da linha que ferve, nesse tamanho, parecia um tremor.
 */
export function generateKitPreview(scene: Phaser.Scene, kitId: string, kit: Kit, number: number): void {
  if (scene.textures.exists(previewKey(kitId))) return;
  const look: PlayerLook = {
    kit,
    isKeeper: false,
    keeperColor: 0,
    skin: 0xe2b183,
    hair: 'parted',
    hairColor: 0x3b2416,
    number,
    seed: 11,
  };
  makeCanvasTexture(scene, previewKey(kitId), TALL.w * PREVIEW_SCALE, TALL.h * PREVIEW_SCALE, (ctx) => {
    ctx.scale(PREVIEW_SCALE, PREVIEW_SCALE);
    drawFigure(ctx, look, poseFor('idle', 'front', 0), 'front', TALL.ox, TALL.oy, 900);
  });
}

export const TITLE_BALL_KEY = 'title-ball';
/** Luz da bola (sombra e brilho) numa camada à parte: a bola gira, a luz não. */
export const TITLE_BALL_LIGHT_KEY = 'title-ball-light';
/** Tamanho da textura e raio da bola da tela inicial (px). */
export const TITLE_BALL_SIZE = 120;
export const TITLE_BALL_RADIUS = 48;

/** Bola de futebol da tela inicial: o padrão clássico de pentágonos e hexágonos, no traço do jogo. */
export function generateTitleBall(scene: Phaser.Scene): void {
  if (scene.textures.exists(TITLE_BALL_KEY)) return;
  const c = TITLE_BALL_SIZE / 2;
  makeCanvasTexture(scene, TITLE_BALL_KEY, TITLE_BALL_SIZE, TITLE_BALL_SIZE, (ctx) => drawSoccerBall(ctx, c, c, TITLE_BALL_RADIUS));
  makeCanvasTexture(scene, TITLE_BALL_LIGHT_KEY, TITLE_BALL_SIZE, TITLE_BALL_SIZE, (ctx) => drawBallLight(ctx, c, c, TITLE_BALL_RADIUS));
}

/**
 * Bola vista com um pentágono de frente: ele no centro, raios saindo dos vértices até os cinco
 * pentágonos de fora (achatados pela curva da bola e cortados na borda) e as costuras dos hexágonos
 * entre eles.
 */
function drawSoccerBall(ctx: Ctx, cx: number, cy: number, r: number): void {
  const INK_DARK = '#2a221c';
  const at = (d: number, a: number): { x: number; y: number } => ({ x: cx + Math.cos(a) * d, y: cy + Math.sin(a) * d });
  const path = (pts: readonly { x: number; y: number }[]): void => {
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.closePath();
  };

  inkFill(ctx, () => ellipsePath(ctx, cx, cy, r, r), '#f3ead2', 4.5);
  ctx.save();
  ctx.beginPath();
  ellipsePath(ctx, cx, cy, r, r);
  ctx.clip();

  const top = -Math.PI / 2;
  const step = (Math.PI * 2) / 5;
  const inner = r * 0.3;
  // Pentágonos de fora: centro a `outerD`, raio `outerR`, achatados na direção do centro (`flat`).
  const outerD = r * 0.9;
  const outerR = r * 0.32;
  const flat = 0.72;
  const outer = (i: number): { x: number; y: number }[] => {
    const th = top + i * step;
    const ux = Math.cos(th);
    const uy = Math.sin(th);
    const c = at(outerD, th);
    // Um vértice aponta para o centro da bola.
    return Array.from({ length: 5 }, (_, k) => {
      const a = Math.PI + k * step;
      const u = Math.cos(a) * outerR * flat;
      const w = Math.sin(a) * outerR;
      return { x: c.x + ux * u - uy * w, y: c.y + uy * u + ux * w };
    });
  };
  const center = Array.from({ length: 5 }, (_, i) => at(inner, top + i * step));
  const outers = Array.from({ length: 5 }, (_, i) => outer(i));

  ctx.fillStyle = INK_DARK;
  path(center);
  ctx.fill();
  for (const o of outers) {
    path(o);
    ctx.fill();
  }
  // Costuras: dos vértices do pentágono do meio até os de fora, e entre os de fora (hexágonos).
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = 2.4;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const o = outers[i]!;
    const next = outers[(i + 1) % 5]!;
    ctx.beginPath();
    ctx.moveTo(center[i]!.x, center[i]!.y);
    ctx.lineTo(o[0]!.x, o[0]!.y);
    // Vértice de um lado deste pentágono até o do lado oposto do vizinho.
    ctx.moveTo(o[4]!.x, o[4]!.y);
    ctx.lineTo(next[1]!.x, next[1]!.y);
    ctx.stroke();
  }

  ctx.restore();
}

/** Sombra fria embaixo à direita e brilho de desenho animado em cima à esquerda. */
function drawBallLight(ctx: Ctx, cx: number, cy: number, r: number): void {
  ctx.save();
  ctx.beginPath();
  ellipsePath(ctx, cx, cy, r - 1.5, r - 1.5);
  ctx.clip();
  ctx.beginPath();
  ctx.ellipse(cx + r * 0.42, cy + r * 0.5, r * 0.98, r * 0.82, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(70,80,110,0.24)';
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.ellipse(cx - r * 0.42, cy - r * 0.46, r * 0.24, r * 0.12, -0.6, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fill();
}
