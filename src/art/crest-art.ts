/**
 * Escudos: apenas o contorno do formato do escudo real, com leves marcas de semelhança,
 * desenhados de forma simplificada no estilo do jogo (nunca uma cópia).
 */
import type Phaser from 'phaser';
import { TEAMS } from '../data/teams';
import type { CrestDesign, CrestMark, TeamId } from '../data/teams';
import { css, inkFill } from './brush';
import type { Ctx } from './canvas';
import { makeCanvasTexture } from './canvas';
import { INK_CSS } from './style';

export const CREST_SIZE = 128;

export function crestKey(team: TeamId): string {
  return `crest-${team}`;
}

/** Caminho do contorno de cada formato (centro c, raio r). */
function outline(ctx: Ctx, shape: CrestDesign['shape'], c: number, r: number): void {
  switch (shape) {
    case 'circle':
    case 'circle-crown':
      ctx.arc(c, c + (shape === 'circle-crown' ? r * 0.12 : 0), r * (shape === 'circle-crown' ? 0.86 : 1), 0, Math.PI * 2);
      break;
    case 'oval':
      ctx.ellipse(c, c, r * 0.78, r, 0, 0, Math.PI * 2);
      break;
    case 'bulb':
      // "Bulbo": topo dividido em dois lóbulos, base em ponta arredondada.
      ctx.moveTo(c, c + r);
      ctx.quadraticCurveTo(c - r * 0.95, c + r * 0.55, c - r * 0.85, c - r * 0.25);
      ctx.quadraticCurveTo(c - r * 0.8, c - r * 0.95, c - r * 0.25, c - r * 0.9);
      ctx.quadraticCurveTo(c - r * 0.05, c - r * 0.75, c, c - r * 0.55);
      ctx.quadraticCurveTo(c + r * 0.05, c - r * 0.75, c + r * 0.25, c - r * 0.9);
      ctx.quadraticCurveTo(c + r * 0.8, c - r * 0.95, c + r * 0.85, c - r * 0.25);
      ctx.quadraticCurveTo(c + r * 0.95, c + r * 0.55, c, c + r);
      ctx.closePath();
      break;
    case 'shield-flames':
      ctx.moveTo(c - r * 0.62, c - r * 0.78);
      ctx.lineTo(c + r * 0.62, c - r * 0.78);
      ctx.lineTo(c + r * 0.62, c + r * 0.18);
      ctx.quadraticCurveTo(c + r * 0.55, c + r * 0.72, c, c + r * 0.98);
      ctx.quadraticCurveTo(c - r * 0.55, c + r * 0.72, c - r * 0.62, c + r * 0.18);
      ctx.closePath();
      break;
  }
}

function star(ctx: Ctx, x: number, y: number, r: number, fill: string): void {
  inkFill(
    ctx,
    () => {
      for (let k = 0; k < 10; k++) {
        const rr = k % 2 === 0 ? r : r * 0.42;
        const a = (k * Math.PI) / 5 - Math.PI / 2;
        if (k === 0) ctx.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
        else ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
      }
      ctx.closePath();
    },
    fill,
    2,
  );
}

