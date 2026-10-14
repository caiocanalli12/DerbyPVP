/**
 * Fluxo da partida: máquina de estados, relógio, placar, intervalos e troca de lado.
 *
 *   SAIDA_DE_BOLA -> JOGANDO -> COMEMORACAO_GOL -> SAIDA_DE_BOLA ...
 *   + INTERVALO (cartão), PRORROGACAO (cartão), PENALTIS e FIM (cartão).
 *
 * O relógio só corre em JOGANDO. Lógica pura (sem Phaser).
 */
import {
  DRIBBLE_OFFSET,
  EXTRA_HALF_DURATION,
  FIELD_LENGTH,
  GK_CATCH_MAX_SPEED,
  GK_LINE_OFFSET,
  GOAL_DEPTH,
  PEN_RESULT_TIME,
  PEN_SETUP_TIME,
  PENALTY_SPOT_DISTANCE,
  GOAL_CELEBRATION_DURATION,
  GOAL_CELEBRATION_SKIP_AFTER,
  HALF_DURATION,
  INTERTITLE_DURATION,
  KICKOFF_AIM_MAX_DEG,
  KICKOFF_DEFENDER_DISTANCE,
  KICKOFF_DELAY,
  KICKOFF_PASS_DEADLINE,
  PLAYER_TURN_RATE,
} from '../config/constants';
import { FIELD_CENTER_X, FIELD_CENTER_Y } from './field';
import type { GoalSide } from './field';
import type { Player, TeamIndex } from './player';
import {
  attackDir,
  createWorld,
  getPlayer,
  givePossession,
  playerId,
  resetToFormation,
  stepLooseBallPhysics,
  stepWorld,
} from './world';
import type { HumanInputs, World } from './world';
import { emptyCommand } from './command';
import type { TeamCommand } from './command';
import { cancelCharge, passTo } from './control';
import { choosePassTarget } from './kick';
import { angleDiff, clamp } from './vec';
import { placeBall } from './ball';
import { placeBallInHands } from './goalkeeper';
import {
  createShootout,
  effectiveAim,
  kickerRole,
  recordKick,
  resolvePenalty,
  updateAiming,
} from './penalties';
import type { PenaltyAttempt, PenaltyResult, PenaltyZone, Shootout } from './penalties';

export type MatchPhase =
  | 'SAIDA_DE_BOLA'
  | 'JOGANDO'
  | 'COMEMORACAO_GOL'
  | 'INTERVALO'
  | 'PRORROGACAO'
  | 'PENALTIS'
  | 'FIM';

/** Períodos de jogo: 1º e 2º tempos, 1ª e 2ª metades da prorrogação. */
export type Period = '1T' | '2T' | 'PR1' | 'PR2';

export interface GoalRecord {
  team: TeamIndex;
  /** Quem tocou por último (pode ser gol contra). */
  scorer: number | null;
  ownGoal: boolean;
  period: Period;
  clock: number;
}

export type MatchEvent =
  | { type: 'whistle' }
  | { type: 'goal'; goal: GoalRecord }
  | { type: 'periodEnd'; period: Period }
  | { type: 'sidesSwapped' }
  | { type: 'intertitle'; text: string }
  | { type: 'finalWhistle' }
  | { type: 'penaltyKick'; team: TeamIndex }
  | { type: 'penaltyResult'; team: TeamIndex; result: PenaltyResult };

export interface Match {
  world: World;
  phase: MatchPhase;
  period: Period;
  /** Tempo jogado no período atual (s). */
  clock: number;
  /** Tempo no estado atual (s). */
  phaseTimer: number;
  score: [number, number];
  goals: GoalRecord[];
  /** Time que dá a saída de bola atual/próxima. */
  kickoffTeam: TeamIndex;
  /** Saída de bola: já apitou e o batedor pode passar. */
  kickoffLive: boolean;
  /** Direção (rad) em que o batedor mira o passe da saída. */
  kickoffAim: number;
  /** Texto do cartão de intertítulo em exibição (ou null). */
  intertitle: string | null;
  /** Próximo período depois do cartão de INTERVALO/PRORROGACAO. */
  nextPeriod: Period | null;
  /** A partida terminou (depois do cartão de FIM). */
  over: boolean;
  /** Disputa de pênaltis (depois do cartão PÊNALTIS). */
  shootout: Shootout | null;
  /** Cobrança em andamento. */
  attempt: PenaltyAttempt | null;
  events: MatchEvent[];
}

