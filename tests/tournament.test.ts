import { describe, expect, it } from 'vitest';
import { TOURNAMENT_GOALS_MEAN } from '../src/config/constants';
import { Rng } from '../src/core/rng';
import { TEAMS } from '../src/data/teams';
import type { TeamId } from '../src/data/teams';
import {
  championOf,
  createTournament,
  formatResult,
  matchesInRound,
  nextOpponent,
  opponentLevel,
  poisson,
  recordPlayerMatch,
  ROUND_COUNT,
  roundPairs,
  simulateMatch,
  visibleState,
} from '../src/sim/tournament';
import type { MatchResult, PlayerMatchResult, Tournament } from '../src/sim/tournament';

const WIN: PlayerMatchResult = { score: [2, 1], penalties: null, winner: 0 };
const LOSS: PlayerMatchResult = { score: [0, 1], penalties: null, winner: 1 };
const PEN_WIN: PlayerMatchResult = { score: [1, 1], penalties: [4, 3], winner: 0 };

/** Todos os jogos já decididos do campeonato. */
function played(t: Tournament): MatchResult[] {
  return t.results.flat().filter((r): r is MatchResult => r !== null);
}

/** O vencedor confere com o placar (ou com os pênaltis, no empate). */
function expectConsistent(r: MatchResult): void {
  if (r.score[0] !== r.score[1]) {
    expect(r.penalties).toBeNull();
    expect(r.winner).toBe(r.score[0] > r.score[1] ? 0 : 1);
  } else {
    expect(r.penalties).not.toBeNull();
    expect(r.penalties![0]).not.toBe(r.penalties![1]);
    expect(r.winner).toBe(r.penalties![0] > r.penalties![1] ? 0 : 1);
  }
}

describe('chave do campeonato', () => {
  it('sempre 8 times distintos, com o jogador na primeira vaga', () => {
    for (const team of TEAMS) {
      for (let seed = 1; seed <= 50; seed++) {
        const t = createTournament(team.id, 'facil', seed);
        expect(t.bracket).toHaveLength(8);
        expect(new Set(t.bracket).size).toBe(8);
        expect([...t.bracket].sort()).toEqual(TEAMS.map((x) => x.id).sort());
        expect(t.bracket[0]).toBe(team.id);
      }
    }
  });

  it('o sorteio varia com a semente e se repete com a mesma semente', () => {
    const draws = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) draws.add(createTournament('PAL', 'dificil', seed).bracket.join(','));
    expect(draws.size).toBeGreaterThan(20);
    expect(createTournament('PAL', 'dificil', 7)).toEqual(createTournament('PAL', 'dificil', 7));
  });

  it('quartas, semifinal e final; o adversário é o par do jogador', () => {
    const t = createTournament('COR', 'facil', 3);
    expect([0, 1, 2].map(matchesInRound)).toEqual([4, 2, 1]);
    const pairs = roundPairs(t, 0);
    expect(pairs).toHaveLength(4);
    expect(pairs[0]).toEqual(['COR', t.bracket[1]]);
    expect(nextOpponent(t)).toBe(t.bracket[1]);
    expect(roundPairs(t, 1)).toEqual([null, null]);
  });

  it('nível do adversário: FÁCIL = Fácil, Médio, Médio; DIFÍCIL = Fácil, Médio, Difícil', () => {
    for (const [difficulty, levels] of [
      ['facil', ['facil', 'medio', 'medio']],
      ['dificil', ['facil', 'medio', 'dificil']],
    ] as const) {
      let t = createTournament('BAR', difficulty, 11);
      const seen: string[] = [];
      for (let r = 0; r < ROUND_COUNT; r++) {
        seen.push(opponentLevel(t));
        t = recordPlayerMatch(t, WIN);
      }
      expect(seen).toEqual(levels);
    }
  });
});

describe('jogos simulados', () => {
  it('gols por Poisson com média 1,4', () => {
    const rng = new Rng(99);
    let sum = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) sum += poisson(rng, TOURNAMENT_GOALS_MEAN);
    expect(sum / n).toBeGreaterThan(TOURNAMENT_GOALS_MEAN - 0.05);
    expect(sum / n).toBeLessThan(TOURNAMENT_GOALS_MEAN + 0.05);
  });

  it('todo jogo simulado tem vencedor; empate vai para os pênaltis', () => {
    const rng = new Rng(5);
    let ties = 0;
    for (let i = 0; i < 2000; i++) {
      const r = simulateMatch('INT', 'CHE', rng);
      expect(r.simulated).toBe(true);
      expectConsistent(r);
      if (r.penalties) {
        ties++;
        // Houve cobranças (a disputa sempre termina com um vencedor).
        const total = r.penalties[0] + r.penalties[1];
        expect(total).toBeGreaterThan(0);
      }
    }
    // Poisson(1,4) x Poisson(1,4): empate em ~26% dos jogos.
    expect(ties / 2000).toBeGreaterThan(0.2);
    expect(ties / 2000).toBeLessThan(0.32);
  });

  it('formato do placar: "INT 2 × 1 CHE" e "MIL 1 × 1 LIV (pên. 4 × 3)"', () => {
    const id = (x: TeamId): string => x;
    expect(formatResult({ teams: ['INT', 'CHE'], score: [2, 1], penalties: null, winner: 0, simulated: true }, id)).toBe('INT 2 × 1 CHE');
    expect(formatResult({ teams: ['MIL', 'LIV'], score: [1, 1], penalties: [4, 3], winner: 0, simulated: true }, id)).toBe(
      'MIL 1 × 1 LIV (pên. 4 × 3)',
    );
  });
});

