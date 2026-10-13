import { describe, expect, it } from 'vitest';
import { AI_MARK_DISTANCE, AI_ZONES, FORMATION } from '../src/config/constants';
import { aiTarget, chooseMarker, toAttackFrame } from '../src/sim/ai';
import { placeBall } from '../src/sim/ball';
import { goalCenter } from '../src/sim/field';
import { createWorld, getPlayer, givePossession, playerId } from '../src/sim/world';
import { idle, steps } from './helpers/sim';

describe('IA de linha', () => {
  it('formação deslocada para a bola: 30% em X e 20% em Y', () => {
    const w = createWorld();
    w.controlled = [playerId(0, 'ATA'), playerId(1, 'ATA')];
    placeBall(w.ball, 25, 14, 0);
    const fixo = getPlayer(w, playerId(0, 'FIXO'));
    const t = aiTarget(w, fixo, null);
    expect(t.x).toBeCloseTo(FORMATION.FIXO.x + (25 - 20) * 0.3, 6);
    expect(t.y).toBeCloseTo(FORMATION.FIXO.y + (14 - 10) * 0.2, 6);
  });

  it('cada função fica presa à sua zona', () => {
    const w = createWorld(4);
    for (let i = 0; i < 900; i++) {
      placeBall(w.ball, 20 + Math.sin(i * 0.02) * 19, 10 + Math.cos(i * 0.031) * 9.5, 0);
      steps(w, 1);
    }
    for (const team of [0, 1] as const) {
      for (const role of ['FIXO', 'ALA_E', 'ALA_D', 'ATA'] as const) {
        const p = getPlayer(w, playerId(team, role));
        if (w.controlled[team] === p.id) continue;
        const t = aiTarget(w, p, null);
        const f = toAttackFrame(w, team, t.x, t.y);
        const z = AI_ZONES[role];
        expect(f.u).toBeGreaterThanOrEqual(z.uMin - 1e-6);
        expect(f.u).toBeLessThanOrEqual(z.uMax + 1e-6);
        expect(f.v).toBeGreaterThanOrEqual(z.vMin - 1e-6);
        expect(f.v).toBeLessThanOrEqual(z.vMax + 1e-6);
      }
    }
  });

  it('o fixo não passa muito do meio e o atacante não recua até a própria área', () => {
    expect(AI_ZONES.FIXO.uMax).toBeLessThanOrEqual(23);
    expect(AI_ZONES.ATA.uMin).toBeGreaterThan(6);
    expect(AI_ZONES.ALA_E.vMax).toBeLessThan(10);
    expect(AI_ZONES.ALA_D.vMin).toBeGreaterThan(10);
  });

  it('defesa: quem tem o portador na zona fica entre ele e o próprio gol, a ~2 m', () => {
    const w = createWorld();
    const carrier = getPlayer(w, playerId(1, 'ATA'));
    carrier.x = 14;
    carrier.y = 14;
    givePossession(w, carrier);
    w.controlled[0] = playerId(0, 'ATA');
    const marker = chooseMarker(w, 0);
    expect(marker).not.toBeNull();
    expect(marker!.team).toBe(0);
    const t = aiTarget(w, marker!, marker!.id);
    const g = goalCenter(w.defends[0]);
    // Na reta portador -> gol, a ~2 m do portador.
    expect(Math.hypot(t.x - carrier.x, t.y - carrier.y)).toBeCloseTo(AI_MARK_DISTANCE, 1);
    const cross = (t.x - carrier.x) * (g.y - carrier.y) - (t.y - carrier.y) * (g.x - carrier.x);
    expect(Math.abs(cross)).toBeLessThan(0.5);
    expect(Math.hypot(t.x - g.x, t.y - g.y)).toBeLessThan(Math.hypot(carrier.x - g.x, carrier.y - g.y));
  });

  it('defesa: os demais recuam e fecham o meio', () => {
    const w = createWorld();
    const carrier = getPlayer(w, playerId(1, 'ATA'));
    carrier.x = 20;
    carrier.y = 10;
    placeBall(w.ball, 20, 10, 0);
    const ala = getPlayer(w, playerId(0, 'ALA_E'));
    const neutral = aiTarget(w, ala, null);
    givePossession(w, carrier);
    const defending = aiTarget(w, ala, null);
    expect(defending.x).toBeLessThan(neutral.x);
    expect(Math.abs(defending.y - 10)).toBeLessThan(Math.abs(neutral.y - 10));
  });

  it('ataque: com a bola, os companheiros avançam para abrir espaço', () => {
    const w = createWorld();
    placeBall(w.ball, 20, 10, 0);
    const ala = getPlayer(w, playerId(0, 'ALA_D'));
    const neutral = aiTarget(w, ala, null);
    givePossession(w, getPlayer(w, playerId(0, 'FIXO')));
    const attacking = aiTarget(w, ala, null);
    expect(attacking.x).toBeGreaterThan(neutral.x + 3);
  });

  it('a IA nunca fica conduzindo: quem pega a bola vira controlado pelo humano', () => {
    const w = createWorld(9);
    for (let i = 0; i < 3000; i++) {
      steps(w, 1, [idle(), idle()]);
      const o = w.ball.owner;
      if (o !== null && !w.ballInHands) {
        const p = getPlayer(w, o);
        expect(w.controlled[p.team]).toBe(p.id);
      }
      if (i % 200 === 0) {
        w.ball.owner = null;
        w.ballInHands = false;
        placeBall(w.ball, 5 + (i % 30), 3 + (i % 14), 0);
        w.ball.vx = 3;
      }
    }
  });
});
