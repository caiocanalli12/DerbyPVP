/**
 * Goleiro (sempre IA). Lógica pura.
 *
 * - Posição: perto da linha, acompanhando o Y da bola (largura do gol + margem); sai um
 *   pouco quando a bola se aproxima; preso à área.
 * - Chutes: reage depois de GK_REACTION_TIME (+ variação). Se a bola vai passar longe do
 *   corpo, mergulha (preparação curta + deslize lateral); senão, ajusta parado.
 * - Até GK_CATCH_MAX_SPEED segura; acima, espalma para o lado.
 * - Com a bola nas mãos: segura GK_HOLD_TIME (ninguém rouba) e lança por cima para o
 *   companheiro de linha mais livre.
 */
import {
  BALL_RADIUS,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GK_CATCH_MAX_SPEED,
  GK_CLAIM_ADVANTAGE,
  GK_CLAIM_MAX_SPEED,
  GK_COME_OUT_MAX,
  GK_COME_OUT_RANGE,
  GK_DIVE_ARM,
  GK_DIVE_DURATION,
  GK_DIVE_MIN_OFFSET,
  GK_DIVE_REACH_Z,
  GK_DIVE_SPEED,
  GK_DIVE_TIMING_SLACK,
  GK_DIVE_WINDUP,
  GK_HAND_RADIUS,
  GK_HANDS_OFFSET,
  GK_HANDS_Z,
  GK_HOLD_TIME,
  GK_HOME_SMOOTHING,
  GK_LATERAL_MARGIN,
  GK_Y_FOLLOW,
  GK_DIVE_SPEED_JITTER,
  GK_LINE_OFFSET,
  GK_MOVE_SPEED,
  GK_PARRY_LATERAL_SPEED,
  GK_PARRY_NO_TOUCH,
  GK_PARRY_SPEED_FACTOR,
  GK_PARRY_UP_SPEED,
  GK_REACTION_JITTER,
  GK_REACH_JITTER,
  GK_REACTION_TIME,
  GK_RECOVER_TIME,
  GK_SHUFFLE_SPEED,
  GK_STAND_REACH,
  GK_STAND_REACH_Z,
  GK_THREAT_HORIZON,
  GK_THREAT_MARGIN,
  GK_THREAT_MIN_SPEED,
  GK_THROW_DIST_WEIGHT,
  GK_THROW_HSPEED,
  GK_THROW_MAX_TIME,
  GK_THROW_MIN_TIME,
  GOAL_AREA_RADIUS,
  GOAL_HEIGHT,
  GRAVITY,
  PASS_MAX_LEAD,
  PASS_RECEIVER_LOCK_EXTRA,
  PLAYER_RADIUS,
  PLAYER_TURN_RATE,
} from '../config/constants';
import { ballSpeed, integrateFreeBall } from './ball';
import type { Ball } from './ball';
import { GOAL_Y_MAX, GOAL_Y_MIN, goalCenter, goalLineX, inGoalArea, inwardDir } from './field';
import type { GoalSide } from './field';
import type { Player, TeamIndex } from './player';
import { clamp, rotateTowards } from './vec';
import type { World } from './world';

export type KeeperMode = 'position' | 'windup' | 'dive' | 'recover' | 'hold';

export interface KeeperState {
  mode: KeeperMode;
  /** Tempo no modo atual (s). */
  timer: number;
  /** Está reagindo a um chute (contando o tempo de reação). */
  reacting: boolean;
  reactTimer: number;
  reactDelay: number;
  /** Ajuste parado: y para onde ir (ou null). */
  standY: number | null;
  /** Direção do mergulho (unitária). */
  diveX: number;
  diveY: number;
  /** Fator de velocidade deste mergulho (variação aleatória). */
  diveSpeedFactor: number;
  /** Fator de alcance dos braços neste lance (variação aleatória). */
  reachFactor: number;
  /** Posição desejada suavizada (NaN = ainda não definida). */
  homeX: number;
  homeY: number;
}

export function createKeeperState(): KeeperState {
  return {
    mode: 'position',
    timer: 0,
    reacting: false,
    reactTimer: 0,
    reactDelay: GK_REACTION_TIME,
    standY: null,
    diveX: 0,
    diveY: 1,
    diveSpeedFactor: 1,
    reachFactor: 1,
    homeX: Number.NaN,
    homeY: Number.NaN,
  };
}

export function resetKeeperState(k: KeeperState): void {
  Object.assign(k, createKeeperState());
}

