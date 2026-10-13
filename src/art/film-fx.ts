/**
 * Texturas do efeito de filme antigo (camadas simples, sem shader): grão (4 variações),
 * riscos verticais, pontinhos de poeira, vinheta e papel envelhecido.
 */
import type Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { Rng } from '../core/rng';
import { makeCanvasTexture } from './canvas';

export const GRAIN_VARIANTS = 4;
export const GRAIN_SIZE = 256;

export function grainKey(v: number): string {
  return `film-grain-${v}`;
}

export const SCRATCH_KEY = 'film-scratch';
export const DUST_KEY = 'film-dust';
export const VIGNETTE_KEY = 'film-vignette';
export const PAPER_KEY = 'film-paper';

export function generateFilmTextures(scene: Phaser.Scene): void {
  if (scene.textures.exists(grainKey(0))) return;
  for (let v = 0; v < GRAIN_VARIANTS; v++) {
    const rng = new Rng(7000 + v * 31);
    makeCanvasTexture(scene, grainKey(v), GRAIN_SIZE, GRAIN_SIZE, (ctx) => {
      const img = ctx.createImageData(GRAIN_SIZE, GRAIN_SIZE);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = rng.next();
        // Grão: pontos claros e escuros esparsos, o resto transparente.
        if (n < 0.08) {
          img.data[i] = img.data[i + 1] = img.data[i + 2] = 20;
          img.data[i + 3] = Math.round(rng.range(60, 160));
        } else if (n > 0.93) {
          img.data[i] = 255;
          img.data[i + 1] = 248;
          img.data[i + 2] = 230;
          img.data[i + 3] = Math.round(rng.range(40, 120));
        }
      }
      ctx.putImageData(img, 0, 0);
    });
  }
  // Risco vertical fino (fica esticado na altura da tela).
  makeCanvasTexture(scene, SCRATCH_KEY, 6, 256, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, 0, 256);
    g.addColorStop(0, 'rgba(255,248,230,0)');
    g.addColorStop(0.2, 'rgba(255,248,230,0.75)');
    g.addColorStop(0.8, 'rgba(255,248,230,0.6)');
    g.addColorStop(1, 'rgba(255,248,230,0)');
    ctx.fillStyle = g;
    ctx.fillRect(2, 0, 1.4, 256);
  });
  // Pontinho de poeira (fiapo escuro).
  makeCanvasTexture(scene, DUST_KEY, 24, 24, (ctx) => {
    ctx.strokeStyle = 'rgba(25,18,12,0.85)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(4, 14);
    ctx.quadraticCurveTo(10, 4, 14, 12);
    ctx.quadraticCurveTo(18, 18, 21, 9);
    ctx.stroke();
    ctx.fillStyle = 'rgba(25,18,12,0.9)';
    ctx.beginPath();
    ctx.arc(8, 18, 1.6, 0, Math.PI * 2);
    ctx.fill();
  });
  // Vinheta leve nas bordas.
  makeCanvasTexture(scene, VIGNETTE_KEY, GAME_WIDTH, GAME_HEIGHT, (ctx) => {
    const g = ctx.createRadialGradient(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_HEIGHT * 0.45, GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH * 0.62);
    g.addColorStop(0, 'rgba(20,14,8,0)');
    g.addColorStop(1, 'rgba(20,14,8,0.42)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  });
  // Papel envelhecido (manchas e fibras bem leves), em tom quente.
  makeCanvasTexture(scene, PAPER_KEY, GAME_WIDTH, GAME_HEIGHT, (ctx) => {
    const rng = new Rng(4321);
    for (let i = 0; i < 260; i++) {
      const x = rng.range(0, GAME_WIDTH);
      const y = rng.range(0, GAME_HEIGHT);
      const r = rng.range(20, 90);
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, rng.chance(0.6) ? 'rgba(120,85,40,0.06)' : 'rgba(255,240,200,0.06)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  });
}