export const PERIOD_LABEL: Readonly<Record<Period, string>> = { '1T': '1T', '2T': '2T', PR1: 'PR1', PR2: 'PR2' };

export function periodDuration(period: Period): number {
  return period === '1T' || period === '2T' ? HALF_DURATION : EXTRA_HALF_DURATION;
}

/** Quem dá a saída de bola no início de cada período: J1 no 1º, J2 no 2º (idem na prorrogação). */
function kickoffTeamFor(period: Period): TeamIndex {
  return period === '1T' || period === 'PR1' ? 0 : 1;
}

export function createMatch(seed = 1): Match {
  const match: Match = {
    world: createWorld(seed),
    phase: 'SAIDA_DE_BOLA',
    period: '1T',
    clock: 0,
    phaseTimer: 0,
    score: [0, 0],
    goals: [],
    kickoffTeam: 0,
    kickoffLive: false,
    kickoffAim: Math.PI,
    intertitle: null,
    nextPeriod: null,
    over: false,
    shootout: null,
    attempt: null,
    events: [],
  };
  setupKickoff(match, 0);
  return match;
}

/** Vencedor da partida (placar e, se houver, pênaltis); null se empatada/sem fim. */
export function matchWinner(match: Match): TeamIndex | null {
  if (match.score[0] !== match.score[1]) return match.score[0] > match.score[1] ? 0 : 1;
  return match.shootout?.winner ?? null;
}

/** Devolve e limpa os eventos da partida. */
export function drainMatchEvents(match: Match): MatchEvent[] {
  const ev = match.events;
  match.events = [];
  return ev;
}

/** Time que ataca o gol `side` (quem marca quando a bola entra nele). */
export function teamAttacking(world: World, side: GoalSide): TeamIndex {
  return world.defends[0] === side ? 1 : 0;
}

/**
 * Prepara a saída de bola: todos na formação, bola no centro com o atacante do time
 * `team` (mirando o próprio campo), e o atacante adversário fora do círculo central.
 */
export function setupKickoff(match: Match, team: TeamIndex): void {
  const world = match.world;
  resetToFormation(world);
  match.kickoffTeam = team;
  match.kickoffLive = false;
  match.phase = 'SAIDA_DE_BOLA';
  match.phaseTimer = 0;

  const kicker = getPlayer(world, playerId(team, 'ATA'));
  const dir = attackDir(world, team);
  match.kickoffAim = ownGoalDirection(world, team);
  placeKickoffTaker(kicker, match.kickoffAim);
  kicker.prevX = kicker.x;
  kicker.prevY = kicker.y;

  const other: TeamIndex = team === 0 ? 1 : 0;
  const rival = getPlayer(world, playerId(other, 'ATA'));
  rival.x = FIELD_CENTER_X + dir * KICKOFF_DEFENDER_DISTANCE;
  rival.y = FIELD_CENTER_Y;
  rival.prevX = rival.x;
  rival.prevY = rival.y;

  world.controlled = [playerId(0, 'ATA'), playerId(1, 'ATA')];
  world.controlSwitchTimer = [0, 0];
  world.controlPrev = [null, null];
  givePossession(world, kicker);
  // A posse inicial não é um "evento de jogo".
  world.events = world.events.filter((e) => e.type !== 'possession');
  // Bola parada no centro, à frente do batedor.
  world.ball.prevX = world.ball.x = FIELD_CENTER_X;
  world.ball.prevY = world.ball.y = FIELD_CENTER_Y;
}

