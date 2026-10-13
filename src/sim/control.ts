/**
 * O que cada humano controla (troca automática com histerese) e as ações do jogador
 * controlado (passe, carga e chute).
 */
import {
  CONTROL_PREDICT_TIME,
  CONTROL_SWITCH_COOLDOWN,
  CONTROL_SWITCH_MARGIN,
  PASS_NO_TARGET_SPEED,
  PASS_RECEIVER_LOCK_EXTRA,
  SHOT_CHARGE_TIME,
} from '../config/constants';
import type { PlayerInput } from '../core/input';
import { choosePassTarget, planPass, releaseBall, shotVelocity } from './kick';
import type { Player, TeamIndex } from './player';
import type { World } from './world';
import { getPlayer } from './world';

export interface HumanState {
  /** Está segurando o botão de chute com a bola (carregando). */
  charging: boolean;
  /** Carga atual (0..1). */
  charge: number;
}

export function createHumanState(): HumanState {
  return { charging: false, charge: 0 };
}

export function cancelCharge(h: HumanState): void {
  h.charging = false;
  h.charge = 0;
}

/** Troca o jogador controlado por um humano (cancela a carga se mudar). */
export function setControlled(world: World, team: TeamIndex, playerId: number): void {
  if (world.controlled[team] === playerId) return;
  const p = getPlayer(world, playerId);
  if (p.team !== team || p.role === 'GK') return;
  world.controlled[team] = playerId;
  world.controlSwitchTimer[team] = 0;
  cancelCharge(world.humans[team]);
}

/** Posição prevista da bola daqui a CONTROL_PREDICT_TIME. */
export function predictedBall(world: World): { x: number; y: number } {
  const b = world.ball;
  return { x: b.x + b.vx * CONTROL_PREDICT_TIME, y: b.y + b.vy * CONTROL_PREDICT_TIME };
}

/**
 * Troca automática de controle de um time:
 * - o time tem a bola (jogador de linha): quem está com ela;
 * - passe em andamento para um companheiro: o receptor (já trocado na hora do passe);
 * - senão: o jogador de linha mais perto da bola prevista, com histerese
 *   (CONTROL_SWITCH_MARGIN m mais perto e no máximo uma troca a cada CONTROL_SWITCH_COOLDOWN s).
 */
export function updateAutoControl(world: World, team: TeamIndex, dt: number): void {
  world.controlSwitchTimer[team] += dt;

  const owner = world.ball.owner !== null ? getPlayer(world, world.ball.owner) : null;
  if (owner && owner.team === team && owner.role !== 'GK') {
    setControlled(world, team, owner.id);
    return;
  }

  const lock = world.passLock;
  if (lock && lock.team === team) {
    setControlled(world, team, lock.receiver);
    return;
  }

  if (world.controlSwitchTimer[team] < CONTROL_SWITCH_COOLDOWN) return;

  const target = predictedBall(world);
  const current = getPlayer(world, world.controlled[team]);
  const curDist = Math.hypot(current.x - target.x, current.y - target.y);
  let best: Player | null = null;
  let bestDist = Infinity;
  for (const p of world.players) {
    if (p.team !== team || p.role === 'GK') continue;
    const d = Math.hypot(p.x - target.x, p.y - target.y);
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  if (best && best.id !== current.id && bestDist + CONTROL_SWITCH_MARGIN <= curDist) {
    setControlled(world, team, best.id);
  }
}

/** Direção de ação: o direcional, ou para onde o jogador está virado. */
function actionDirection(p: Player, input: PlayerInput): { x: number; y: number } {
  if (input.moveX !== 0 || input.moveY !== 0) return { x: input.moveX, y: input.moveY };
  return { x: Math.cos(p.facing), y: Math.sin(p.facing) };
}

/** Executa um passe do jogador `p` na direção dada. */
export function performPass(world: World, p: Player, dirX: number, dirY: number): void {
  const ball = world.ball;
  const mates = world.players.filter((m) => m.team === p.team);
  const target = choosePassTarget(p, mates, dirX, dirY);
  if (target) {
    const plan = planPass(ball, target);
    releaseBall(ball, p, { x: plan.vx, y: plan.vy, z: 0 });
    world.passLock = { team: p.team, receiver: target.id, until: world.time + plan.eta + PASS_RECEIVER_LOCK_EXTRA };
    setControlled(world, p.team, target.id);
  } else {
    const l = Math.hypot(dirX, dirY) || 1;
    releaseBall(ball, p, { x: (dirX / l) * PASS_NO_TARGET_SPEED, y: (dirY / l) * PASS_NO_TARGET_SPEED, z: 0 });
  }
  world.events.push({ type: 'pass', player: p.id, target: target ? target.id : null });
}

/** Executa um chute do jogador `p` com a carga dada. */
export function performShot(world: World, p: Player, charge: number, input: PlayerInput): void {
  const ball = world.ball;
  const dir = input.moveX !== 0 || input.moveY !== 0 ? { x: input.moveX, y: input.moveY } : null;
  const goal = world.defends[p.team === 0 ? 1 : 0];
  const v = shotVelocity(ball.x, ball.y, charge, dir, goal, world.rng);
  releaseBall(ball, p, v);
  world.events.push({ type: 'shot', player: p.id, charge, speed: Math.hypot(v.x, v.y) });
}

/**
 * Ações do jogador controlado pelo humano `team` neste passo.
 * Com a bola: passe (F / ;) ou carga e chute (G / .). Sem a bola: (dividida na fase 7).
 */
export function handleHumanActions(world: World, team: TeamIndex, input: PlayerInput, dt: number): void {
  const h = world.humans[team];
  const p = getPlayer(world, world.controlled[team]);
  const hasBall = world.ball.owner === p.id;

  // Perdeu a bola enquanto carregava: a carga é cancelada.
  if (h.charging && !hasBall) cancelCharge(h);
  if (!hasBall) return;

  if (!h.charging && input.pass.pressed) {
    const d = actionDirection(p, input);
    performPass(world, p, d.x, d.y);
    return;
  }

  if (!h.charging && input.shoot.pressed) {
    h.charging = true;
    h.charge = 0;
  }
  if (!h.charging) return;

  if (input.shoot.down) {
    h.charge = Math.min(1, h.charge + dt / SHOT_CHARGE_TIME);
    return;
  }
  // Soltou (ou apertou e soltou no mesmo passo): chuta com a carga atual.
  const charge = h.charge;
  cancelCharge(h);
  performShot(world, p, charge, input);
}
