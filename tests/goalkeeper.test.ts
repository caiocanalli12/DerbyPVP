import { describe, expect, it } from 'vitest';
import {
  GK_CATCH_MAX_SPEED,
  GK_HOLD_TIME,
  GK_LATERAL_MARGIN,
  GK_REACTION_TIME,
  GOAL_AREA_RADIUS,
  SIM_DT,
} from '../src/config/constants';
import { placeBall } from '../src/sim/ball';
import { GOAL_Y_MAX, GOAL_Y_MIN } from '../src/sim/field';
import { keeperHomePosition, tryKeeperSave } from '../src/sim/goalkeeper';
import { startTackle } from '../src/sim/tackle';
import { createWorld, getPlayer, givePossession, playerId } from '../src/sim/world';
import type { World } from '../src/sim/world';
import { idle, move, steps } from './helpers/sim';
import { goalRate, switchShot } from './helpers/shots';

function gkOf(w: World, team: 0 | 1) {
  return getPlayer(w, playerId(team, 'GK'));
}

describe('posicionamento do goleiro', () => {
  it('fica perto da linha, acompanhando o Y da bola dentro da largura do gol + 0,5 m', () => {
    const minY = GOAL_Y_MIN - GK_LATERAL_MARGIN;
    const maxY = GOAL_Y_MAX + GK_LATERAL_MARGIN;
    const ys: number[] = [];
    for (const by of [1, 5, 8, 10, 12, 15, 19]) {
      const h = keeperHomePosition({ ...createWorld().ball, x: 25, y: by }, 1);
      expect(h.y).toBeGreaterThanOrEqual(minY - 1e-9);
      expect(h.y).toBeLessThanOrEqual(maxY + 1e-9);
      expect(40 - h.x).toBeLessThan(1.5);
      ys.push(h.y);
    }
    // Acompanha: monotônico com o Y da bola.
    for (let i = 1; i < ys.length; i++) expect(ys[i]!).toBeGreaterThanOrEqual(ys[i - 1]! - 1e-9);
    expect(ys[ys.length - 1]! - ys[0]!).toBeGreaterThan(0.5);
  });

  it('sai um pouco quando a bola se aproxima', () => {
    const far = keeperHomePosition({ ...createWorld().ball, x: 20, y: 10 }, 1);
    const near = keeperHomePosition({ ...createWorld().ball, x: 34, y: 10 }, 1);
    expect(40 - near.x).toBeGreaterThan(40 - far.x + 0.5);
  });

  it('nunca sai da área', () => {
    const w = createWorld(3);
    const gk = gkOf(w, 1);
    for (let i = 0; i < 600; i++) {
      placeBall(w.ball, 30 + Math.sin(i * 0.05) * 8, 10 + Math.cos(i * 0.07) * 9, 0);
      steps(w, 1);
      expect(Math.hypot(gk.x - 40, gk.y - 10)).toBeLessThanOrEqual(GOAL_AREA_RADIUS + 1e-6);
    }
  });

  it('não reage ao chute antes do tempo de reação (0,15 s)', () => {
    const w = createWorld(5);
    const gk = gkOf(w, 1);
    const s = getPlayer(w, playerId(0, 'ATA'));
    s.x = 30;
    s.y = 10;
    givePossession(w, s);
    steps(w, 70);
    w.ball.owner = null;
    w.ball.vx = 20;
    w.ball.vy = -3;
    const y0 = gk.y;
    let t = 0;
    while (t < GK_REACTION_TIME - SIM_DT) {
      steps(w, 1);
      t += SIM_DT;
      expect(Math.abs(gk.y - y0)).toBeLessThan(0.08);
    }
  });
});

describe('defesas', () => {
  it(`até ${GK_CATCH_MAX_SPEED} m/s segura; acima, espalma para o lado`, () => {
    for (const [speed, expected] of [
      [12, 'catch'],
      [GK_CATCH_MAX_SPEED, 'catch'],
      [19, 'parry'],
    ] as const) {
      const w = createWorld(1);
      const gk = gkOf(w, 1);
      gk.x = 39;
      gk.y = 10;
      placeBall(w.ball, 39 - 0.3, 10.2, 0.5);
      w.ball.vx = speed;
      expect(tryKeeperSave(w, gk, w.keepers[1])).toBe(expected);
      if (expected === 'parry') {
        expect(w.ball.vx).toBeLessThan(0); // volta para o campo
        expect(Math.abs(w.ball.vy)).toBeGreaterThan(2); // para o lado
        expect(w.ball.owner).toBeNull();
      } else {
        expect(w.ball.owner).toBe(gk.id);
        expect(w.ballInHands).toBe(true);
      }
    }
  });

  it('chutes fracos são defendidos', () => {
    expect(goalRate([[30, 10, 0.25, 8.75], [30, 10, 0.25, 11.25], [30, 7, 0.25, 11.25]])).toBeLessThanOrEqual(0.05);
  });

  it('chutes fortes de longe quase sempre são defendidos', () => {
    expect(goalRate([[22, 10, 0.85, 8.75], [22, 6, 0.85, 11.25]])).toBeLessThanOrEqual(0.15);
  });

  it('é batível: chute forte no canto, de perto, tem chance real', () => {
    const r = goalRate([
      [31, 10, 0.85, 8.75],
      [31, 10, 0.85, 11.25],
      [33, 10, 0.85, 8.75],
      [31, 6, 0.85, 11.25],
    ]);
    expect(r).toBeGreaterThanOrEqual(0.35);
    expect(r).toBeLessThanOrEqual(0.9);
  });

  it('é batível: chute rápido depois de troca de lado tem chance real', () => {
    let g = 0;
    const n = 20;
    for (let s = 1; s <= n; s++) if (switchShot(s, 31, s % 2 ? 6 : 14, s % 2 ? 14 : 6, 0.85) === 'goal') g++;
    expect(g / n).toBeGreaterThanOrEqual(0.3);
  });
});

