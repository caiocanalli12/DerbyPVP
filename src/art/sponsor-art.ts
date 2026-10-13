/**
 * Placas de patrocínio no estilo de cartaz pintado dos anos 1930.
 * Os logos são desenhados do zero, apenas inspirados nas marcas (nunca copiados).
 * Cada face é fatiada em lâminas verticais para a virada de placa giratória.
 */
import type Phaser from 'phaser';
import { SPONSOR_SLATS } from '../config/constants';
import { Rng } from '../core/rng';
import { SPONSORS } from '../data/sponsors';
import type { Sponsor } from '../data/sponsors';
import { css, inkFill, mix, shade } from './brush';
import type { Ctx } from './canvas';
import { FONT_TEXT, FONT_TITLE, INK_CSS } from './style';

/** Resolução da face (px da textura por px da tela). */
export const SPONSOR_RES = 2;

export function sponsorKey(id: string): string {
  return `sponsor-${id}`;
}

export function slatFrame(i: number): string {
  return `slat-${i}`;
}

/** Texto com contorno e sombra de cartaz. */
function posterText(ctx: Ctx, text: string, x: number, y: number, size: number, font: string, fill: string, outline = INK_CSS, shadow = true): void {
  ctx.font = `${font === FONT_TEXT ? '700 ' : ''}${size}px "${font}"`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  if (shadow) {
    ctx.fillStyle = 'rgba(26,20,16,0.45)';
    ctx.fillText(text, x + size * 0.06, y + size * 0.07);
  }
  ctx.lineWidth = Math.max(2, size * 0.12);
  ctx.strokeStyle = outline;
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

/** Ajusta o tamanho da fonte para caber na largura. */
function fitSize(ctx: Ctx, text: string, font: string, maxW: number, start: number): number {
  let size = start;
  for (; size > 8; size -= 1) {
    ctx.font = `${font === FONT_TEXT ? '700 ' : ''}${size}px "${font}"`;
    if (ctx.measureText(text).width <= maxW) break;
  }
  return size;
}

function drawMarlburo(ctx: Ctx, w: number, h: number, s: Sponsor): void {
  ctx.fillStyle = css(s.bg);
  ctx.fillRect(0, 0, w, h);
  // "Telhado" próprio: faixa vermelha com cumeeira arredondada e beirais.
  const rw = w * 0.32;
  inkFill(
    ctx,
    () => {
      ctx.moveTo(0, 0);
      ctx.lineTo(rw, 0);
      ctx.lineTo(rw, h);
      ctx.lineTo(rw * 0.78, h);
      ctx.quadraticCurveTo(rw * 0.5, h * 0.32, rw * 0.22, h);
      ctx.lineTo(0, h);
      ctx.closePath();
    },
    css(s.main),
    3,
  );
  ctx.fillStyle = css(s.bg);
  ctx.beginPath();
  ctx.arc(rw * 0.5, h * 0.28, h * 0.08, 0, Math.PI * 2);
  ctx.fill();
  const size = fitSize(ctx, s.text, FONT_TITLE, w * 0.6, h * 0.62);
  posterText(ctx, s.text, rw + (w - rw) / 2, h * 0.5, size, FONT_TITLE, css(s.accent), css(s.bg), false);
  ctx.fillStyle = css(s.main);
  ctx.fillRect(rw + w * 0.06, h * 0.82, w - rw - w * 0.12, h * 0.06);
}

function drawBet(ctx: Ctx, w: number, h: number, s: Sponsor): void {
  ctx.fillStyle = css(s.bg);
  ctx.fillRect(0, 0, w, h);
  // Faixas diagonais amarelas nas pontas.
  ctx.fillStyle = css(shade(s.bg, 0.2));
  for (let i = -2; i < 14; i++) {
    ctx.beginPath();
    ctx.moveTo(i * h * 0.6, h);
    ctx.lineTo(i * h * 0.6 + h * 0.3, h);
    ctx.lineTo(i * h * 0.6 + h * 0.6, 0);
    ctx.lineTo(i * h * 0.6 + h * 0.3, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.save();
  ctx.translate(w / 2, h * 0.47);
  ctx.transform(1, 0, -0.18, 1, 0, 0);
  const size = fitSize(ctx, s.text, FONT_TEXT, w * 0.7, h * 0.78);
  posterText(ctx, s.text, 0, 0, size, FONT_TEXT, css(s.main));
  ctx.restore();
  ctx.strokeStyle = css(s.accent);
  ctx.lineWidth = h * 0.05;
  ctx.beginPath();
  ctx.moveTo(w * 0.22, h * 0.86);
  ctx.quadraticCurveTo(w * 0.5, h * 0.74, w * 0.78, h * 0.86);
  ctx.stroke();
}

function drawChopp(ctx: Ctx, w: number, h: number, s: Sponsor): void {
  ctx.fillStyle = css(s.bg);
  ctx.fillRect(0, 0, w, h);
  // Raios quentes saindo da caneca.
  const cx = w * 0.14;
  const cy = h * 0.55;
  ctx.fillStyle = css(mix(s.bg, s.main, 0.35));
  for (let i = 0; i < 16; i++) {
    const a0 = (i / 16) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(a0) * w, cy + Math.sin(a0) * w);
    ctx.lineTo(cx + Math.cos(a0 + 0.18) * w, cy + Math.sin(a0 + 0.18) * w);
    ctx.closePath();
    ctx.fill();
  }
  // Caneca de chope com espuma.
  const mw = h * 0.5;
  const mh = h * 0.62;
  inkFill(
    ctx,
    () => {
      ctx.rect(cx - mw / 2, cy - mh / 2, mw, mh);
    },
    '#f2b632',
    3,
  );
  ctx.beginPath();
  ctx.arc(cx + mw / 2, cy, mh * 0.28, -Math.PI / 2, Math.PI / 2);
  ctx.lineWidth = h * 0.07;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
  for (const [dx, r] of [
    [-0.3, 0.16],
    [0, 0.2],
    [0.3, 0.16],
  ] as const) {
    inkFill(ctx, () => ctx.arc(cx + dx * mw, cy - mh / 2, h * r, 0, Math.PI * 2), '#fffaf0', 2);
  }
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.fillRect(cx - mw * 0.32, cy - mh * 0.2, mw * 0.12, mh * 0.6);
  const left = w * 0.28;
  posterText(ctx, 'CHOPP', left + (w - left) / 2, h * 0.24, h * 0.24, FONT_TEXT, css(s.accent));
  const size = fitSize(ctx, 'Brama', FONT_TITLE, (w - left) * 0.9, h * 0.6);
  posterText(ctx, 'Brama', left + (w - left) / 2, h * 0.62, size, FONT_TITLE, css(s.main));
}

function drawAsilo(ctx: Ctx, w: number, h: number, s: Sponsor): void {
  ctx.fillStyle = css(s.bg);
  ctx.fillRect(0, 0, w, h);
  // Moldura dupla azul e rosa.
  ctx.lineWidth = h * 0.05;
  ctx.strokeStyle = css(s.main);
  ctx.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
  ctx.strokeStyle = css(s.accent);
  ctx.lineWidth = h * 0.025;
  ctx.strokeRect(h * 0.16, h * 0.16, w - h * 0.32, h - h * 0.32);
  // "Asilo do" em azul e "Rods" em rosa.
  const a = 'Asilo do ';
  const b = 'Rods';
  const size = fitSize(ctx, a + b, FONT_TITLE, w * 0.82, h * 0.56);
  ctx.font = `${size}px "${FONT_TITLE}"`;
  const wa = ctx.measureText(a).width;
  const wb = ctx.measureText(b).width;
  const x0 = w / 2 - (wa + wb) / 2;
  posterText(ctx, a.trim(), x0 + ctx.measureText(a.trim()).width / 2, h * 0.52, size, FONT_TITLE, css(s.main), '#ffffff', false);
  posterText(ctx, b, x0 + wa + wb / 2, h * 0.52, size, FONT_TITLE, css(s.accent), '#ffffff', false);
}

function drawMiami(ctx: Ctx, w: number, h: number, s: Sponsor): void {
  ctx.fillStyle = css(s.bg);
  ctx.fillRect(0, 0, w, h);
  // Chama estilizada (três línguas de fogo).
  const fx = w * 0.13;
  const base = h * 0.9;
  const flame = (dx: number, hh: number, ww: number, color: string): void => {
    inkFill(
      ctx,
      () => {
        ctx.moveTo(fx + dx - ww, base);
        ctx.quadraticCurveTo(fx + dx - ww * 1.2, base - hh * 0.55, fx + dx + ww * 0.3, base - hh);
        ctx.quadraticCurveTo(fx + dx + ww * 0.1, base - hh * 0.5, fx + dx + ww, base - hh * 0.35);
        ctx.quadraticCurveTo(fx + dx + ww * 1.1, base - hh * 0.1, fx + dx + ww * 0.6, base);
        ctx.closePath();
      },
      color,
      2.5,
    );
  };
  flame(-h * 0.12, h * 0.7, h * 0.2, css(s.main));
  flame(h * 0.1, h * 0.82, h * 0.22, css(s.main));
  flame(0, h * 0.5, h * 0.14, css(s.accent));
  const left = w * 0.27;
  const size = fitSize(ctx, 'MIAMI HOT', FONT_TITLE, (w - left) * 0.92, h * 0.58);
  posterText(ctx, 'MIAMI HOT', left + (w - left) / 2, h * 0.53, size, FONT_TITLE, css(s.main), css(s.accent), true);
}

/** Envelhecimento de cartaz: manchas, borda e brilho. */
function agePoster(ctx: Ctx, w: number, h: number, seed: number): void {
  const rng = new Rng(seed);
  for (let i = 0; i < 18; i++) {
    const x = rng.range(0, w);
    const y = rng.range(0, h);
    const r = rng.range(4, 18);
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(90,60,30,0.10)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(255,245,220,0.18)');
  g.addColorStop(1, 'rgba(43,53,80,0.18)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = INK_CSS;
  ctx.lineWidth = 4;
  ctx.strokeRect(1, 1, w - 2, h - 2);
}

const DRAWERS: Readonly<Record<string, (ctx: Ctx, w: number, h: number, s: Sponsor) => void>> = {
  marlburo: drawMarlburo,
  bet366: drawBet,
  chopp: drawChopp,
  asilo: drawAsilo,
  miami: drawMiami,
};

/** Gera as faces das placas (uma textura por patrocinador, fatiada em lâminas). */
export function generateSponsorTextures(scene: Phaser.Scene, boardW: number, boardH: number): void {
  const w = Math.round(boardW * SPONSOR_RES);
  const h = Math.round(boardH * SPONSOR_RES);
  SPONSORS.forEach((s, i) => {
    const key = sponsorKey(s.id);
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const tex = scene.textures.createCanvas(key, w, h);
    if (!tex) throw new Error(`Não foi possível criar a placa ${s.id}`);
    const ctx = tex.getContext();
    ctx.save();
    DRAWERS[s.id]?.(ctx, w, h, s);
    ctx.restore();
    agePoster(ctx, w, h, 77 + i);
    const sw = w / SPONSOR_SLATS;
    for (let k = 0; k < SPONSOR_SLATS; k++) {
      const x0 = Math.round(k * sw);
      const x1 = Math.round((k + 1) * sw);
      tex.add(slatFrame(k), 0, x0, 0, x1 - x0, h);
    }
    tex.refresh();
  });
}
