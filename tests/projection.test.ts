import { describe, expect, it } from 'vitest';
import {
  CENTER_X,
  FIELD_TOP,
  PPM,
  depthFor,
  depthScale,
  project,
  unproject,
} from '../src/core/projection';
import {
  FIELD_LENGTH,
  FIELD_SCREEN_WIDTH_FRACTION,
  FIELD_WIDTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  GOAL_DEPTH,
  GOAL_HEIGHT,
  WALL_GOAL_HEIGHT,
} from '../src/config/constants';

describe('projeção mundo -> tela', () => {
  it('segue a fórmula da especificação', () => {
    const x = 12.5;
    const y = 7;
    const z = 1.3;
    const t = y / 20;
    const s = 0.86 + (1 - 0.86) * t;
    const p = project(x, y, z);
    expect(p.scale).toBeCloseTo(s, 10);
    expect(p.x).toBeCloseTo(CENTER_X + (x - 20) * PPM * s, 10);
    expect(p.y).toBeCloseTo(FIELD_TOP + y * PPM * 0.6 * (0.92 + 0.08 * t) - z * PPM * s, 10);
  });

  it('escala 0,86 no fundo e 1,0 na frente', () => {
    expect(depthScale(0)).toBeCloseTo(0.86, 10);
    expect(depthScale(FIELD_WIDTH)).toBeCloseTo(1.0, 10);
    expect(project(0, 0).scale).toBeCloseTo(0.86, 10);
    expect(project(0, FIELD_WIDTH).scale).toBeCloseTo(1.0, 10);
  });

  it('o campo ocupa ~85% da largura na linha da frente', () => {
    const left = project(0, FIELD_WIDTH).x;
    const right = project(FIELD_LENGTH, FIELD_WIDTH).x;
    expect((right - left) / GAME_WIDTH).toBeCloseTo(FIELD_SCREEN_WIDTH_FRACTION, 6);
  });

  it('o campo é um trapézio mais estreito no fundo, centrado', () => {
    const backW = project(FIELD_LENGTH, 0).x - project(0, 0).x;
    const frontW = project(FIELD_LENGTH, FIELD_WIDTH).x - project(0, FIELD_WIDTH).x;
    expect(backW).toBeLessThan(frontW);
    expect(backW / frontW).toBeCloseTo(0.86, 6);
    expect((project(0, 0).x + project(FIELD_LENGTH, 0).x) / 2).toBeCloseTo(CENTER_X, 6);
    expect((project(0, FIELD_WIDTH).x + project(FIELD_LENGTH, FIELD_WIDTH).x) / 2).toBeCloseTo(CENTER_X, 6);
  });

  it('o campo inteiro (com gols e a parede acima deles) cabe na tela', () => {
    const corners: [number, number, number][] = [];
    for (const x of [-GOAL_DEPTH, 0, FIELD_LENGTH, FIELD_LENGTH + GOAL_DEPTH]) {
      for (const y of [0, FIELD_WIDTH]) {
        for (const z of [0, GOAL_HEIGHT, WALL_GOAL_HEIGHT]) corners.push([x, y, z]);
      }
    }
    for (const [x, y, z] of corners) {
      const p = project(x, y, z);
      expect(p.x).toBeGreaterThanOrEqual(0);
      expect(p.x).toBeLessThanOrEqual(GAME_WIDTH);
      expect(p.y).toBeGreaterThanOrEqual(0);
      expect(p.y).toBeLessThanOrEqual(GAME_HEIGHT);
    }
  });

  it('deixa espaço no topo para placar e arquibancada', () => {
    // O fundo do campo fica abaixo de 40% da altura da tela.
    expect(FIELD_TOP).toBeGreaterThan(GAME_HEIGHT * 0.4);
    // E a frente do campo não encosta na borda de baixo.
    expect(project(0, FIELD_WIDTH).y).toBeLessThan(GAME_HEIGHT - 20);
  });

  it('y maior fica mais embaixo na tela (monotônico)', () => {
    let last = -Infinity;
    for (let y = 0; y <= FIELD_WIDTH; y += 0.5) {
      const sy = project(20, y).y;
      expect(sy).toBeGreaterThan(last);
      last = sy;
    }
  });

  it('altura (z) sobe na tela sem mudar o x', () => {
    const ground = project(10, 10, 0);
    const air = project(10, 10, 2);
    expect(air.y).toBeLessThan(ground.y);
    expect(air.x).toBeCloseTo(ground.x, 10);
    expect(ground.y - air.y).toBeCloseTo(2 * PPM * depthScale(10), 10);
  });

  it('unproject é a inversa de project no chão', () => {
    for (let x = -1; x <= 41; x += 3.5) {
      for (let y = 0; y <= 20; y += 2.5) {
        const p = project(x, y);
        const w = unproject(p.x, p.y);
        expect(w.x).toBeCloseTo(x, 6);
        expect(w.y).toBeCloseTo(y, 6);
      }
    }
  });

  it('ordenação por profundidade: mais à frente desenha por cima', () => {
    expect(depthFor(15)).toBeGreaterThan(depthFor(5));
    expect(depthFor(0)).toBeLessThan(depthFor(FIELD_WIDTH));
  });
});
