/**
 * Troféu do campeonato no estilo 1930: taça dourada com duas alças grandes, haste com nó, base de
 * madeira em degraus com placa, brilho e uma estrela gravada. Três variações com a linha fervendo.
 */
import type Phaser from 'phaser';
import { BOIL_JITTER } from '../config/constants';
import { inkFill } from './brush';
import { jitterer, makeCanvasTexture } from './canvas';
import type { Ctx } from './canvas';
import { INK_CSS } from './style';
import { BOIL_VARIANTS } from './ui-art';

export const TROPHY_KEY = 'trophy';
/** Tamanho de cada quadro (px) e ponto de apoio (meio da base). */
export const TROPHY_W = 260;
export const TROPHY_H = 340;
export const TROPHY_ORIGIN = { x: 0.5, y: 332 / TROPHY_H };

export function trophyFrame(variant: number): string {
  return `trophy-${variant}`;
}

const GOLD_LIGHT = '#fff2b0';
const GOLD = '#f2c037';
const GOLD_DEEP = '#c98b18';
const GOLD_DARK = '#8a5a10';
const WOOD = '#6b4426';
const WOOD_DARK = '#4a2d18';

/** Desenha as variações (lado a lado num atlas). Só na primeira vez. */
export function generateTrophyTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(TROPHY_KEY)) return;
  makeCanvasTexture(scene, TROPHY_KEY, TROPHY_W * BOIL_VARIANTS, TROPHY_H, (ctx, addFrame) => {
    for (let v = 0; v < BOIL_VARIANTS; v++) {
      ctx.save();
      ctx.translate(v * TROPHY_W, 0);
      drawTrophy(ctx, jitterer(4100 + v * 37, BOIL_JITTER));
      ctx.restore();
      addFrame(trophyFrame(v), v * TROPHY_W, 0, TROPHY_W, TROPHY_H);
    }
  });
}

function goldGradient(ctx: Ctx, x0: number, x1: number): CanvasGradient {
  const g = ctx.createLinearGradient(x0, 0, x1, 0);
  g.addColorStop(0, GOLD_LIGHT);
  g.addColorStop(0.3, GOLD);
  g.addColorStop(0.72, GOLD_DEEP);
  g.addColorStop(1, GOLD_DARK);
  return g;
}

/** Uma alça: tira grossa com contorno (traço preto largo, dourado por cima e um filete de brilho). */
function handle(ctx: Ctx, j: (v: number) => number, s: 1 | -1): void {
  const cx = 130;
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(cx + s * j(-74), j(98));
    ctx.bezierCurveTo(cx + s * j(-138), j(84), cx + s * j(-136), j(176), cx + s * j(-62), j(164));
  };
  ctx.lineCap = 'round';
  path();
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = 23;
  ctx.stroke();
  path();
  ctx.strokeStyle = s < 0 ? GOLD : GOLD_DEEP;
  ctx.lineWidth = 14;
  ctx.stroke();
  path();
  ctx.strokeStyle = s < 0 ? 'rgba(255,248,215,0.8)' : 'rgba(255,240,190,0.45)';
  ctx.lineWidth = 3.5;
  ctx.stroke();
}

