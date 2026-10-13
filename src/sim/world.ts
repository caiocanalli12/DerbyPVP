/**
 * Estado do mundo da partida e o passo da simulação (lógica pura, sem Phaser).
 */
import {
  BALL_MAX_SUBSTEP_DIST,
  DEFLECT_NO_TOUCH,
  PLAYER_DRIBBLE_SPEED_FACTOR,
  PLAYER_RUN_SPEED,
} from '../config/constants';
import type { PlayerInput } from '../core/input';
import { Rng } from '../core/rng';
import {
  ballSpeed,
  collideBallWithArena,
  createBall,
  goalScoredIn,
  integrateFreeBall,
  placeBall,
  substepsFor,
} from './ball';
import type { Ball } from './ball';
import { cancelCharge, createHumanState, handleHumanActions, setControlled, updateAutoControl } from './control';
import type { HumanState } from './control';
import type { SimEvent } from './events';
import { FIELD_CENTER_X, FIELD_CENTER_Y } from './field';
import type { GoalSide } from './field';
import { separatePlayers } from './physics';
import { clampToField, createPlayer, formationPosition, integrateMovement, ROLES } from './player';
import type { Player, Role, TeamIndex } from './player';
import { bodyHeight, deflectOffPlayers, findPossessionWinner, placeDribbledBall } from './possession';
import { chooseMarker, faceBallWhenIdle, isAiFieldPlayer, updateFieldAi } from './ai';
import {
  clampKeeperToArea,
  createKeeperState,
  integrateKeeperDive,
  keeperBodyHeight,
  placeBallInHands,
  resetKeeperState,
  tryKeeperSave,
  updateKeeper,
} from './goalkeeper';
import type { KeeperState } from './goalkeeper';
import { integrateSlide, resolveTackleHit, updateBodyState } from './tackle';

export interface PassLock {
  team: TeamIndex;
  receiver: number;
  /** Tempo do mundo até quando o receptor fica reservado. */
  until: number;
}

export interface World {
  /** Tempo simulado (s). */
  time: number;
  /** Jogadores: ids 0–4 = time 0 (J1), 5–9 = time 1 (J2), na ordem de ROLES. */
  players: Player[];
  ball: Ball;
  /** Gol que cada time defende (troca no intervalo). */
  defends: [GoalSide, GoalSide];
  /** Jogador controlado por cada humano (J1 controla o time 0, J2 o time 1). */
  controlled: [number, number];
  /** Tempo (s) desde a última troca de controle de cada humano. */
  controlSwitchTimer: [number, number];
  humans: [HumanState, HumanState];
  /** Passe em andamento: o receptor fica com o controle até a bola chegar. */
  passLock: PassLock | null;
  /** A bola está nas mãos do goleiro (ninguém rouba). */
  ballInHands: boolean;
  /** Estado da IA de cada goleiro (índice = time). */
  keepers: [KeeperState, KeeperState];
  /** IA ligada (jogadores de linha e goleiros). Desligar serve para testes e depuração. */
  aiEnabled: boolean;
  /** Gol marcado neste passo (lado do gol), se houver. A partida decide o que fazer. */
  goal: GoalSide | null;
  /** Eventos acumulados desde a última leitura (drainEvents). */
  events: SimEvent[];
  rng: Rng;
}

/** Entrada humana por passo (só o que a simulação precisa). */
export type HumanInputs = [PlayerInput, PlayerInput];

export function createWorld(seed = 1): World {
  const players: Player[] = [];
  for (const team of [0, 1] as const) {
    ROLES.forEach((role, i) => players.push(createPlayer(team * ROLES.length + i, team, role)));
  }
  const world: World = {
    time: 0,
    players,
    ball: createBall(),
    defends: [0, 1],
    controlled: [playerId(0, 'ATA'), playerId(1, 'ATA')],
    controlSwitchTimer: [0, 0],
    humans: [createHumanState(), createHumanState()],
    passLock: null,
    ballInHands: false,
    keepers: [createKeeperState(), createKeeperState()],
    aiEnabled: true,
    goal: null,
    events: [],
    rng: new Rng(seed),
  };
  resetToFormation(world);
  return world;
}

