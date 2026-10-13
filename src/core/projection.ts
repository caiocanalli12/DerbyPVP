/**
 * Única fonte da perspectiva: toda conversão mundo -> tela passa por aqui.
 *
 *   t      = y / FIELD_WIDTH                      (0 = fundo, 1 = frente)
 *   s      = lerp(0.86, 1.0, t)                   (escala por profundidade)
 *   telaX  = centroX + (x - L/2) * PPM * s
 *   telaY  = topoCampo + y * PPM * 0.6 * lerp(0.92, 1.0, t) - z * PPM * s
 *
 * PPM e topoCampo são calculados para o campo inteiro caber na tela,
 * ocupando FIELD_SCREEN_WIDTH_FRACTION da largura.
 */
import {
  FIELD_LENGTH,
  FIELD_SCREEN_BOTTOM_MARGIN,
  FIELD_SCREEN_WIDTH_FRACTION,
  FIELD_WIDTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  PROJ_SCALE_BACK,
  PROJ_SCALE_FRONT,
  PROJ_Y_DEPTH_BACK,
  PROJ_Y_DEPTH_FRONT,
  PROJ_Y_SQUASH,
} from '../config/constants';

export interface ScreenPoint {
  x: number;
  y: number;
  /** Escala do sprite nessa profundidade. */
  scale: number;
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Pixels por metro (na frente do campo, onde s = 1). */
export const PPM = (GAME_WIDTH * FIELD_SCREEN_WIDTH_FRACTION) / FIELD_LENGTH;
/** Centro horizontal do campo na tela. */
export const CENTER_X = GAME_WIDTH / 2;

/** Altura em tela (px) de um deslocamento y a partir do fundo, no chão. */
function groundOffsetY(y: number): number {
  const t = y / FIELD_WIDTH;
  return y * PPM * PROJ_Y_SQUASH * lerp(PROJ_Y_DEPTH_BACK, PROJ_Y_DEPTH_FRONT, t);
}

/** Linha de tela onde fica o fundo do campo (y = 0, z = 0). */
export const FIELD_TOP = GAME_HEIGHT - FIELD_SCREEN_BOTTOM_MARGIN - groundOffsetY(FIELD_WIDTH);

/** Escala por profundidade para um y do mundo (não limitado: vale fora do campo também). */
export function depthScale(y: number): number {
  return lerp(PROJ_SCALE_BACK, PROJ_SCALE_FRONT, y / FIELD_WIDTH);
}

/** Converte um ponto do mundo (m) para a tela (px). */
export function project(x: number, y: number, z = 0): ScreenPoint {
  const s = depthScale(y);
  return {
    x: CENTER_X + (x - FIELD_LENGTH / 2) * PPM * s,
    y: FIELD_TOP + groundOffsetY(y) - z * PPM * s,
    scale: s,
  };
}

/**
 * Inversa da projeção no chão (z = 0): tela -> mundo.
 * telaY - topo = a*y² + b*y, com a = PPM*0.6*(frente-fundo)/W e b = PPM*0.6*fundo.
 */
export function unproject(screenX: number, screenY: number): { x: number; y: number } {
  const a = (PPM * PROJ_Y_SQUASH * (PROJ_Y_DEPTH_FRONT - PROJ_Y_DEPTH_BACK)) / FIELD_WIDTH;
  const b = PPM * PROJ_Y_SQUASH * PROJ_Y_DEPTH_BACK;
  const c = -(screenY - FIELD_TOP);
  let y: number;
  if (Math.abs(a) < 1e-12) {
    y = -c / b;
  } else {
    // Raiz positiva (a > 0, b > 0). Forma estável numericamente.
    const disc = Math.max(0, b * b - 4 * a * c);
    y = (2 * -c) / (b + Math.sqrt(disc));
  }
  const s = depthScale(y);
  const x = (screenX - CENTER_X) / (PPM * s) + FIELD_LENGTH / 2;
  return { x, y };
}

/**
 * Profundidade de desenho para um y do mundo: quem está mais à frente fica por cima.
 * A bola usa o y do chão (não a altura).
 */
export function depthFor(y: number): number {
  return DEPTH_WORLD_BASE + y * DEPTH_PER_METER;
}

/** Faixas de profundidade (Phaser setDepth). Fundo < mundo < interface. */
export const DEPTH_WORLD_BASE = 1000;
export const DEPTH_PER_METER = 10;
export const DEPTH_BACKGROUND = 0;
export const DEPTH_FIELD = 100;
export const DEPTH_FIELD_LINES = 110;
export const DEPTH_SHADOWS = 200;
/** Parede da frente: acima de tudo que está dentro do campo. */
export const DEPTH_FRONT_WALL = DEPTH_WORLD_BASE + (FIELD_WIDTH + 1) * DEPTH_PER_METER;
export const DEPTH_UI = 5000;
export const DEPTH_DEBUG = 9000;