function drawTrophy(ctx: Ctx, j: (v: number) => number): void {
  const cx = 130;
  // Sombra no chão.
  ctx.fillStyle = 'rgba(26,20,16,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx, 334, 92, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // Base de madeira em dois degraus, com a placa dourada.
  const block = (x0: number, y0: number, x1: number, y1: number, fill: string): void =>
    inkFill(
      ctx,
      () => {
        ctx.moveTo(j(x0 + 4), j(y0));
        ctx.lineTo(j(x1 - 4), j(y0));
        ctx.lineTo(j(x1), j(y0 + 4));
        ctx.lineTo(j(x1), j(y1));
        ctx.lineTo(j(x0), j(y1));
        ctx.lineTo(j(x0), j(y0 + 4));
        ctx.closePath();
      },
      fill,
      4,
    );
  block(58, 298, 202, 330, WOOD);
  block(76, 272, 184, 300, WOOD_DARK);
  ctx.fillStyle = 'rgba(255,230,190,0.18)';
  ctx.fillRect(62, 300, 136, 4);
  inkFill(ctx, () => ctx.rect(j(102), j(306), 56, 17), goldGradient(ctx, 102, 158), 2.5);
  ctx.strokeStyle = 'rgba(26,20,16,0.6)';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(110, 315);
  ctx.lineTo(150, 315);
  ctx.stroke();

  // Pé, haste e nó.
  inkFill(
    ctx,
    () => {
      ctx.moveTo(j(94), j(274));
      ctx.quadraticCurveTo(j(130), j(254), j(166), j(274));
      ctx.lineTo(j(146), j(246));
      ctx.lineTo(j(114), j(246));
      ctx.closePath();
    },
    goldGradient(ctx, 94, 166),
    4,
  );
  inkFill(
    ctx,
    () => {
      ctx.moveTo(j(119), j(248));
      ctx.lineTo(j(141), j(248));
      ctx.lineTo(j(137), j(200));
      ctx.lineTo(j(123), j(200));
      ctx.closePath();
    },
    goldGradient(ctx, 119, 141),
    4,
  );
  inkFill(ctx, () => ctx.ellipse(j(cx), j(224), 17, 9, 0, 0, Math.PI * 2), goldGradient(ctx, 113, 147), 4);

  // Alças atrás da taça.
  handle(ctx, j, -1);
  handle(ctx, j, 1);

  // Taça.
  const bowl = (): void => {
    ctx.moveTo(j(118), j(204));
    ctx.bezierCurveTo(j(70), j(192), j(46), j(134), j(44), j(78));
    ctx.lineTo(j(216), j(78));
    ctx.bezierCurveTo(j(214), j(134), j(190), j(192), j(142), j(204));
    ctx.closePath();
  };
  inkFill(ctx, bowl, goldGradient(ctx, 44, 216), 5);
  // Faixa decorativa (art déco) e a estrela gravada.
  ctx.save();
  ctx.beginPath();
  bowl();
  ctx.clip();
  ctx.strokeStyle = 'rgba(138,90,16,0.55)';
  ctx.lineWidth = 3;
  for (const y of [100, 108]) {
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(220, y);
    ctx.stroke();
  }
  ctx.restore();
  const star: { x: number; y: number }[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 === 0 ? 21 : 9;
    star.push({ x: cx + Math.cos(a) * r, y: 144 + Math.sin(a) * r });
  }
  inkFill(
    ctx,
    () => {
      star.forEach((p, i) => (i === 0 ? ctx.moveTo(j(p.x), j(p.y)) : ctx.lineTo(j(p.x), j(p.y))));
      ctx.closePath();
    },
    GOLD_LIGHT,
    2.5,
  );
  // Brilho comprido do lado da luz.
  ctx.strokeStyle = 'rgba(255,252,235,0.85)';
  ctx.lineWidth = 7;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(j(66), j(92));
  ctx.quadraticCurveTo(j(70), j(150), j(104), j(184));
  ctx.stroke();
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(j(84), j(92));
  ctx.quadraticCurveTo(j(88), j(128), j(98), j(146));
  ctx.stroke();

  // Boca da taça: aro claro e o fundo escuro.
  inkFill(ctx, () => ctx.ellipse(j(cx), j(78), 88, 13, 0, 0, Math.PI * 2), GOLD_LIGHT, 4.5);
  ctx.fillStyle = GOLD_DARK;
  ctx.beginPath();
  ctx.ellipse(cx, 79, 76, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(26,20,16,0.35)';
  ctx.beginPath();
  ctx.ellipse(cx + 6, 80, 64, 6, 0, 0, Math.PI * 2);
  ctx.fill();
}