function setMode(k: KeeperState, mode: KeeperMode): void {
  k.mode = mode;
  k.timer = 0;
}

/** Previsão simples da trajetória (sem colisões): quando e onde a bola cruza o plano x = planeX. */
export function predictCrossing(
  ball: Ball,
  planeX: number,
  horizon: number,
): { t: number; y: number; z: number } | null {
  const b: Ball = { ...ball };
  const h = 1 / 120;
  let t = 0;
  let prevX = b.x;
  while (t < horizon) {
    integrateFreeBall(b, h);
    t += h;
    if ((prevX - planeX) * (b.x - planeX) <= 0 && prevX !== b.x) {
      const f = (planeX - prevX) / (b.x - prevX);
      return { t: t - h * (1 - f), y: b.y - b.vy * h * (1 - f), z: Math.max(0, b.z) };
    }
    prevX = b.x;
    if (b.vx === 0 && b.vy === 0 && b.z === 0) break;
  }
  return null;
}

/** A bola solta está indo para o gol `side` (com margem) dentro do horizonte? */
export function isShotThreat(ball: Ball, side: GoalSide): boolean {
  if (ball.owner !== null) return false;
  if (Math.hypot(ball.vx, ball.vy) < GK_THREAT_MIN_SPEED) return false;
  const out = -inwardDir(side);
  if (ball.vx * out <= 0) return false;
  const cross = predictCrossing(ball, goalLineX(side), GK_THREAT_HORIZON);
  if (!cross) return false;
  return (
    cross.y >= GOAL_Y_MIN - GK_THREAT_MARGIN &&
    cross.y <= GOAL_Y_MAX + GK_THREAT_MARGIN &&
    cross.z <= GOAL_HEIGHT + GK_THREAT_MARGIN
  );
}

/** Mantém o goleiro dentro da área (e do campo). */
export function clampKeeperToArea(gk: Player, side: GoalSide): void {
  const c = goalCenter(side);
  const r = GOAL_AREA_RADIUS - PLAYER_RADIUS;
  const dx = gk.x - c.x;
  const dy = gk.y - c.y;
  const d = Math.hypot(dx, dy);
  if (d > r) {
    gk.x = c.x + (dx / d) * r;
    gk.y = c.y + (dy / d) * r;
  }
  gk.x = clamp(gk.x, PLAYER_RADIUS, FIELD_LENGTH - PLAYER_RADIUS);
  gk.y = clamp(gk.y, PLAYER_RADIUS, FIELD_WIDTH - PLAYER_RADIUS);
}

/**
 * Posição-base do goleiro: perto da linha, na reta entre a bola e o centro do gol (fecha o
 * ângulo e acompanha o Y da bola), limitada à largura do gol + GK_LATERAL_MARGIN; sai um
 * pouco quando a bola se aproxima.
 */
export function keeperHomePosition(ball: Ball, side: GoalSide): { x: number; y: number } {
  const c = goalCenter(side);
  const inward = inwardDir(side);
  const dBall = Math.hypot(ball.x - c.x, ball.y - c.y);
  const advance = GK_COME_OUT_MAX * clamp(1 - dBall / GK_COME_OUT_RANGE, 0, 1);
  const depth = GK_LINE_OFFSET + advance;
  // Ponto da reta bola -> centro do gol na profundidade do goleiro.
  const ballDepth = Math.max((ball.x - c.x) * inward, depth);
  const lineY = c.y + (ball.y - c.y) * (depth / ballDepth);
  // Mistura: acompanhar o Y da bola (limitado) x fechar o ângulo.
  const minY = GOAL_Y_MIN - GK_LATERAL_MARGIN;
  const maxY = GOAL_Y_MAX + GK_LATERAL_MARGIN;
  const y = lineY + (clamp(ball.y, minY, maxY) - lineY) * GK_Y_FOLLOW;
  return { x: c.x + inward * depth, y: clamp(y, minY, maxY) };
}

function moveTowards(gk: Player, tx: number, ty: number, speed: number): void {
  const dx = tx - gk.x;
  const dy = ty - gk.y;
  const d = Math.hypot(dx, dy);
  gk.maxSpeed = speed;
  if (d < 0.05) {
    gk.moveX = 0;
    gk.moveY = 0;
  } else {
    const mag = Math.min(1, d / 0.6);
    gk.moveX = (dx / d) * mag;
    gk.moveY = (dy / d) * mag;
  }
}

