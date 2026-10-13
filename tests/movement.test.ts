import { describe, expect, it } from 'vitest';
import { emptyPlayerInput } from '../src/core/input';
import type { PlayerInput } from '../src/core/input';
import {
  FIELD_LENGTH,
  FIELD_WIDTH,
  PLAYER_RADIUS,
  PLAYER_RUN_SPEED,
  SIM_DT,
} from '../src/config/constants';
import { clampToField, createPlayer, formationPosition, integrateMovement } from '../src/sim/player';
import { separatePlayers } from '../src/sim/physics';
import { createWorld, getPlayer, stepWorld } from '../src/sim/world';
import type { HumanInputs } from '../src/sim/world';

function input(x: number, y: number): PlayerInput {
  const i = emptyPlayerInput();
  const l = Math.hypot(x, y);
  i.moveX = l > 0 ? x / l : 0;
  i.moveY = l > 0 ? y / l : 0;
  return i;
}

function run(world: ReturnType<typeof createWorld>, inputs: HumanInputs, seconds: number): void {
  const steps = Math.round(seconds / SIM_DT);
  for (let i = 0; i < steps; i++) stepWorld(world, inputs, SIM_DT);
}

describe('formação', () => {
  it('posições base da especificação para o time que ataca à direita', () => {
    expect(formationPosition('GK', 0)).toEqual({ x: 1.5, y: 10 });
    expect(formationPosition('FIXO', 0)).toEqual({ x: 9, y: 10 });
    expect(formationPosition('ALA_E', 0)).toEqual({ x: 15, y: 4 });
    expect(formationPosition('ALA_D', 0)).toEqual({ x: 15, y: 16 });
    expect(formationPosition('ATA', 0)).toEqual({ x: 18.5, y: 10 });
  });

  it('o outro time é o espelho (ala esquerdo continua à esquerda de quem ataca)', () => {
    expect(formationPosition('GK', 1)).toEqual({ x: 38.5, y: 10 });
    expect(formationPosition('ALA_E', 1)).toEqual({ x: 25, y: 16 });
    expect(formationPosition('ALA_D', 1)).toEqual({ x: 25, y: 4 });
  });

  it('numeração: goleiro 1, fixo 4, ala direito 7, ala esquerdo 11, atacante 9', () => {
    const w = createWorld();
    expect(w.players.map((p) => p.number)).toEqual([1, 4, 7, 11, 9, 1, 4, 7, 11, 9]);
  });
});

describe('movimento', () => {
  it('chega à velocidade de corrida (6,5 m/s) rápido, mas não instantaneamente', () => {
    const p = createPlayer(0, 0, 'ATA');
    p.x = 10;
    p.y = 10;
    p.moveX = 1;
    integrateMovement(p, SIM_DT);
    expect(Math.hypot(p.vx, p.vy)).toBeLessThan(PLAYER_RUN_SPEED);
    for (let i = 0; i < 20; i++) integrateMovement(p, SIM_DT);
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(PLAYER_RUN_SPEED, 6);
  });

  it('diagonal não é mais rápida', () => {
    const p = createPlayer(0, 0, 'ATA');
    p.x = 10;
    p.y = 10;
    p.moveX = Math.SQRT1_2;
    p.moveY = Math.SQRT1_2;
    for (let i = 0; i < 60; i++) integrateMovement(p, SIM_DT);
    expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(PLAYER_RUN_SPEED, 6);
  });

  it('para rápido ao soltar (sem deslizar no gelo)', () => {
    const p = createPlayer(0, 0, 'ATA');
    p.x = 10;
    p.y = 10;
    p.vx = PLAYER_RUN_SPEED;
    p.moveX = 0;
    let t = 0;
    while (Math.hypot(p.vx, p.vy) > 0 && t < 1) {
      integrateMovement(p, SIM_DT);
      t += SIM_DT;
    }
    expect(t).toBeLessThan(0.15);
    expect(p.x - 10).toBeLessThan(0.5);
  });

  it('os dois humanos movem seus jogadores ao mesmo tempo', () => {
    const w = createWorld();
    // Sem IA, para provar que só os controlados se mexem.
    w.aiEnabled = false;
    const p1 = getPlayer(w, w.controlled[0]);
    const p2 = getPlayer(w, w.controlled[1]);
    const p1x = p1.x;
    const p2y = p2.y;
    run(w, [input(1, 0), input(0, -1)], 0.5);
    expect(p1.x).toBeGreaterThan(p1x + 2);
    expect(p2.y).toBeLessThan(p2y - 2);
    // Os demais ficam parados (IA desligada neste teste).
    for (const p of w.players) {
      if (p.id === p1.id || p.id === p2.id) continue;
      expect(Math.hypot(p.vx, p.vy)).toBe(0);
    }
  });

  it('ninguém atravessa as paredes', () => {
    const w = createWorld();
    run(w, [input(-1, -1), input(1, 1)], 6);
    for (const p of w.players) {
      expect(p.x).toBeGreaterThanOrEqual(PLAYER_RADIUS - 1e-9);
      expect(p.x).toBeLessThanOrEqual(FIELD_LENGTH - PLAYER_RADIUS + 1e-9);
      expect(p.y).toBeGreaterThanOrEqual(PLAYER_RADIUS - 1e-9);
      expect(p.y).toBeLessThanOrEqual(FIELD_WIDTH - PLAYER_RADIUS + 1e-9);
    }
  });

  it('jogador correndo contra o canto para encostado nas paredes', () => {
    const p = createPlayer(0, 0, 'ATA');
    p.x = 3;
    p.y = 3;
    p.moveX = -Math.SQRT1_2;
    p.moveY = -Math.SQRT1_2;
    for (let i = 0; i < 120; i++) {
      integrateMovement(p, SIM_DT);
      clampToField(p);
    }
    expect(p.x).toBeCloseTo(PLAYER_RADIUS, 6);
    expect(p.y).toBeCloseTo(PLAYER_RADIUS, 6);
    expect(p.vx).toBe(0);
    expect(p.vy).toBe(0);
  });
});

describe('separação suave', () => {
  it('jogadores sobrepostos se afastam aos poucos, sem teleporte', () => {
    const a = createPlayer(0, 0, 'ATA');
    const b = createPlayer(5, 1, 'ATA');
    a.x = 10;
    a.y = 10;
    b.x = 10.3;
    b.y = 10;
    separatePlayers([a, b]);
    const d1 = b.x - a.x;
    expect(d1).toBeGreaterThan(0.3);
    expect(d1).toBeLessThan(PLAYER_RADIUS * 2);
    for (let i = 0; i < 60; i++) separatePlayers([a, b]);
    expect(b.x - a.x).toBeCloseTo(PLAYER_RADIUS * 2, 2);
  });

  it('empurrar com o corpo desloca o adversário', () => {
    const w = createWorld();
    const p1 = getPlayer(w, w.controlled[0]);
    const p2 = getPlayer(w, w.controlled[1]);
    p1.x = 18;
    p1.y = 10;
    p2.x = 19;
    p2.y = 10;
    run(w, [input(1, 0), input(0, 0)], 1);
    expect(p2.x).toBeGreaterThan(19.5);
    expect(p2.x - p1.x).toBeGreaterThan(PLAYER_RADIUS * 2 * 0.6);
  });
});
