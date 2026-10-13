/**
 * Fundo do estádio desenhado por código numa única textura (1280x720) por partida:
 * céu do clima, arquibancadas (fundo e laterais), paredes de madeira pintada, gramado com
 * faixas de corte e textura de papel envelhecido, linhas irregulares desenhadas à mão.
 * Tudo posicionado por core/projection.ts.
 */
import type Phaser from 'phaser';
import {
  CENTER_CIRCLE_RADIUS,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  GOAL_AREA_RADIUS,
  GOAL_DEPTH,
  GOAL_HEIGHT,
  SKY_HEIGHT,
  WALL_BACK_HEIGHT,
  WALL_GOAL_HEIGHT,
  WALL_SIDE_HEIGHT,
} from '../config/constants';
import { project } from '../core/projection';
import { Rng } from '../core/rng';
import type { WeatherId } from '../data/weather';
import { FIELD_CENTER_X, FIELD_CENTER_Y, GOAL_Y_MAX, GOAL_Y_MIN, penaltySpot } from '../sim/field';
import { css, mix, shade } from './brush';
import type { Ctx } from './canvas';
import { makeCanvasTexture } from './canvas';
import { INK_CSS } from './style';

export const STADIUM_KEY = 'stadium-bg';

interface W {
  x: number;
  y: number;
  z?: number;
}

const scr = (p: W): { x: number; y: number } => {
  const s = project(p.x, p.y, p.z ?? 0);
  return { x: s.x, y: s.y };
};

function poly(ctx: Ctx, pts: readonly W[]): void {
  pts.forEach((p, i) => {
    const s = scr(p);
    if (i === 0) ctx.moveTo(s.x, s.y);
    else ctx.lineTo(s.x, s.y);
  });
  ctx.closePath();
}

/** Paleta de cada clima (cores de base; a iluminação global vem por cima no WeatherView). */
export interface StadiumPalette {
  skyTop: number;
  skyBottom: number;
  grassA: number;
  grassB: number;
  line: number;
  wood: number;
  woodDark: number;
  stand: number;
  standDark: number;
}

export function stadiumPalette(weather: WeatherId): StadiumPalette {
  const base: StadiumPalette = {
    skyTop: 0x6fc1ec,
    skyBottom: 0xc6ecf8,
    grassA: 0x58b947,
    grassB: 0x46a238,
    line: 0xfbf7ea,
    wood: 0xa8632e,
    woodDark: 0x6e3d1a,
    stand: 0x8a5a3c,
    standDark: 0x5e3b27,
  };
  switch (weather) {
    case 'sunset':
      return { ...base, skyTop: 0x6b4a9a, skyBottom: 0xf7a65a };
    case 'night':
      return { ...base, skyTop: 0x070d24, skyBottom: 0x1d2d5c, grassA: 0x4fae40, grassB: 0x409a34 };
    case 'rain':
      return {
        ...base,
        skyTop: 0x6c7680,
        skyBottom: 0x9aa4ad,
        grassA: 0x4f9e44,
        grassB: 0x438d3a,
        wood: 0x8f5a31,
        stand: 0x76533d,
        standDark: 0x523a2b,
      };
    default:
      return base;
  }
}

/** Linha "desenhada à mão": pequenas ondulações e espessura variável. */
function handLine(ctx: Ctx, rng: Rng, pts: readonly W[], color: string, width: number, closed = false): void {
  const s = pts.map(scr);
  if (closed) s.push(s[0]!);
  ctx.strokeStyle = color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (let i = 0; i < s.length - 1; i++) {
    const a = s[i]!;
    const b = s[i + 1]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.round(len / 14));
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    for (let k = 1; k <= steps; k++) {
      const t = k / steps;
      const wob = k === steps ? 0 : rng.range(-0.7, 0.7);
      const nx = -(b.y - a.y) / (len || 1);
      const ny = (b.x - a.x) / (len || 1);
      ctx.lineTo(a.x + (b.x - a.x) * t + nx * wob, a.y + (b.y - a.y) * t + ny * wob);
    }
    ctx.lineWidth = width * rng.range(0.85, 1.15);
    ctx.stroke();
  }
}