/** O goleiro deve sair para pegar a bola solta e lenta dentro da área? */
function shouldClaim(world: World, gk: Player, side: GoalSide): boolean {
  const b = world.ball;
  if (b.owner !== null || b.z > 1.2 || Math.hypot(b.vx, b.vy) > GK_CLAIM_MAX_SPEED) return false;
  if (!inGoalArea(side, b.x, b.y, -0.2)) return false;
  const dGk = Math.hypot(b.x - gk.x, b.y - gk.y);
  let dOpp = Infinity;
  for (const p of world.players) {
    if (p.team === gk.team) continue;
    dOpp = Math.min(dOpp, Math.hypot(b.x - p.x, b.y - p.y));
  }
  return dGk + GK_CLAIM_ADVANTAGE < dOpp;
}

/** Alcance lateral do mergulho sem mover o corpo (braço + mão + raio da bola). */
const DIVE_STATIC_REACH = GK_DIVE_ARM + GK_HAND_RADIUS + BALL_RADIUS;
// (o mergulho é decidido com o alcance nominal; a variação só aparece no contato)
/** Velocidade média do corpo no mergulho (o perfil cai 60% do início ao fim). */
const DIVE_AVG_SPEED = GK_DIVE_SPEED * 0.7;

/**
 * Depois do tempo de reação, a cada passo: prevê onde a bola cruza o plano do corpo.
 * - Perto do corpo: ajusta parado (passos curtos até a linha da bola).
 * - Longe: dá passos laterais e só mergulha quando o tempo até a bola chegar fica no
 *   limite do que o mergulho precisa (mergulhar cedo demais o deixaria deitado quando ela passa).
 */
function trackShot(world: World, gk: Player, k: KeeperState, side: GoalSide): void {
  const ball = world.ball;
  const lineX = goalLineX(side);
  const inward = inwardDir(side);
  const ballAhead = (ball.x - gk.x) * inward > 0;
  const plane = ballAhead ? gk.x : lineX;
  const cross = predictCrossing(ball, plane, GK_THREAT_HORIZON);
  if (!cross) {
    k.standY = null;
    return;
  }
  const off = cross.y - gk.y;
  k.standY = cross.y;
  if (Math.abs(off) <= GK_DIVE_MIN_OFFSET) return;
  const need = GK_DIVE_WINDUP + Math.max(0, Math.abs(off) - DIVE_STATIC_REACH) / DIVE_AVG_SPEED;
  if (cross.t > need + GK_DIVE_TIMING_SLACK) return;
  // Hora de mergulhar: lateral, com um leve avanço na direção do campo.
  const dx = inward * 0.25;
  const dy = Math.sign(off);
  const l = Math.hypot(dx, dy);
  k.diveX = dx / l;
  k.diveY = dy / l;
  k.diveSpeedFactor = 1 + world.rng.range(-GK_DIVE_SPEED_JITTER, GK_DIVE_SPEED_JITTER);
  k.standY = null;
  setMode(k, 'windup');
}

/** Escolhe o companheiro de linha mais livre para o lançamento. */
export function chooseThrowTarget(world: World, gk: Player): Player | null {
  let best: Player | null = null;
  let bestScore = -Infinity;
  for (const m of world.players) {
    if (m.team !== gk.team || m.role === 'GK' || m.state !== 'normal') continue;
    let minOpp = Infinity;
    for (const o of world.players) {
      if (o.team === gk.team) continue;
      minOpp = Math.min(minOpp, Math.hypot(o.x - m.x, o.y - m.y));
    }
    const d = Math.hypot(m.x - gk.x, m.y - gk.y);
    const score = minOpp - d * GK_THROW_DIST_WEIGHT;
    if (score > bestScore) {
      bestScore = score;
      best = m;
    }
  }
  return best;
}

