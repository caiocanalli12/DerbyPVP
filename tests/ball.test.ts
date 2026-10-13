import { describe, expect, it } from 'vitest';
import {
  BALL_RADIUS,
  BALL_ROLL_DAMPING,
  BALL_STOP_SPEED,
  BALL_WALL_RESTITUTION,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GOAL_DEPTH,
  GOAL_HEIGHT,
  GRAVITY,
  SIM_DT,
} from '../src/config/constants';
import { Rng } from '../src/core/rng';
import {
  collideBallWithArena,
  createBall,
  goalScoredIn,
  integrateFreeBall,
  placeBall,
} from '../src/sim/ball';
import type { Ball } from '../src/sim/ball';
import { GOAL_Y_MAX, GOAL_Y_MIN } from '../src/sim/field';
import { createWorld } from '../src/sim/world';
import { clearPlayers, seconds, steps } from './helpers/sim';

/** Simula só a bola (sem jogadores) com subpassos, como o mundo faz. */
function simulateBall(ball: Ball, secondsTotal: number, onStep?: (b: Ball) => void): { goal: 0 | 1 | null } {
  let goal: 0 | 1 | null = null;
  const n = Math.round(secondsTotal / SIM_DT);
  for (let i = 0; i < n; i++) {
    const sub = Math.max(1, Math.ceil((Math.hypot(ball.vx, ball.vy, ball.vz) * SIM_DT) / 0.05));
    for (let k = 0; k < sub; k++) {
      integrateFreeBall(ball, SIM_DT / sub);
      collideBallWithArena(ball);
      const g = goalScoredIn(ball);
      if (g !== null && goal === null) goal = g;
    }
    onStep?.(ball);
  }
  return { goal };
}

function ballAt(x: number, y: number, z: number, vx: number, vy: number, vz: number): Ball {
  const b = createBall();
  placeBall(b, x, y, z);
  b.vx = vx;
  b.vy = vy;
  b.vz = vz;
  return b;
}

describe('física da bola', () => {
  it('rolando: amortecimento exponencial exp(-1,1·dt)', () => {
    const b = ballAt(10, 10, 0, 10, 0, 0);
    simulateBall(b, 1);
    expect(b.vx).toBeCloseTo(10 * Math.exp(-BALL_ROLL_DAMPING * 1), 3);
  });

  it('para abaixo de 0,15 m/s', () => {
    const b = ballAt(10, 10, 0, 2, 0, 0);
    simulateBall(b, 5);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
    const c = ballAt(10, 10, 0, BALL_STOP_SPEED * 0.9, 0, 0);
    simulateBall(c, SIM_DT);
    expect(c.vx).toBe(0);
  });

  it('no ar: gravidade de 20 m/s²', () => {
    const b = ballAt(10, 10, 5, 0, 0, 0);
    simulateBall(b, 0.3);
    expect(b.z).toBeCloseTo(5 - 0.5 * GRAVITY * 0.3 * 0.3, 1);
  });

  it('quica no chão com restituição 0,5 e depois rola', () => {
    const b = ballAt(10, 10, 2, 0, 0, 0);
    let maxAfter = 0;
    let bounces = 0;
    let lastVz = 0;
    simulateBall(b, 3, (s) => {
      if (lastVz < 0 && s.vz > 0) bounces++;
      lastVz = s.vz;
      if (bounces === 1) maxAfter = Math.max(maxAfter, s.z);
    });
    // Altura após o quique ~ 2 * 0,5² = 0,5 m.
    expect(maxAfter).toBeGreaterThan(0.4);
    expect(maxAfter).toBeLessThan(0.6);
    expect(b.z).toBe(0);
    expect(b.vz).toBe(0);
  });

  it('paredes devolvem com restituição 0,7', () => {
    const b = ballAt(20, 1, 0, 0, -8, 0);
    simulateBall(b, 0.2);
    expect(b.vy).toBeGreaterThan(0);
    // 8 m/s menos o amortecimento até a parede, vezes 0,7.
    expect(b.vy).toBeLessThan(8 * BALL_WALL_RESTITUTION + 0.01);
    expect(b.vy).toBeGreaterThan(8 * BALL_WALL_RESTITUTION * 0.75);
  });

  it('bate na parede ao lado do gol e volta (sem gol)', () => {
    const b = ballAt(3, 4, 0, -15, 0, 0);
    const r = simulateBall(b, 1);
    expect(r.goal).toBeNull();
    expect(b.vx).toBeGreaterThan(0);
    expect(b.x).toBeGreaterThanOrEqual(BALL_RADIUS - 1e-9);
  });
});