function arcPts(cx: number, cy: number, r: number, a0: number, a1: number, n = 48): W[] {
  const out: W[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    out.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r });
  }
  return out;
}

/** Textura de papel envelhecido: manchas e fibras suaves. */
function paperTexture(ctx: Ctx, rng: Rng, x: number, y: number, w: number, h: number, strength: number): void {
  for (let i = 0; i < (w * h) / 900; i++) {
    const px = x + rng.range(0, w);
    const py = y + rng.range(0, h);
    const r = rng.range(6, 26);
    const g = ctx.createRadialGradient(px, py, 0, px, py, r);
    const dark = rng.chance(0.5);
    g.addColorStop(0, dark ? `rgba(60,40,20,${0.05 * strength})` : `rgba(255,245,215,${0.05 * strength})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(px - r, py - r, r * 2, r * 2);
  }
  ctx.lineWidth = 0.6;
  for (let i = 0; i < (w * h) / 2500; i++) {
    const px = x + rng.range(0, w);
    const py = y + rng.range(0, h);
    const a = rng.range(0, Math.PI);
    const l = rng.range(3, 10);
    ctx.strokeStyle = `rgba(70,50,30,${0.08 * strength})`;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    ctx.stroke();
  }
}

/** Tábuas de madeira pintada num quadrilátero do mundo. */
function woodPanel(ctx: Ctx, rng: Rng, quad: readonly W[], pal: StadiumPalette, horizontal: boolean): void {
  ctx.beginPath();
  poly(ctx, quad);
  ctx.fillStyle = css(pal.wood);
  ctx.fill();
  ctx.save();
  ctx.beginPath();
  poly(ctx, quad);
  ctx.clip();
  // Faixas das tábuas.
  const s = quad.map(scr);
  const minX = Math.min(...s.map((p) => p.x));
  const maxX = Math.max(...s.map((p) => p.x));
  const minY = Math.min(...s.map((p) => p.y));
  const maxY = Math.max(...s.map((p) => p.y));
  ctx.strokeStyle = css(pal.woodDark, 0.55);
  ctx.lineWidth = 1.2;
  if (horizontal) {
    for (let y = minY + 5; y < maxY; y += 7) {
      ctx.beginPath();
      ctx.moveTo(minX, y + rng.range(-0.4, 0.4));
      ctx.lineTo(maxX, y + rng.range(-0.4, 0.4));
      ctx.stroke();
    }
  } else {
    for (let x = minX + 9; x < maxX; x += 11) {
      ctx.beginPath();
      ctx.moveTo(x, minY);
      ctx.lineTo(x + rng.range(-1, 1), maxY);
      ctx.stroke();
    }
  }
  // Veios e luz de cima.
  for (let i = 0; i < ((maxX - minX) * (maxY - minY)) / 400; i++) {
    const px = rng.range(minX, maxX);
    const py = rng.range(minY, maxY);
    ctx.strokeStyle = css(pal.woodDark, 0.25);
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.quadraticCurveTo(px + 4, py + rng.range(-1, 1), px + 8, py);
    ctx.stroke();
  }
  const g = ctx.createLinearGradient(0, minY, 0, maxY);
  g.addColorStop(0, 'rgba(255,240,210,0.18)');
  g.addColorStop(1, 'rgba(43,53,80,0.25)');
  ctx.fillStyle = g;
  ctx.fillRect(minX, minY, maxX - minX, maxY - minY);
  ctx.restore();
  ctx.beginPath();
  poly(ctx, quad);
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
}

/** Linha de tela onde termina a arquibancada do fundo (topo da parede do fundo). */
export const BACK_WALL_TOP = project(0, 0, WALL_BACK_HEIGHT).y;
export const BACK_WALL_BOTTOM = project(0, 0, 0).y;

/** Borda interna das arquibancadas laterais (afastada do gol). */
export function sideStandEdge(side: 0 | 1, y: number): number {
  const x = side === 0 ? -GOAL_DEPTH - 0.7 : FIELD_LENGTH + GOAL_DEPTH + 0.7;
  return project(x, y, 0).x;
}

function drawSky(ctx: Ctx, rng: Rng, pal: StadiumPalette, weather: WeatherId): void {
  const g = ctx.createLinearGradient(0, 0, 0, SKY_HEIGHT + 30);
  g.addColorStop(0, css(pal.skyTop));
  g.addColorStop(1, css(pal.skyBottom));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, GAME_WIDTH, SKY_HEIGHT + 30);
  if (weather === 'night') {
    for (let i = 0; i < 70; i++) {
      const x = rng.range(0, GAME_WIDTH);
      const y = rng.range(2, SKY_HEIGHT);
      const r = rng.range(0.6, 1.6);
      ctx.fillStyle = `rgba(255,248,220,${rng.range(0.5, 1)})`;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawFloodlightTower(ctx: Ctx, x: number, baseY: number, topY: number): void {
  ctx.lineWidth = 2;
  ctx.strokeStyle = INK_CSS;
  ctx.fillStyle = '#4a4f5c';
  // Treliça.
  ctx.beginPath();
  ctx.moveTo(x - 9, baseY);
  ctx.lineTo(x - 3, topY + 20);
  ctx.lineTo(x + 3, topY + 20);
  ctx.lineTo(x + 9, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  for (let y = topY + 30; y < baseY; y += 14) {
    ctx.beginPath();
    ctx.moveTo(x - 3 - ((y - topY) / (baseY - topY)) * 6, y);
    ctx.lineTo(x + 3 + ((y - topY) / (baseY - topY)) * 6, y + 7);
    ctx.stroke();
  }
  // Painel de lâmpadas.
  ctx.fillStyle = '#2b2f38';
  ctx.fillRect(x - 22, topY, 44, 22);
  ctx.strokeRect(x - 22, topY, 44, 22);
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const lx = x - 16 + c * 10.7;
      const ly = topY + 6 + r * 10;
      const g = ctx.createRadialGradient(lx, ly, 0, lx, ly, 6);
      g.addColorStop(0, '#fffbe6');
      g.addColorStop(1, 'rgba(255,240,180,0)');
      ctx.fillStyle = g;
      ctx.fillRect(lx - 6, ly - 6, 12, 12);
    }
  }
}

function drawBackStands(ctx: Ctx, rng: Rng, pal: StadiumPalette, weather: WeatherId): void {
  const top = SKY_HEIGHT;
  const bottom = BACK_WALL_TOP;
  if (weather === 'night') {
    drawFloodlightTower(ctx, 46, top + 70, 6);
    drawFloodlightTower(ctx, GAME_WIDTH - 46, top + 70, 6);
  }
  // Cornija art déco no alto da arquibancada.
  ctx.fillStyle = css(shade(pal.stand, 0.15));
  ctx.fillRect(0, top - 6, GAME_WIDTH, 14);
  ctx.fillStyle = css(mix(pal.stand, 0xf3e6c4, 0.55));
  for (let x = 0; x < GAME_WIDTH; x += 40) {
    ctx.beginPath();
    ctx.moveTo(x, top + 8);
    ctx.lineTo(x + 20, top - 6);
    ctx.lineTo(x + 40, top + 8);
    ctx.closePath();
    ctx.fill();
  }
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, top + 8);
  ctx.lineTo(GAME_WIDTH, top + 8);
  ctx.stroke();
  // Degraus.
  const rows = 9;
  const h = (bottom - (top + 8)) / rows;
  for (let i = 0; i < rows; i++) {
    const y = top + 8 + i * h;
    ctx.fillStyle = css(i % 2 === 0 ? pal.stand : pal.standDark);
    ctx.fillRect(0, y, GAME_WIDTH, h);
    ctx.fillStyle = css(shade(pal.stand, 0.35), 0.8);
    ctx.fillRect(0, y + h - 3, GAME_WIDTH, 3);
  }
  // Escadas (corredores) a cada tanto.
  for (let x = 160; x < GAME_WIDTH; x += 320) {
    ctx.fillStyle = css(mix(pal.stand, 0xf3e6c4, 0.25));
    ctx.fillRect(x - 6, top + 8, 12, bottom - top - 8);
    ctx.strokeStyle = css(pal.standDark);
    ctx.lineWidth = 1;
    for (let y = top + 12; y < bottom; y += 6) {
      ctx.beginPath();
      ctx.moveTo(x - 6, y);
      ctx.lineTo(x + 6, y);
      ctx.stroke();
    }
  }
  paperTexture(ctx, rng, 0, top, GAME_WIDTH, bottom - top, 1.2);
}

function drawSideStands(ctx: Ctx, rng: Rng, pal: StadiumPalette): void {
  for (const side of [0, 1] as const) {
    const yTop = BACK_WALL_TOP;
    const e0 = sideStandEdge(side, 0);
    const e1 = sideStandEdge(side, FIELD_WIDTH);
    const outer = side === 0 ? 0 : GAME_WIDTH;
    ctx.beginPath();
    ctx.moveTo(outer, yTop);
    ctx.lineTo(e0, yTop);
    ctx.lineTo(e1, GAME_HEIGHT);
    ctx.lineTo(outer, GAME_HEIGHT);
    ctx.closePath();
    ctx.fillStyle = css(pal.standDark);
    ctx.fill();
    // Degraus diagonais acompanhando o campo.
    for (let k = 1; k <= 6; k++) {
      const off = k * 15 * (side === 0 ? -1 : 1);
      ctx.strokeStyle = css(k % 2 === 0 ? pal.stand : shade(pal.stand, 0.3));
      ctx.lineWidth = 7;
      ctx.beginPath();
      ctx.moveTo(e0 + off, yTop);
      ctx.lineTo(e1 + off, GAME_HEIGHT);
      ctx.stroke();
    }
    ctx.strokeStyle = INK_CSS;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(e0, yTop);
    ctx.lineTo(e1, GAME_HEIGHT);
    ctx.stroke();
    paperTexture(ctx, rng, side === 0 ? 0 : e0, yTop, Math.abs(e0 - outer), GAME_HEIGHT - yTop, 1);
  }
}

function drawGrass(ctx: Ctx, rng: Rng, pal: StadiumPalette, weather: WeatherId): void {
  const stripes = 10;
  const w = FIELD_LENGTH / stripes;
  // Faixa de grama além das linhas (até as paredes e dentro dos gols).
  for (let i = 0; i < stripes; i++) {
    ctx.beginPath();
    poly(ctx, [
      { x: i * w, y: 0 },
      { x: (i + 1) * w, y: 0 },
      { x: (i + 1) * w, y: FIELD_WIDTH },
      { x: i * w, y: FIELD_WIDTH },
    ]);
    ctx.fillStyle = css(i % 2 === 0 ? pal.grassA : pal.grassB);
    ctx.fill();
  }
  for (const side of [0, 1] as const) {
    const x0 = side === 0 ? 0 : FIELD_LENGTH;
    const x1 = side === 0 ? -GOAL_DEPTH : FIELD_LENGTH + GOAL_DEPTH;
    ctx.beginPath();
    poly(ctx, [
      { x: x0, y: GOAL_Y_MIN },
      { x: x1, y: GOAL_Y_MIN },
      { x: x1, y: GOAL_Y_MAX },
      { x: x0, y: GOAL_Y_MAX },
    ]);
    ctx.fillStyle = css(shade(pal.grassB, 0.2));
    ctx.fill();
  }
  // Textura sutil de papel envelhecido e tufos de grama, recortados no campo.
  ctx.save();
  ctx.beginPath();
  poly(ctx, [
    { x: 0, y: 0 },
    { x: FIELD_LENGTH, y: 0 },
    { x: FIELD_LENGTH, y: FIELD_WIDTH },
    { x: 0, y: FIELD_WIDTH },
  ]);
  ctx.clip();
  const tl = scr({ x: 0, y: FIELD_WIDTH });
  const tr = scr({ x: FIELD_LENGTH, y: 0 });
  paperTexture(ctx, rng, tl.x, tr.y, tr.x - tl.x + 80, tl.y - tr.y, 1.4);
  for (let i = 0; i < 700; i++) {
    const p = scr({ x: rng.range(0, FIELD_LENGTH), y: rng.range(0, FIELD_WIDTH) });
    ctx.strokeStyle = css(rng.chance(0.5) ? shade(pal.grassA, 0.25) : mix(pal.grassA, 0xffffff, 0.25), 0.45);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
    ctx.lineTo(p.x + rng.range(-1, 1), p.y - rng.range(1.5, 3));
    ctx.stroke();
  }
  // Leve escurecido nas bordas (profundidade).
  const g = ctx.createLinearGradient(0, tr.y, 0, tl.y);
  g.addColorStop(0, 'rgba(43,53,80,0.18)');
  g.addColorStop(0.3, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, tr.y, GAME_WIDTH, tl.y - tr.y);
  if (weather === 'rain') {
    // Poças decorativas.
    for (let i = 0; i < 7; i++) {
      const c = scr({ x: rng.range(4, FIELD_LENGTH - 4), y: rng.range(2, FIELD_WIDTH - 2) });
      const rx = rng.range(14, 30);
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, rx * 0.32, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(120,140,165,0.55)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(c.x - rx * 0.3, c.y - rx * 0.08, rx * 0.35, rx * 0.06, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(230,240,255,0.45)';
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(c.x, c.y, rx, rx * 0.32, 0, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(40,55,70,0.5)';
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }
  }
  ctx.restore();
}

function drawLines(ctx: Ctx, rng: Rng, pal: StadiumPalette): void {
  const c = css(pal.line);
  const wdt = 3;
  handLine(
    ctx,
    rng,
    [
      { x: 0, y: 0 },
      { x: FIELD_LENGTH, y: 0 },
      { x: FIELD_LENGTH, y: FIELD_WIDTH },
      { x: 0, y: FIELD_WIDTH },
    ],
    c,
    wdt,
    true,
  );
  handLine(
    ctx,
    rng,
    [
      { x: FIELD_CENTER_X, y: 0 },
      { x: FIELD_CENTER_X, y: FIELD_WIDTH },
    ],
    c,
    wdt,
  );
  handLine(ctx, rng, arcPts(FIELD_CENTER_X, FIELD_CENTER_Y, CENTER_CIRCLE_RADIUS, 0, Math.PI * 2, 40), c, wdt);
  handLine(ctx, rng, arcPts(0, FIELD_CENTER_Y, GOAL_AREA_RADIUS, -Math.PI / 2, Math.PI / 2, 40), c, wdt);
  handLine(ctx, rng, arcPts(FIELD_LENGTH, FIELD_CENTER_Y, GOAL_AREA_RADIUS, Math.PI / 2, Math.PI * 1.5, 40), c, wdt);
  const dot = (x: number, y: number, r: number): void => {
    ctx.beginPath();
    poly(ctx, arcPts(x, y, r, 0, Math.PI * 2, 16));
    ctx.fillStyle = c;
    ctx.fill();
  };
  dot(FIELD_CENTER_X, FIELD_CENTER_Y, 0.2);
  for (const side of [0, 1] as const) {
    const p = penaltySpot(side);
    dot(p.x, p.y, 0.15);
  }
}

function drawWalls(ctx: Ctx, rng: Rng, pal: StadiumPalette): void {
  // Parede do fundo (as placas de patrocínio são desenhadas por cima, animadas).
  woodPanel(
    ctx,
    rng,
    [
      { x: -GOAL_DEPTH - 0.6, y: 0, z: 0 },
      { x: FIELD_LENGTH + GOAL_DEPTH + 0.6, y: 0, z: 0 },
      { x: FIELD_LENGTH + GOAL_DEPTH + 0.6, y: 0, z: WALL_BACK_HEIGHT },
      { x: -GOAL_DEPTH - 0.6, y: 0, z: WALL_BACK_HEIGHT },
    ],
    pal,
    true,
  );
  for (const side of [0, 1] as const) {
    const x = side === 0 ? 0 : FIELD_LENGTH;
    const panels: W[][] = [
      [
        { x, y: 0, z: 0 },
        { x, y: GOAL_Y_MIN, z: 0 },
        { x, y: GOAL_Y_MIN, z: WALL_SIDE_HEIGHT },
        { x, y: 0, z: WALL_SIDE_HEIGHT },
      ],
      [
        { x, y: GOAL_Y_MIN, z: GOAL_HEIGHT },
        { x, y: GOAL_Y_MAX, z: GOAL_HEIGHT },
        { x, y: GOAL_Y_MAX, z: WALL_GOAL_HEIGHT },
        { x, y: GOAL_Y_MIN, z: WALL_GOAL_HEIGHT },
      ],
      [
        { x, y: GOAL_Y_MAX, z: 0 },
        { x, y: FIELD_WIDTH, z: 0 },
        { x, y: FIELD_WIDTH, z: WALL_SIDE_HEIGHT },
        { x, y: GOAL_Y_MAX, z: WALL_SIDE_HEIGHT },
      ],
    ];
    for (const p of panels) woodPanel(ctx, rng, p, pal, false);
    // Fundo do gol (parede atrás da rede).
    const xb = side === 0 ? -GOAL_DEPTH : FIELD_LENGTH + GOAL_DEPTH;
    woodPanel(
      ctx,
      rng,
      [
        { x: xb, y: GOAL_Y_MIN, z: 0 },
        { x: xb, y: GOAL_Y_MAX, z: 0 },
        { x: xb, y: GOAL_Y_MAX, z: WALL_GOAL_HEIGHT },
        { x: xb, y: GOAL_Y_MIN, z: WALL_GOAL_HEIGHT },
      ],
      { ...pal, wood: shade(pal.wood, 0.3) },
      false,
    );
  }
}

/** Gera a textura de fundo do estádio para o clima. */
export function generateStadiumTexture(scene: Phaser.Scene, weather: WeatherId, seed: number): void {
  const pal = stadiumPalette(weather);
  const rng = new Rng(seed ^ 0x5a5a);
  makeCanvasTexture(scene, STADIUM_KEY, GAME_WIDTH, GAME_HEIGHT, (ctx) => {
    ctx.fillStyle = css(pal.standDark);
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    drawSky(ctx, rng, pal, weather);
    drawBackStands(ctx, rng, pal, weather);
    // Chão em volta do campo (pista de terra entre o campo e as arquibancadas).
    const dirt = css(mix(pal.standDark, 0x9c7a52, 0.45));
    ctx.fillStyle = dirt;
    ctx.fillRect(0, scr({ x: 0, y: FIELD_WIDTH }).y, GAME_WIDTH, GAME_HEIGHT);
    for (const side of [0, 1] as const) {
      const xo = side === 0 ? -GOAL_DEPTH - 0.7 : FIELD_LENGTH + GOAL_DEPTH + 0.7;
      const xi = side === 0 ? 0 : FIELD_LENGTH;
      ctx.beginPath();
      poly(ctx, [
        { x: xo, y: 0 },
        { x: xi, y: 0 },
        { x: xi, y: FIELD_WIDTH + 1.6 },
        { x: xo, y: FIELD_WIDTH + 1.6 },
      ]);
      ctx.fillStyle = dirt;
      ctx.fill();
    }
    drawSideStands(ctx, rng, pal);
    if (weather === 'night') {
      // Torres da frente (as do fundo ficam atrás da arquibancada).
      drawFloodlightTower(ctx, 28, GAME_HEIGHT + 10, 430);
      drawFloodlightTower(ctx, GAME_WIDTH - 28, GAME_HEIGHT + 10, 430);
    }
    drawWalls(ctx, rng, pal);
    drawGrass(ctx, rng, pal, weather);
    drawLines(ctx, rng, pal);
  });
}
