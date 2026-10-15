/**
 * Peças puras da sincronização do visitante: o buffer de interpolação dos snapshots, o filtro de
 * eventos repetidos e a medida do ping.
 */

/** Algo com o tick do anfitrião em que foi tirado. */
export interface Timed {
  tick: number;
}

/** Quão rápido a estimativa do relógio do anfitrião acompanha pacotes mais lentos (por pacote). */
const OFFSET_SMOOTHING = 0.03;

/**
 * Buffer de interpolação: guarda os snapshots em ordem de tick e, para o instante de desenho (o
 * relógio estimado do anfitrião menos `delay`), devolve os dois que o cercam e a fração entre eles.
 *
 * - Atrasado (de antes do que já está sendo desenhado) ou repetido: descartado.
 * - Fora de ordem: entra no lugar certo.
 * - Relógio do anfitrião: estimado pela diferença entre o tick do snapshot e a hora local em que
 *   chegou. Um pacote que chega mais cedo do que o esperado ajusta na hora; os atrasados puxam a
 *   estimativa devagar (um pacote atrasado não faz o desenho dar um salto para trás).
 * - Antes do primeiro snapshot desenha o primeiro; passou do último, para nele (sem extrapolar).
 */
export class SnapshotBuffer<S extends Timed> {
  private items: S[] = [];
  private offset: number | null = null;
  /** Tick do snapshot que está sendo desenhado (nada mais antigo entra). */
  private baseTick = -Infinity;

  constructor(
    private readonly delay: number,
    private readonly tickTime: number,
    private readonly capacity = 64,
  ) {}

  /** Guarda um snapshot recebido em `now` (s, relógio local). Devolve se guardou. */
  push(s: S, now: number): boolean {
    if (s.tick <= this.baseTick) return false;
    if (this.items.some((x) => x.tick === s.tick)) return false;
    let i = this.items.length;
    while (i > 0 && this.items[i - 1]!.tick > s.tick) i--;
    this.items.splice(i, 0, s);
    while (this.items.length > this.capacity) this.items.shift();
    const sample = s.tick * this.tickTime - now;
    if (this.offset === null || sample > this.offset) this.offset = sample;
    else this.offset += (sample - this.offset) * OFFSET_SMOOTHING;
    return true;
  }

  /** Instante (s, relógio do anfitrião) que deve aparecer na tela agora. */
  renderTime(now: number): number | null {
    return this.offset === null ? null : now + this.offset - this.delay;
  }

  /** Os dois snapshots em volta do instante de desenho e a fração entre eles (0..1). */
  sample(now: number): { a: S; b: S; alpha: number; tick: number } | null {
    const t = this.renderTime(now);
    if (t === null || this.items.length === 0) return null;
    const tick = t / this.tickTime;
    // A folga evita que um arredondamento (13,9999999 em vez de 14) deixe a foto anterior na vez.
    while (this.items.length >= 2 && this.items[1]!.tick <= tick + 1e-6) this.items.shift();
    const a = this.items[0]!;
    const b = this.items[1] ?? a;
    this.baseTick = Math.max(this.baseTick, a.tick);
    const alpha = b === a ? 0 : Math.min(1, Math.max(0, (tick - a.tick) / (b.tick - a.tick)));
    return { a, b, alpha, tick };
  }

  /** O snapshot mais novo recebido. */
  newest(): S | null {
    return this.items[this.items.length - 1] ?? null;
  }

  get size(): number {
    return this.items.length;
  }

  clear(): void {
    this.items = [];
    this.offset = null;
    this.baseTick = -Infinity;
  }
}

/** Lembra os ids de eventos já disparados (cada um dispara uma vez só, mesmo repetido ou fora de ordem). */
export class EventDeduper {
  private readonly seen = new Set<number>();
  private max = 0;

  /** Primeira vez que este id aparece? (E marca como visto.) */
  fresh(id: number): boolean {
    if (this.seen.has(id) || id <= this.max - EventDeduper.WINDOW) return false;
    this.seen.add(id);
    if (id > this.max) {
      this.max = id;
      // Esquece os muito antigos (nunca mais vão chegar).
      if (this.seen.size > EventDeduper.WINDOW * 2) for (const x of this.seen) if (x <= this.max - EventDeduper.WINDOW) this.seen.delete(x);
    }
    return true;
  }

  static readonly WINDOW = 4096;
}

/** Cor do ping no placar: verde até 80 ms, amarelo até 150 ms, vermelho acima. */
export function pingColor(ms: number): 'green' | 'yellow' | 'red' {
  return ms <= 80 ? 'green' : ms <= 150 ? 'yellow' : 'red';
}

/** Ping (ida e volta, ms) suavizado. */
export class PingMeter {
  private value: number | null = null;

  /** Uma resposta chegou: `sentAt` e `now` em ms. */
  sample(sentAt: number, now: number): void {
    const rtt = Math.max(0, now - sentAt);
    this.value = this.value === null ? rtt : this.value + (rtt - this.value) * 0.3;
  }

  get ms(): number | null {
    return this.value === null ? null : Math.round(this.value);
  }
}