/** Lança a bola por cima para `target`, aterrissando nele (com antecipação se estiver correndo). */
function throwBall(world: World, gk: Player, target: Player, onControl: (team: TeamIndex, id: number) => void): void {
  const ball = world.ball;
  let tx = target.x;
  let ty = target.y;
  let T = clamp(Math.hypot(tx - ball.x, ty - ball.y) / GK_THROW_HSPEED, GK_THROW_MIN_TIME, GK_THROW_MAX_TIME);
  for (let i = 0; i < 2; i++) {
    let lx = target.vx * T;
    let ly = target.vy * T;
    const ll = Math.hypot(lx, ly);
    if (ll > PASS_MAX_LEAD) {
      lx *= PASS_MAX_LEAD / ll;
      ly *= PASS_MAX_LEAD / ll;
    }
    tx = clamp(target.x + lx, BALL_RADIUS, FIELD_LENGTH - BALL_RADIUS);
    ty = clamp(target.y + ly, BALL_RADIUS, FIELD_WIDTH - BALL_RADIUS);
    T = clamp(Math.hypot(tx - ball.x, ty - ball.y) / GK_THROW_HSPEED, GK_THROW_MIN_TIME, GK_THROW_MAX_TIME);
  }
  ball.owner = null;
  world.ballInHands = false;
  ball.lastTouch = gk.id;
  ball.vx = (tx - ball.x) / T;
  ball.vy = (ty - ball.y) / T;
  ball.vz = (0.5 * GRAVITY * T * T - ball.z) / T;
  gk.noTouchTimer = GK_PARRY_NO_TOUCH;
  world.passLock = { team: gk.team, receiver: target.id, until: world.time + T + PASS_RECEIVER_LOCK_EXTRA };
  onControl(gk.team, target.id);
  world.events.push({ type: 'pass', player: gk.id, target: target.id });
}

/** Coloca a bola nas mãos do goleiro. */
export function placeBallInHands(ball: Ball, gk: Player): void {
  ball.x = gk.x + Math.cos(gk.facing) * GK_HANDS_OFFSET;
  ball.y = gk.y + Math.sin(gk.facing) * GK_HANDS_OFFSET;
  ball.z = GK_HANDS_Z;
  ball.vx = 0;
  ball.vy = 0;
  ball.vz = 0;
}

/**
 * Comportamento do goleiro neste passo (antes do movimento).
 * `onControl` troca o controle humano para o receptor do lançamento.
 */
export function updateKeeper(
  world: World,
  gk: Player,
  k: KeeperState,
  dt: number,
  onControl: (team: TeamIndex, id: number) => void,
): void {
  const side = world.defends[gk.team];
  const ball = world.ball;
  k.timer += dt;
  gk.moveX = 0;
  gk.moveY = 0;

  // Vira para a bola (ou para o campo, se estiver com ela).
  const lookAt =
    k.mode === 'hold'
      ? Math.atan2(0, inwardDir(side))
      : Math.atan2(ball.y - gk.y, ball.x - gk.x);
  if (k.mode !== 'dive' && k.mode !== 'recover') {
    gk.facing = rotateTowards(gk.facing, lookAt, PLAYER_TURN_RATE * dt);
  }

  switch (k.mode) {
    case 'hold': {
      if (ball.owner !== gk.id) {
        setMode(k, 'position');
        break;
      }
      const home = keeperHomePosition({ ...ball, x: FIELD_LENGTH / 2, y: ball.y }, side);
      moveTowards(gk, home.x, home.y, GK_MOVE_SPEED * 0.4);
      if (k.timer >= GK_HOLD_TIME) {
        const target = chooseThrowTarget(world, gk);
        if (target) {
          throwBall(world, gk, target, onControl);
          setMode(k, 'position');
        }
      }
      return;
    }
    case 'windup':
      if (k.timer >= GK_DIVE_WINDUP) setMode(k, 'dive');
      return;
    case 'dive':
      if (k.timer >= GK_DIVE_DURATION) {
        setMode(k, 'recover');
        k.reacting = false;
      }
      return;
    case 'recover':
      if (k.timer >= GK_RECOVER_TIME) setMode(k, 'position');
      return;
    case 'position':
      break;
  }

  // Reação a chutes.
  const threat = isShotThreat(ball, side);
  if (!threat) {
    k.reacting = false;
    k.standY = null;
  } else if (!k.reacting) {
    k.reacting = true;
    k.reactTimer = 0;
    k.reactDelay = GK_REACTION_TIME + world.rng.range(0, GK_REACTION_JITTER);
    k.reachFactor = 1 + world.rng.range(-GK_REACH_JITTER, GK_REACH_JITTER);
    k.standY = null;
  } else {
    k.reactTimer += dt;
    if (k.reactTimer < k.reactDelay) {
      // Ainda não reagiu ao chute: continua como estava (parado).
      moveTowards(gk, gk.x, gk.y, GK_MOVE_SPEED);
      return;
    }
    trackShot(world, gk, k, side);
    if (k.mode !== 'position') return;
  }

  if (k.standY !== null) {
    moveTowards(gk, gk.x, k.standY, GK_SHUFFLE_SPEED);
  } else if (!threat && shouldClaim(world, gk, side)) {
    moveTowards(gk, ball.x, ball.y, GK_MOVE_SPEED);
  } else {
    const home = keeperHomePosition(ball, side);
    if (Number.isNaN(k.homeX) || GK_HOME_SMOOTHING <= 0) {
      k.homeX = home.x;
      k.homeY = home.y;
    } else {
      const a = 1 - Math.exp(-dt / GK_HOME_SMOOTHING);
      k.homeX += (home.x - k.homeX) * a;
      k.homeY += (home.y - k.homeY) * a;
    }
    moveTowards(gk, k.homeX, k.homeY, GK_MOVE_SPEED);
  }
}

