import { describe, expect, it } from 'vitest';
import {
  PEN_CURSOR_LIMIT,
  PEN_OVER_MAX_CHANCE,
  PEN_STRONG_PASS_CHANCE,
  PEN_TIME_LIMIT,
  SIM_DT,
} from '../src/config/constants';
import { emptyPlayerInput } from '../src/core/input';
import { Rng } from '../src/core/rng';
import { createMatch, matchWinner, stepMatch } from '../src/sim/match';
import type { Match } from '../src/sim/match';
import {
  createShootout,
  cursorSway,
  decideWinner,
  inOuterBand,
  kickerRole,
  pickKeeperZone,
  recordKick,
  resolvePenalty,
  updateAiming,
  zoneOf,
} from '../src/sim/penalties';
import type { PenaltyAttempt, PenaltyResult } from '../src/sim/penalties';
import type { HumanInputs } from '../src/sim/world';
import { withButtons } from './helpers/sim';

const G: PenaltyResult = 'goal';
const X: PenaltyResult = 'saved';

/** Aplica cobranças alternadas (J1, J2, J1, ...) até acabar a lista ou decidir. */
function play(seq: PenaltyResult[]) {
  const s = createShootout();
  for (const r of seq) {
    if (s.winner !== null) break;
    recordKick(s, r);
  }
  return s;
}

describe('série de pênaltis', () => {
  it('J1 começa e as cobranças alternam', () => {
    const s = createShootout();
    expect(s.turn).toBe(0);
    recordKick(s, G);
    expect(s.turn).toBe(1);
    recordKick(s, G);
    expect(s.turn).toBe(0);
  });

  it('rodízio: Atacante, Ala esquerdo, Ala direito, Fixo e repete', () => {
    const s = createShootout();
    const order: string[] = [];
    for (let i = 0; i < 6; i++) {
      order.push(kickerRole(s, 0));
      s.kicks[0].push(G);
    }
    expect(order).toEqual(['ATA', 'ALA_E', 'ALA_D', 'FIXO', 'ATA', 'ALA_E']);
  });

  it('série de 5: quem fizer mais vence', () => {
    // J1: G G G G X (4)  J2: G X G G G (4)? -> empate; ajusta para J2 errar 2.
    const s = play([G, G, G, X, G, G, G, G, X, X]);
    expect(s.kicks[0].length + s.kicks[1].length).toBe(10);
    expect(s.winner).toBe(0);
  });

  it('encerra antes quando um time não pode mais alcançar o outro', () => {
    // J1 faz 3, J2 perde 3: depois da 3ª do J2, J2 tem no máximo 2 < 3.
    const s = play([G, X, G, X, G, X, G, G, G, G]);
    expect(s.winner).toBe(0);
    expect(s.kicks[0].length).toBe(3);
    expect(s.kicks[1].length).toBe(3);
  });

  it('encerra no meio da rodada: J1 marca a 5ª e o J2 nem precisa bater', () => {
    // 4 rodadas: J1 3 gols, J2 2 gols. J1 marca a 5ª (4): J2 chegaria no máximo a 3.
    const s = play([G, G, G, X, G, X, X, G, G, G]);
    expect(s.winner).toBe(0);
    expect(s.kicks[0].length).toBe(5);
    expect(s.kicks[1].length).toBe(4);
  });

  it('não encerra antes da hora: com chance de empatar, a série continua', () => {
    // 4 rodadas: J1 3, J2 3; J1 erra a 5ª: J2 ainda pode vencer ou empatar.
    const s = play([G, G, G, G, G, G, X, X, X]);
    expect(s.winner).toBeNull();
  });

  it('empate na série vai para morte súbita alternada', () => {
    const s = play([G, G, G, G, G, G, G, G, G, G]);
    expect(s.winner).toBeNull();
    // Morte súbita: J1 erra, J2 ainda não bateu -> nada decidido.
    recordKick(s, X);
    expect(s.winner).toBeNull();
    recordKick(s, G);
    expect(s.winner).toBe(1);
  });

  it('morte súbita continua enquanto os dois fazem (ou erram) juntos', () => {
    const s = play([G, G, G, G, G, G, G, G, G, G, X, X, G, G, G, G]);
    expect(s.winner).toBeNull();
    recordKick(s, G);
    recordKick(s, X);
    expect(s.winner).toBe(0);
  });

  it('decideWinner não decide sem necessidade', () => {
    const s = createShootout();
    s.kicks = [[G, G], [G]];
    expect(decideWinner(s)).toBeNull();
  });
});

