/**
 * Lado do visitante na partida online: ele não simula a partida oficial.
 *
 * - Manda o comando de cada tick (`GuestInputTracker`) e repete o "pronto" até a partida começar.
 * - Guarda os snapshots num buffer de interpolação e desenha um espelho da partida ~100 ms atrás
 *   do anfitrião (`applySnapshot`), disparando cada evento uma vez só, quando o desenho chega nele.
 * - Previsão leve: o jogador que ele controla anda na hora com o próprio comando (a mesma física de
 *   movimento) e é corrigido aos poucos quando chega o estado oficial (`GuestPredictor`). Bola,
 *   passes, chutes e carrinhos são sempre do anfitrião.
 */
import {
  DRIBBLE_OFFSET,
  NET_INTERP_DELAY,
  NET_PREDICT_CORRECTION_TIME,
  NET_PREDICT_SNAP_DIST,
  NET_READY_RESEND,
  PLAYER_DRIBBLE_SPEED_FACTOR,
  PLAYER_RUN_SPEED,
  SHOT_CHARGE_TIME,
  SIM_DT,
} from '../config/constants';
import type { TeamCommand } from '../sim/command';
import type { Match } from '../sim/match';
import { clampToField, createPlayer, integrateMovement } from '../sim/player';
import type { Player } from '../sim/player';
import { GuestInputTracker } from './inputs';
import type { NetSession } from './peer';
import { message } from './protocol';
import { applySnapshot } from './snapshot';
import type { NetEvent, SnapshotMessage } from './snapshot';
import { EventDeduper, SnapshotBuffer } from './sync';

/** Índices nas listas do snapshot (ver `SnapshotMessage`). */
const P_FIELDS = 8;
const PHASE_JOGANDO = 1;
const STATE_NORMAL = 0;
/** Comandos guardados para refazer a previsão (2 s). */
const MAX_HISTORY = 120;

interface SentInput {
  seq: number;
  mx: number;
  my: number;
}

/**
 * Previsão do jogador do visitante: parte do estado oficial mais novo e reaplica os comandos que o
 * anfitrião ainda não tinha usado (`ack`); o desenho não pula, a diferença some em
 * NET_PREDICT_CORRECTION_TIME (ou pula, se passar de NET_PREDICT_SNAP_DIST).
 */
export class GuestPredictor {
  /** Jogador previsto (-1 = nenhum: fora do jogo corrido, caído, deslizando...). */
  id = -1;
  private readonly body: Player = createPlayer(0, 1, 'ATA');
  private prevX = 0;
  private prevY = 0;
  private offX = 0;
  private offY = 0;
  private dribbling = false;
  private readonly inputs: SentInput[] = [];

  /** Um tick local com o comando já mandado. */
  step(seq: number, cmd: TeamCommand): void {
    this.inputs.push({ seq, mx: cmd.moveX, my: cmd.moveY });
    if (this.inputs.length > MAX_HISTORY) this.inputs.shift();
    if (this.id < 0) return;
    this.prevX = this.body.x;
    this.prevY = this.body.y;
    this.integrate(cmd.moveX, cmd.moveY);
    const k = Math.exp(-SIM_DT / NET_PREDICT_CORRECTION_TIME);
    this.offX *= k;
    this.offY *= k;
  }

  /** Chegou um snapshot novo: refaz a previsão a partir dele. */
  reconcile(s: SnapshotMessage): void {
    const id = s.c[1]!;
    const o = id * P_FIELDS;
    const active = s.m[0] === PHASE_JOGANDO && s.p[o + 5] === STATE_NORMAL && id >= 0;
    if (!active) {
      this.id = -1;
      return;
    }
    const before = this.id === id ? { x: this.body.x + this.offX, y: this.body.y + this.offY } : null;
    const b = this.body;
    b.x = s.p[o]!;
    b.y = s.p[o + 1]!;
    b.vx = s.p[o + 2]!;
    b.vy = s.p[o + 3]!;
    b.facing = s.p[o + 4]!;
    this.dribbling = s.b[6] === id;
    let px = b.x;
    let py = b.y;
    for (const input of this.inputs) {
      if (input.seq <= s.ack) continue;
      px = b.x;
      py = b.y;
      this.integrate(input.mx, input.my);
    }
    this.prevX = px;
    this.prevY = py;
    this.id = id;
    if (!before) {
      this.offX = 0;
      this.offY = 0;
      return;
    }
    // O desenho fica onde estava; a diferença some aos poucos (ou pula, se for grande).
    this.offX = before.x - b.x;
    this.offY = before.y - b.y;
    if (Math.hypot(this.offX, this.offY) > NET_PREDICT_SNAP_DIST) {
      this.offX = 0;
      this.offY = 0;
    }
  }

