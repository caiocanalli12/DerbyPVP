/**
 * Passe e chute (lógica pura).
 */
import {
  BALL_ROLL_DAMPING,
  KICK_REGAIN_COOLDOWN,
  PASS_ANGLE_WEIGHT,
  PASS_CONE_DEG,
  PASS_DIST_WEIGHT,
  PASS_MAX_LEAD,
  PASS_MAX_SPEED,
  PASS_MIN_SPEED,
  PASS_SPEED_BASE,
  PASS_SPEED_PER_METER,
  SHOT_ASSIST_MAX_ANGLE_DEG,
  SHOT_ASSIST_POST_MARGIN,
  SHOT_ASSIST_STRENGTH,
  SHOT_INACCURACY_START,
  SHOT_LOFT_START,
  SHOT_MAX_ERROR_DEG,
  SHOT_MAX_EXTRA_VZ,
  SHOT_MAX_SPEED,
  SHOT_MAX_VZ,
  SHOT_MIN_SPEED,
  BALL_RADIUS,
  FIELD_LENGTH,
  FIELD_WIDTH,
} from '../config/constants';
import type { Rng } from '../core/rng';
import type { Ball } from './ball';
import { GOAL_Y_MAX, GOAL_Y_MIN, goalCenter, goalLineX } from './field';
import type { GoalSide } from './field';
import type { Player } from './player';
import { angleDiff, clamp, lerp } from './vec';

const DEG = Math.PI / 180;

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/**
 * Escolhe o companheiro para o passe: dentro do cone (PASS_CONE_DEG) em torno de `dir`,
 * com menor pontuação = ângulo * peso + distância * peso. Goleiro não recebe passe
 * (o humano nunca o controla). Devolve null se ninguém estiver no cone.
 */
