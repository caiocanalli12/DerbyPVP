/**
 * Limite de vozes simultâneas por tipo de som (lógica pura, testável).
 *
 * Cada som tocado é uma "voz" que termina num instante conhecido do relógio do áudio. Se já houver
 * o máximo de vozes do mesmo tipo tocando, as mais antigas são devolvidas para serem cortadas.
 */
export class VoiceLimiter<V> {
  private readonly active = new Map<string, { end: number; voice: V }[]>();

  constructor(private readonly maxPerType: number) {}

  /**
   * Registra uma voz do tipo `type` que toca até `end` (relógio do áudio). Devolve as vozes que
   * precisam ser cortadas para respeitar o limite (as mais antigas ainda tocando).
   */
  add(type: string, now: number, end: number, voice: V): V[] {
    const list = this.prune(type, now);
    list.push({ end, voice });
    const evicted: V[] = [];
    while (list.length > this.maxPerType) evicted.push(list.shift()!.voice);
    return evicted;
  }

  /** Quantas vozes do tipo ainda tocam em `now`. */
  count(type: string, now: number): number {
    return this.prune(type, now).length;
  }

  /** Devolve todas as vozes ainda tocando em `now` e esquece todas (ao cortar tudo). */
  drain(now: number): V[] {
    const out: V[] = [];
    for (const list of this.active.values()) for (const v of list) if (v.end > now) out.push(v.voice);
    this.active.clear();
    return out;
  }

  private prune(type: string, now: number): { end: number; voice: V }[] {
    const list = (this.active.get(type) ?? []).filter((v) => v.end > now);
    this.active.set(type, list);
    return list;
  }
}
