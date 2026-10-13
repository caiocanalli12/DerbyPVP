import { describe, expect, it } from 'vitest';
import {
  PASS_MAX_SPEED,
  PASS_MIN_SPEED,
  SHOT_CHARGE_TIME,
  SHOT_MAX_SPEED,
  SHOT_MIN_SPEED,
  SIM_DT,
} from '../src/config/constants';
import { Rng } from '../src/core/rng';
import { assistShotAngle, choosePassTarget, passSpeedFor, shotVelocity } from '../src/sim/kick';
import { createPlayer } from '../src/sim/player';
import { createWorld, getPlayer, givePossession, playerId } from '../src/sim/world';
import type { World } from '../src/sim/world';
import { clearPlayers, idle, move, steps, withButtons } from './helpers/sim';

const DEG = Math.PI / 180;

function mates() {
  const passer = createPlayer(4, 0, 'ATA');
  passer.x = 10;
  passer.y = 10;
  const a = createPlayer(1, 0, 'FIXO');
  const b = createPlayer(2, 0, 'ALA_D');
  const c = createPlayer(3, 0, 'ALA_E');
  const gk = createPlayer(0, 0, 'GK');
  return { passer, a, b, c, gk, all: [passer, a, b, c, gk] };
}

describe('escolha do alvo do passe', () => {
  it('escolhe o companheiro dentro do cone de 60°', () => {
    const { passer, a, b, c, gk, all } = mates();
    a.x = 18;
    a.y = 11; // ~7° à direita
    b.x = 10;
    b.y = 18; // 90°
    c.x = 2;
    c.y = 10; // atrás
    gk.x = 16;
    gk.y = 10; // goleiro nunca recebe passe
    expect(choosePassTarget(passer, all, 1, 0)?.id).toBe(a.id);
  });

  it('fora do cone (> 30° de cada lado) ninguém é escolhido', () => {
    const { passer, a, b, c, all } = mates();
    a.x = 14;
    a.y = 14; // 45°
    b.x = 10;
    b.y = 4; // -90°
    c.x = 4;
    c.y = 10;
    expect(choosePassTarget(passer, all, 1, 0)).toBeNull();
  });

  it('ângulo pesa mais que distância', () => {
    const { passer, a, b, c, all } = mates();
    a.x = 25;
    a.y = 10; // 0°, 15 m
    b.x = 15;
    b.y = 12.5; // ~26,6°, 5,6 m
    c.x = 0.5;
    c.y = 0.5;
    expect(choosePassTarget(passer, all, 1, 0)?.id).toBe(a.id);
  });

  it('com ângulos parecidos, o mais perto vence', () => {
    const { passer, a, b, c, all } = mates();
    a.x = 25;
    a.y = 10.5;
    b.x = 15;
    b.y = 10.2;
    c.x = 0.5;
    c.y = 0.5;
    expect(choosePassTarget(passer, all, 1, 0)?.id).toBe(b.id);
  });
});

describe('velocidade do passe', () => {
  it('proporcional à distância, entre 7 e 16 m/s', () => {
    expect(passSpeedFor(1)).toBe(PASS_MIN_SPEED);
    expect(passSpeedFor(40)).toBe(PASS_MAX_SPEED);
    expect(passSpeedFor(6)).toBeLessThan(passSpeedFor(9));
    for (let d = 0; d < 40; d += 0.5) {
      expect(passSpeedFor(d)).toBeGreaterThanOrEqual(PASS_MIN_SPEED);
      expect(passSpeedFor(d)).toBeLessThanOrEqual(PASS_MAX_SPEED);
    }
  });
});

function worldWithBall(): World {
  const w = createWorld();
  clearPlayers(w);
  const p = getPlayer(w, playerId(0, 'ATA'));
  p.x = 10;
  p.y = 10;
  p.facing = 0;
  givePossession(w, p);
  steps(w, 1);
  return w;
}

describe('passe no mundo', () => {
  it('a bola chega ao receptor rasteira e o controle troca na hora do passe', () => {
    const w = worldWithBall();
    const r = getPlayer(w, playerId(0, 'ALA_D'));
    r.x = 18;
    r.y = 11;
    steps(w, 1, [withButtons(move(1, 0), 'tap'), idle()]);
    expect(w.controlled[0]).toBe(r.id);
    expect(w.ball.owner).toBeNull();
    expect(w.ball.vz).toBe(0);
    const speed = Math.hypot(w.ball.vx, w.ball.vy);
    expect(speed).toBeGreaterThanOrEqual(PASS_MIN_SPEED);
    expect(speed).toBeLessThanOrEqual(PASS_MAX_SPEED);
    expect(w.events.some((e) => e.type === 'pass' && e.target === r.id)).toBe(true);
    // Receptor parado recebe.
    steps(w, 120);
    expect(w.ball.owner).toBe(r.id);
  });

  it('sem direcional, passa para onde está virado', () => {
    const w = worldWithBall();
    const r = getPlayer(w, playerId(0, 'ALA_D'));
    r.x = 17;
    r.y = 10;
    steps(w, 1, [withButtons(idle(), 'tap'), idle()]);
    expect(w.controlled[0]).toBe(r.id);
  });

  it('mira à frente do receptor que está correndo', () => {
    const w = worldWithBall();
    const r = getPlayer(w, playerId(0, 'ALA_D'));
    r.x = 18;
    r.y = 10;
    r.vx = 0;
    r.vy = 5; // correndo para a frente do campo
    steps(w, 1, [withButtons(move(1, 0), 'tap'), idle()]);
    expect(w.ball.vy).toBeGreaterThan(0.5);
  });

  it('sem companheiro no cone: toque reto naquela direção', () => {
    const w = worldWithBall();
    steps(w, 1, [withButtons(move(0, 1), 'tap'), idle()]);
    expect(w.ball.owner).toBeNull();
    expect(Math.abs(w.ball.vx)).toBeLessThan(1e-6);
    expect(w.ball.vy).toBeGreaterThan(0);
    expect(w.controlled[0]).toBe(playerId(0, 'ATA'));
  });
});

