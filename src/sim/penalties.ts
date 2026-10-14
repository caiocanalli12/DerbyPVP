/**
 * Disputa de pênaltis (lógica pura).
 *
 * - Série de PEN_SERIES cobranças alternadas (J1 começa); encerra antes se um time não
 *   puder mais alcançar o outro; persistindo o empate, cobranças alternadas em morte súbita.
 * - Batedores em rodízio: Atacante, Ala esquerdo, Ala direito, Fixo e repete.
 * - Batedor (humano): cursor de mira com balanço automático, carga = força, prazo de 5 s.
 * - Goleiro (IA aleatória): escolhe esquerda/centro/direita (40/20/40) no momento do chute.
 */
import {
  BALL_RADIUS,
  GOAL_WIDTH,
  PEN_CURSOR_LIMIT,
  PEN_CURSOR_SPEED,
  PEN_GK_CENTER,
  PEN_GK_LEFT,
  PEN_MAX_HEIGHT,
  PEN_MIN_HEIGHT,
  PEN_OUTER_FRACTION,
  PEN_OVER_HEIGHT,
  PEN_OVER_MAX_CHANCE,
  PEN_OVER_START,
  PEN_SERIES,
  PEN_STRONG_PASS_CHANCE,
  PEN_STRONG_POWER,
  PEN_SWAY_AMPLITUDE,
  PEN_SWAY_HZ,
  PEN_TIME_LIMIT,
  PEN_WEAK_POWER,
  SHOT_CHARGE_TIME,
  SHOT_MAX_SPEED,
  SHOT_MIN_SPEED,
} from '../config/constants';
import type { Rng } from '../core/rng';
import type { AimDir, TeamCommand } from './command';
import type { Role, TeamIndex } from './player';
import { lerp } from './vec';

export type PenaltyResult = 'goal' | 'saved' | 'miss';

/** Zona do gol do ponto de vista do batedor (esquerda = y menor no gol da direita). */
export type PenaltyZone = 'L' | 'C' | 'R';

/** Rodízio dos batedores. */
export const PENALTY_ROTATION: readonly Exclude<Role, 'GK'>[] = ['ATA', 'ALA_E', 'ALA_D', 'FIXO'];

export interface Shootout {
  kicks: [PenaltyResult[], PenaltyResult[]];
  /** Time que bate a próxima cobrança. */
  turn: TeamIndex;
  winner: TeamIndex | null;
}

export function createShootout(): Shootout {
  return { kicks: [[], []], turn: 0, winner: null };
}

export function goalsOf(s: Shootout, team: TeamIndex): number {
  return s.kicks[team].filter((k) => k === 'goal').length;
}

/** Quem bate a próxima cobrança do time (rodízio). */
export function kickerRole(s: Shootout, team: TeamIndex): Exclude<Role, 'GK'> {
  return PENALTY_ROTATION[s.kicks[team].length % PENALTY_ROTATION.length]!;
}

export function isSuddenDeath(s: Shootout): boolean {
  return s.kicks[0].length >= PEN_SERIES && s.kicks[1].length >= PEN_SERIES;
}

/** Calcula o vencedor, se a disputa já estiver decidida. */
export function decideWinner(s: Shootout): TeamIndex | null {
  const [ta, tb] = [s.kicks[0].length, s.kicks[1].length];
  const [ga, gb] = [goalsOf(s, 0), goalsOf(s, 1)];
  if (ta <= PEN_SERIES && tb <= PEN_SERIES && !(ta === PEN_SERIES && tb === PEN_SERIES && ga === gb)) {
    // Série regular: decide quando um não alcança mais o outro.
    const remA = PEN_SERIES - ta;
    const remB = PEN_SERIES - tb;
    if (ga + remA < gb) return 1;
    if (gb + remB < ga) return 0;
    if (ta === PEN_SERIES && tb === PEN_SERIES && ga !== gb) return ga > gb ? 0 : 1;
    return null;
  }
  // Morte súbita: só decide com o mesmo número de cobranças.
  if (ta === tb && ga !== gb) return ga > gb ? 0 : 1;
  return null;
}

/** Registra uma cobrança do time da vez e passa a vez. */
export function recordKick(s: Shootout, result: PenaltyResult): void {
  if (s.winner !== null) return;
  s.kicks[s.turn].push(result);
  s.winner = decideWinner(s);
  s.turn = s.turn === 0 ? 1 : 0;
}

/** Zona de uma posição lateral (m, relativa ao centro do gol; negativa = esquerda do batedor). */
export function zoneOf(offset: number): PenaltyZone {
  const third = GOAL_WIDTH / 6;
  if (offset < -third) return 'L';
  if (offset > third) return 'R';
  return 'C';
}

/** Sorteia o lado do goleiro: esquerda / centro / direita com 40 / 20 / 40. */
export function pickKeeperZone(rng: Rng): PenaltyZone {
  const r = rng.next();
  if (r < PEN_GK_LEFT) return 'L';
  if (r < PEN_GK_LEFT + PEN_GK_CENTER) return 'C';
  return 'R';
}

