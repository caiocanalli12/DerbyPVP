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
  GOAL_CELEBRATION_DURATION,
  GOAL_CELEBRATION_SKIP_AFTER,
  HALF_DURATION,
  INTERTITLE_DURATION,
  KICKOFF_DEFENDER_DISTANCE,
  KICKOFF_DELAY,
} from '../config/constants';
import { emptyPlayerInput } from '../core/input';
import { FIELD_CENTER_X, FIELD_CENTER_Y } from './field';
import type { GoalSide } from './field';
import type { TeamIndex } from './player';
import { attackDir, createWorld, getPlayer, givePossession, playerId, resetToFormation, stepWorld } from './world';
import type { HumanInputs, World } from './world';
import { cancelCharge } from './control';

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
  | { type: 'finalWhistle' };

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
  /** Texto do cartão de intertítulo em exibição (ou null). */
  intertitle: string | null;
  /** Próximo período depois do cartão de INTERVALO/PRORROGACAO. */
  nextPeriod: Period | null;
  /** A partida terminou (depois do cartão de FIM). */
  over: boolean;
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
    intertitle: null,
    nextPeriod: null,
    over: false,
    events: [],
  };
  setupKickoff(match, 0);
  return match;
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
 * `team`, e o atacante adversário fora do círculo central.
 */
export function setupKickoff(match: Match, team: TeamIndex): void {
  const world = match.world;
  resetToFormation(world);
  match.kickoffTeam = team;
  match.phase = 'SAIDA_DE_BOLA';
  match.phaseTimer = 0;

  const kicker = getPlayer(world, playerId(team, 'ATA'));
  const dir = attackDir(world, team);
  kicker.x = FIELD_CENTER_X - dir * DRIBBLE_OFFSET;
  kicker.y = FIELD_CENTER_Y;
  kicker.prevX = kicker.x;
  kicker.prevY = kicker.y;
  kicker.facing = dir === 1 ? 0 : Math.PI;

  const other: TeamIndex = team === 0 ? 1 : 0;
  const rival = getPlayer(world, playerId(other, 'ATA'));
  rival.x = FIELD_CENTER_X + dir * KICKOFF_DEFENDER_DISTANCE;
  rival.y = FIELD_CENTER_Y;
  rival.prevX = rival.x;
  rival.prevY = rival.y;

  world.controlled = [playerId(0, 'ATA'), playerId(1, 'ATA')];
  world.controlSwitchTimer = [0, 0];
  givePossession(world, kicker);
  // A posse inicial não é um "evento de jogo".
  world.events = world.events.filter((e) => e.type !== 'possession');
  // Bola parada exatamente à frente do batedor.
  world.ball.prevX = world.ball.x = kicker.x + Math.cos(kicker.facing) * DRIBBLE_OFFSET;
  world.ball.prevY = world.ball.y = kicker.y;
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

const IDLE_INPUTS: HumanInputs = [emptyPlayerInput(), emptyPlayerInput()];

/** Avança a partida um passo fixo. */
export function stepMatch(match: Match, inputs: HumanInputs, dt: number): void {
  match.phaseTimer += dt;
  const world = match.world;

  switch (match.phase) {
    case 'SAIDA_DE_BOLA':
      freezeWorld(world);
      if (match.phaseTimer >= KICKOFF_DELAY) {
        match.phase = 'JOGANDO';
        match.phaseTimer = 0;
        match.events.push({ type: 'whistle' });
      }
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
        match.phaseTimer >= GOAL_CELEBRATION_SKIP_AFTER && (inputs[0].pass.pressed || inputs[1].pass.pressed);
      if (skip || match.phaseTimer >= GOAL_CELEBRATION_DURATION) setupKickoff(match, match.kickoffTeam);
      break;
    }

    case 'INTERVALO':
    case 'PRORROGACAO':
      freezeWorld(world);
      if (match.phaseTimer >= INTERTITLE_DURATION && match.nextPeriod) startPeriod(match, match.nextPeriod);
      break;

    case 'PENALTIS':
      // Disputa de pênaltis entra na fase 9.
      freezeWorld(world);
      break;

    case 'FIM':
      freezeWorld(world);
      if (match.phaseTimer >= INTERTITLE_DURATION) match.over = true;
      break;
  }
}

/** Relógio no formato do placar: "01:12". */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds + 1e-6));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