describe('cobrança', () => {
  it('goleiro escolhe esquerda/centro/direita com 40/20/40', () => {
    const rng = new Rng(11);
    const n = 20000;
    const c = { L: 0, C: 0, R: 0 };
    for (let i = 0; i < n; i++) c[pickKeeperZone(rng)]++;
    expect(c.L / n).toBeCloseTo(0.4, 1);
    expect(c.C / n).toBeCloseTo(0.2, 1);
    expect(c.R / n).toBeCloseTo(0.4, 1);
  });

  it('zonas: terços da largura do gol; faixa externa = 15% de cada lado', () => {
    expect(zoneOf(-1.2)).toBe('L');
    expect(zoneOf(0)).toBe('C');
    expect(zoneOf(0.7)).toBe('R');
    expect(inOuterBand(1.1)).toBe(true);
    expect(inOuterBand(-1.1)).toBe(true);
    expect(inOuterBand(1.0)).toBe(false);
  });

  /** Estatística do resultado para uma mira/força fixa. */
  function stats(offset: number, power: number, n = 4000) {
    const rng = new Rng(7);
    const r = { goal: 0, saved: 0, miss: 0, sameZoneGoals: 0, sameZone: 0, over: 0 };
    for (let i = 0; i < n; i++) {
      const p = resolvePenalty(offset, power, rng);
      r[p.result]++;
      if (p.reason === 'over') r.over++;
      if (p.keeperZone === zoneOf(offset) && p.reason !== 'over') {
        r.sameZone++;
        if (p.result === 'goal') r.sameZoneGoals++;
      }
    }
    return r;
  }

  it('defende quando escolhe a zona da bola (fora da faixa externa)', () => {
    const r = stats(-0.8, 0.6);
    expect(r.sameZone).toBeGreaterThan(0);
    expect(r.sameZoneGoals).toBe(0);
    // Zona errada: gol.
    expect(r.goal).toBe(4000 - r.sameZone);
  });

  it('bola nos 15% externos entra mesmo com o goleiro na zona certa', () => {
    const r = stats(1.2, 0.6);
    expect(r.sameZoneGoals).toBe(r.sameZone);
    expect(r.saved).toBe(0);
  });

  it('chute fraco (rasteiro) o goleiro alcança até na faixa externa', () => {
    const r = stats(1.2, 0.2);
    expect(r.saved).toBe(r.sameZone);
  });

  it('chute muito forte na zona certa passa ~35% das vezes', () => {
    const r = stats(-0.8, 0.85);
    expect(r.sameZoneGoals / r.sameZone).toBeCloseTo(PEN_STRONG_PASS_CHANCE, 1);
  });

  it('acima de 90% de força há risco crescente de isolar', () => {
    expect(stats(0, 0.9).over).toBe(0);
    const r95 = stats(0, 0.95).over / 4000;
    const r100 = stats(0, 1).over / 4000;
    expect(r95).toBeGreaterThan(0.15);
    expect(r100).toBeGreaterThan(r95);
    expect(r100).toBeCloseTo(PEN_OVER_MAX_CHANCE, 1);
  });

  it('mira fora da boca do gol é perdida', () => {
    expect(resolvePenalty(1.6, 0.5, new Rng(1)).result).toBe('miss');
  });

  it('força baixa = rasteiro; força alta = mais rápido e mais alto', () => {
    const lo = resolvePenalty(0.2, 0.1, new Rng(3));
    const hi = resolvePenalty(0.2, 0.85, new Rng(3));
    expect(lo.height).toBeLessThan(0.4);
    expect(hi.height).toBeGreaterThan(lo.height + 1);
    expect(hi.speed).toBeGreaterThan(lo.speed);
  });
});

