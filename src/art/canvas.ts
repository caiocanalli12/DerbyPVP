/**
 * Infraestrutura para texturas desenhadas por código (Canvas 2D) e registradas no Phaser.
 */
import type Phaser from 'phaser';
import { Rng } from '../core/rng';

export type Ctx = CanvasRenderingContext2D;

/**
 * Canvas desenhado na CPU. Medido numa Intel UHD: com o canvas acelerado, o raster dos desenhos vai
 * para a mesma GPU que desenha o jogo e os quadros da tela VS ficam mais longos no total (30 fps
 * contra 44 fps com o canvas na CPU). Na CPU, ler 1 pixel força o raster na hora (o que permite
 * fatiar a geração) e o conteúdo sobrevive a uma perda de contexto da GPU.
 */
const CANVAS_OPTIONS: CanvasRenderingContext2DSettings = { willReadFrequently: true };

/** Registra um retângulo do desenho como quadro nomeado da textura (atlas). */
export type AddFrame = (name: string, x: number, y: number, w: number, h: number) => void;

type FrameRect = [name: string, x: number, y: number, w: number, h: number];

function newCanvas(key: string, width: number, height: number): [HTMLCanvasElement, Ctx] {
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(width);
  canvas.height = Math.ceil(height);
  const ctx = canvas.getContext('2d', CANVAS_OPTIONS);
  if (!ctx) throw new Error(`Não foi possível criar a textura ${key}`);
  return [canvas, ctx];
}

/** Registra o canvas pronto como textura (é aqui que ele vai para a GPU, uma vez só). */
function registerCanvas(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement, frames: readonly FrameRect[]): Phaser.Textures.Texture {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  // O Phaser aceita um canvas como fonte de imagem (a tipagem só declara HTMLImageElement).
  const tex = scene.textures.addImage(key, canvas as unknown as HTMLImageElement);
  if (!tex) throw new Error(`Não foi possível criar a textura ${key}`);
  for (const [name, x, y, w, h] of frames) tex.add(name, 0, x, y, w, h);
  return tex;
}

/**
 * Cria (ou recria) uma textura desenhada por código, com o contexto do canvas cru.
 *
 * O desenho é feito num canvas próprio, registrado no Phaser só no fim, e a textura vai para a
 * GPU uma única vez. (Com `textures.createCanvas` o Phaser envia o canvas vazio, guarda uma cópia
 * dos pixels com getImageData e o `refresh()` envia tudo de novo.)
 */
export function drawCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: Ctx, addFrame: AddFrame) => void,
): Phaser.Textures.Texture {
  const [canvas, ctx] = newCanvas(key, width, height);
  const frames: FrameRect[] = [];
  draw(ctx, (name, x, y, w, h) => frames.push([name, x, y, w, h]));
  return registerCanvas(scene, key, canvas, frames);
}

/** Marca, no meio de uma geração aos poucos, que o próximo passo é o envio para a GPU. */
export const UPLOAD_NEXT = 'upload-next';

/**
 * Como `drawCanvasTexture`, mas em partes: `draw` é um gerador que desenha um pedaço por vez.
 *
 * O Chrome só grava os comandos de desenho e rasteriza tudo quando alguém lê os pixels (no envio
 * para a GPU), o que concentraria todo o trabalho num quadro só. Por isso, depois de cada pedaço,
 * a leitura de 1 pixel força o raster daquele pedaço. Antes do envio final o gerador entrega
 * `UPLOAD_NEXT`, para quem chama deixar o envio para o começo de um quadro.
 */
export function* drawCanvasTextureSteps(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: Ctx, addFrame: AddFrame) => Iterable<void>,
): Generator<typeof UPLOAD_NEXT | void, Phaser.Textures.Texture, void> {
  const [canvas, ctx] = newCanvas(key, width, height);
  const frames: FrameRect[] = [];
  for (const _ of draw(ctx, (name, x, y, w, h) => frames.push([name, x, y, w, h]))) {
    ctx.getImageData(0, 0, 1, 1);
    yield;
  }
  yield UPLOAD_NEXT;
  return registerCanvas(scene, key, canvas, frames);
}

/** Como `drawCanvasTexture`, com juntas e pontas de linha arredondadas (traço de pincel). */
export function makeCanvasTexture(
  scene: Phaser.Scene,
  key: string,
  width: number,
  height: number,
  draw: (ctx: Ctx, addFrame: AddFrame) => void,
): Phaser.Textures.Texture {
  return drawCanvasTexture(scene, key, width, height, (ctx, addFrame) => {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    draw(ctx, addFrame);
  });
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