describe('bola nas mãos', () => {
  function caught(): World {
    const w = createWorld(2);
    const gk = gkOf(w, 1);
    gk.x = 39;
    gk.y = 10;
    placeBall(w.ball, 38.7, 10, 0.4);
    w.ball.vx = 8;
    tryKeeperSave(w, gk, w.keepers[1]);
    expect(w.ball.owner).toBe(gk.id);
    return w;
  }

  it('segura 1 s: ninguém rouba (nem encostando, nem com carrinho)', () => {
    const w = caught();
    const gk = gkOf(w, 1);
    const atk = getPlayer(w, playerId(0, 'ATA'));
    atk.x = gk.x - 1.3;
    atk.y = gk.y;
    w.controlled[0] = atk.id;
    startTackle(atk, 1, 0);
    steps(w, Math.floor((GK_HOLD_TIME * 0.9) / SIM_DT), [move(1, 0), idle()]);
    expect(w.ball.owner).toBe(gk.id);
    expect(w.ballInHands).toBe(true);
  });

  /** Espera o lançamento (até 1 s + folga). */
  function waitThrow(w: World): void {
    for (let i = 0; i < (GK_HOLD_TIME + 0.3) / SIM_DT && w.ball.owner !== null; i++) steps(w, 1);
    expect(w.ball.owner).toBeNull();
  }

  it('o lançamento sai por cima de quem está colado no goleiro (não volta para o gol)', () => {
    const w = caught();
    const gk = gkOf(w, 1);
    const free = getPlayer(w, playerId(1, 'ALA_E'));
    for (const p of w.players) {
      if (p.team === 1 && p.role !== 'GK') {
        p.x = 26;
        p.y = p.id === free.id ? 10 : 2;
      }
      if (p.team === 0) {
        p.x = 8;
        p.y = 18;
      }
    }
    // Atacante grudado no goleiro, bem no caminho do lançamento.
    const atk = getPlayer(w, playerId(0, 'ATA'));
    atk.x = gk.x - 0.85;
    atk.y = gk.y;
    w.controlled[0] = atk.id;
    waitThrow(w);
    steps(w, Math.round(2.5 / SIM_DT));
    expect(w.events.some((e) => e.type === 'deflect' && e.player === atk.id)).toBe(false);
    expect(w.goal).toBeNull();
  });

  it('o receptor parado domina o lançamento que cai nele (amortece, não rebate no peito)', () => {
    const w = caught();
    const free = getPlayer(w, playerId(1, 'ALA_E'));
    for (const p of w.players) {
      if (p.team === 1 && p.role !== 'GK') {
        p.x = 27;
        p.y = p.id === free.id ? 16 : 3;
      }
      if (p.team === 0) {
        p.x = 8;
        p.y = 3;
      }
    }
    waitThrow(w);
    // O alvo é o mais livre no instante do lançamento (a IA se mexe enquanto o goleiro segura).
    const thrown = w.events.find((e) => e.type === 'pass' && e.player === playerId(1, 'GK'));
    const target = thrown && thrown.type === 'pass' ? thrown.target : null;
    expect(target).not.toBeNull();
    for (let i = 0; i < 3 / SIM_DT && w.ball.owner === null; i++) steps(w, 1);
    expect(w.events.some((e) => e.type === 'deflect' && e.player === target)).toBe(false);
    expect(w.ball.owner).toBe(target);
  });

  it('depois de 1 s lança por cima para o companheiro mais livre, e o controle vai para ele', () => {
    const w = caught();
    // Deixa um ala totalmente livre e os outros marcados.
    const free = getPlayer(w, playerId(1, 'ALA_E'));
    for (const p of w.players) {
      if (p.team === 1 && p.role !== 'GK') {
        p.x = 30;
        p.y = p.id === free.id ? 17 : 5;
      }
      if (p.team === 0) {
        p.x = 30.5;
        p.y = 5;
      }
    }
    let thrown = false;
    for (let i = 0; i < (GK_HOLD_TIME + 0.3) / SIM_DT && !thrown; i++) {
      steps(w, 1);
      thrown = w.ball.owner === null;
    }
    expect(thrown).toBe(true);
    expect(w.ball.vz).toBeGreaterThan(3);
    expect(w.controlled[1]).toBe(free.id);
    expect(w.events.some((e) => e.type === 'pass' && e.player === playerId(1, 'GK') && e.target === free.id)).toBe(true);
  });
});