describe('campeonato fase a fase', () => {
  it('o jogador nunca é simulado; os outros jogos da fase são, e todos têm vencedor', () => {
    for (let seed = 1; seed <= 40; seed++) {
      let t = createTournament('LIV', seed % 2 ? 'facil' : 'dificil', seed);
      for (let r = 0; r < ROUND_COUNT; r++) {
        t = recordPlayerMatch(t, r === 1 ? PEN_WIN : WIN);
        // A fase jogada está completa.
        expect(t.results[r]!.every((x) => x !== null)).toBe(true);
        for (const res of played(t)) {
          expectConsistent(res);
          const hasPlayer = res.teams.includes('LIV');
          expect(res.simulated).toBe(!hasPlayer);
        }
      }
      expect(t.status).toBe('champion');
      expect(championOf(t)).toBe('LIV');
      expect(played(t)).toHaveLength(7);
    }
  });

  it('o jogo do jogador fica registrado como ele terminou', () => {
    const t = recordPlayerMatch(createTournament('MIL', 'facil', 4), PEN_WIN);
    const r = t.results[0]![0]!;
    expect(r.teams).toEqual(['MIL', t.bracket[1]]);
    expect(r.score).toEqual([1, 1]);
    expect(r.penalties).toEqual([4, 3]);
    expect(r.winner).toBe(0);
    expect(t.round).toBe(1);
    expect(t.status).toBe('playing');
    // O próximo adversário é o vencedor do outro jogo da chave.
    const other = t.results[0]![1]!;
    expect(nextOpponent(t)).toBe(other.teams[other.winner]);
  });

  it('derrota elimina: sem segunda chance, e o resto do campeonato é simulado', () => {
    let t = createTournament('RMA', 'dificil', 8);
    t = recordPlayerMatch(t, WIN);
    t = recordPlayerMatch(t, LOSS);
    expect(t.status).toBe('eliminated');
    expect(nextOpponent(t)).toBeNull();
    expect(played(t)).toHaveLength(7);
    expect(championOf(t)).not.toBe('RMA');
    expect(championOf(t)).not.toBeNull();
    // Depois de eliminado, nada muda.
    expect(recordPlayerMatch(t, WIN)).toBe(t);
  });

  it('não muda o campeonato recebido', () => {
    const t = createTournament('CHE', 'facil', 12);
    const copy = JSON.parse(JSON.stringify(t)) as Tournament;
    recordPlayerMatch(t, WIN);
    expect(t).toEqual(copy);
  });

  it('a mesma semente (e os mesmos jogos do jogador) dá o mesmo campeonato', () => {
    const run = (seed: number): Tournament => {
      let t = createTournament('INT', 'dificil', seed);
      t = recordPlayerMatch(t, WIN);
      t = recordPlayerMatch(t, PEN_WIN);
      return recordPlayerMatch(t, LOSS);
    };
    expect(run(21)).toEqual(run(21));
    expect(JSON.stringify(run(21))).not.toBe(JSON.stringify(run(22)));
  });
});

describe('o que a chave mostra', () => {
  it('antes do jogo: só as quartas, sem placar e sem campeão', () => {
    const t = createTournament('PAL', 'facil', 2);
    const s = visibleState(t, () => true);
    expect(s.teams[0]).toEqual(roundPairs(t, 0));
    expect(s.teams[1]).toEqual([
      [null, null],
      [null, null],
    ]);
    expect(s.results.flat().every((r) => r === null)).toBe(true);
    expect(s.champion).toBeNull();
    expect(s.player).toBe('PAL');
  });

  it('resultado escondido não mostra o placar nem quem avançou', () => {
    const t = recordPlayerMatch(createTournament('PAL', 'facil', 2), WIN);
    // Só o jogo do jogador visível (os outros da fase ainda vão aparecer).
    const s = visibleState(t, (r, k) => r === 0 && k === 0);
    expect(s.results[0]![0]).toEqual(t.results[0]![0]);
    expect(s.results[0]!.slice(1)).toEqual([null, null, null]);
    expect(s.teams[1]![0]).toEqual(['PAL', null]);
    expect(s.teams[1]![1]).toEqual([null, null]);
    // Tudo visível: a semifinal já tem os dois times.
    const all = visibleState(t, () => true);
    expect(all.teams[1]![0]![1]).toBe(nextOpponent(t));
  });

  it('o campeão só aparece quando a final está visível', () => {
    let t = createTournament('BAR', 'dificil', 6);
    for (let r = 0; r < ROUND_COUNT; r++) t = recordPlayerMatch(t, WIN);
    expect(visibleState(t, () => true).champion).toBe('BAR');
    expect(visibleState(t, (r) => r < ROUND_COUNT - 1).champion).toBeNull();
  });
});
