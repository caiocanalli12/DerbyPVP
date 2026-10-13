/**
 * Bola: estado, voo/rolagem e colisões com paredes, postes, travessão e rede (lógica pura).
 */
import {
  BALL_GROUND_RESTITUTION,
  BALL_MIN_BOUNCE_VZ,
  BALL_NET_FRICTION,
  BALL_NET_RESTITUTION,
  BALL_RADIUS,
  BALL_ROLL_DAMPING,
  BALL_STOP_SPEED,
  BALL_WALL_RESTITUTION,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GOAL_DEPTH,
  GOAL_HEIGHT,
  GRAVITY,
  POST_RADIUS,
} from '../config/constants';
import { FIELD_CENTER_X, FIELD_CENTER_Y, GOAL_Y_MAX, GOAL_Y_MIN } from './field';
import type { GoalSide } from './field';

export interface Ball {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  prevX: number;
  prevY: number;
  prevZ: number;
  /** Jogador com a bola nos pés (ou nas mãos, se for goleiro), ou null se solta. */
  owner: number | null;
  /** Último jogador que tocou na bola. */
  lastTouch: number | null;
}

/** O que aconteceu com a bola durante um passo (para desenho, áudio e regras). */
export type BallContact = 'wall' | 'post' | 'bar' | 'net' | 'ground';

export function createBall(): Ball {
  return {
    x: FIELD_CENTER_X,
    y: FIELD_CENTER_Y,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    prevX: FIELD_CENTER_X,
    prevY: FIELD_CENTER_Y,
    prevZ: 0,
    owner: null,
    lastTouch: null,
  };
}

export function placeBall(ball: Ball, x: number, y: number, z = 0): void {
  ball.x = x;
  ball.y = y;
  ball.z = z;
  ball.prevX = x;
  ball.prevY = y;
  ball.prevZ = z;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
}

export function ballSpeed(ball: Ball): number {
  return Math.hypot(ball.vx, ball.vy, ball.vz);
}

export function ballGroundSpeed(ball: Ball): number {
  return Math.hypot(ball.vx, ball.vy);
}

export function isAirborne(ball: Ball): boolean {
  return ball.z > 1e-6 || ball.vz > 1e-6;
}

/** Quantos subpassos são necessários para a bola não atravessar postes. */
export function substepsFor(ball: Ball, dt: number, maxDist: number): number {
  const d = ballSpeed(ball) * dt;
  return Math.max(1, Math.ceil(d / maxDist));
}

/**
 * Integra um subpasso de bola solta: gravidade e quique, ou rolagem com amortecimento.
 * Devolve 'ground' se quicou no chão.
 */
export function integrateFreeBall(ball: Ball, dt: number): BallContact | null {
  let contact: BallContact | null = null;
  if (isAirborne(ball)) {
    ball.vz -= GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;
    if (ball.z <= 0) {
      ball.z = 0;
      if (-ball.vz > BALL_MIN_BOUNCE_VZ) {
        ball.vz = -ball.vz * BALL_GROUND_RESTITUTION;
        contact = 'ground';
      } else {
        ball.vz = 0;
      }
    }
  } else {
    const damp = Math.exp(-BALL_ROLL_DAMPING * dt);
    ball.vx *= damp;
    ball.vy *= damp;
    if (Math.hypot(ball.vx, ball.vy) < BALL_STOP_SPEED) {
      ball.vx = 0;
      ball.vy = 0;
    }
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z = 0;
    ball.vz = 0;
  }
  return contact;
}

/** A bola está entre os postes (centro) e abaixo do travessão? */
function inGoalMouth(y: number, z: number): boolean {
  return y > GOAL_Y_MIN && y < GOAL_Y_MAX && z < GOAL_HEIGHT;
}

/** Reflete a velocidade da bola numa normal (unitária) com restituição, só se estiver entrando. */
function reflect(ball: Ball, nx: number, ny: number, nz: number, restitution: number): boolean {
  const vn = ball.vx * nx + ball.vy * ny + ball.vz * nz;
  if (vn >= 0) return false;
  const k = (1 + restitution) * vn;
  ball.vx -= k * nx;
  ball.vy -= k * ny;
  ball.vz -= k * nz;
  return true;
}

/** Colisão com um cilindro vertical (poste) no plano XY, válida abaixo do travessão. Devolve se houve impacto. */
function collidePost(ball: Ball, px: number, py: number): boolean {
  if (ball.z > GOAL_HEIGHT + POST_RADIUS) return false;
  const dx = ball.x - px;
  const dy = ball.y - py;
  const d = Math.hypot(dx, dy);
  const minD = BALL_RADIUS + POST_RADIUS;
  if (d >= minD || d < 1e-9) return false;
  const nx = dx / d;
  const ny = dy / d;
  ball.x = px + nx * minD;
  ball.y = py + ny * minD;
  return reflect(ball, nx, ny, 0, BALL_WALL_RESTITUTION);
}

