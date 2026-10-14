/**
 * Campeonato do modo solo: chave mata-mata de 8 times (lógica pura, com RNG de semente).
 *
 * - O jogador fica na vaga 0; os outros 7 times são sorteados nas demais vagas das quartas
 *   (o jogo k das quartas é entre as vagas 2k e 2k+1). Como a vaga 0 sempre leva ao jogo 0 da
 *   rodada seguinte, o jogo do jogador é sempre o primeiro de cada fase.
 * - Fase por fase: o jogo do jogador é disputado de verdade; os outros da fase são simulados
 *   (gols de cada time por Poisson e, no empate, uma disputa de pênaltis com as mesmas regras da
 *   partida). Todo jogo tem um vencedor.
 * - Derrota = eliminação: o resto do campeonato é simulado (para a chave final). Vencer a final = título.
 *
 * As funções não mudam o campeonato recebido: devolvem um novo.
 */
import {
  CHAMPIONSHIP_LEVELS,
  TOURNAMENT_GOALS_MEAN,
  TOURNAMENT_PEN_SCORE_CHANCE,
} from '../config/constants';
import { Rng } from '../core/rng';
import { TEAMS } from '../data/teams';
import type { TeamId } from '../data/teams';
import type { CpuLevel } from './cpu';
import { createShootout, goalsOf, recordKick } from './penalties';

/** Dificuldade escolhida para o campeonato (define o nível do CPU em cada fase). */
export type ChampionshipDifficulty = keyof typeof CHAMPIONSHIP_LEVELS;

export const CHAMPIONSHIP_DIFFICULTIES: readonly ChampionshipDifficulty[] = ['facil', 'dificil'];

/** Fases: quartas (4 jogos), semifinal (2) e final (1). */
export const ROUND_COUNT = 3;
export const ROUND_NAMES: readonly string[] = ['QUARTAS DE FINAL', 'SEMIFINAL', 'FINAL'];

export interface MatchResult {
  /** Na ordem da chave (o de cima primeiro). */
  teams: [TeamId, TeamId];
  score: [number, number];
  /** Gols na disputa de pênaltis (só no empate). */
  penalties: [number, number] | null;
  winner: 0 | 1;
  /** Jogo simulado (todos menos os do jogador). */
  simulated: boolean;
}

export type ChampionshipStatus = 'playing' | 'eliminated' | 'champion';

export interface Tournament {
  readonly seed: number;
  readonly player: TeamId;
  readonly difficulty: ChampionshipDifficulty;
  /** Os 8 times na ordem da chave (o jogador na vaga 0). */
  readonly bracket: readonly TeamId[];
  /** Resultados por fase (0 = quartas, 1 = semifinal, 2 = final); null = ainda não jogado. */
  readonly results: readonly (readonly (MatchResult | null)[])[];
  /** Fase do próximo jogo do jogador (ROUND_COUNT quando o campeonato acabou para ele). */
  readonly round: number;
  readonly status: ChampionshipStatus;
  /** Estado do RNG dos jogos simulados (continua de onde parou). */
  readonly rngState: number;
}

/** Resultado do jogo do jogador, do ponto de vista da partida (o jogador é sempre o J1, o time 0). */
export interface PlayerMatchResult {
  score: [number, number];
  penalties: [number, number] | null;
  winner: 0 | 1;
}

/** Quantos jogos tem a fase. */
export function matchesInRound(round: number): number {
  return 4 >> round;
}

/** Sorteia a chave: o jogador na vaga 0 e os outros 7 times embaralhados nas demais. */
export function createTournament(player: TeamId, difficulty: ChampionshipDifficulty, seed: number): Tournament {
  const rng = new Rng(seed);
  const others = TEAMS.map((t) => t.id).filter((id) => id !== player);
  for (let i = others.length - 1; i > 0; i--) {
    const k = rng.int(0, i);
    [others[i], others[k]] = [others[k]!, others[i]!];
  }
  return {
    seed,
    player,
    difficulty,
    bracket: [player, ...others],
    results: Array.from({ length: ROUND_COUNT }, (_, r) => Array<MatchResult | null>(matchesInRound(r)).fill(null)),
    round: 0,
    status: 'playing',
    rngState: rng.getState(),
  };
}

/** Times de cada jogo da fase (null onde a fase anterior ainda não tem vencedor). */
export function roundPairs(t: Tournament, round: number): ([TeamId, TeamId] | null)[] {
  if (round === 0) {
    return Array.from({ length: 4 }, (_, k) => [t.bracket[2 * k]!, t.bracket[2 * k + 1]!] as [TeamId, TeamId]);
  }
  const prev = t.results[round - 1]!;
  return Array.from({ length: matchesInRound(round) }, (_, k) => {
    const a = prev[2 * k];
    const b = prev[2 * k + 1];
    return a && b ? [winnerOf(a), winnerOf(b)] : null;
  });
}

export function winnerOf(r: MatchResult): TeamId {
  return r.teams[r.winner];
}

/** Adversário do jogador no próximo jogo (null se o campeonato acabou para ele). */
export function nextOpponent(t: Tournament): TeamId | null {
  if (t.status !== 'playing') return null;
  const pair = roundPairs(t, t.round)[0];
  return pair ? pair[1] : null;
}

/** Nível do CPU no próximo jogo do jogador. */
export function opponentLevel(t: Tournament): CpuLevel {
  return CHAMPIONSHIP_LEVELS[t.difficulty][Math.min(t.round, ROUND_COUNT - 1)]!;
}