export function choosePassTarget(
  passer: Player,
  teammates: readonly Player[],
  dirX: number,
  dirY: number,
): Player | null {
  const dl = Math.hypot(dirX, dirY);
  if (dl < 1e-9) return null;
  const ux = dirX / dl;
  const uy = dirY / dl;
  const halfCone = PASS_CONE_DEG / 2;
  let best: Player | null = null;
  let bestScore = Infinity;
  for (const m of teammates) {
    if (m.id === passer.id || m.team !== passer.team || m.role === 'GK') continue;
    const dx = m.x - passer.x;
    const dy = m.y - passer.y;
    const d = Math.hypot(dx, dy);
    if (d < 1e-6) continue;
    const cos = clamp((dx * ux + dy * uy) / d, -1, 1);
    const angle = Math.acos(cos) / DEG;
    if (angle > halfCone) continue;
    const score = angle * PASS_ANGLE_WEIGHT + d * PASS_DIST_WEIGHT;
    if (score < bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Velocidade do passe rasteiro para uma distância (proporcional, limitada a 7–16 m/s). */
export function passSpeedFor(distance: number): number {
  return clamp(PASS_SPEED_BASE + PASS_SPEED_PER_METER * distance, PASS_MIN_SPEED, PASS_MAX_SPEED);
}

/**
 * Tempo para uma bola rolando com amortecimento exponencial percorrer `distance`
 * saindo a `speed`. Infinity se ela parar antes.
 */
export function rollTime(distance: number, speed: number): number {
  const k = BALL_ROLL_DAMPING;
  const ratio = (k * distance) / speed;
  if (ratio >= 1) return Infinity;
  return -Math.log(1 - ratio) / k;
}

export interface PassPlan {
  vx: number;
  vy: number;
  speed: number;
  /** Tempo estimado de chegada ao receptor (s). */
  eta: number;
  target: { x: number; y: number };
}

/**
 * Planeja o passe da posição da bola para o receptor, mirando um pouco à frente
 * dele se estiver correndo.
 */
export function planPass(ball: Ball, receiver: Player): PassPlan {
  let tx = receiver.x;
  let ty = receiver.y;
  let speed = passSpeedFor(Math.hypot(tx - ball.x, ty - ball.y));
  let eta = 0;
  for (let i = 0; i < 3; i++) {
    const d = Math.hypot(tx - ball.x, ty - ball.y);
    speed = passSpeedFor(d);
    const t = rollTime(d, speed);
    eta = Number.isFinite(t) ? t : d / speed;
    let lx = receiver.vx * eta;
    let ly = receiver.vy * eta;
    const ll = Math.hypot(lx, ly);
    if (ll > PASS_MAX_LEAD) {
      lx *= PASS_MAX_LEAD / ll;
      ly *= PASS_MAX_LEAD / ll;
    }
    tx = clamp(receiver.x + lx, BALL_RADIUS, FIELD_LENGTH - BALL_RADIUS);
    ty = clamp(receiver.y + ly, BALL_RADIUS, FIELD_WIDTH - BALL_RADIUS);
  }
  const dx = tx - ball.x;
  const dy = ty - ball.y;
  const d = Math.hypot(dx, dy);
  const ux = d > 1e-9 ? dx / d : Math.cos(receiver.facing);
  const uy = d > 1e-9 ? dy / d : Math.sin(receiver.facing);
  return { vx: ux * speed, vy: uy * speed, speed, eta, target: { x: tx, y: ty } };
}

/** Solta a bola do jogador com a velocidade dada e aplica o tempo sem poder recuperá-la. */
export function releaseBall(ball: Ball, kicker: Player, v: Vec3): void {
  ball.owner = null;
  ball.lastTouch = kicker.id;
  ball.vx = v.x;
  ball.vy = v.y;
  ball.vz = v.z;
  kicker.noTouchTimer = KICK_REGAIN_COOLDOWN;
}

/**
 * Corrige levemente (SHOT_ASSIST_STRENGTH) um ângulo de chute em direção à boca do gol,
 * se ele estiver a até SHOT_ASSIST_MAX_ANGLE_DEG do centro do gol.
 */
export function assistShotAngle(fromX: number, fromY: number, angle: number, goal: GoalSide): number {
  const c = goalCenter(goal);
  const goalAngle = Math.atan2(c.y - fromY, c.x - fromX);
  if (Math.abs(angleDiff(angle, goalAngle)) > SHOT_ASSIST_MAX_ANGLE_DEG * DEG) return angle;
  const lineX = goalLineX(goal);
  const dx = lineX - fromX;
  const cos = Math.cos(angle);
  // O raio precisa ir na direção da linha do gol.
  if (Math.abs(dx) < 1e-6 || Math.sign(cos) !== Math.sign(dx) || Math.abs(cos) < 1e-6) return angle;
  const hitY = fromY + Math.tan(angle) * dx;
  const minY = GOAL_Y_MIN + SHOT_ASSIST_POST_MARGIN;
  const maxY = GOAL_Y_MAX - SHOT_ASSIST_POST_MARGIN;
  const targetY = clamp(hitY, minY, maxY);
  if (targetY === hitY) return angle;
  const desired = Math.atan2(targetY - fromY, dx);
  return angle + angleDiff(angle, desired) * SHOT_ASSIST_STRENGTH;
}

/**
 * Velocidade do chute com carga `charge` (0..1).
 * Sem direcional: vai ao centro do gol adversário. Chutes fortes sobem; acima de
 * SHOT_INACCURACY_START entra erro aleatório (pode isolar por cima ou pela lateral).
 */
export function shotVelocity(
  fromX: number,
  fromY: number,
  charge: number,
  dir: { x: number; y: number } | null,
  goal: GoalSide,
  rng: Rng,
): Vec3 {
  const c = clamp(charge, 0, 1);
  const center = goalCenter(goal);
  let angle: number;
  if (!dir || Math.hypot(dir.x, dir.y) < 1e-9) {
    angle = Math.atan2(center.y - fromY, center.x - fromX);
  } else {
    angle = assistShotAngle(fromX, fromY, Math.atan2(dir.y, dir.x), goal);
  }
  const speed = lerp(SHOT_MIN_SPEED, SHOT_MAX_SPEED, c);
  let vz = c > SHOT_LOFT_START ? ((c - SHOT_LOFT_START) / (1 - SHOT_LOFT_START)) * SHOT_MAX_VZ : 0;
  if (c > SHOT_INACCURACY_START) {
    const k = (c - SHOT_INACCURACY_START) / (1 - SHOT_INACCURACY_START);
    angle += rng.range(-1, 1) * SHOT_MAX_ERROR_DEG * DEG * k;
    vz += rng.range(-0.25, 1) * SHOT_MAX_EXTRA_VZ * k;
  }
  return { x: Math.cos(angle) * speed, y: Math.sin(angle) * speed, z: Math.max(0, vz) };
}
