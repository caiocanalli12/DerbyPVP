/**
 * Geometria do campo derivada das constantes (lógica pura).
 */
import {
  FIELD_LENGTH,
  FIELD_WIDTH,
  GOAL_AREA_RADIUS,
  GOAL_WIDTH,
  PENALTY_SPOT_DISTANCE,
} from '../config/constants';

export const FIELD_CENTER_X = FIELD_LENGTH / 2;
export const FIELD_CENTER_Y = FIELD_WIDTH / 2;

/** Postes (y) — iguais para os dois gols. */
export const GOAL_Y_MIN = FIELD_CENTER_Y - GOAL_WIDTH / 2;
export const GOAL_Y_MAX = FIELD_CENTER_Y + GOAL_WIDTH / 2;

/** Lado do gol: 0 = gol da esquerda (x = 0), 1 = gol da direita (x = FIELD_LENGTH). */
export type GoalSide = 0 | 1;

/** X da linha do gol de cada lado. */
export function goalLineX(side: GoalSide): number {
  return side === 0 ? 0 : FIELD_LENGTH;
}

/** Sentido "para dentro do campo" a partir de cada gol (+1 no gol esquerdo, -1 no direito). */
export function inwardDir(side: GoalSide): 1 | -1 {
  return side === 0 ? 1 : -1;
}

/** Centro do gol (na linha) de cada lado. */
export function goalCenter(side: GoalSide): { x: number; y: number } {
  return { x: goalLineX(side), y: FIELD_CENTER_Y };
}

/** Marca do pênalti de cada lado. */
export function penaltySpot(side: GoalSide): { x: number; y: number } {
  return { x: goalLineX(side) + inwardDir(side) * PENALTY_SPOT_DISTANCE, y: FIELD_CENTER_Y };
}

/** Está dentro da área (semicírculo) do gol `side`? */
export function inGoalArea(side: GoalSide, x: number, y: number, margin = 0): boolean {
  const c = goalCenter(side);
  const dx = x - c.x;
  if (dx * inwardDir(side) < -margin) return false;
  return Math.hypot(dx, y - c.y) <= GOAL_AREA_RADIUS + margin;
}
