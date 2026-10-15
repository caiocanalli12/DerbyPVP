/**
 * Lado do anfitrião na partida online: ele roda a simulação oficial (a mesma de sempre).
 *
 * - Os comandos do visitante chegam como `input` e alimentam o `RemoteSource` (fonte do time 1).
 * - Os eventos de cada quadro (do mundo, da partida e os sons) vão para uma caixa de saída, cada um
 *   com um id único, e seguem no próximo snapshot.
 * - Snapshot a cada NET_SNAPSHOT_TICKS ticks; antes de a partida começar (esperando o visitante
 *   ficar pronto), a cada NET_IDLE_SNAPSHOT_TIME.
 */
import { NET_SNAPSHOT_TICKS } from '../config/constants';
import type { SimEvent } from '../sim/events';
import type { Match, MatchEvent } from '../sim/match';
import type { SoundEvent } from '../sim/sound';
import { RemoteSource } from './inputs';
import type { NetSession } from './peer';
import { PROTOCOL_VERSION } from './protocol';
import { encodeSnapshot } from './snapshot';
import type { NetEvent } from './snapshot';

/** No máximo tantos eventos por snapshot (o resto segue no próximo). */
const EVENTS_PER_SNAPSHOT = 64;

/** Eventos do mundo que o desenho do visitante usa. */
function forwarded(e: SimEvent): boolean {
  switch (e.type) {
    case 'pass':
    case 'shot':
    case 'tackleStart':
    case 'tackle':
    case 'save':
    case 'goal':
      return true;
    case 'contact':
      return e.kind === 'post' || e.kind === 'bar';
    default:
      return false;
  }
}

export class HostLink {
  readonly remote = new RemoteSource();
  /** O visitante avisou que está pronto (texturas desenhadas). */
  guestReady = false;
  private outbox: NetEvent[] = [];
  private eventSeq = 0;
  private lastTick = -Infinity;
  private readonly off: () => void;

  constructor(private readonly session: NetSession) {
    this.off = session.listen((e) => {
      if (e.kind !== 'message') return;
      if (e.msg.type === 'input') this.remote.receive(e.msg);
      else if (e.msg.type === 'ready') this.guestReady = true;
    });
  }

  /** Guarda os eventos drenados num quadro (tick atual) para o próximo snapshot. */
  push(tick: number, world: readonly SimEvent[], match: readonly MatchEvent[], sounds: readonly SoundEvent[]): void {
    for (const e of world) if (forwarded(e)) this.outbox.push({ id: ++this.eventSeq, t: tick, k: 'w', e });
    for (const e of match) {
      if (e.type === 'goal' || e.type === 'penaltyKick' || e.type === 'penaltyResult') this.outbox.push({ id: ++this.eventSeq, t: tick, k: 'm', e });
    }
    for (const s of sounds) {
      const { id: _id, ...cue } = s;
      this.outbox.push({ id: ++this.eventSeq, t: tick, k: 's', e: cue });
    }
  }

  /** Manda o snapshot do tick, se já deu o intervalo (ou se `force`). */
  maybeSend(match: Match, tick: number, force = false): void {
    if (!force && tick - this.lastTick < NET_SNAPSHOT_TICKS) return;
    this.lastTick = tick;
    const events = this.outbox.splice(0, EVENTS_PER_SNAPSHOT);
    this.session.send(encodeSnapshot(match, tick, this.remote.ack, events, PROTOCOL_VERSION));
  }

  dispose(): void {
    this.off();
  }
}
