import { describe, expect, it } from 'vitest';
import { NET_INTERP_DELAY, SIM_DT } from '../src/config/constants';
import { Rng } from '../src/core/rng';
import { GuestLink } from '../src/net/guest';
import { HostLink } from '../src/net/host';
import { GuestInputTracker, RemoteSource } from '../src/net/inputs';
import type { NetSession, SessionEvent } from '../src/net/peer';
import { parseMessage, PROTOCOL_VERSION } from '../src/net/protocol';
import type { InputMessage, NetMessage } from '../src/net/protocol';
import { applySnapshot, encodeSnapshot } from '../src/net/snapshot';
import type { NetEvent, SnapshotMessage } from '../src/net/snapshot';
import { EventDeduper, PingMeter, pingColor, SnapshotBuffer } from '../src/net/sync';
import { emptyCommand, isValidCommand } from '../src/sim/command';
import type { CommandSource, TeamCommand } from '../src/sim/command';
import { CpuSource } from '../src/sim/cpu';
import { createMatch, drainMatchEvents, drainSounds, stepMatch } from '../src/sim/match';
import { drainEvents } from '../src/sim/world';

// ---------------------------------------------------------------------------
// Comandos do visitante
// ---------------------------------------------------------------------------

function cmd(over: Partial<TeamCommand> = {}): TeamCommand {
  return { ...emptyCommand(), ...over };
}

/** O visitante segura o chute por `hold` ticks a partir de `at` e toca o passe nos ticks de `passes`. */
function guestScript(ticks: number, passes: number[], shots: [at: number, hold: number][]): TeamCommand[] {
  const out: TeamCommand[] = [];
  let held = false;
  for (let t = 0; t < ticks; t++) {
    const shot = shots.find(([at, hold]) => t >= at && t < at + hold);
    const now = shot !== undefined;
    out.push(cmd({ moveX: 1, passPressed: passes.includes(t), shootHeld: now, shootPressed: now && !held, shootReleased: !now && held }));
    held = now;
  }
  return out;
}

