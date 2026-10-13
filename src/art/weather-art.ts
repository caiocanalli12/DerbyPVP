/**
 * Elementos do clima desenhados por código: sol com rosto (sorridente ou sonolento),
 * lua com rosto, nuvens fofas, cone de luz dos refletores e o escurecimento da noite.
 */
import type Phaser from 'phaser';
import { BOIL_JITTER, GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { project } from '../core/projection';
import { Rng } from '../core/rng';
import { FIELD_CENTER_X, FIELD_CENTER_Y } from '../sim/field';
import { ellipsePath, inkFill, pieEye } from './brush';
import type { Ctx } from './canvas';
import { makeCanvasTexture } from './canvas';
import { INK_CSS } from './style';

export const SKY_FACE_VARIANTS = 3;

export function sunKey(sleepy: boolean, v: number): string {
  return `sun-${sleepy ? 'sleepy' : 'happy'}-${v}`;
}

export function moonKey(v: number): string {
  return `moon-${v}`;
}

export function cloudKey(kind: 'fluffy' | 'gray' | 'pink', v: number): string {
  return `cloud-${kind}-${v}`;
}

export const LIGHT_CONE_KEY = 'light-cone';
export const NIGHT_SHADE_KEY = 'night-shade';

function face(ctx: Ctx, cx: number, cy: number, r: number, sleepy: boolean, j: () => number): void {
  if (sleepy) {
    // Pálpebras pesadas.
    for (const dx of [-0.32, 0.32]) {
      ctx.beginPath();
      ctx.arc(cx + dx * r + j(), cy - r * 0.05, r * 0.16, 0, Math.PI);
      ctx.lineWidth = 2.2;
      ctx.strokeStyle = INK_CSS;
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.moveTo(cx - r * 0.2, cy + r * 0.38);
    ctx.quadraticCurveTo(cx, cy + r * 0.46, cx + r * 0.2, cy + r * 0.38);
    ctx.lineWidth = 2;
    ctx.stroke();
  } else {
    pieEye(ctx, cx - r * 0.3 + j() * 0.5, cy - r * 0.12, r * 0.11, r * 0.17, 0.1, 1.6);
    pieEye(ctx, cx + r * 0.3 + j() * 0.5, cy - r * 0.12, r * 0.11, r * 0.17, 0.1, 1.6);
    inkFill(
      ctx,
      () => {
        ctx.moveTo(cx - r * 0.42, cy + r * 0.18);
        ctx.quadraticCurveTo(cx, cy + r * 0.72, cx + r * 0.42, cy + r * 0.18);
        ctx.quadraticCurveTo(cx, cy + r * 0.36, cx - r * 0.42, cy + r * 0.18);
      },
      '#7a2a1a',
      1.8,
    );
  }
  // Bochechas rosadas.
  for (const dx of [-0.55, 0.55]) {
    ctx.beginPath();
    ctx.ellipse(cx + dx * r, cy + r * 0.22, r * 0.14, r * 0.09, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(240,90,70,0.45)';
    ctx.fill();
  }
}

function drawSun(ctx: Ctx, size: number, sleepy: boolean, v: number): void {
  const rng = new Rng(500 + v * 17 + (sleepy ? 3 : 0));
  const j = (): number => rng.range(-BOIL_JITTER, BOIL_JITTER);
  const c = size / 2;
  const r = size * 0.27;
  const body = sleepy ? '#ff9a3c' : '#ffd23f';
  const rays = sleepy ? '#ffb85c' : '#ffe27a';
  // Raios em ziguezague.
  inkFill(
    ctx,
    () => {
      const n = 14;
      for (let i = 0; i <= n * 2; i++) {
        const a = (i / (n * 2)) * Math.PI * 2;
        const rr = i % 2 === 0 ? r * 1.62 + j() : r * 1.12;
        const x = c + Math.cos(a) * rr;
        const y = c + Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.closePath();
    },
    rays,
    2.4,
  );
  inkFill(ctx, () => ellipsePath(ctx, c + j() * 0.3, c + j() * 0.3, r, r), body, 2.6);
  face(ctx, c, c, r, sleepy, j);
}

function drawMoon(ctx: Ctx, size: number, v: number): void {
  const rng = new Rng(800 + v * 23);
  const j = (): number => rng.range(-BOIL_JITTER, BOIL_JITTER);
  const c = size / 2;
  const r = size * 0.38;
  const glow = ctx.createRadialGradient(c, c, r * 0.8, c, c, size / 2);
  glow.addColorStop(0, 'rgba(255,248,210,0.35)');
  glow.addColorStop(1, 'rgba(255,248,210,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, size, size);
  inkFill(ctx, () => ellipsePath(ctx, c + j() * 0.3, c, r, r), '#f6efc9', 2.4);
  for (const [dx, dy, rr] of [
    [-0.35, -0.4, 0.12],
    [0.4, 0.35, 0.1],
    [0.15, -0.55, 0.07],
  ] as const) {
    ctx.beginPath();
    ctx.arc(c + dx * r, c + dy * r, rr * r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(190,180,140,0.55)';
    ctx.fill();
  }
  face(ctx, c, c, r, true, j);
}

function drawCloud(ctx: Ctx, w: number, h: number, fill: string, v: number, kind: number): void {
  const rng = new Rng(300 + v * 11 + kind * 101);
  const j = (): number => rng.range(-BOIL_JITTER, BOIL_JITTER);
  const puffs = [
    [0.22, 0.62, 0.2],
    [0.4, 0.42, 0.26],
    [0.62, 0.45, 0.24],
    [0.78, 0.62, 0.18],
    [0.5, 0.66, 0.22],
  ];
  inkFill(
    ctx,
    () => {
      for (const [x, y, r] of puffs) {
        ctx.moveTo(x! * w + r! * h + j(), y! * h);
        ctx.arc(x! * w + j() * 0.5, y! * h + j() * 0.5, r! * h, 0, Math.PI * 2);
      }
    },
    fill,
    2.2,
  );
  // Remove as linhas internas pintando o miolo por cima.
  ctx.beginPath();
  for (const [x, y, r] of puffs) {
    ctx.moveTo(x! * w + r! * h * 0.86, y! * h);
    ctx.arc(x! * w, y! * h, r! * h * 0.86, 0, Math.PI * 2);
  }
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(w * 0.38, h * 0.38, w * 0.1, h * 0.08, -0.3, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fill();
}

/** Gera todas as texturas de clima (são poucas e pequenas). */
export function generateWeatherTextures(scene: Phaser.Scene): void {
  const S = 96;
  for (let v = 0; v < SKY_FACE_VARIANTS; v++) {
    makeCanvasTexture(scene, sunKey(false, v), S, S, (ctx) => drawSun(ctx, S, false, v));
    makeCanvasTexture(scene, sunKey(true, v), S, S, (ctx) => drawSun(ctx, S, true, v));
    makeCanvasTexture(scene, moonKey(v), S, S, (ctx) => drawMoon(ctx, S, v));
    makeCanvasTexture(scene, cloudKey('fluffy', v), 120, 56, (ctx) => drawCloud(ctx, 120, 56, '#ffffff', v, 0));
    makeCanvasTexture(scene, cloudKey('gray', v), 120, 56, (ctx) => drawCloud(ctx, 120, 56, '#b9c0c7', v, 1));
    makeCanvasTexture(scene, cloudKey('pink', v), 120, 56, (ctx) => drawCloud(ctx, 120, 56, '#ffd0c0', v, 2));
  }
  // Cone de luz: triângulo com gradiente (topo = lâmpada).
  makeCanvasTexture(scene, LIGHT_CONE_KEY, 256, 512, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 512);
    g.addColorStop(0, 'rgba(255,246,200,0.55)');
    g.addColorStop(1, 'rgba(255,246,200,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(128 - 10, 0);
    ctx.lineTo(128 + 10, 0);
    ctx.lineTo(256, 512);
    ctx.lineTo(0, 512);
    ctx.closePath();
    ctx.fill();
  });
  // Escurecimento da noite: mais forte nas bordas, campo iluminado no centro.
  makeCanvasTexture(scene, NIGHT_SHADE_KEY, GAME_WIDTH, GAME_HEIGHT, (ctx) => {
    const c = project(FIELD_CENTER_X, FIELD_CENTER_Y);
    const g = ctx.createRadialGradient(c.x, c.y, 120, c.x, c.y, 760);
    g.addColorStop(0, 'rgb(205,214,255)');
    g.addColorStop(0.45, 'rgb(150,160,215)');
    g.addColorStop(1, 'rgb(70,80,140)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  });
}
