/**
 * Arte das telas de menu: prévia grande do jogador com o uniforme e a bola com rosto.
 */
import type Phaser from 'phaser';
import { BOIL_JITTER } from '../config/constants';
import { Rng } from '../core/rng';
import type { Kit } from '../data/teams';
import { ellipsePath, inkFill, pieEye } from './brush';
import { makeCanvasTexture } from './canvas';
import { drawFigure, poseFor, TALL } from './player-art';
import type { PlayerLook } from './player-art';

/** Escala da prévia (o desenho é o mesmo do jogo, só maior). */
const PREVIEW_SCALE = 2;

export function previewKey(kitId: string, v: number): string {
  return `preview-${kitId}-${v}`;
}

/** Prévia do jogador de frente, parado, com 3 variações de fervura. */
export function generateKitPreview(scene: Phaser.Scene, kitId: string, kit: Kit, number: number): void {
  if (scene.textures.exists(previewKey(kitId, 0))) return;
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
  for (let v = 0; v < 3; v++) {
    makeCanvasTexture(scene, previewKey(kitId, v), TALL.w * PREVIEW_SCALE, TALL.h * PREVIEW_SCALE, (ctx) => {
      ctx.scale(PREVIEW_SCALE, PREVIEW_SCALE);
      drawFigure(ctx, look, poseFor('idle', 'front', v % 2), 'front', TALL.ox, TALL.oy, 900 + v * 17);
    });
  }
}

export function faceBallKey(v: number): string {
  return `face-ball-${v}`;
}

/** Bola de couro com rosto (personagem decorativo da tela inicial). */
export function generateFaceBall(scene: Phaser.Scene): void {
  if (scene.textures.exists(faceBallKey(0))) return;
  const S = 120;
  for (let v = 0; v < 3; v++) {
    const rng = new Rng(77 + v * 9);
    const j = (): number => rng.range(-BOIL_JITTER * 1.2, BOIL_JITTER * 1.2);
    makeCanvasTexture(scene, faceBallKey(v), S, S, (ctx) => {
      const c = S / 2;
      const r = S * 0.4;
      inkFill(ctx, () => ellipsePath(ctx, c + j() * 0.3, c + j() * 0.3, r, r), '#efe2c0', 4);
      ctx.save();
      ctx.beginPath();
      ellipsePath(ctx, c, c, r, r);
      ctx.clip();
      ctx.beginPath();
      ctx.ellipse(c + r * 0.4, c + r * 0.5, r, r * 0.8, 0, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(70,80,110,0.25)';
      ctx.fill();
      ctx.strokeStyle = '#1A1410';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(c - r * 0.95, c - r * 0.55 + j());
      ctx.quadraticCurveTo(c, c - r * 0.85, c + r * 0.95, c - r * 0.55 + j());
      ctx.stroke();
      ctx.restore();
      pieEye(ctx, c - r * 0.3 + j() * 0.3, c - r * 0.05, r * 0.13, r * 0.2, 0.1, 2.4);
      pieEye(ctx, c + r * 0.3 + j() * 0.3, c - r * 0.05, r * 0.13, r * 0.2, 0.1, 2.4);
      inkFill(
        ctx,
        () => {
          ctx.moveTo(c - r * 0.42, c + r * 0.28);
          ctx.quadraticCurveTo(c, c + r * 0.82, c + r * 0.42, c + r * 0.28);
          ctx.quadraticCurveTo(c, c + r * 0.45, c - r * 0.42, c + r * 0.28);
        },
        '#7a2a1a',
        2.4,
      );
      ctx.beginPath();
      ctx.ellipse(c - r * 0.42, c - r * 0.48, r * 0.2, r * 0.11, -0.6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.fill();
    });
  }
}
