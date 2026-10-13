/**
 * Posse de bola: domínio, condução e desvio no corpo (lógica pura).
 */
import {
  BALL_BODY_RESTITUTION,
  BALL_RADIUS,
  DRIBBLE_OFFSET,
  DRIBBLE_SIDE_AMPLITUDE,
  DRIBBLE_STRIDE,
  DRIBBLE_TOUCH_AMPLITUDE,
  FIELD_LENGTH,
  FIELD_WIDTH,
  PASS_RECEIVE_BRAKE_DIST,
  PASS_RECEIVE_SPEED_MARGIN,
  PLAYER_HEIGHT,
  PLAYER_RADIUS,
  PLAYER_RUN_SPEED,
  POSSESSION_MAX_REL_SPEED,
  POSSESSION_MAX_Z,
  POSSESSION_RADIUS,
} from '../config/constants';
import type { Ball } from './ball';
import type { Player } from './player';
import { clamp } from './vec';

/** Pode tocar na bola agora? (Deslizando, caído ou cambaleando: não.) */
export function canTouchBall(p: Player): boolean {
  return p.noTouchTimer <= 0 && p.state === 'normal';
}

/** Pode ganhar a posse pela regra geral? O goleiro usa a própria lógica (defesa/pegada). */
export function canGainPossession(p: Player): boolean {
  return p.role !== 'GK' && canTouchBall(p);
}

/** Velocidade (horizontal) da bola relativa ao jogador. A altura já é limitada por POSSESSION_MAX_Z. */
export function relativeSpeed(ball: Ball, p: Player): number {
  return Math.hypot(ball.vx - p.vx, ball.vy - p.vy);
}

/**
 * Velocidade máxima do receptor de um passe com a bola chegando perto: a soma das velocidades
 * (o pior caso, de frente) fica abaixo do limite da posse. Infinity se a bola está longe ou se
 * afastando.
 */
export function receiveSpeedCap(ball: Ball, p: Player): number {
  const dx = ball.x - p.x;
  const dy = ball.y - p.y;
  if (Math.hypot(dx, dy) > PASS_RECEIVE_BRAKE_DIST) return Infinity;
  const closing = dx * (ball.vx - p.vx) + dy * (ball.vy - p.vy) < 0;
  if (!closing) return Infinity;
  return Math.max(0, POSSESSION_MAX_REL_SPEED - PASS_RECEIVE_SPEED_MARGIN - Math.hypot(ball.vx, ball.vy));
}

/** Altura do corpo para a bola: deslizando ou caído, a bola passa por cima mais fácil. */
export function bodyHeight(p: Player): number {
  return p.state === 'tackling' || p.state === 'fallen' ? 0.6 : PLAYER_HEIGHT;
}

/** A bola está baixa e lenta o bastante (em relação a ele) para este jogador dominar? */
export function canDominate(ball: Ball, p: Player): boolean {
  return (
    canGainPossession(p) && ball.z < POSSESSION_MAX_Z && relativeSpeed(ball, p) < POSSESSION_MAX_REL_SPEED
  );
}

/**
 * Escolhe quem domina a bola solta neste passo: o mais próximo entre os que estão
 * a menos de POSSESSION_RADIUS, com z baixo e velocidade relativa aceitável.
 */
export function findPossessionWinner(ball: Ball, players: readonly Player[]): Player | null {
  if (ball.owner !== null || ball.z >= POSSESSION_MAX_Z) return null;
  let best: Player | null = null;
  let bestD = Infinity;
  for (const p of players) {
    if (!canDominate(ball, p)) continue;
    const d = Math.hypot(ball.x - p.x, ball.y - p.y);
    if (d >= POSSESSION_RADIUS) continue;
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/**
 * Bola rápida demais (ou de quem não pode dominar) bate no corpo e desvia.
 * Devolve o jogador em que bateu, ou null.
 */
export function deflectOffPlayers(
  ball: Ball,
  players: readonly Player[],
  heightOf: (p: Player) => number = bodyHeight,
): Player | null {
  if (ball.owner !== null || ball.z > PLAYER_HEIGHT) return null;
  const minD = PLAYER_RADIUS + BALL_RADIUS;
  let hit: Player | null = null;
  for (const p of players) {
    if (!canTouchBall(p)) continue;
    if (ball.z > heightOf(p)) continue;
    // Quem consegue dominar não desvia: fica com a bola na checagem de posse.
    if (canDominate(ball, p)) continue;
    const dx = ball.x - p.x;
    const dy = ball.y - p.y;
    const d = Math.hypot(dx, dy);
    if (d >= minD) continue;
    const nx = d > 1e-9 ? dx / d : 1;
    const ny = d > 1e-9 ? dy / d : 0;
    // Só desvia se estiver indo contra o corpo.
    const rvx = ball.vx - p.vx;
    const rvy = ball.vy - p.vy;
    const vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      const k = (1 + BALL_BODY_RESTITUTION) * vn;
      ball.vx -= k * nx;
      ball.vy -= k * ny;
      hit = p;
    }
    ball.x = p.x + nx * minD;
    ball.y = p.y + ny * minD;
  }
  return hit;
}

/** Posiciona a bola conduzida: à frente do jogador, com um leve balanço de toques. */
export function placeDribbledBall(ball: Ball, p: Player, dt: number): void {
  const speed = Math.hypot(p.vx, p.vy);
  const moving = clamp(speed / PLAYER_RUN_SPEED, 0, 1);
  p.dribblePhase = (p.dribblePhase + ((speed * dt) / DRIBBLE_STRIDE) * Math.PI * 2) % (Math.PI * 4);
  const fwd = DRIBBLE_OFFSET + DRIBBLE_TOUCH_AMPLITUDE * Math.sin(p.dribblePhase) * moving;
  const side = DRIBBLE_SIDE_AMPLITUDE * Math.sin(p.dribblePhase * 0.5) * moving;
  const cx = Math.cos(p.facing);
  const sy = Math.sin(p.facing);
  ball.x = clamp(p.x + cx * fwd - sy * side, BALL_RADIUS, FIELD_LENGTH - BALL_RADIUS);
  ball.y = clamp(p.y + sy * fwd + cx * side, BALL_RADIUS, FIELD_WIDTH - BALL_RADIUS);
  ball.z = 0;
  ball.vx = p.vx;
  ball.vy = p.vy;
  ball.vz = 0;
}