describe('chute com carga', () => {
  it('carrega de 0 a 100% em 0,9 s e trava em 100%', () => {
    const w = worldWithBall();
    steps(w, 1, [withButtons(idle(), 'none', 'press'), idle()]);
    const half = Math.round(SHOT_CHARGE_TIME / 2 / SIM_DT);
    steps(w, half - 1, [withButtons(idle(), 'none', 'hold'), idle()]);
    expect(w.humans[0].charging).toBe(true);
    expect(w.humans[0].charge).toBeCloseTo(0.5, 1);
    steps(w, 200, [withButtons(idle(), 'none', 'hold'), idle()]);
    expect(w.humans[0].charge).toBe(1);
    expect(w.ball.owner).toBe(playerId(0, 'ATA'));
  });

  it('soltar chuta: 100% sai a 24 m/s; toque rápido sai a 9 m/s e rasteiro', () => {
    let w = worldWithBall();
    steps(w, 1, [withButtons(idle(), 'none', 'press'), idle()]);
    steps(w, 80, [withButtons(idle(), 'none', 'hold'), idle()]);
    steps(w, 1, [withButtons(idle(), 'none', 'release'), idle()]);
    expect(w.ball.owner).toBeNull();
    const shot = w.events.find((e) => e.type === 'shot');
    expect(shot && shot.type === 'shot' && shot.charge).toBe(1);

    w = worldWithBall();
    steps(w, 1, [withButtons(idle(), 'none', 'tap'), idle()]);
    expect(Math.hypot(w.ball.vx, w.ball.vy)).toBeCloseTo(SHOT_MIN_SPEED, 0);
    expect(w.ball.vz).toBe(0);
  });

  it('perder a bola enquanto carrega cancela a carga', () => {
    const w = worldWithBall();
    steps(w, 1, [withButtons(idle(), 'none', 'press'), idle()]);
    steps(w, 10, [withButtons(idle(), 'none', 'hold'), idle()]);
    expect(w.humans[0].charging).toBe(true);
    w.ball.owner = null;
    steps(w, 1, [withButtons(idle(), 'none', 'hold'), idle()]);
    expect(w.humans[0].charging).toBe(false);
    expect(w.humans[0].charge).toBe(0);
  });
});

describe('direção e altura do chute', () => {
  const rng = () => new Rng(7);

  it('velocidade de 9 (0%) a 24 m/s (100%)', () => {
    const v0 = shotVelocity(10, 10, 0, null, 1, rng());
    const v1 = shotVelocity(10, 10, 1, null, 1, rng());
    expect(Math.hypot(v0.x, v0.y)).toBeCloseTo(SHOT_MIN_SPEED, 6);
    expect(Math.hypot(v1.x, v1.y)).toBeCloseTo(SHOT_MAX_SPEED, 6);
  });

  it('sem direcional vai para o centro do gol adversário', () => {
    const v = shotVelocity(30, 4, 0.3, null, 1, rng());
    const angle = Math.atan2(v.y, v.x);
    expect(angle).toBeCloseTo(Math.atan2(10 - 4, 40 - 30), 6);
  });

  it('chute fraco é rasteiro e preciso; acima de 50% sobe', () => {
    expect(shotVelocity(30, 10, 0.4, { x: 1, y: 0 }, 1, rng()).z).toBe(0);
    expect(shotVelocity(30, 10, 0.7, { x: 1, y: 0 }, 1, rng()).z).toBeGreaterThan(0);
    // Até 85%, mesmo direcional sempre dá o mesmo chute (sem erro aleatório).
    const a = shotVelocity(30, 10, 0.8, { x: 1, y: 0.1 }, 1, new Rng(1));
    const b = shotVelocity(30, 10, 0.8, { x: 1, y: 0.1 }, 1, new Rng(999));
    expect(a).toEqual(b);
  });

  it('acima de 85% há imprecisão aleatória (pode isolar)', () => {
    const angles = new Set<string>();
    let maxVz = 0;
    for (let s = 0; s < 50; s++) {
      const v = shotVelocity(30, 10, 1, { x: 1, y: 0 }, 1, new Rng(s));
      angles.add(Math.atan2(v.y, v.x).toFixed(4));
      maxVz = Math.max(maxVz, v.z);
    }
    expect(angles.size).toBeGreaterThan(40);
    expect(maxVz).toBeGreaterThan(8);
  });

  it('direcional a até 45° do gol recebe correção de 25% para a boca', () => {
    // Do ponto (30, 10), mirando 30° para baixo: o raio cruza a linha fora do gol.
    const a = 30 * DEG;
    const corrected = assistShotAngle(30, 10, a, 1);
    expect(corrected).toBeLessThan(a);
    // A correção é parcial (25% do caminho até a boca).
    const target = Math.atan2(11.5 - 0.25 - 10, 10);
    expect(corrected).toBeCloseTo(a + (target - a) * 0.25, 6);
  });

  it('direcional já na boca do gol não é corrigido', () => {
    const a = 3 * DEG;
    expect(assistShotAngle(30, 10, a, 1)).toBe(a);
  });

  it('direcional a mais de 45° do gol não é corrigido', () => {
    const a = 60 * DEG;
    expect(assistShotAngle(30, 10, a, 1)).toBe(a);
  });

  it('o J2 chuta no gol da esquerda', () => {
    const v = shotVelocity(10, 10, 0.5, null, 0, rng());
    expect(v.x).toBeLessThan(0);
  });
});