/** Integra o corpo do goleiro durante o mergulho. */
export function integrateKeeperDive(gk: Player, k: KeeperState, dt: number): void {
  const f = 1 - 0.6 * clamp(k.timer / GK_DIVE_DURATION, 0, 1);
  const v = GK_DIVE_SPEED * k.diveSpeedFactor * f;
  gk.vx = k.diveX * v;
  gk.vy = k.diveY * v;
  gk.x += gk.vx * dt;
  gk.y += gk.vy * dt;
}

/** Altura do corpo do goleiro para a bola passar por cima (deitado no mergulho). */
export function keeperBodyHeight(k: KeeperState, standing: number): number {
  return k.mode === 'dive' || k.mode === 'recover' ? 0.7 : standing;
}

/** Distância de um ponto a um segmento (no plano). */
function distToSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 > 0 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  return Math.hypot(px - (ax + vx * t), py - (ay + vy * t));
}

/** A bola está ao alcance das mãos do goleiro agora? */
export function ballInKeeperReach(ball: Ball, gk: Player, k: KeeperState): boolean {
  switch (k.mode) {
    case 'dive': {
      if (ball.z > GK_DIVE_REACH_Z) return false;
      const arm = GK_DIVE_ARM * k.reachFactor;
      const d = distToSegment(ball.x, ball.y, gk.x, gk.y, gk.x + k.diveX * arm, gk.y + k.diveY * arm);
      return d <= GK_HAND_RADIUS + BALL_RADIUS;
    }
    case 'recover':
      return ball.z <= 0.5 && Math.hypot(ball.x - gk.x, ball.y - gk.y) <= 0.5 + BALL_RADIUS;
    case 'position':
    case 'windup':
      return (
        ball.z <= GK_STAND_REACH_Z &&
        Math.hypot(ball.x - gk.x, ball.y - gk.y) <= GK_STAND_REACH * k.reachFactor + BALL_RADIUS
      );
    case 'hold':
      return false;
  }
}

/**
 * Checa a defesa (chamado a cada subpasso da bola solta).
 * Até GK_CATCH_MAX_SPEED segura; acima, espalma para o lado. Devolve o resultado.
 */
export function tryKeeperSave(world: World, gk: Player, k: KeeperState): 'catch' | 'parry' | null {
  const ball = world.ball;
  if (ball.owner !== null || gk.noTouchTimer > 0) return null;
  if (!ballInKeeperReach(ball, gk, k)) return null;
  const side = world.defends[gk.team];
  const speed = ballSpeed(ball);
  ball.lastTouch = gk.id;
  if (speed <= GK_CATCH_MAX_SPEED) {
    ball.owner = gk.id;
    world.ballInHands = true;
    world.passLock = null;
    placeBallInHands(ball, gk);
    setMode(k, 'hold');
    k.reacting = false;
    k.standY = null;
    world.events.push({ type: 'save', player: gk.id, result: 'catch' });
    return 'catch';
  }
  // Espalma: devolve para o campo e empurra para o lado.
  const inward = inwardDir(side);
  const c = goalCenter(side);
  let lateral = Math.sign(ball.y - c.y);
  if (lateral === 0) lateral = k.diveY >= 0 ? 1 : -1;
  ball.vx = inward * Math.abs(ball.vx) * GK_PARRY_SPEED_FACTOR;
  ball.vy = lateral * GK_PARRY_LATERAL_SPEED + ball.vy * 0.2;
  ball.vz = GK_PARRY_UP_SPEED;
  gk.noTouchTimer = GK_PARRY_NO_TOUCH;
  world.events.push({ type: 'save', player: gk.id, result: 'parry' });
  return 'parry';
}