describe('mira e prazo', () => {
  function attempt(): PenaltyAttempt {
    return { team: 0, kicker: 4, keeper: 5, phase: 'aiming', timer: 0, aimTime: 0, cursor: 0, charging: false, charge: 0, plan: null };
  }

  it('esquerda/direita movem o cursor, limitado à boca do gol', () => {
    const a = attempt();
    const right = { ...emptyPlayerInput(), right: { down: true, pressed: false, released: false } };
    for (let i = 0; i < 120; i++) updateAiming(a, right, SIM_DT);
    expect(a.cursor).toBeCloseTo(PEN_CURSOR_LIMIT, 6);
    const left = { ...emptyPlayerInput(), left: { down: true, pressed: false, released: false } };
    for (let i = 0; i < 30; i++) updateAiming(a, left, SIM_DT);
    expect(a.cursor).toBeLessThan(PEN_CURSOR_LIMIT);
  });

  it('o cursor balança sozinho (cantos extremos ficam arriscados)', () => {
    const values = Array.from({ length: 50 }, (_, i) => cursorSway(i * 0.05));
    expect(Math.max(...values)).toBeGreaterThan(0.1);
    expect(Math.min(...values)).toBeLessThan(-0.1);
  });

  it('segurar carrega; soltar chuta com a força carregada', () => {
    const a = attempt();
    expect(updateAiming(a, withButtons(emptyPlayerInput(), 'none', 'press'), SIM_DT)).toBeNull();
    for (let i = 0; i < 27; i++) updateAiming(a, withButtons(emptyPlayerInput(), 'none', 'hold'), SIM_DT);
    const power = updateAiming(a, withButtons(emptyPlayerInput(), 'none', 'release'), SIM_DT);
    expect(power).not.toBeNull();
    expect(power!).toBeCloseTo(0.5, 1);
  });

  it('prazo de 5 s: chuta sozinho com a carga atual', () => {
    const a = attempt();
    let power: number | null = null;
    let t = 0;
    while (power === null && t < PEN_TIME_LIMIT + 1) {
      power = updateAiming(a, emptyPlayerInput(), SIM_DT);
      t += SIM_DT;
    }
    expect(power).toBe(0);
    expect(t).toBeCloseTo(PEN_TIME_LIMIT, 1);
  });
});

describe('disputa completa na partida', () => {
  function toPenalties(): Match {
    const m = createMatch(21);
    m.world.aiEnabled = false;
    const idle: HumanInputs = [emptyPlayerInput(), emptyPlayerInput()];
    for (let i = 0; i < 400 / SIM_DT && m.phase !== 'PENALTIS'; i++) stepMatch(m, idle, SIM_DT);
    expect(m.phase).toBe('PENALTIS');
    return m;
  }

  it('do empate na prorrogação até o vencedor nos pênaltis', () => {
    const m = toPenalties();
    // Cada humano só segura e solta o chute quando é a vez dele (mira varia com o tempo).
    let i = 0;
    const kickers: string[] = [];
    while (!m.over && i < 200 / SIM_DT) {
      const a = m.attempt;
      const inputs: HumanInputs = [emptyPlayerInput(), emptyPlayerInput()];
      if (a && a.phase === 'aiming') {
        const phase = Math.floor(a.aimTime / SIM_DT);
        const btn = phase === 10 ? 'press' : phase > 10 && phase < 50 ? 'hold' : phase === 50 ? 'release' : 'none';
        inputs[a.team] = withButtons({ ...emptyPlayerInput(), right: { down: (i >> 6) % 2 === 0, pressed: false, released: false } }, 'none', btn);
        if (phase === 0) kickers.push(`${a.team}:${m.world.players[a.kicker]!.role}`);
      }
      stepMatch(m, inputs, SIM_DT);
      i++;
    }
    expect(m.over).toBe(true);
    expect(m.shootout).not.toBeNull();
    expect(m.shootout!.winner).not.toBeNull();
    expect(matchWinner(m)).toBe(m.shootout!.winner);
    expect(kickers[0]).toBe('0:ATA');
    expect(kickers[1]).toBe('1:ATA');
    expect(kickers[2]).toBe('0:ALA_E');
  });
});