  private integrate(mx: number, my: number): void {
    const b = this.body;
    b.moveX = mx;
    b.moveY = my;
    b.maxSpeed = PLAYER_RUN_SPEED * (this.dribbling ? PLAYER_DRIBBLE_SPEED_FACTOR : 1);
    integrateMovement(b, SIM_DT);
    clampToField(b);
  }

  /** Onde desenhar o jogador previsto (`alpha` = fração do tick local). */
  render(alpha: number): { x: number; y: number; vx: number; vy: number; facing: number } {
    const b = this.body;
    return {
      x: this.prevX + (b.x - this.prevX) * alpha + this.offX,
      y: this.prevY + (b.y - this.prevY) * alpha + this.offY,
      vx: b.vx,
      vy: b.vy,
      facing: b.facing,
    };
  }
}

export class GuestLink {
  readonly buffer = new SnapshotBuffer<SnapshotMessage>(NET_INTERP_DELAY, SIM_DT);
  readonly predictor = new GuestPredictor();
  private readonly deduper = new EventDeduper();
  private readonly tracker = new GuestInputTracker();
  /** Eventos esperando o desenho chegar no tick deles. */
  private pending: NetEvent[] = [];
  private readonly off: () => void;
  private readySentAt = -Infinity;
  /** A partida começou (já veio um snapshot de um tick depois do primeiro). */
  started = false;
  /** Carga prevista do próprio chute (o anfitrião confirma depois). */
  private localCharge: number | null = null;

  constructor(
    private readonly session: NetSession,
    private readonly now: () => number = () => performance.now() / 1000,
  ) {
    this.off = session.listen((e) => {
      if (e.kind === 'message' && e.msg.type === 'snapshot') this.receive(e.msg);
    });
  }

  /** Snapshot recebido (também usado nos testes, sem rede). */
  receive(s: SnapshotMessage): void {
    if (!this.buffer.push(s, this.now())) return;
    if (s.tick > 0) this.started = true;
    for (const e of s.e) if (this.deduper.fresh(e.id)) this.pending.push(e);
    const newest = this.buffer.newest();
    if (newest === s) this.predictor.reconcile(s);
  }

  /** Repete o "pronto" até a partida começar. */
  announceReady(): void {
    const t = this.now();
    if (this.started || t - this.readySentAt < NET_READY_RESEND) return;
    this.readySentAt = t;
    this.session.send(message({ type: 'ready' }));
  }

  /** Comando de um tick local: manda, avança a previsão e a carga prevista do chute. */
  sendInput(tick: number, cmd: TeamCommand, carrying: boolean): void {
    const m = this.tracker.next(tick, cmd);
    this.session.send(m);
    this.predictor.step(m.seq, cmd);
    if (cmd.shootPressed && carrying) this.localCharge = 0;
    if (this.localCharge !== null) {
      if (cmd.shootHeld && carrying) this.localCharge = Math.min(1, this.localCharge + SIM_DT / SHOT_CHARGE_TIME);
      else this.localCharge = null;
    }
  }

  /**
   * Aplica no espelho o estado do instante de desenho e devolve os eventos que chegaram na vez
   * deles (null antes do primeiro snapshot). `localAlpha` = fração do tick local (previsão).
   */
  frame(mirror: Match, localAlpha: number): { events: NetEvent[]; alpha: number } | null {
    const s = this.buffer.sample(this.now());
    if (!s) return null;
    applySnapshot(mirror, s.a, s.b, s.alpha);
    // Previsão: o jogador do visitante (e a bola, se estiver com ele) aparecem onde ele já está.
    const id = this.predictor.id;
    const w = mirror.world;
    if (id >= 0 && w.controlled[1] === id && mirror.phase === 'JOGANDO') {
      const p = w.players[id]!;
      if (p.state === 'normal') {
        const r = this.predictor.render(localAlpha);
        p.prevX = p.x = r.x;
        p.prevY = p.y = r.y;
        p.vx = r.vx;
        p.vy = r.vy;
        p.facing = r.facing;
        if (w.ball.owner === id && !w.ballInHands) {
          w.ball.prevX = w.ball.x = r.x + Math.cos(r.facing) * DRIBBLE_OFFSET;
          w.ball.prevY = w.ball.y = r.y + Math.sin(r.facing) * DRIBBLE_OFFSET;
          w.ball.prevZ = w.ball.z = 0;
        }
      }
      if (this.localCharge !== null) {
        w.humans[1].charging = true;
        w.humans[1].charge = Math.max(w.humans[1].charge, this.localCharge);
      }
    }
    const due: NetEvent[] = [];
    const keep: NetEvent[] = [];
    for (const e of this.pending) (e.t <= s.tick ? due : keep).push(e);
    this.pending = keep;
    return { events: due, alpha: s.alpha };
  }

  /** O jogador do visitante está com a bola (no estado oficial mais novo)? */
  carrying(): boolean {
    const n = this.buffer.newest();
    return n !== null && n.b[6] === n.c[1] && n.m[12] === 0;
  }

  dispose(): void {
    this.off();
  }
}