describe('comandos do visitante pela rede', () => {
  it('nenhum toque se perde, mesmo faltando pacotes (contadores acumulados)', () => {
    const script = guestScript(400, [10, 11, 50, 120, 121, 122, 300], [
      [60, 40],
      [200, 3],
    ]);
    const tracker = new GuestInputTracker();
    const msgs = script.map((c, t) => tracker.next(t, c));
    const host = new RemoteSource();
    const rng = new Rng(9);
    let passes = 0;
    let presses = 0;
    let releases = 0;
    let heldTicks = 0;
    for (let t = 0; t < 420; t++) {
      // 40% dos pacotes se perdem; os outros chegam com 0–3 ticks de atraso.
      for (const m of msgs) if (m.tick === t - rng.int(0, 3) && rng.chance(0.6)) host.receive(m);
      const c = host.getCommand(t);
      expect(isValidCommand(c)).toBe(true);
      if (c.passPressed) passes++;
      if (c.shootPressed) presses++;
      if (c.shootReleased) releases++;
      if (c.shootHeld) heldTicks++;
    }
    // Depois do último pacote, tudo que faltava aparece.
    for (let t = 420; t < 440; t++) {
      host.receive(msgs[msgs.length - 1]!);
      const c = host.getCommand(t);
      if (c.passPressed) passes++;
      if (c.shootPressed) presses++;
      if (c.shootReleased) releases++;
    }
    expect(passes).toBe(7);
    expect(presses).toBe(2);
    expect(releases).toBe(2);
    // O chute longo ficou preso por perto do que o visitante segurou (40 ticks).
    expect(heldTicks).toBeGreaterThan(30);
  });

  it('apertar e soltar entre dois pacotes vira um toque (aperta e solta no mesmo tick)', () => {
    const tracker = new GuestInputTracker();
    const host = new RemoteSource();
    tracker.next(0, cmd({ shootPressed: true, shootHeld: true }));
    const m = tracker.next(1, cmd({ shootReleased: true }));
    host.receive(m);
    const c = host.getCommand(5);
    expect(c).toMatchObject({ shootPressed: true, shootReleased: true, shootHeld: false });
    expect(isValidCommand(c)).toBe(true);
    expect(host.getCommand(6)).toMatchObject({ shootPressed: false, shootReleased: false, shootHeld: false });
  });

  it('mensagens velhas, repetidas ou com contadores voltando são ignoradas', () => {
    const tracker = new GuestInputTracker();
    const a = tracker.next(0, cmd({ moveX: 1 }));
    const b = tracker.next(1, cmd({ moveX: -1, passPressed: true }));
    const host = new RemoteSource();
    host.receive(b);
    host.receive(a);
    host.receive(b);
    expect(host.getCommand(0)).toMatchObject({ moveX: -1, passPressed: true });
    expect(host.getCommand(1).passPressed).toBe(false);
    const forged: InputMessage = { ...b, seq: b.seq + 5, pass: 0 };
    host.receive(forged);
    expect(host.ack).toBe(b.seq);
  });

  it('a direção diagonal vai arredondada e continua válida', () => {
    const tracker = new GuestInputTracker();
    const m = tracker.next(3, cmd({ moveX: Math.SQRT1_2, moveY: -Math.SQRT1_2 }));
    expect(parseMessage(JSON.parse(JSON.stringify(m)))).toEqual(m);
    const host = new RemoteSource();
    host.receive(m);
    expect(isValidCommand(host.getCommand(0))).toBe(true);
  });

  it('o protocolo recusa comandos malformados', () => {
    const good = new GuestInputTracker().next(1, cmd());
    for (const bad of [
      { ...good, mx: 2 },
      { ...good, mx: 0.9, my: 0.9 },
      { ...good, aim: 2 },
      { ...good, held: 'sim' },
      { ...good, pass: -1 },
      { ...good, seq: 1.5 },
      { ...good, my: Number.NaN },
    ]) {
      expect(parseMessage(bad)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Buffer de interpolação, eventos e ping
// ---------------------------------------------------------------------------

const snap = (tick: number): { tick: number } => ({ tick });

describe('buffer de interpolação', () => {
  it('desenha entre os dois snapshots em volta do instante (atraso de ~100 ms)', () => {
    const buf = new SnapshotBuffer<{ tick: number }>(0.1, 1 / 60);
    expect(buf.sample(0)).toBeNull();
    // Snapshots a cada 2 ticks, chegando na hora (relógio local = relógio do anfitrião).
    for (let t = 0; t <= 20; t += 2) buf.push(snap(t), t / 60);
    const s = buf.sample(20 / 60)!;
    // 20/60 - 0,1 s = tick 14.
    expect(s.tick).toBeCloseTo(14, 6);
    expect(s.a.tick).toBe(14);
    expect(s.b.tick).toBe(16);
    expect(s.alpha).toBeCloseTo(0, 6);
    const s2 = buf.sample(21 / 60)!;
    expect(s2.a.tick).toBe(14);
    expect(s2.alpha).toBeCloseTo(0.5, 6);
  });

  it('fora de ordem entra no lugar; atrasado demais e repetido são descartados', () => {
    const buf = new SnapshotBuffer<{ tick: number }>(0.1, 1 / 60);
    buf.push(snap(10), 10 / 60);
    buf.push(snap(14), 14 / 60);
    expect(buf.push(snap(12), 14 / 60)).toBe(true);
    expect(buf.push(snap(12), 14 / 60)).toBe(false);
    const s = buf.sample(19 / 60)!;
    expect(s.a.tick).toBe(12);
    expect(s.b.tick).toBe(14);
    // Um que chega agora, mais velho do que o que está sendo desenhado: descartado.
    expect(buf.push(snap(11), 19 / 60)).toBe(false);
  });

  it('pacote atrasado não faz o desenho voltar; sem pacotes novos, para no último (sem extrapolar)', () => {
    const buf = new SnapshotBuffer<{ tick: number }>(0.1, 1 / 60);
    for (let t = 0; t <= 30; t += 2) buf.push(snap(t), t / 60);
    const before = buf.renderTime(30 / 60)!;
    // Um pacote que demorou 200 ms a mais.
    buf.push(snap(32), 32 / 60 + 0.2);
    expect(buf.renderTime(30 / 60)!).toBeGreaterThan(before - 0.02);
    // Bem depois do último: fica no último.
    const end = buf.sample(5)!;
    expect(end.a.tick).toBe(32);
    expect(end.b).toBe(end.a);
    expect(end.alpha).toBe(0);
  });

  it('eventos com o mesmo id disparam uma vez só, mesmo fora de ordem', () => {
    const d = new EventDeduper();
    const fired = [5, 3, 5, 4, 3, 6, 6, 1].filter((id) => d.fresh(id));
    expect(fired).toEqual([5, 3, 4, 6, 1]);
  });

  it('ping suavizado e as cores do placar', () => {
    const p = new PingMeter();
    expect(p.ms).toBeNull();
    p.sample(1000, 1050);
    expect(p.ms).toBe(50);
    p.sample(2000, 2150);
    expect(p.ms).toBe(80);
    expect([pingColor(40), pingColor(80), pingColor(81), pingColor(150), pingColor(151)]).toEqual(['green', 'green', 'yellow', 'yellow', 'red']);
  });
});

// ---------------------------------------------------------------------------
// Snapshots
// ---------------------------------------------------------------------------

/** Uma partida jogada por dois CPUs por `seconds`, drenando os eventos. */
function playedMatch(seconds: number, seed = 4): ReturnType<typeof createMatch> {
  const m = createMatch(seed);
  const src = [new CpuSource(m, 0, 'medio', 1), new CpuSource(m, 1, 'medio', 2)];
  for (let t = 0; t < seconds / SIM_DT; t++) {
    stepMatch(m, [src[0]!.getCommand(t), src[1]!.getCommand(t)], SIM_DT);
    drainEvents(m.world);
    drainMatchEvents(m);
    drainSounds(m);
  }
  return m;
}

describe('snapshot', () => {
  it('passa por JSON e pela validação igual, e é pequeno', () => {
    const m = playedMatch(20);
    const events: NetEvent[] = [
      { id: 1, t: 3, k: 'w', e: { type: 'shot', player: 7, charge: 0.6, speed: 18 } },
      { id: 2, t: 3, k: 's', e: { type: 'kick', x: 22.5, power: 0.6 } },
      { id: 3, t: 4, k: 'm', e: { type: 'goal', goal: { team: 1, scorer: 7, ownGoal: false, period: '1T', clock: 12 } } },
    ];
    const s = encodeSnapshot(m, 1200, 77, events, PROTOCOL_VERSION);
    const json = JSON.stringify(s);
    expect(parseMessage(JSON.parse(json))).toEqual(s);
    expect(json.length).toBeLessThan(1400);
  });

  it('aplicado num espelho, reproduz o que o desenho lê', () => {
    const m = playedMatch(30, 6);
    const s = encodeSnapshot(m, 1800, 0, [], PROTOCOL_VERSION);
    const mirror = createMatch(999);
    applySnapshot(mirror, s, s, 0);
    expect(mirror.phase).toBe(m.phase);
    expect(mirror.period).toBe(m.period);
    expect(mirror.score).toEqual(m.score);
    expect(mirror.clock).toBeCloseTo(m.clock, 2);
    expect(mirror.world.controlled).toEqual(m.world.controlled);
    expect(mirror.world.ball.owner).toBe(m.world.ball.owner);
    expect(mirror.world.ball.x).toBeCloseTo(m.world.ball.x, 2);
    mirror.world.players.forEach((p, i) => {
      const o = m.world.players[i]!;
      expect(p.x).toBeCloseTo(o.x, 2);
      expect(p.y).toBeCloseTo(o.y, 2);
      expect(p.state).toBe(o.state);
    });
    expect(mirror.world.keepers.map((k) => k.mode)).toEqual(m.world.keepers.map((k) => k.mode));
  });

  it('interpola as posições entre duas fotos (prev = a, atual = b)', () => {
    const m = playedMatch(10, 8);
    const a = encodeSnapshot(m, 600, 0, [], PROTOCOL_VERSION);
    const b = { ...a, tick: 602, p: a.p.map((v, i) => (i % 8 === 0 ? v + 0.2 : v)) };
    const mirror = createMatch(1);
    applySnapshot(mirror, a, b, 0.5);
    expect(mirror.world.players[3]!.prevX).toBeCloseTo(a.p[3 * 8]!, 6);
    expect(mirror.world.players[3]!.x).toBeCloseTo(a.p[3 * 8]! + 0.2, 6);
  });

  it('recusa snapshots malformados', () => {
    const s = encodeSnapshot(playedMatch(2), 120, 0, [], PROTOCOL_VERSION);
    const base = JSON.parse(JSON.stringify(s)) as Record<string, unknown>;
    const p = base.p as number[];
    const m = base.m as number[];
    for (const bad of [
      { ...base, p: p.slice(1) },
      { ...base, m: [99, ...m.slice(1)] },
      { ...base, p: [...p.slice(0, 5), 9, ...p.slice(6)] },
      { ...base, b: [1, 2, 3, 4, 5, 6, 42] },
      { ...base, c: [0, 10] },
      { ...base, tick: -1 },
      { ...base, it: 'x'.repeat(500) },
      { ...base, so: ['gx', '', -1] },
      { ...base, e: [{ id: 1, t: 1, k: 'w', e: { type: 'shot', player: 12, charge: 1, speed: 1 } }] },
      { ...base, e: [{ id: 1, t: 1, k: 's', e: { type: 'boom', x: 1 } }] },
      { ...base, e: [{ id: 1, t: 1, k: 'x', e: {} }] },
      { ...base, m: m.map((v, i) => (i === 2 ? Number.NaN : v)) },
    ]) {
      expect(parseMessage(bad)).toBeNull();
    }
  });
});

// ---------------------------------------------------------------------------
// Anfitrião → visitante, de ponta a ponta (sem rede: pacotes atrasados na mão)
// ---------------------------------------------------------------------------

/** Sessão falsa: guarda o que foi mandado e entrega o que chega aos ouvintes. */
class FakeSession {
  sent: NetMessage[] = [];
  private listeners = new Set<(e: SessionEvent) => void>();
  listen(fn: (e: SessionEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  send(m: NetMessage): void {
    this.sent.push(m);
  }
  deliver(msg: NetMessage): void {
    for (const fn of this.listeners) fn({ kind: 'message', msg });
  }
}

describe('partida pela rede (anfitrião → visitante)', () => {
  it('o visitante vê o mesmo placar e cada evento uma vez só, com atraso e variação', () => {
    const hostSession = new FakeSession();
    const guestSession = new FakeSession();
    const host = new HostLink(hostSession as unknown as NetSession);
    let clock = 0;
    const guest = new GuestLink(guestSession as unknown as NetSession, () => clock);
    const m = createMatch(12);
    // O time do visitante é do CPU (no lugar do teclado); o do anfitrião também.
    const sources: CommandSource[] = [new CpuSource(m, 0, 'dificil', 3), new CpuSource(m, 1, 'facil', 4)];
    const mirror = createMatch(1);
    const rng = new Rng(77);
    const inFlight: { at: number; raw: string }[] = [];
    const hostSounds: number[] = [];
    const firedSounds: string[] = [];
    let hostGoals = 0;
    let guestGoals = 0;
    const seconds = 150;
    for (let tick = 0; tick < seconds / SIM_DT; tick++) {
      clock = tick * SIM_DT;
      stepMatch(m, [sources[0]!.getCommand(tick), sources[1]!.getCommand(tick)], SIM_DT);
      const world = drainEvents(m.world);
      const matchEvents = drainMatchEvents(m);
      const sounds = drainSounds(m);
      hostSounds.push(...sounds.map((s) => s.id));
      hostGoals += matchEvents.filter((e) => e.type === 'goal').length;
      host.push(tick, world, matchEvents, sounds);
      host.maybeSend(m, tick);
      // Na rede: 30–90 ms (às vezes 200 ms), em ordem (canal confiável), como texto.
      for (const msg of hostSession.sent.splice(0)) {
        const delay = rng.chance(0.05) ? 0.2 : rng.range(0.03, 0.09);
        const last = inFlight[inFlight.length - 1]?.at ?? 0;
        inFlight.push({ at: Math.max(last, clock + delay), raw: JSON.stringify(msg) });
      }
      while (inFlight.length && inFlight[0]!.at <= clock) {
        const parsed = parseMessage(JSON.parse(inFlight.shift()!.raw));
        expect(parsed).not.toBeNull();
        guestSession.deliver(parsed!);
      }
      // O visitante desenha a 60 quadros por segundo.
      const f = guest.frame(mirror, 0);
      if (f) {
        for (const e of f.events) {
          if (e.k === 's') firedSounds.push(`${e.id}`);
          if (e.k === 'm' && e.e.type === 'goal') guestGoals++;
        }
      }
    }
    // Deixa o resto chegar e ser desenhado.
    for (let i = 0; i < 60; i++) {
      clock += SIM_DT;
      while (inFlight.length && inFlight[0]!.at <= clock) guestSession.deliver(parseMessage(JSON.parse(inFlight.shift()!.raw))!);
      const f = guest.frame(mirror, 0);
      if (f) for (const e of f.events) if (e.k === 's') firedSounds.push(`${e.id}`);
      if (f) for (const e of f.events) if (e.k === 'm' && e.e.type === 'goal') guestGoals++;
    }
    expect(mirror.score).toEqual(m.score);
    expect(guestGoals).toBe(hostGoals);
    expect(hostGoals).toBeGreaterThan(0);
    // Cada som do anfitrião tocou exatamente uma vez no visitante.
    expect(new Set(firedSounds).size).toBe(firedSounds.length);
    expect(firedSounds.length).toBe(hostSounds.length);
    // O desenho fica ~100 ms atrás do anfitrião.
    expect(guest.buffer.renderTime(clock)! / SIM_DT).toBeLessThan(seconds / SIM_DT + 60);
    expect(NET_INTERP_DELAY).toBeGreaterThan(0);
  });

  it('o visitante repete o "pronto" até a partida começar', () => {
    const session = new FakeSession();
    let clock = 0;
    const guest = new GuestLink(session as unknown as NetSession, () => clock);
    for (let i = 0; i < 300; i++) {
      clock = i * SIM_DT;
      guest.announceReady();
    }
    const readies = session.sent.filter((m) => m.type === 'ready').length;
    expect(readies).toBeGreaterThanOrEqual(4);
    const m = createMatch(2);
    const s: SnapshotMessage = encodeSnapshot(m, 5, 0, [], PROTOCOL_VERSION);
    guest.receive(s);
    session.sent = [];
    clock += 2;
    guest.announceReady();
    expect(session.sent).toHaveLength(0);
  });
});