/** Campeão (vencedor da final), se já houver. */
export function championOf(t: Tournament): TeamId | null {
  const f = t.results[ROUND_COUNT - 1]![0];
  return f ? winnerOf(f) : null;
}

/** Sorteio de Poisson com média `mean` (Knuth). */
export function poisson(rng: Rng, mean: number): number {
  const limit = Math.exp(-mean);
  let k = 0;
  let p = rng.next();
  while (p > limit) {
    k++;
    p *= rng.next();
  }
  return k;
}

/**
 * Simula um jogo: gols de cada time por Poisson e, no empate, uma disputa de pênaltis (5 cobranças
 * alternadas, encerrando antes se não der mais para alcançar, depois morte súbita).
 */
export function simulateMatch(a: TeamId, b: TeamId, rng: Rng): MatchResult {
  const score: [number, number] = [poisson(rng, TOURNAMENT_GOALS_MEAN), poisson(rng, TOURNAMENT_GOALS_MEAN)];
  if (score[0] !== score[1]) return { teams: [a, b], score, penalties: null, winner: score[0] > score[1] ? 0 : 1, simulated: true };
  const s = createShootout();
  while (s.winner === null) recordKick(s, rng.chance(TOURNAMENT_PEN_SCORE_CHANCE) ? 'goal' : 'miss');
  return { teams: [a, b], score, penalties: [goalsOf(s, 0), goalsOf(s, 1)], winner: s.winner, simulated: true };
}

/** Simula os jogos ainda sem resultado da fase (o do jogador nunca: ele já foi registrado). */
function simulateRound(results: (MatchResult | null)[][], t: Tournament, round: number, rng: Rng): void {
  const pairs = roundPairs({ ...t, results }, round);
  pairs.forEach((pair, k) => {
    if (results[round]![k] || !pair) return;
    results[round]![k] = simulateMatch(pair[0], pair[1], rng);
  });
}

/**
 * Registra o jogo do jogador na fase atual e simula os outros jogos da fase. Perdeu: eliminado (e o
 * resto do campeonato é simulado). Ganhou a final: campeão.
 */
export function recordPlayerMatch(t: Tournament, r: PlayerMatchResult): Tournament {
  if (t.status !== 'playing') return t;
  const opponent = nextOpponent(t);
  if (!opponent) throw new Error('campeonato sem adversário para o jogador');
  const rng = new Rng(0);
  rng.setState(t.rngState);
  const results = t.results.map((round) => [...round]);
  results[t.round]![0] = {
    teams: [t.player, opponent],
    score: [r.score[0], r.score[1]],
    penalties: r.penalties ? [r.penalties[0], r.penalties[1]] : null,
    winner: r.winner,
    simulated: false,
  };
  simulateRound(results, t, t.round, rng);
  let status: ChampionshipStatus = 'playing';
  let round = t.round + 1;
  if (r.winner !== 0) {
    status = 'eliminated';
    for (let k = t.round + 1; k < ROUND_COUNT; k++) simulateRound(results, t, k, rng);
    round = ROUND_COUNT;
  } else if (t.round === ROUND_COUNT - 1) {
    status = 'champion';
  }
  return { ...t, results, round, status, rngState: rng.getState() };
}

/** O que aparece na chave (o cartaz em `render/BracketView` só desenha isto). */
export interface BracketState {
  /** Times visíveis de cada jogo, por fase (null = vaga ainda vazia). */
  teams: (readonly [TeamId | null, TeamId | null])[][];
  /** Placar visível de cada jogo (null = ainda não jogado ou ainda escondido). */
  results: (MatchResult | null)[][];
  player: TeamId;
  /** Campeão (a placa da final brilha). */
  champion: TeamId | null;
}

/** Estado da chave com os resultados que `visible(fase, jogo)` deixa ver. */
export function visibleState(t: Tournament, visible: (round: number, k: number) => boolean): BracketState {
  const teams: (readonly [TeamId | null, TeamId | null])[][] = [];
  const results: (MatchResult | null)[][] = [];
  for (let r = 0; r < ROUND_COUNT; r++) {
    const row: (readonly [TeamId | null, TeamId | null])[] = [];
    const res: (MatchResult | null)[] = [];
    for (let k = 0; k < matchesInRound(r); k++) {
      if (r === 0) {
        row.push(roundPairs(t, 0)[k]!);
      } else {
        const feed = (i: number): TeamId | null => {
          const prev = t.results[r - 1]![i];
          return prev && visible(r - 1, i) ? winnerOf(prev) : null;
        };
        row.push([feed(2 * k), feed(2 * k + 1)]);
      }
      const result = t.results[r]![k] ?? null;
      res.push(result && visible(r, k) ? result : null);
    }
    teams.push(row);
    results.push(res);
  }
  const final = results[ROUND_COUNT - 1]![0];
  return { teams, results, player: t.player, champion: final ? winnerOf(final) : null };
}

/** "INT 2 × 1 CHE" ou "MIL 1 × 1 LIV (pên. 4 × 3)". */
export function formatResult(r: MatchResult, short: (id: TeamId) => string): string {
  const base = `${short(r.teams[0])} ${r.score[0]} × ${r.score[1]} ${short(r.teams[1])}`;
  return r.penalties ? `${base} (pên. ${r.penalties[0]} × ${r.penalties[1]})` : base;
}