/** Direção (rad) do centro para o gol que o time defende. */
function ownGoalDirection(world: World, team: TeamIndex): number {
  return attackDir(world, team) === 1 ? Math.PI : 0;
}

/** O batedor fica atrás da bola (no centro), virado para onde mira. */
function placeKickoffTaker(kicker: Player, aim: number): void {
  kicker.x = FIELD_CENTER_X - Math.cos(aim) * DRIBBLE_OFFSET;
  kicker.y = FIELD_CENTER_Y - Math.sin(aim) * DRIBBLE_OFFSET;
  kicker.facing = aim;
}

/**
 * Para quem vai o passe da saída mirando `aim`: o companheiro de linha no cone do passe ou, se não
 * houver, o mais próximo dessa direção. Nunca o goleiro.
 */
export function kickoffTarget(world: World, kicker: Player, aim: number): Player {
  const mates = world.players.filter((p) => p.team === kicker.team && p.role !== 'GK' && p.id !== kicker.id);
  const ux = Math.cos(aim);
  const uy = Math.sin(aim);
  const inCone = choosePassTarget(kicker, mates, ux, uy);
  if (inCone) return inCone;
  let best = mates[0]!;
  let bestCos = -Infinity;
  for (const m of mates) {
    const d = Math.hypot(m.x - kicker.x, m.y - kicker.y) || 1;
    const cos = ((m.x - kicker.x) * ux + (m.y - kicker.y) * uy) / d;
    if (cos > bestCos) {
      bestCos = cos;
      best = m;
    }
  }
  return best;
}

/**
 * Saída de bola depois do apito: ninguém se mexe; o batedor gira em volta da bola com o direcional,
 * mirando só o próprio campo, e o passe (ou o prazo) põe a bola em jogo.
 */
function stepKickoff(match: Match, input: TeamCommand, dt: number): void {
  const world = match.world;
  const team = match.kickoffTeam;
  const kicker = getPlayer(world, playerId(team, 'ATA'));
  // Ângulos medidos a partir da direção do próprio gol, para nunca girar passando pela frente.
  const back = ownGoalDirection(world, team);
  const max = (KICKOFF_AIM_MAX_DEG * Math.PI) / 180;
  const rel = angleDiff(back, match.kickoffAim);
  if (input.moveX !== 0 || input.moveY !== 0) {
    let want = angleDiff(back, Math.atan2(input.moveY, input.moveX));
    // Direcional para a frente: fica no limite do lado em que já está.
    if (Math.abs(want) > max) want = (Math.abs(want) > Math.PI - 1e-6 ? Math.sign(rel) || 1 : Math.sign(want)) * max;
    const step = PLAYER_TURN_RATE * dt;
    match.kickoffAim = back + clamp(rel + clamp(want - rel, -step, step), -max, max);
  }
  placeKickoffTaker(kicker, match.kickoffAim);

  const late = match.phaseTimer >= KICKOFF_DELAY + KICKOFF_PASS_DEADLINE;
  if (input.passPressed || late) {
    passTo(world, kicker, kickoffTarget(world, kicker, match.kickoffAim));
    match.kickoffLive = false;
    match.phase = 'JOGANDO';
    match.phaseTimer = 0;
  }
}

/** Congela o mundo (sem movimento): mantém o desenho estável durante pausas de regra. */
function freezeWorld(world: World): void {
  for (const p of world.players) {
    p.prevX = p.x;
    p.prevY = p.y;
    p.vx = 0;
    p.vy = 0;
  }
  world.ball.prevX = world.ball.x;
  world.ball.prevY = world.ball.y;
  world.ball.prevZ = world.ball.z;
  for (const h of world.humans) cancelCharge(h);
}

function showIntertitle(match: Match, phase: MatchPhase, text: string): void {
  match.phase = phase;
  match.phaseTimer = 0;
  match.intertitle = text;
  match.events.push({ type: 'intertitle', text });
}

