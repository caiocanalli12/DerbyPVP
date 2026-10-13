import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';

describe('Rng', () => {
  it('é determinístico para a mesma seed', () => {
    const a = new Rng(1234);
    const b = new Rng(1234);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('gera sequências diferentes para seeds diferentes', () => {
    const a = new Rng(1);
    const b = new Rng(2);
    const sa = Array.from({ length: 10 }, () => a.next());
    const sb = Array.from({ length: 10 }, () => b.next());
    expect(sa).not.toEqual(sb);
  });

  it('fica sempre em [0, 1)', () => {
    const r = new Rng(99);
    for (let i = 0; i < 10000; i++) {
      const v = r.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('int respeita os limites inclusivos e cobre todos os valores', () => {
    const r = new Rng(7);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) {
      const v = r.int(1, 6);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(6);
      seen.add(v);
    }
    expect(seen.size).toBe(6);
  });

  it('chance aproxima a probabilidade pedida', () => {
    const r = new Rng(42);
    let hits = 0;
    const n = 20000;
    for (let i = 0; i < n; i++) if (r.chance(0.3)) hits++;
    expect(hits / n).toBeGreaterThan(0.28);
    expect(hits / n).toBeLessThan(0.32);
  });

  it('salva e restaura o estado', () => {
    const r = new Rng(5);
    r.next();
    const saved = r.getState();
    const x = r.next();
    r.setState(saved);
    expect(r.next()).toBe(x);
  });
});
