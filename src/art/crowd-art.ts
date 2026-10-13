/**
 * Torcedores no estilo 1930: cabeças redondas, olhos pie-cut, chapéus de época misturados,
 * camisas e cachecóis nas cores do uniforme que está em campo. Poucas texturas reaproveitadas
 * (variação de cor e posição vem na hora de espalhar).
 */
import type Phaser from 'phaser';
import { BOIL_JITTER } from '../config/constants';
import { Rng } from '../core/rng';
import type { Kit } from '../data/teams';
import { css, ellipsePath, inkFill, light, mix, pieEye, shade } from './brush';
import type { Ctx } from './canvas';
import { INK_CSS } from './style';

export const CROWD_KEY = 'crowd';
export const FAN_W = 26;
export const FAN_H = 36;
export const FLAG_W = 34;
export const FLAG_H = 40;

/** Variações de torcedor (chapéu, pele) por time. */
export const FAN_VARIANTS = 6;
/** Poses: 0/1 balanço, 2 braços para cima, 3 pulo com cachecol. */
export const FAN_POSES = 4;
export const FAN_BOILS = 3;
export const FLAG_FRAMES = 3;

export function fanFrame(team: number, variant: number, pose: number, boil: number): string {
  return `fan-${team}-${variant}-${pose}-${boil}`;
}

export function flagFrame(team: number, frame: number): string {
  return `flag-${team}-${frame}`;
}

type Hat = 'boater' | 'bowler' | 'cap' | 'none';
const HATS: readonly Hat[] = ['boater', 'bowler', 'cap', 'none', 'boater', 'cap'];
const SKINS = [0xf3cfac, 0xe2b183, 0xc98e5c, 0xa86d43, 0x7f4f2e, 0xe8bf95];

/** Cores do torcedor: camisa (principal do uniforme) e cachecol/listra (secundária). */
export function crowdColors(kit: Kit): { main: number; second: number } {
  const main = kit.pattern.kind === 'stripes' ? kit.pattern.colors[0] : kit.shirt;
  let second = kit.pattern.kind === 'stripes' ? kit.pattern.colors[1] : kit.collar;
  if (second === main) second = kit.shorts !== main ? kit.shorts : kit.trim;
  return { main, second };
}