function swapSides(match: Match): void {
  const w = match.world;
  w.defends = [w.defends[1], w.defends[0]];
  match.events.push({ type: 'sidesSwapped' });
}

/** Começa um período: troca de lado quando manda a regra e prepara a saída. */
function startPeriod(match: Match, period: Period): void {
  if (period === '2T' || period === 'PR2') swapSides(match);
  match.period = period;
  match.clock = 0;
  match.intertitle = null;
  setupKickoff(match, kickoffTeamFor(period));
}

/** O tempo do período acabou. */
function endPeriod(match: Match): void {
  match.events.push({ type: 'periodEnd', period: match.period });
  freezeWorld(match.world);
  const tied = match.score[0] === match.score[1];
  switch (match.period) {
    case '1T':
      match.nextPeriod = '2T';
      showIntertitle(match, 'INTERVALO', 'FIM DO 1º TEMPO');
      break;
    case '2T':
      if (tied) {
        match.nextPeriod = 'PR1';
        showIntertitle(match, 'PRORROGACAO', 'PRORROGAÇÃO');
      } else {
        finish(match);
      }
      break;
    case 'PR1':
      match.nextPeriod = 'PR2';
      showIntertitle(match, 'INTERVALO', 'FIM DO 1º TEMPO DA PRORROGAÇÃO');
      break;
    case 'PR2':
      if (tied) {
        match.nextPeriod = null;
        showIntertitle(match, 'PENALTIS', 'PÊNALTIS');
      } else {
        finish(match);
      }
      break;
  }
}

function finish(match: Match): void {
  match.nextPeriod = null;
  match.events.push({ type: 'finalWhistle' });
  showIntertitle(match, 'FIM', 'FIM DE JOGO');
}

function registerGoal(match: Match, side: GoalSide): void {
  const world = match.world;
  const team = teamAttacking(world, side);
  const scorer = world.ball.lastTouch;
  const ownGoal = scorer !== null && getPlayer(world, scorer).team !== team;
  const goal: GoalRecord = { team, scorer, ownGoal, period: match.period, clock: match.clock };
  match.score[team]++;
  match.goals.push(goal);
  match.events.push({ type: 'goal', goal });
  match.phase = 'COMEMORACAO_GOL';
  match.phaseTimer = 0;
  // Saída de bola para quem tomou o gol.
  match.kickoffTeam = team === 0 ? 1 : 0;
  for (const h of world.humans) cancelCharge(h);
}

const IDLE_INPUTS: HumanInputs = [emptyCommand(), emptyCommand()];

/** Avança a partida um passo fixo. */
export function stepMatch(match: Match, inputs: HumanInputs, dt: number): void {
  match.phaseTimer += dt;
  const world = match.world;

  switch (match.phase) {
    case 'SAIDA_DE_BOLA':
      freezeWorld(world);
      if (match.phaseTimer < KICKOFF_DELAY) break;
      if (!match.kickoffLive) {
        match.kickoffLive = true;
        match.events.push({ type: 'whistle' });
      }
      stepKickoff(match, inputs[match.kickoffTeam], dt);
      break;

    case 'JOGANDO': {
      stepWorld(world, inputs, dt);
      if (world.goal !== null) {
        registerGoal(match, world.goal);
        break;
      }
      match.clock += dt;
      if (match.clock >= periodDuration(match.period) - 1e-9) {
        match.clock = periodDuration(match.period);
        endPeriod(match);
      }
      break;
    }

    case 'COMEMORACAO_GOL': {
      // A bola continua na rede e os jogadores param; ninguém joga.
      stepWorld(world, IDLE_INPUTS, dt);
      const skip =
        match.phaseTimer >= GOAL_CELEBRATION_SKIP_AFTER && (inputs[0].passPressed || inputs[1].passPressed);
      if (skip || match.phaseTimer >= GOAL_CELEBRATION_DURATION) setupKickoff(match, match.kickoffTeam);
      break;
    }

    case 'INTERVALO':
    case 'PRORROGACAO':
      freezeWorld(world);
      if (match.phaseTimer >= INTERTITLE_DURATION && match.nextPeriod) startPeriod(match, match.nextPeriod);
      break;

    case 'PENALTIS':
      freezeWorld(world);
      if (!match.shootout) {
        if (match.phaseTimer >= INTERTITLE_DURATION) {
          match.intertitle = null;
          match.shootout = createShootout();
          startAttempt(match);
        }
        break;
      }
      stepPenalties(match, inputs, dt);
      break;

    case 'FIM':
      freezeWorld(world);
      if (match.phaseTimer >= INTERTITLE_DURATION) match.over = true;
      break;
  }
}