export function playerId(team: TeamIndex, role: Role): number {
  return team * ROLES.length + ROLES.indexOf(role);
}

export function getPlayer(world: World, id: number): Player {
  const p = world.players[id];
  if (!p) throw new Error(`Jogador inexistente: ${id}`);
  return p;
}

export function teamPlayers(world: World, team: TeamIndex): Player[] {
  return world.players.filter((p) => p.team === team);
}

/** Sentido de ataque de um time no eixo X (+1 = para a direita). */
export function attackDir(world: World, team: TeamIndex): 1 | -1 {
  return world.defends[team] === 0 ? 1 : -1;
}

/** Gol que o time `team` ataca. */
export function attackedGoal(world: World, team: TeamIndex): GoalSide {
  return world.defends[team === 0 ? 1 : 0];
}

/** Devolve e limpa os eventos acumulados. */
export function drainEvents(world: World): SimEvent[] {
  const ev = world.events;
  world.events = [];
  return ev;
}

/** Coloca todos na formação base, parados e virados para o ataque; bola no centro. */
export function resetToFormation(world: World): void {
  for (const p of world.players) {
    const pos = formationPosition(p.role, world.defends[p.team]);
    p.x = pos.x;
    p.y = pos.y;
    p.prevX = pos.x;
    p.prevY = pos.y;
    p.vx = 0;
    p.vy = 0;
    p.moveX = 0;
    p.moveY = 0;
    p.noTouchTimer = 0;
    p.state = 'normal';
    p.stateTimer = 0;
    p.tackleCooldown = 0;
    p.tackleHit = false;
    p.facing = attackDir(world, p.team) === 1 ? 0 : Math.PI;
    p.aiTargetX = pos.x;
    p.aiTargetY = pos.y;
  }
  for (const k of world.keepers) resetKeeperState(k);
  world.ballInHands = false;
  world.ball.owner = null;
  world.ball.lastTouch = null;
  placeBall(world.ball, FIELD_CENTER_X, FIELD_CENTER_Y);
  world.passLock = null;
  world.goal = null;
  for (const h of world.humans) cancelCharge(h);
}

/** Dá a posse a um jogador (domínio, roubada, saída de bola). */
export function givePossession(world: World, p: Player): void {
  const previousOwner = world.ball.owner;
  world.ball.owner = p.id;
  world.ballInHands = false;
  world.ball.lastTouch = p.id;
  world.ball.z = 0;
  world.ball.vz = 0;
  // Qualquer domínio encerra o passe em andamento.
  world.passLock = null;
  // Quem ganha a bola passa a ser controlado na hora (exceção da histerese).
  if (p.role !== 'GK') setControlled(world, p.team, p.id);
  world.events.push({ type: 'possession', player: p.id, previousOwner });
}

/** Atualiza a bola: conduzida (presa ao dono) ou solta (física com subpassos). */
function stepBall(world: World, dt: number): void {
  const ball = world.ball;
  ball.prevX = ball.x;
  ball.prevY = ball.y;
  ball.prevZ = ball.z;

  if (ball.owner !== null) {
    const owner = getPlayer(world, ball.owner);
    if (world.ballInHands) {
      placeBallInHands(ball, owner);
      return;
    }
    if (owner.state === 'normal') {
      placeDribbledBall(ball, owner, dt);
      return;
    }
    // Segurança: quem não está de pé não conduz.
    ball.owner = null;
  }

  const n = substepsFor(ball, dt, BALL_MAX_SUBSTEP_DIST);
  const h = dt / n;
  for (let i = 0; i < n; i++) {
    const bounce = integrateFreeBall(ball, h);
    if (bounce) world.events.push({ type: 'contact', kind: bounce, speed: ballSpeed(ball) });
    for (const kind of collideBallWithArena(ball)) {
      world.events.push({ type: 'contact', kind, speed: ballSpeed(ball) });
    }
    // Goleiros: defesa (segura ou espalma) antes de qualquer desvio no corpo.
    let saved = false;
    for (const team of world.aiEnabled ? ([0, 1] as const) : ([] as const)) {
      const gk = getPlayer(world, playerId(team, 'GK'));
      if (tryKeeperSave(world, gk, world.keepers[team])) {
        saved = true;
        break;
      }
    }
    if (ball.owner !== null) return;
    if (saved) continue;
    const hit = deflectOffPlayers(ball, world.players, (p) =>
      p.role === 'GK' ? keeperBodyHeight(world.keepers[p.team], bodyHeight(p)) : bodyHeight(p),
    );
    if (hit) {
      ball.lastTouch = hit.id;
      // Bola que desviou não é dominada logo em seguida pelo mesmo jogador.
      hit.noTouchTimer = Math.max(hit.noTouchTimer, DEFLECT_NO_TOUCH);
      world.events.push({ type: 'deflect', player: hit.id });
    }
    const side = goalScoredIn(ball);
    if (side !== null && world.goal === null) {
      world.goal = side;
      world.events.push({ type: 'goal', side, lastTouch: ball.lastTouch });
    }
  }

  const winner = findPossessionWinner(ball, world.players);
  if (winner) givePossession(world, winner);
}