function drawFan(ctx: Ctx, ox: number, oy: number, main: number, second: number, variant: number, pose: number, boil: number): void {
  const rng = new Rng(9000 + variant * 97 + pose * 13 + boil * 7);
  const j = (): number => rng.range(-BOIL_JITTER * 0.5, BOIL_JITTER * 0.5);
  const skin = SKINS[variant % SKINS.length]!;
  const hat = HATS[variant % HATS.length]!;
  const line = 1.6;
  const cx = ox + FAN_W / 2;
  const jump = pose === 3 ? -4 : 0;
  const headY = oy + 11 + jump + j();
  const bodyTop = oy + 19 + jump;
  // Braços (atrás do corpo quando para cima).
  const armsUp = pose >= 2;
  const arm = (sx: number): void => {
    const shX = cx + sx * 6;
    const shY = bodyTop + 3;
    const hx = armsUp ? cx + sx * (9 + j()) : cx + sx * (8 + (pose === 1 ? 1 : 0)) + j();
    const hy = armsUp ? oy + 2 + jump + j() : bodyTop + 13 + j();
    ctx.beginPath();
    ctx.moveTo(shX, shY);
    ctx.quadraticCurveTo(shX + sx * 5, (shY + hy) / 2, hx, hy);
    ctx.lineWidth = 5.2;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke();
    ctx.lineWidth = 3;
    ctx.strokeStyle = css(main);
    ctx.stroke();
    inkFill(ctx, () => ellipsePath(ctx, hx, hy, 2.4, 2.4), css(skin), 1.2);
  };
  if (armsUp) {
    arm(-1);
    arm(1);
  }
  // Corpo (camisa do time) com faixa/cachecol na segunda cor.
  inkFill(
    ctx,
    () => {
      ctx.moveTo(cx - 8 + j(), oy + FAN_H);
      ctx.quadraticCurveTo(cx - 9, bodyTop + 2, cx, bodyTop + j());
      ctx.quadraticCurveTo(cx + 9, bodyTop + 2, cx + 8 + j(), oy + FAN_H);
      ctx.closePath();
    },
    css(main),
    line,
  );
  ctx.fillStyle = css(second);
  ctx.fillRect(cx - 6, bodyTop + 3, 12, 3);
  if (pose === 3) {
    // Cachecol esticado acima da cabeça.
    ctx.save();
    ctx.translate(cx, oy + 3 + jump);
    ctx.rotate(-0.15 + j() * 0.05);
    for (let k = -3; k < 3; k++) {
      ctx.fillStyle = css(k % 2 === 0 ? main : second);
      ctx.fillRect(k * 3.4, -2, 3.4, 4);
    }
    ctx.strokeStyle = INK_CSS;
    ctx.lineWidth = 1;
    ctx.strokeRect(-10.2, -2, 20.4, 4);
    ctx.restore();
  }
  // Cabeça.
  inkFill(ctx, () => ellipsePath(ctx, cx + j() * 0.3, headY, 6.4, 6.6), css(skin), line);
  ctx.beginPath();
  ctx.ellipse(cx + 1.5, headY + 3.5, 5, 2.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = css(shade(skin, 0.25), 0.4);
  ctx.fill();
  const happy = pose >= 2;
  pieEye(ctx, cx - 2.4, headY - 0.4, 1.3, 1.9, 0.2, 0.9, happy);
  pieEye(ctx, cx + 2.4, headY - 0.4, 1.3, 1.9, 0.2, 0.9, happy);
  ctx.beginPath();
  if (happy) {
    ctx.ellipse(cx, headY + 3.4, 2.2, 1.6, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#5a1d1d';
    ctx.fill();
  } else {
    ctx.moveTo(cx - 2.3, headY + 2.8);
    ctx.quadraticCurveTo(cx, headY + 4.4, cx + 2.3, headY + 2.8);
    ctx.lineWidth = 1;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke();
  }
  // Chapéu de época.
  switch (hat) {
    case 'boater':
      inkFill(ctx, () => ellipsePath(ctx, cx, headY - 5.2, 8.6, 2.1), '#e8d08a', 1.2);
      inkFill(
        ctx,
        () => {
          ctx.rect(cx - 5, headY - 9.5, 10, 4.5);
        },
        '#ecd796',
        1.2,
      );
      ctx.fillStyle = css(main);
      ctx.fillRect(cx - 5, headY - 6.8, 10, 1.6);
      break;
    case 'bowler':
      inkFill(ctx, () => ellipsePath(ctx, cx, headY - 5, 8, 1.8), '#2a2420', 1.2);
      inkFill(ctx, () => ctx.arc(cx, headY - 5.2, 5.2, Math.PI, 0), '#2a2420', 1.2);
      break;
    case 'cap':
      inkFill(
        ctx,
        () => {
          ctx.moveTo(cx - 6.6, headY - 3.2);
          ctx.quadraticCurveTo(cx - 5, headY - 9.5, cx + 3, headY - 8.4);
          ctx.quadraticCurveTo(cx + 9.5, headY - 6, cx + 6.5, headY - 3.6);
          ctx.closePath();
        },
        css(mix(second, 0x6b5a48, 0.5)),
        1.2,
      );
      break;
    case 'none':
      inkFill(ctx, () => ctx.arc(cx, headY - 1.4, 6.6, Math.PI * 1.05, Math.PI * 1.95), '#3b2416', 1.1);
      break;
  }
  if (!armsUp) {
    arm(-1);
    arm(1);
  }
}

function drawFlag(ctx: Ctx, ox: number, oy: number, main: number, second: number, frame: number): void {
  const poleX = ox + 4;
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = 2.4;
  ctx.beginPath();
  ctx.moveTo(poleX, oy + FLAG_H);
  ctx.lineTo(poleX, oy + 3);
  ctx.stroke();
  const wave = (t: number): number => Math.sin(t * Math.PI * 2 + frame * 2.1) * 3;
  const w = FLAG_W - 8;
  const h = 16;
  const path = (): void => {
    ctx.moveTo(poleX, oy + 4);
    for (let i = 1; i <= 6; i++) ctx.lineTo(poleX + (w * i) / 6, oy + 4 + wave(i / 6));
    for (let i = 6; i >= 0; i--) ctx.lineTo(poleX + (w * i) / 6, oy + 4 + h + wave(i / 6) * 0.8);
    ctx.closePath();
  };
  inkFill(ctx, path, css(main), 1.6);
  ctx.save();
  ctx.beginPath();
  path();
  ctx.clip();
  ctx.fillStyle = css(second);
  ctx.fillRect(poleX, oy + 4 + h * 0.38, w + 2, h * 0.26);
  ctx.fillStyle = 'rgba(255,255,255,0.15)';
  ctx.fillRect(poleX, oy, w, 6);
  ctx.restore();
}

/** Gera o atlas da torcida para os dois uniformes em campo. */
export function generateCrowdTexture(scene: Phaser.Scene, kits: readonly [Kit, Kit]): void {
  const cols = FAN_VARIANTS * FAN_POSES;
  const fanRows = 2 * FAN_BOILS;
  const width = Math.max(cols * FAN_W, 2 * FLAG_FRAMES * FLAG_W);
  const height = fanRows * FAN_H + FLAG_H;
  if (scene.textures.exists(CROWD_KEY)) scene.textures.remove(CROWD_KEY);
  const tex = scene.textures.createCanvas(CROWD_KEY, width, height);
  if (!tex) throw new Error('Não foi possível criar a textura da torcida');
  const ctx = tex.getContext();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const team of [0, 1] as const) {
    const { main, second } = crowdColors(kits[team]);
    for (let b = 0; b < FAN_BOILS; b++) {
      for (let v = 0; v < FAN_VARIANTS; v++) {
        for (let p = 0; p < FAN_POSES; p++) {
          const x = (v * FAN_POSES + p) * FAN_W;
          const y = (team * FAN_BOILS + b) * FAN_H;
          // Variação de tom da camisa entre torcedores.
          const shirt = v % 3 === 0 ? light(main, 0.12) : v % 3 === 1 ? main : shade(main, 0.12);
          drawFan(ctx, x, y, shirt, second, v, p, b);
          tex.add(fanFrame(team, v, p, b), 0, x, y, FAN_W, FAN_H);
        }
      }
    }
    for (let f = 0; f < FLAG_FRAMES; f++) {
      const x = (team * FLAG_FRAMES + f) * FLAG_W;
      const y = fanRows * FAN_H;
      drawFlag(ctx, x, y, main, second, f);
      tex.add(flagFrame(team, f), 0, x, y, FLAG_W, FLAG_H);
    }
  }
  tex.refresh();
}