// ---------------------------------------------------------------------------
// Pênaltis (todas as cobranças no gol da direita)
// ---------------------------------------------------------------------------

/** Gol das cobranças. */
export const PENALTY_GOAL: GoalSide = 1;
const PEN_GOAL_X = FIELD_LENGTH;
const PEN_SPOT_X = FIELD_LENGTH - PENALTY_SPOT_DISTANCE;

function setPos(p: { x: number; y: number; prevX: number; prevY: number; vx: number; vy: number }, x: number, y: number): void {
  p.x = x;
  p.y = y;
  p.prevX = x;
  p.prevY = y;
  p.vx = 0;
  p.vy = 0;
}

/** Arruma o cenário de uma cobrança: batedor na marca, goleiro na linha, os outros no meio. */
function startAttempt(match: Match): void {
  const s = match.shootout;
  if (!s) return;
  const world = match.world;
  const team = s.turn;
  const other: TeamIndex = team === 0 ? 1 : 0;
  const kicker = getPlayer(world, playerId(team, kickerRole(s, team)));
  const keeper = getPlayer(world, playerId(other, 'GK'));
  for (const k of world.keepers) {
    k.mode = 'position';
    k.timer = 0;
  }
  world.ballInHands = false;
  world.ball.owner = null;
  for (const h of world.humans) cancelCharge(h);

  // Os que não participam ficam em fila perto do círculo central.
  let i0 = 0;
  let i1 = 0;
  for (const p of world.players) {
    p.state = 'normal';
    if (p.id === kicker.id || p.id === keeper.id) continue;
    if (p.team === 0) setPos(p, 17.5 - (i0++ % 2) * 1.2, 6 + Math.floor((i0 - 1) / 2) * 1.6);
    else setPos(p, 22.5 + (i1++ % 2) * 1.2, 6 + Math.floor((i1 - 1) / 2) * 1.6);
    p.facing = 0;
  }
  setPos(kicker, PEN_SPOT_X - DRIBBLE_OFFSET - 0.25, FIELD_CENTER_Y);
  kicker.facing = 0;
  setPos(keeper, PEN_GOAL_X - GK_LINE_OFFSET * 0.6, FIELD_CENTER_Y);
  keeper.facing = Math.PI;
  placeBall(world.ball, PEN_SPOT_X, FIELD_CENTER_Y, 0);
  world.controlled = [team === 0 ? kicker.id : playerId(0, 'ATA'), team === 1 ? kicker.id : playerId(1, 'ATA')];

  match.attempt = {
    team,
    kicker: kicker.id,
    keeper: keeper.id,
    phase: 'setup',
    timer: 0,
    aimTime: 0,
    cursor: 0,
    charging: false,
    charge: 0,
    plan: null,
  };
}

/** Deslocamento lateral (m) do goleiro para cada zona. */
const ZONE_OFFSET: Readonly<Record<PenaltyZone, number>> = { L: -1, C: 0, R: 1 };

