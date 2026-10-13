/**
 * Infraestrutura para texturas desenhadas por código (Canvas 2D) e registradas no Phaser.
 */
import type Phaser from 'phaser';
import { Rng } from '../core/rng';

export type Ctx = CanvasRenderingContext2D;

/** Cria (ou recria) uma textura de canvas com o desenho dado. */
export function makeCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: Ctx) => void,
): Phaser.Textures.CanvasTexture {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, Math.ceil(width), Math.ceil(height));
  if (!tex) throw new Error(`Não foi possível criar a textura ${key}`);
  const ctx = tex.getContext();
  ctx.clearRect(0, 0, tex.width, tex.height);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  draw(ctx);
  tex.refresh();
  return tex;
}

/** Deslocamento aleatório determinístico (para as linhas que "fervem"). */
export function jitterer(seed: number, amount: number): (v: number) => number {
  const rng = new Rng(seed);
  return (v: number) => v + rng.range(-amount, amount);
}

export function cssColor(color: number, alpha = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}
