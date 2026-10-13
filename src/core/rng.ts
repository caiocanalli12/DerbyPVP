/**
 * Gerador pseudoaleatório com seed (mulberry32).
 * Toda aleatoriedade da simulação passa por aqui, para os testes serem reproduzíveis.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Número em [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Número em [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Inteiro em [min, max] (inclusivo). */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** Verdadeiro com probabilidade p. */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Elemento aleatório de uma lista não vazia. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick: lista vazia');
    return items[this.int(0, items.length - 1)] as T;
  }

  /** Estado interno (para salvar/restaurar). */
  getState(): number {
    return this.state;
  }

  setState(state: number): void {
    this.state = state >>> 0;
  }
}

/** Seed nova a partir do relógio (para partidas reais; testes usam seeds fixas). */
export function randomSeed(): number {
  return (Date.now() ^ Math.floor(Math.random() * 0xffffffff)) >>> 0;
}
