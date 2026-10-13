/**
 * Jogador: estado e movimento (lógica pura).
 */
import {
  FIELD_LENGTH,
  FIELD_WIDTH,
  FORMATION,
  PLAYER_ACCEL,
  PLAYER_BRAKE,
  PLAYER_RADIUS,
  PLAYER_RUN_SPEED,
  PLAYER_TURN_RATE,
} from '../config/constants';
import type { GoalSide } from './field';
import { rotateTowards } from './vec';

export type Role = 'GK' | 'FIXO' | 'ALA_D' | 'ALA_E' | 'ATA';
export type TeamIndex = 0 | 1;

/** Ordem dos jogadores dentro de cada time. */
export const ROLES: readonly Role[] = ['GK', 'FIXO', 'ALA_D', 'ALA_E', 'ATA'];
export const ROLE_NUMBER: Readonly<Record<Role, number>> = { GK: 1, FIXO: 4, ALA_D: 7, ALA_E: 11, ATA: 9 };

export interface Player {
  readonly id: number;
  readonly team: TeamIndex;
  readonly role: Role;
  readonly number: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Posição no passo anterior (para a interpolação do desenho). */
  prevX: number;
  prevY: number;
  /** Direção em que o corpo está virado (rad, 0 = +x). */
  facing: number;
  /** Direção desejada neste passo (magnitude 0..1), definida pelo humano ou pela IA. */
  moveX: number;
  moveY: number;
  /** Velocidade máxima neste passo (m/s). */
  maxSpeed: number;
  /** Tempo (s) em que não pode tocar na bola (depois de passar ou chutar). */
  noTouchTimer: number;
  /** Fase do balanço de condução (rad). */
  dribblePhase: number;
}

export function createPlayer(id: number, team: TeamIndex, role: Role): Player {
  return {
    id,
    team,
    role,
    number: ROLE_NUMBER[role],
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    prevX: 0,
    prevY: 0,
    facing: team === 0 ? 0 : Math.PI,
    moveX: 0,
    moveY: 0,
    maxSpeed: PLAYER_RUN_SPEED,
    noTouchTimer: 0,
    dribblePhase: 0,
  };
}

/** Posição da formação base de um papel para o time que defende o gol `side`. */
export function formationPosition(role: Role, defends: GoalSide): { x: number; y: number } {
  const base = FORMATION[role];
  return defends === 0 ? { x: base.x, y: base.y } : { x: FIELD_LENGTH - base.x, y: FIELD_WIDTH - base.y };
}

/**
 * Integra o movimento de um jogador por `dt`:
 * acelera até a velocidade desejada (freia mais forte do que acelera) e gira o corpo.
 */
export function integrateMovement(p: Player, dt: number): void {
  const rawMag = Math.hypot(p.moveX, p.moveY);
  const mag = Math.min(1, rawMag);
  const tx = mag > 0 ? (p.moveX / rawMag) * mag * p.maxSpeed : 0;
  const ty = mag > 0 ? (p.moveY / rawMag) * mag * p.maxSpeed : 0;

  const dvx = tx - p.vx;
  const dvy = ty - p.vy;
  const dvLen = Math.hypot(dvx, dvy);
  // Freia forte quando para ou inverte; acelera normal quando ganha velocidade.
  const braking = mag === 0 || p.vx * tx + p.vy * ty < 0 || Math.hypot(tx, ty) < Math.hypot(p.vx, p.vy);
  const maxDv = (braking ? PLAYER_BRAKE : PLAYER_ACCEL) * dt;
  if (dvLen <= maxDv) {
    p.vx = tx;
    p.vy = ty;
  } else {
    p.vx += (dvx / dvLen) * maxDv;
    p.vy += (dvy / dvLen) * maxDv;
  }

  p.x += p.vx * dt;
  p.y += p.vy * dt;

  if (mag > 0) {
    p.facing = rotateTowards(p.facing, Math.atan2(p.moveY, p.moveX), PLAYER_TURN_RATE * dt);
  }
}

/** Mantém o jogador dentro das paredes e zera a velocidade contra elas. */
export function clampToField(p: Player): void {
  const r = PLAYER_RADIUS;
  if (p.x < r) {
    p.x = r;
    if (p.vx < 0) p.vx = 0;
  } else if (p.x > FIELD_LENGTH - r) {
    p.x = FIELD_LENGTH - r;
    if (p.vx > 0) p.vx = 0;
  }
  if (p.y < r) {
    p.y = r;
    if (p.vy < 0) p.vy = 0;
  } else if (p.y > FIELD_WIDTH - r) {
    p.y = FIELD_WIDTH - r;
    if (p.vy > 0) p.vy = 0;
  }
}