/** Colisão com o travessão (cilindro horizontal ao longo de Y, em x = lineX, z = GOAL_HEIGHT). */
function collideBar(ball: Ball, lineX: number): boolean {
  if (ball.y < GOAL_Y_MIN || ball.y > GOAL_Y_MAX) return false;
  const dx = ball.x - lineX;
  const dz = ball.z - GOAL_HEIGHT;
  const d = Math.hypot(dx, dz);
  const minD = BALL_RADIUS + POST_RADIUS;
  if (d >= minD || d < 1e-9) return false;
  const nx = dx / d;
  const nz = dz / d;
  ball.x = lineX + nx * minD;
  ball.z = Math.max(0, GOAL_HEIGHT + nz * minD);
  return reflect(ball, nx, 0, nz, BALL_WALL_RESTITUTION);
}

/**
 * Colisões numa extremidade do campo (gol do lado `side`).
 *
 * `u` = quanto o centro da bola passou da linha do gol (positivo = para dentro do gol).
 * - u > 0: a bola está dentro do gol (só se chega lá pela boca): vale a rede
 *   (fundo, laterais e teto).
 * - -r < u <= 0: a bola encosta no plano da linha. Se estiver na boca (entre os postes e
 *   abaixo do travessão), passa; senão é parede (ao lado do gol ou acima do travessão).
 * Como o subpasso anda no máximo BALL_MAX_SUBSTEP_DIST (< raio), a bola não pula a parede.
 */
function collideGoalEnd(ball: Ball, side: GoalSide, contacts: BallContact[]): void {
  const r = BALL_RADIUS;
  const lineX = side === 0 ? 0 : FIELD_LENGTH;
  const out = side === 0 ? -1 : 1; // sentido "para fora do campo"

  if (collidePost(ball, lineX, GOAL_Y_MIN) || collidePost(ball, lineX, GOAL_Y_MAX)) contacts.push('post');
  if (collideBar(ball, lineX)) contacts.push('bar');

  const u = (ball.x - lineX) * out;
  if (u > 0) {
    let hitNet = false;
    const maxU = GOAL_DEPTH - r;
    if (u > maxU) {
      ball.x = lineX + out * maxU;
      hitNet = reflect(ball, -out, 0, 0, BALL_NET_RESTITUTION) || hitNet;
    }
    if (ball.y < GOAL_Y_MIN + r) {
      ball.y = GOAL_Y_MIN + r;
      hitNet = reflect(ball, 0, 1, 0, BALL_NET_RESTITUTION) || hitNet;
    } else if (ball.y > GOAL_Y_MAX - r) {
      ball.y = GOAL_Y_MAX - r;
      hitNet = reflect(ball, 0, -1, 0, BALL_NET_RESTITUTION) || hitNet;
    }
    if (ball.z > GOAL_HEIGHT - r) {
      ball.z = GOAL_HEIGHT - r;
      hitNet = reflect(ball, 0, 0, -1, BALL_NET_RESTITUTION) || hitNet;
    }
    if (hitNet) {
      ball.vx *= BALL_NET_FRICTION;
      ball.vy *= BALL_NET_FRICTION;
      ball.vz *= BALL_NET_FRICTION;
      contacts.push('net');
    }
  } else if (u > -r && !inGoalMouth(ball.y, ball.z)) {
    ball.x = lineX - out * r;
    if (reflect(ball, -out, 0, 0, BALL_WALL_RESTITUTION)) contacts.push('wall');
  }
}

/**
 * Resolve todas as colisões da bola solta com o cenário.
 * Paredes não têm topo para a física: a bola nunca sai.
 */
export function collideBallWithArena(ball: Ball): BallContact[] {
  const contacts: BallContact[] = [];
  const r = BALL_RADIUS;

  // Fundo e frente.
  if (ball.y < r) {
    ball.y = r;
    if (reflect(ball, 0, 1, 0, BALL_WALL_RESTITUTION)) contacts.push('wall');
  } else if (ball.y > FIELD_WIDTH - r) {
    ball.y = FIELD_WIDTH - r;
    if (reflect(ball, 0, -1, 0, BALL_WALL_RESTITUTION)) contacts.push('wall');
  }

  // Extremidades (gols): só perto da linha ou dentro do gol.
  const reach = 2 * r + POST_RADIUS;
  if (ball.x < reach) collideGoalEnd(ball, 0, contacts);
  else if (ball.x > FIELD_LENGTH - reach) collideGoalEnd(ball, 1, contacts);

  return contacts;
}

/**
 * A bola cruzou completamente a linha de algum gol (entre os postes e abaixo do travessão)?
 * Devolve o lado do gol, ou null.
 */
export function goalScoredIn(ball: Ball): GoalSide | null {
  if (ball.y <= GOAL_Y_MIN || ball.y >= GOAL_Y_MAX || ball.z >= GOAL_HEIGHT) return null;
  if (ball.x < -BALL_RADIUS) return 0;
  if (ball.x > FIELD_LENGTH + BALL_RADIUS) return 1;
  return null;
}
