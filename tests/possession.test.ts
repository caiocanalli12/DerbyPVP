import { describe, expect, it } from 'vitest';
import {
  DRIBBLE_OFFSET,
  DRIBBLE_TOUCH_AMPLITUDE,
  DRIBBLE_SIDE_AMPLITUDE,
  KICK_REGAIN_COOLDOWN,
  PLAYER_DRIBBLE_SPEED_FACTOR,
  PLAYER_RUN_SPEED,
  SIM_DT,
} from '../src/config/constants';
import { placeBall } from '../src/sim/ball';
import { createWorld, getPlayer, givePossession, playerId } from '../src/sim/world';
import { clearPlayers, idle, move, seconds, steps, withButtons } from './helpers/sim';

function setup() {
  const w = createWorld();
  clearPlayers(w);
  return w;
}

describe('posse de bola', () => {
  it('domina a bola a menos de 0,6 m, baixa e lenta', () => {
    const w = setup();
    const p = getPlayer(w, playerId(0, 'ATA'));
    p.x = 10;
    p.y = 10;
    placeBall(w.ball, 10.55, 10, 0);
    steps(w, 1);
    expect(w.ball.owner).toBe(p.id);
  });

  it('não domina a mais de 0,6 m', () => {
    const w = setup();
    const p = getPlayer(w, playerId(0, 'ATA'));
    p.x = 10;
    p.y = 10;
    placeBall(w.ball, 10.65, 10, 0);
    steps(w, 1);
    expect(w.ball.owner).toBeNull();
  });

  it('não domina bola alta (z >= 0,5)', () => {
    const w = setup();
    const p = getPlayer(w, playerId(0, 'ATA'));
    p.x = 10;
    p.y = 10;
    placeBall(w.ball, 10.3, 10, 0.8);
    w.ball.vz = 4;
    steps(w, 1);
    expect(w.ball.owner).toBeNull();
  });

  it('bola rápida demais (>= 9 m/s relativa) desvia no corpo', () => {
    const w = setup();
    const p = getPlayer(w, playerId(0, 'ATA'));
    p.x = 10;
    p.y = 10;
    placeBall(w.ball, 13, 10, 0);
    w.ball.vx = -14;
    steps(w, 30);
    expect(w.ball.owner).toBeNull();
    expect(w.ball.vx).toBeGreaterThan(0);
    expect(w.events.some((e) => e.type === 'deflect' && e.player === p.id)).toBe(true);
  });

  it('bola a 8 m/s vindo de frente é dominada', () => {
    const w = setup();
    const p = getPlayer(w, playerId(0, 'ATA'));
    p.x = 10;
    p.y = 10;
    placeBall(w.ball, 13, 10, 0);
    w.ball.vx = -8.5;
    steps(w, 40);
    expect(w.ball.owner).toBe(p.id);
  });

  it('bola solta disputada fica com o mais próximo', () => {
    const w = setup();
    const a = getPlayer(w, playerId(0, 'ATA'));
    const b = getPlayer(w, playerId(1, 'ATA'));
    a.x = 9.5;
    a.y = 10;
    b.x = 10.5;
    b.y = 10.05;
    // A bola está a 0,45 m de A e a ~0,55 m de B: os dois podem dominar, A está mais perto.
    placeBall(w.ball, 9.95, 10, 0);
    steps(w, 1);
    expect(w.ball.owner).toBe(a.id);
  });

  it('o goleiro não domina pela regra geral (tem lógica própria)', () => {
    const w = setup();
    const gk = getPlayer(w, playerId(0, 'GK'));
    gk.x = 10;
    gk.y = 10;
    placeBall(w.ball, 10.3, 10, 0);
    steps(w, 1);
    expect(w.ball.owner).not.toBe(gk.id);
  });

  it('companheiro que ganha a bola passa a ser controlado na hora', () => {
    const w = setup();
    const ala = getPlayer(w, playerId(0, 'ALA_E'));
    ala.x = 10;
    ala.y = 10;
    placeBall(w.ball, 10.3, 10, 0);
    expect(w.controlled[0]).toBe(playerId(0, 'ATA'));
    steps(w, 1);
    expect(w.controlled[0]).toBe(ala.id);
  });
});

describe('condução', () => {
  it('a bola fica 0,45 m à frente, na direção em que o jogador está virado', () => {
    const w = setup();
    const p = getPlayer(w, playerId(0, 'ATA'));
    p.x = 10;
    p.y = 10;
    p.facing = Math.PI / 2;
    givePossession(w, p);
    steps(w, 1);
    expect(w.ball.x).toBeCloseTo(10, 6);
    expect(w.ball.y).toBeCloseTo(10 + DRIBBLE_OFFSET, 6);
  });

  it('balanço de condução é leve e a bola acompanha o jogador', () => {
    const w = setup();
    const p = getPlayer(w, playerId(0, 'ATA'));
    p.x = 10;
    p.y = 10;
    givePossession(w, p);
    let maxDev = 0;
    for (let i = 0; i < 90; i++) {
      steps(w, 1, [move(1, 0), idle()]);
      const dx = w.ball.x - p.x;
      const dy = w.ball.y - p.y;
      maxDev = Math.max(maxDev, Math.abs(Math.hypot(dx, dy) - DRIBBLE_OFFSET));
      expect(w.ball.owner).toBe(p.id);
    }
    expect(maxDev).toBeGreaterThan(0.01);
    expect(maxDev).toBeLessThanOrEqual(DRIBBLE_TOUCH_AMPLITUDE + DRIBBLE_SIDE_AMPLITUDE + 1e-6);
  });

  it('com a bola corre a 90% da velocidade', () => {
    const w = setup();
    const p = getPlayer(w, playerId(0, 'ATA'));
    p.x = 5;
    p.y = 10;
    givePossession(w, p);
    seconds(w, 1, [move(1, 0), idle()]);
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(PLAYER_RUN_SPEED * PLAYER_DRIBBLE_SPEED_FACTOR, 4);
  });

  it('encostar no adversário não rouba a bola', () => {
    const w = setup();
    const a = getPlayer(w, playerId(0, 'ATA'));
    const b = getPlayer(w, playerId(1, 'ATA'));
    a.x = 10;
    a.y = 10;
    b.x = 12;
    b.y = 10;
    givePossession(w, a);
    seconds(w, 2, [move(1, 0), move(-1, 0)]);
    expect(w.ball.owner).toBe(a.id);
  });
});

describe('recarga depois de chutar/passar', () => {
  it('quem chutou não recupera a bola por 0,25 s', () => {
    const w = setup();
    const p = getPlayer(w, playerId(0, 'ATA'));
    p.x = 10;
    p.y = 10;
    givePossession(w, p);
    // Chute fraco (toque) na direção da parede da frente.
    steps(w, 1, [withButtons(move(0, 1), 'none', 'tap'), idle()]);
    expect(w.ball.owner).toBeNull();
    expect(p.noTouchTimer).toBeGreaterThan(0);
    // Mesmo correndo atrás, só pode dominar depois da recarga.
    let regainedAt = -1;
    for (let i = 0; i < 120 && regainedAt < 0; i++) {
      steps(w, 1, [move(0, 1), idle()]);
      if (w.ball.owner === p.id) regainedAt = (i + 2) * SIM_DT;
    }
    if (regainedAt >= 0) expect(regainedAt).toBeGreaterThanOrEqual(KICK_REGAIN_COOLDOWN - 1e-9);
  });
});