describe('gol', () => {
  it('conta quando a bola cruza totalmente a linha entre os postes, abaixo do travessão', () => {
    const b = ballAt(5, 10, 0.5, -15, 0, 0);
    const r = simulateBall(b, 1);
    expect(r.goal).toBe(0);
    const c = ballAt(35, 9, 0, 15, 0, 0);
    expect(simulateBall(c, 1).goal).toBe(1);
  });

  it('não conta enquanto a bola não cruzou totalmente a linha', () => {
    const b = ballAt(-BALL_RADIUS * 0.5, 10, 0.2, 0, 0, 0);
    expect(goalScoredIn(b)).toBeNull();
    const c = ballAt(-BALL_RADIUS - 0.01, 10, 0.2, 0, 0, 0);
    expect(goalScoredIn(c)).toBe(0);
  });

  /** Simula registrando contatos e a altura do centro quando a bola chega à linha (x <= 0). */
  function shootAtLeftGoal(z0: number, vz0: number) {
    const b = ballAt(4, 10, z0, -14, 0, vz0);
    const contacts = new Set<string>();
    let zAtLine: number | null = null;
    let goal: 0 | 1 | null = null;
    const n = Math.round(1.5 / SIM_DT);
    for (let i = 0; i < n; i++) {
      const sub = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy, b.vz) * SIM_DT) / 0.05));
      for (let k = 0; k < sub; k++) {
        integrateFreeBall(b, SIM_DT / sub);
        if (zAtLine === null && b.x <= BALL_RADIUS + 0.2) zAtLine = b.z;
        for (const c of collideBallWithArena(b)) contacts.add(c);
        const g = goalScoredIn(b);
        if (g !== null && goal === null) goal = g;
      }
    }
    return { b, contacts, zAtLine: zAtLine ?? -1, goal };
  }

  // Tempo até a linha: (4 - 0) / 14 s.
  const tLine = 4 / 14;
  const vzFor = (z0: number, zLine: number) => (zLine - z0 + 0.5 * GRAVITY * tLine * tLine) / tLine;

  it('por cima do travessão não conta: bate na parede acima do gol e volta', () => {
    const r = shootAtLeftGoal(1, vzFor(1, 2.6));
    expect(r.zAtLine).toBeGreaterThan(GOAL_HEIGHT + BALL_RADIUS);
    expect(r.goal).toBeNull();
    expect(r.contacts.has('wall')).toBe(true);
    expect(r.b.x).toBeGreaterThan(0);
  });

  it('no travessão: bate e não entra', () => {
    const r = shootAtLeftGoal(1, vzFor(1, GOAL_HEIGHT + 0.03));
    expect(r.contacts.has('bar')).toBe(true);
    expect(r.goal).toBeNull();
  });

  it('logo abaixo do travessão: gol', () => {
    const r = shootAtLeftGoal(1, vzFor(1, GOAL_HEIGHT - BALL_RADIUS - 0.1));
    expect(r.zAtLine).toBeLessThan(GOAL_HEIGHT);
    expect(r.goal).toBe(0);
  });

  it('bola na trave volta', () => {
    const b = ballAt(4, GOAL_Y_MIN, 0.3, -14, 0, 0);
    let hitPost = false;
    const n = Math.round(0.6 / SIM_DT);
    for (let i = 0; i < n; i++) {
      const sub = Math.max(1, Math.ceil((Math.hypot(b.vx, b.vy, b.vz) * SIM_DT) / 0.05));
      for (let k = 0; k < sub; k++) {
        integrateFreeBall(b, SIM_DT / sub);
        if (collideBallWithArena(b).includes('post')) hitPost = true;
      }
    }
    expect(hitPost).toBe(true);
    expect(b.vx).toBeGreaterThan(0);
  });

  it('a rede segura a bola dentro do gol', () => {
    const b = ballAt(4, 10, 0.3, -20, 0, 2);
    simulateBall(b, 3);
    expect(b.x).toBeLessThan(0);
    expect(b.x).toBeGreaterThanOrEqual(-GOAL_DEPTH + BALL_RADIUS - 1e-6);
    expect(b.y).toBeGreaterThan(GOAL_Y_MIN);
    expect(b.y).toBeLessThan(GOAL_Y_MAX);
  });
});

describe('a bola nunca sai do campo (fuzz)', () => {
  it('2000 chutes aleatórios de qualquer lugar, em qualquer direção e altura', () => {
    const rng = new Rng(2024);
    const violations: string[] = [];
    for (let i = 0; i < 2000; i++) {
      const a = rng.range(0, Math.PI * 2);
      const speed = rng.range(5, 30);
      const b = ballAt(
        rng.range(0.2, FIELD_LENGTH - 0.2),
        rng.range(0.2, FIELD_WIDTH - 0.2),
        rng.range(0, 3),
        Math.cos(a) * speed,
        Math.sin(a) * speed,
        rng.range(-2, 12),
      );
      simulateBall(b, 2.5, (s) => {
        const beyond = s.x < 0 || s.x > FIELD_LENGTH;
        const ok =
          s.y >= BALL_RADIUS - 1e-6 &&
          s.y <= FIELD_WIDTH - BALL_RADIUS + 1e-6 &&
          s.x >= -GOAL_DEPTH &&
          s.x <= FIELD_LENGTH + GOAL_DEPTH &&
          s.z >= 0 &&
          // Só pode estar além da linha dentro do gol.
          (!beyond || (s.y > GOAL_Y_MIN && s.y < GOAL_Y_MAX && s.z < GOAL_HEIGHT));
        if (!ok) violations.push(`#${i}: (${s.x.toFixed(3)}, ${s.y.toFixed(3)}, ${s.z.toFixed(3)})`);
      });
    }
    expect(violations).toEqual([]);
  });
});

describe('mundo com bola', () => {
  it('chute para o gol vazio vira gol no mundo e gera evento', () => {
    const w = createWorld();
    clearPlayers(w);
    placeBall(w.ball, 30, 10, 0);
    w.ball.vx = 18;
    seconds(w, 1);
    expect(w.goal).toBe(1);
    expect(w.events.some((e) => e.type === 'goal' && e.side === 1)).toBe(true);
  });

  it('bola parada no centro não se mexe sozinha', () => {
    const w = createWorld();
    clearPlayers(w);
    steps(w, 60);
    expect(w.ball.x).toBe(20);
    expect(w.ball.y).toBe(10);
  });
});