function mark(ctx: Ctx, m: CrestMark, d: CrestDesign, c: number, r: number): void {
  const markC = css(d.mark);
  const mark2 = css(d.mark2);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  switch (m) {
    case 'star-top':
      star(ctx, c, c - r * 0.58, r * 0.16, mark2);
      break;
    case 'letter-p': {
      // Uma curva lembrando a letra "P" (haste e barriga), sem tipografia real.
      ctx.strokeStyle = markC;
      ctx.lineWidth = r * 0.14;
      ctx.beginPath();
      ctx.moveTo(c - r * 0.18, c + r * 0.45);
      ctx.lineTo(c - r * 0.18, c - r * 0.3);
      ctx.quadraticCurveTo(c + r * 0.42, c - r * 0.34, c + r * 0.3, c);
      ctx.quadraticCurveTo(c + r * 0.18, c + r * 0.14, c - r * 0.18, c + r * 0.08);
      ctx.stroke();
      break;
    }
    case 'crossed-oars':
      for (const s of [-1, 1]) {
        ctx.save();
        ctx.translate(c, c + r * 0.05);
        ctx.rotate(s * 0.7);
        ctx.fillStyle = markC;
        ctx.fillRect(-r * 0.04, -r * 0.62, r * 0.08, r * 1.15);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.62, r * 0.1, r * 0.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.beginPath();
      ctx.arc(c, c + r * 0.05, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = mark2;
      ctx.fill();
      break;
    case 'split-stripes-bottom': {
      // Listras verticais na metade de baixo.
      ctx.save();
      ctx.beginPath();
      ctx.rect(c - r, c + r * 0.05, r * 2, r);
      ctx.clip();
      const w = r * 0.24;
      for (let i = -4; i <= 4; i++) {
        ctx.fillStyle = i % 2 === 0 ? markC : mark2;
        ctx.fillRect(c + i * w - w / 2, c, w, r);
      }
      ctx.restore();
      ctx.strokeStyle = INK_CSS;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(c - r, c + r * 0.05);
      ctx.lineTo(c + r, c + r * 0.05);
      ctx.stroke();
      break;
    }
    case 'small-cross-corner':
      ctx.fillStyle = '#c8102e';
      ctx.fillRect(c - r * 0.52, c - r * 0.5, r * 0.3, r * 0.08);
      ctx.fillRect(c - r * 0.41, c - r * 0.62, r * 0.08, r * 0.32);
      break;
    case 'crown-top': {
      const y = c - r * 0.78;
      inkFill(
        ctx,
        () => {
          ctx.moveTo(c - r * 0.42, y + r * 0.22);
          ctx.lineTo(c - r * 0.48, y - r * 0.12);
          ctx.lineTo(c - r * 0.22, y + r * 0.04);
          ctx.lineTo(c, y - r * 0.2);
          ctx.lineTo(c + r * 0.22, y + r * 0.04);
          ctx.lineTo(c + r * 0.48, y - r * 0.12);
          ctx.lineTo(c + r * 0.42, y + r * 0.22);
          ctx.closePath();
        },
        mark2,
        2,
      );
      break;
    }
    case 'diagonal-band':
      ctx.save();
      ctx.translate(c, c + r * 0.12);
      ctx.rotate(-0.75);
      ctx.fillStyle = markC;
      ctx.fillRect(-r, -r * 0.13, r * 2, r * 0.26);
      ctx.restore();
      break;
    case 'concentric-rings':
      for (const [k, col] of [
        [0.7, markC],
        [0.52, mark2],
        [0.34, markC],
      ] as const) {
        ctx.beginPath();
        ctx.arc(c, c, r * k, 0, Math.PI * 2);
        ctx.lineWidth = r * 0.1;
        ctx.strokeStyle = col;
        ctx.stroke();
      }
      break;
    case 'center-dot':
      ctx.beginPath();
      ctx.arc(c, c, r * 0.12, 0, Math.PI * 2);
      ctx.fillStyle = markC;
      ctx.fill();
      break;
    case 'left-stripes':
      ctx.save();
      ctx.beginPath();
      ctx.rect(c - r, c - r, r, r * 2);
      ctx.clip();
      for (let i = 0; i < 5; i++) {
        ctx.fillStyle = i % 2 === 0 ? markC : mark2;
        ctx.fillRect(c - r + i * r * 0.2, c - r, r * 0.2, r * 2);
      }
      ctx.restore();
      break;
    case 'right-cross':
      ctx.fillStyle = markC;
      ctx.fillRect(c + r * 0.06, c - r * 0.1, r * 0.66, r * 0.2);
      ctx.fillRect(c + r * 0.29, c - r * 0.6, r * 0.2, r * 1.2);
      break;
    case 'wing':
      // Silhueta de asa simplificada.
      inkFill(
        ctx,
        () => {
          ctx.moveTo(c - r * 0.35, c + r * 0.25);
          ctx.quadraticCurveTo(c - r * 0.2, c - r * 0.45, c + r * 0.38, c - r * 0.5);
          ctx.quadraticCurveTo(c + r * 0.12, c - r * 0.3, c + r * 0.32, c - r * 0.22);
          ctx.quadraticCurveTo(c + r * 0.05, c - r * 0.05, c + r * 0.25, c + r * 0.05);
          ctx.quadraticCurveTo(c, c + r * 0.1, c - r * 0.35, c + r * 0.25);
        },
        markC,
        2,
      );
      break;
    case 'staff':
      // Bastão vertical com ponta curva (lembra o leão com o cajado).
      ctx.strokeStyle = markC;
      ctx.lineWidth = r * 0.11;
      ctx.beginPath();
      ctx.moveTo(c, c + r * 0.55);
      ctx.lineTo(c, c - r * 0.35);
      ctx.quadraticCurveTo(c, c - r * 0.6, c + r * 0.22, c - r * 0.55);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(c - r * 0.25, c + r * 0.05, r * 0.16, 0, Math.PI * 2);
      ctx.fillStyle = mark2;
      ctx.fill();
      break;
  }
}

function flames(ctx: Ctx, c: number, r: number, color: string): void {
  for (const s of [-1, 1]) {
    inkFill(
      ctx,
      () => {
        const x = c + s * r * 0.66;
        ctx.moveTo(x, c + r * 0.45);
        ctx.quadraticCurveTo(x + s * r * 0.32, c, x + s * r * 0.12, c - r * 0.55);
        ctx.quadraticCurveTo(x + s * r * 0.08, c - r * 0.1, x + s * r * 0.02, c - r * 0.02);
        ctx.quadraticCurveTo(x + s * r * 0.1, c + r * 0.2, x, c + r * 0.45);
      },
      color,
      2,
    );
  }
}

/** Desenha um escudo centrado num quadrado de lado `size`. */
export function drawCrest(ctx: Ctx, d: CrestDesign, size: number): void {
  const c = size / 2;
  const r = size * 0.42;
  ctx.lineJoin = 'round';
  if (d.shape === 'shield-flames') flames(ctx, c, r, css(d.ring));
  // Sombra projetada fria.
  ctx.save();
  ctx.translate(size * 0.03, size * 0.04);
  ctx.beginPath();
  outline(ctx, d.shape, c, r);
  ctx.fillStyle = 'rgba(26,20,16,0.35)';
  ctx.fill();
  ctx.restore();
  inkFill(ctx, () => outline(ctx, d.shape, c, r), css(d.base), size * 0.045);
  ctx.save();
  ctx.beginPath();
  outline(ctx, d.shape, c, r);
  ctx.clip();
  // Anel interno.
  ctx.beginPath();
  outline(ctx, d.shape, c, r * 0.86);
  ctx.lineWidth = size * 0.05;
  ctx.strokeStyle = css(d.ring);
  ctx.stroke();
  for (const m of d.marks) {
    // A coroa do escudo redondo com coroa fica por cima do contorno (desenhada no fim).
    if (d.shape === 'circle-crown' && m === 'crown-top') continue;
    mark(ctx, m, d, c, r * 0.82);
  }
  // Brilho e sombra pintados.
  const g = ctx.createLinearGradient(0, c - r, 0, c + r);
  g.addColorStop(0, 'rgba(255,255,255,0.22)');
  g.addColorStop(0.5, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(43,53,80,0.2)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  ctx.restore();
  ctx.beginPath();
  outline(ctx, d.shape, c, r);
  ctx.lineWidth = size * 0.035;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
  if (d.shape === 'circle-crown') mark(ctx, 'crown-top', { ...d, mark2: d.ring }, c, r);
}

/** Gera as texturas dos escudos dos 8 times (uma vez). */
export function generateCrestTextures(scene: Phaser.Scene): void {
  for (const t of TEAMS) {
    const key = crestKey(t.id);
    if (scene.textures.exists(key)) continue;
    makeCanvasTexture(scene, key, CREST_SIZE, CREST_SIZE, (ctx) => drawCrest(ctx, t.crest, CREST_SIZE));
  }
}