/** Avança a simulação um passo fixo. */
export function stepWorld(world: World, inputs: HumanInputs, dt: number): void {
  for (const p of world.players) {
    p.prevX = p.x;
    p.prevY = p.y;
    p.moveX = 0;
    p.moveY = 0;
    p.maxSpeed = PLAYER_RUN_SPEED;
    if (p.noTouchTimer > 0) p.noTouchTimer = Math.max(0, p.noTouchTimer - dt);
    const before = p.state;
    updateBodyState(p, dt);
    if (before === 'tackling' && p.state === 'fallen') world.events.push({ type: 'tackleMiss', player: p.id });
  }
  if (world.passLock && world.time > world.passLock.until) world.passLock = null;

  // Troca automática de quem cada humano controla.
  for (const team of [0, 1] as const) updateAutoControl(world, team, dt);

  // Humanos: cada um move o jogador que controla e age (passe/chute/dividida).
  for (const team of [0, 1] as const) {
    const input = inputs[team];
    handleHumanActions(world, team, input, dt);
    const p = getPlayer(world, world.controlled[team]);
    if (p.state === 'normal') {
      p.moveX = input.moveX;
      p.moveY = input.moveY;
    }
  }

  // IA: jogadores de linha não controlados e goleiros.
  for (const team of world.aiEnabled ? ([0, 1] as const) : ([] as const)) {
    const marker = chooseMarker(world, team);
    for (const p of world.players) {
      if (p.team !== team || p.state !== 'normal') continue;
      if (p.role === 'GK') {
        updateKeeper(world, p, world.keepers[team], dt, (t, id) => setControlled(world, t, id));
      } else if (isAiFieldPlayer(world, p)) {
        updateFieldAi(world, p, marker ? marker.id : null, dt);
      }
    }
  }

  if (world.ball.owner !== null && !world.ballInHands) {
    getPlayer(world, world.ball.owner).maxSpeed *= PLAYER_DRIBBLE_SPEED_FACTOR;
  }

  for (const p of world.players) {
    if (p.state === 'tackling') integrateSlide(p, dt);
    else if (p.role === 'GK' && world.keepers[p.team].mode === 'dive') integrateKeeperDive(p, world.keepers[p.team], dt);
    else if (p.role === 'GK' && world.keepers[p.team].mode !== 'position' && world.keepers[p.team].mode !== 'hold') {
      p.vx = 0;
      p.vy = 0;
    } else if (p.state !== 'fallen') integrateMovement(p, dt);
    if (p.role !== 'GK' && isAiFieldPlayer(world, p)) faceBallWhenIdle(world, p, dt);
  }

  // Divididas: só acertam na janela ativa.
  for (const p of world.players) {
    if (p.state !== 'tackling') continue;
    const owner = world.ball.owner !== null ? getPlayer(world, world.ball.owner) : null;
    if (resolveTackleHit(p, world.ball, owner, world.ballInHands, world.events)) world.passLock = null;
  }

  separatePlayers(world.players);
  for (const p of world.players) clampToField(p);
  for (const team of [0, 1] as const) clampKeeperToArea(getPlayer(world, playerId(team, 'GK')), world.defends[team]);

  stepBall(world, dt);

  world.time += dt;
}