function stepPenalties(match: Match, inputs: HumanInputs, dt: number): void {
  const s = match.shootout;
  const a = match.attempt;
  if (!s || !a) return;
  const world = match.world;
  const ball = world.ball;
  const keeper = getPlayer(world, a.keeper);
  const keeperState = world.keepers[keeper.team];
  a.timer += dt;

  switch (a.phase) {
    case 'setup':
      if (a.timer >= PEN_SETUP_TIME) {
        a.phase = 'aiming';
        a.timer = 0;
        match.events.push({ type: 'whistle' });
      }
      return;

    case 'aiming': {
      const power = updateAiming(a, inputs[a.team], dt);
      if (power === null) return;
      a.plan = resolvePenalty(effectiveAim(a), power, world.rng);
      a.phase = 'flight';
      a.timer = 0;
      a.charging = false;
      match.events.push({ type: 'penaltyKick', team: a.team });
      // O goleiro mergulha para a zona escolhida.
      if (a.plan.keeperZone !== 'C') {
        keeperState.mode = 'dive';
        keeperState.timer = 0;
        keeperState.diveX = 0;
        keeperState.diveY = ZONE_OFFSET[a.plan.keeperZone];
      }
      return;
    }

    case 'flight': {
      const plan = a.plan;
      if (!plan) return;
      const startX = PEN_SPOT_X;
      const endX = PEN_GOAL_X + 0.05;
      const endY = FIELD_CENTER_Y + plan.offset;
      const dist = Math.hypot(endX - startX, endY - FIELD_CENTER_Y);
      const T = dist / plan.speed;
      const u = Math.min(1, a.timer / T);
      const prev = { x: ball.x, y: ball.y, z: ball.z };
      ball.x = lerp(startX, endX, u);
      ball.y = lerp(FIELD_CENTER_Y, endY, u);
      ball.z = plan.height * u + 0.3 * plan.power * 4 * u * (1 - u);
      ball.prevX = prev.x;
      ball.prevY = prev.y;
      ball.prevZ = prev.z;
      // Goleiro desliza até a zona escolhida enquanto a bola viaja.
      const gy = FIELD_CENTER_Y + ZONE_OFFSET[plan.keeperZone] * Math.min(1, a.timer / Math.max(T, 0.25));
      keeper.prevX = keeper.x;
      keeper.prevY = keeper.y;
      keeper.y = gy;
      if (u < 1) return;

      // Chegou: aplica o resultado e deixa a física continuar.
      const vx = (endX - startX) / T;
      const vy = (endY - FIELD_CENTER_Y) / T;
      ball.lastTouch = a.kicker;
      if (plan.result === 'goal' || plan.reason === 'wide' || plan.reason === 'over') {
        ball.vx = vx;
        ball.vy = vy;
        ball.vz = 0;
        if (plan.result === 'goal') ball.x = Math.min(ball.x, PEN_GOAL_X + GOAL_DEPTH * 0.3);
      } else if (plan.speed <= GK_CATCH_MAX_SPEED) {
        ball.owner = keeper.id;
        world.ballInHands = true;
        keeper.facing = Math.PI;
        placeBallInHands(ball, keeper);
        world.events.push({ type: 'save', player: keeper.id, result: 'catch' });
      } else {
        ball.vx = -vx * 0.3;
        ball.vy = Math.sign(plan.offset || 1) * 5;
        ball.vz = 2.5;
        world.events.push({ type: 'save', player: keeper.id, result: 'parry' });
      }
      a.phase = 'result';
      a.timer = 0;
      match.events.push({ type: 'penaltyResult', team: a.team, result: plan.result });
      return;
    }

    case 'result':
      if (ball.owner === null) stepLooseBallPhysics(world, dt);
      else placeBallInHands(ball, keeper);
      if (a.timer >= PEN_RESULT_TIME && a.plan) {
        recordKick(s, a.plan.result);
        if (s.winner !== null) {
          match.attempt = null;
          finish(match);
        } else {
          startAttempt(match);
        }
      }
      return;
  }
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/** Relógio no formato do placar: "01:12". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds + 1e-6));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