/** A bola está nos 15% externos da largura do gol (de cada lado)? */
export function inOuterBand(offset: number): boolean {
  return Math.abs(offset) > GOAL_WIDTH / 2 - GOAL_WIDTH * PEN_OUTER_FRACTION;
}

/** Altura (m) da bola na linha do gol para uma força (sem isolar). */
export function penaltyHeight(power: number): number {
  return lerp(PEN_MIN_HEIGHT, PEN_MAX_HEIGHT, Math.min(power, PEN_OVER_START) / PEN_OVER_START);
}

export interface PenaltyShotPlan {
  /** Posição lateral final (m, relativa ao centro do gol). */
  offset: number;
  /** Altura na linha do gol (m). */
  height: number;
  power: number;
  speed: number;
  keeperZone: PenaltyZone;
  result: PenaltyResult;
  /** Detalhe para o desenho. */
  reason: 'goal' | 'saved' | 'wide' | 'over' | 'strongPass' | 'outer';
}

/**
 * Resolve uma cobrança no momento do chute.
 * - Fora da boca (com o balanço) ou isolada (> 90% de força): perdida.
 * - Goleiro escolheu a zona da bola: defende, exceto se a bola estiver nos 15% externos
 *   (chute fraco ele alcança mesmo lá) ou se for muito forte (35% de chance de passar).
 */
export function resolvePenalty(offset: number, power: number, rng: Rng): PenaltyShotPlan {
  const p = Math.max(0, Math.min(1, power));
  const speed = lerp(SHOT_MIN_SPEED, SHOT_MAX_SPEED, p);
  const keeperZone = pickKeeperZone(rng);
  let height = penaltyHeight(p);
  const base = { offset, power: p, speed, keeperZone };

  if (Math.abs(offset) > GOAL_WIDTH / 2 - BALL_RADIUS) {
    return { ...base, height, result: 'miss', reason: 'wide' };
  }
  if (p > PEN_OVER_START) {
    const chance = ((p - PEN_OVER_START) / (1 - PEN_OVER_START)) * PEN_OVER_MAX_CHANCE;
    if (rng.chance(chance)) {
      height = PEN_OVER_HEIGHT;
      return { ...base, height, result: 'miss', reason: 'over' };
    }
  }
  if (keeperZone === zoneOf(offset)) {
    if (inOuterBand(offset) && p >= PEN_WEAK_POWER) return { ...base, height, result: 'goal', reason: 'outer' };
    if (p >= PEN_STRONG_POWER && rng.chance(PEN_STRONG_PASS_CHANCE)) {
      return { ...base, height, result: 'goal', reason: 'strongPass' };
    }
    return { ...base, height, result: 'saved', reason: 'saved' };
  }
  return { ...base, height, result: 'goal', reason: 'goal' };
}

// ---------------------------------------------------------------------------
// Uma cobrança em andamento (mira, carga e prazo)
// ---------------------------------------------------------------------------

export type AttemptPhase = 'setup' | 'aiming' | 'flight' | 'result';

export interface PenaltyAttempt {
  team: TeamIndex;
  kicker: number;
  keeper: number;
  phase: AttemptPhase;
  /** Tempo na fase atual (s). */
  timer: number;
  /** Tempo mirando (para o prazo e o balanço). */
  aimTime: number;
  /** Cursor (m, relativo ao centro do gol; negativo = esquerda do batedor). */
  cursor: number;
  charging: boolean;
  charge: number;
  plan: PenaltyShotPlan | null;
}

/** Balanço automático do cursor no instante `t` (s). */
export function cursorSway(t: number): number {
  return Math.sin(t * PEN_SWAY_HZ * Math.PI * 2) * PEN_SWAY_AMPLITUDE;
}

/** Mira efetiva: cursor + balanço. */
export function effectiveAim(a: PenaltyAttempt): number {
  return a.cursor + cursorSway(a.aimTime);
}

/** Mira pelo direcional: esquerda ou cima = -1, direita ou baixo = +1 (as duas = 0). */
export function aimDirFromMove(moveX: number, moveY: number): AimDir {
  return ((moveX > 0 || moveY > 0 ? 1 : 0) - (moveX < 0 || moveY < 0 ? 1 : 0)) as AimDir;
}

/**
 * Atualiza a mira e a carga com o comando do batedor. Esquerda (ou cima) move o cursor para
 * a esquerda do batedor; direita (ou baixo), para a direita (`aimDir`, das teclas; sem ele, o
 * direcional). Devolve a força se chutou.
 */
export function updateAiming(a: PenaltyAttempt, input: TeamCommand, dt: number): number | null {
  a.aimTime += dt;
  const dir = input.aimDir ?? aimDirFromMove(input.moveX, input.moveY);
  a.cursor = Math.max(-PEN_CURSOR_LIMIT, Math.min(PEN_CURSOR_LIMIT, a.cursor + dir * PEN_CURSOR_SPEED * dt));

  if (!a.charging && input.shootPressed) {
    a.charging = true;
    a.charge = 0;
  }
  if (a.charging) {
    if (input.shootHeld) a.charge = Math.min(1, a.charge + dt / SHOT_CHARGE_TIME);
    else return a.charge;
  }
  if (a.aimTime >= PEN_TIME_LIMIT) return a.charge;
  return null;
}
