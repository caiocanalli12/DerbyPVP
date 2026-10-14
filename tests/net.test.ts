import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NET_CONNECT_TIMEOUT, NET_HANDSHAKE_TIMEOUT } from '../src/config/constants';
import { NetSession } from '../src/net/peer';
import type { ConnLike, PeerFactory, PeerLike, SessionEvent } from '../src/net/peer';
import { compatible, GAME_VERSION, message, parseMessage, PROTOCOL_VERSION } from '../src/net/protocol';
import type { NetMessage } from '../src/net/protocol';
import {
  generateRoomCode,
  isRoomCodeChar,
  normalizeRoomCode,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  roomCodeFromSearch,
  roomLink,
  roomPeerId,
} from '../src/net/roomCode';
import { Rng } from '../src/core/rng';

// ---------------------------------------------------------------------------
// Código da sala
// ---------------------------------------------------------------------------

describe('código da sala', () => {
  it('5 caracteres, sem os ambíguos (0/O, 1/I/L)', () => {
    expect(ROOM_CODE_LENGTH).toBe(5);
    for (const ch of '0O1IL') expect(ROOM_CODE_ALPHABET).not.toContain(ch);
    const rng = new Rng(3);
    const seen = new Set<string>();
    for (let i = 0; i < 2000; i++) {
      const code = generateRoomCode(() => rng.next());
      expect(code).toMatch(/^[A-Z2-9]{5}$/);
      for (const ch of code) {
        expect(ROOM_CODE_ALPHABET).toContain(ch);
        seen.add(ch);
      }
    }
    // Usa o alfabeto inteiro.
    expect(seen.size).toBe(ROOM_CODE_ALPHABET.length);
    // Mesmo com random() no limite (perto de 1), não sai do alfabeto.
    expect(generateRoomCode(() => 0.9999999999)).toBe('99999');
  });

  it('normalização: minúsculas, espaços e hífens; inválido vira null', () => {
    expect(normalizeRoomCode('abc23')).toBe('ABC23');
    expect(normalizeRoomCode('  ab c-23 ')).toBe('ABC23');
    expect(normalizeRoomCode('ab\tc\n23')).toBe('ABC23');
    expect(normalizeRoomCode('ABC2')).toBeNull();
    expect(normalizeRoomCode('ABC234')).toBeNull();
    expect(normalizeRoomCode('ABC0O')).toBeNull();
    expect(normalizeRoomCode('ABCL1')).toBeNull();
    expect(normalizeRoomCode('AB#23')).toBeNull();
    expect(normalizeRoomCode('')).toBeNull();
    expect(isRoomCodeChar('a')).toBe(true);
    expect(isRoomCodeChar('7')).toBe(true);
    expect(isRoomCodeChar('o')).toBe(false);
    expect(isRoomCodeChar('ab')).toBe(false);
  });

  it('link da sala e leitura do ?sala=', () => {
    const link = roomLink('XK7PQ', { origin: 'https://exemplo.github.io', pathname: '/derby/' });
    expect(link).toBe('https://exemplo.github.io/derby/?sala=XK7PQ');
    expect(roomCodeFromSearch('?sala=xk7pq')).toBe('XK7PQ');
    expect(roomCodeFromSearch('?debug&sala=xk7pq')).toBe('XK7PQ');
    expect(roomCodeFromSearch('?sala=zz')).toBeNull();
    expect(roomCodeFromSearch('')).toBeNull();
    expect(roomPeerId('XK7PQ')).toMatch(/XK7PQ$/);
  });
});

// ---------------------------------------------------------------------------
// Protocolo
// ---------------------------------------------------------------------------

const VALID: NetMessage[] = [
  { type: 'hello', v: PROTOCOL_VERSION, game: GAME_VERSION, role: 'guest', session: 'abc123' },
  { type: 'select', v: PROTOCOL_VERSION, team: 'PAL', confirmed: false },
  { type: 'start', v: PROTOCOL_VERSION, teams: ['COR', 'COR'], weather: 'rain', seed: 4294967295 },
  { type: 'ready', v: PROTOCOL_VERSION },
  { type: 'rematch', v: PROTOCOL_VERSION, accept: true },
  { type: 'leave', v: PROTOCOL_VERSION, reason: 'full' },
  { type: 'ping', v: PROTOCOL_VERSION, t: 1234.5, reply: true },
];

describe('protocolo', () => {
  it('todas as mensagens passam por JSON e voltam iguais', () => {
    for (const m of VALID) expect(parseMessage(JSON.parse(JSON.stringify(m)))).toEqual(m);
  });

  it('message() põe a versão do protocolo', () => {
    expect(message({ type: 'ready' })).toEqual({ type: 'ready', v: PROTOCOL_VERSION });
    expect(message({ type: 'leave', reason: 'quit' })).toEqual({ type: 'leave', v: PROTOCOL_VERSION, reason: 'quit' });
  });

  it('campos desconhecidos são descartados', () => {
    const parsed = parseMessage({ type: 'ready', v: PROTOCOL_VERSION, extra: 'x'.repeat(1000) });
    expect(parsed).toEqual({ type: 'ready', v: PROTOCOL_VERSION });
  });

  it.each([
    ['nada', undefined],
    ['nulo', null],
    ['texto', 'oi'],
    ['número', 5],
    ['lista', [1, 2]],
    ['sem tipo', { v: PROTOCOL_VERSION }],
    ['tipo desconhecido', { type: 'hack', v: PROTOCOL_VERSION }],
    ['outra versão do protocolo', { type: 'ready', v: PROTOCOL_VERSION + 1 }],
    ['sem versão', { type: 'ready' }],
    ['hello sem papel', { type: 'hello', v: 1, game: GAME_VERSION, session: 'a' }],
    ['hello com papel errado', { type: 'hello', v: 1, game: GAME_VERSION, role: 'admin', session: 'a' }],
    ['hello com texto enorme', { type: 'hello', v: 1, game: 'x'.repeat(500), role: 'host', session: 'a' }],
    ['hello com sessão vazia', { type: 'hello', v: 1, game: GAME_VERSION, role: 'host', session: '' }],
    ['select com time inexistente', { type: 'select', v: 1, team: 'XXX', confirmed: true }],
    ['select sem confirmado', { type: 'select', v: 1, team: 'PAL' }],
    ['select com confirmado texto', { type: 'select', v: 1, team: 'PAL', confirmed: 'sim' }],
    ['start com 1 time', { type: 'start', v: 1, teams: ['PAL'], weather: 'rain', seed: 1 }],
    ['start com 3 times', { type: 'start', v: 1, teams: ['PAL', 'COR', 'BAR'], weather: 'rain', seed: 1 }],
    ['start com clima inválido', { type: 'start', v: 1, teams: ['PAL', 'COR'], weather: 'neve', seed: 1 }],
    ['start com semente negativa', { type: 'start', v: 1, teams: ['PAL', 'COR'], weather: 'rain', seed: -1 }],
    ['start com semente grande demais', { type: 'start', v: 1, teams: ['PAL', 'COR'], weather: 'rain', seed: 2 ** 40 }],
    ['start com semente fracionária', { type: 'start', v: 1, teams: ['PAL', 'COR'], weather: 'rain', seed: 1.5 }],
    ['rematch sem resposta', { type: 'rematch', v: 1 }],
    ['leave com motivo inventado', { type: 'leave', v: 1, reason: 'raiva' }],
    ['ping com tempo infinito', { type: 'ping', v: 1, t: Infinity, reply: false }],
    ['ping com tempo negativo', { type: 'ping', v: 1, t: -3, reply: false }],
    ['ping sem resposta', { type: 'ping', v: 1, t: 3 }],
  ])('rejeita: %s', (_, data) => {
    expect(parseMessage(data)).toBeNull();
  });

  it('o hello é lido mesmo com outra versão (para avisar), mas não é compatível', () => {
    const old = parseMessage({ type: 'hello', v: PROTOCOL_VERSION + 1, game: GAME_VERSION, role: 'host', session: 'a' });
    expect(old).not.toBeNull();
    if (old?.type !== 'hello') throw new Error('tipo');
    expect(compatible(old)).toBe(false);
    expect(compatible({ type: 'hello', v: PROTOCOL_VERSION, game: '0.0.1', role: 'host', session: 'a' })).toBe(false);
    expect(compatible({ type: 'hello', v: PROTOCOL_VERSION, game: GAME_VERSION, role: 'host', session: 'a' })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Sessão sobre uma rede falsa (servidor de sinalização e canais em memória)
// ---------------------------------------------------------------------------

type Fn = (...args: unknown[]) => void;

class Emitter {
  private readonly handlers = new Map<string, Fn[]>();
  on(event: string, fn: (...args: never[]) => void): this {
    // Os ouvintes recebem exatamente o que `emit` manda (o tipo de cada evento é do chamador).
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), fn as unknown as Fn]);
    return this;
  }
  emit(event: string, ...args: unknown[]): void {
    for (const fn of this.handlers.get(event) ?? []) fn(...args);
  }
}

class FakeConn extends Emitter implements ConnLike {
  open = false;
  closed = false;
  other: FakeConn | null = null;
  /** Mensagens recebidas (para os testes). */
  received: unknown[] = [];
  send(data: unknown): void {
    if (!this.open || !this.other) throw new Error('canal fechado');
    const copy: unknown = JSON.parse(JSON.stringify(data));
    const other = this.other;
    setTimeout(() => {
      if (!other.closed) {
        other.received.push(copy);
        other.emit('data', copy);
      }
    }, 1);
  }
  /** Manda algo cru (sem passar pelo protocolo), como um par mal-intencionado faria. */
  sendRaw(data: unknown): void {
    const other = this.other!;
    setTimeout(() => other.emit('data', data), 1);
  }
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.open = false;
    setTimeout(() => this.emit('close'), 1);
    this.other?.close();
  }
}

class FakeNetwork {
  readonly peers = new Map<string, FakePeer>();
  private n = 0;
  /** Faz a próxima conexão nunca abrir (rede que bloqueia o WebRTC). */
  blockWebRtc = false;
  readonly factory: PeerFactory = async (id) => new FakePeer(this, id ?? `aleatorio-${this.n++}`);
}

class FakePeer extends Emitter implements PeerLike {
  destroyed = false;
  /** Conexões recebidas (lado do anfitrião). */
  readonly incoming: FakeConn[] = [];
  constructor(
    private readonly net: FakeNetwork,
    readonly id: string,
  ) {
    super();
    setTimeout(() => {
      if (net.peers.has(id)) {
        this.emit('error', { type: 'unavailable-id' });
        return;
      }
      net.peers.set(id, this);
      this.emit('open', id);
    }, 5);
  }
  connect(id: string): ConnLike {
    const mine = new FakeConn();
    setTimeout(() => {
      const target = this.net.peers.get(id);
      if (!target || target.destroyed) {
        this.emit('error', { type: 'peer-unavailable' });
        return;
      }
      if (this.net.blockWebRtc) return;
      const theirs = new FakeConn();
      mine.other = theirs;
      theirs.other = mine;
      target.incoming.push(theirs);
      target.emit('connection', theirs);
      setTimeout(() => {
        mine.open = true;
        theirs.open = true;
        mine.emit('open');
        theirs.emit('open');
      }, 5);
    }, 5);
    return mine;
  }
  reconnect(): void {}
  destroy(): void {
    this.destroyed = true;
    if (this.net.peers.get(this.id) === this) this.net.peers.delete(this.id);
  }
}

function record(s: NetSession): SessionEvent[] {
  const events: SessionEvent[] = [];
  s.listen((e) => events.push(e));
  return events;
}

describe('sessão online (rede falsa)', () => {
  let warn: { mock: { calls: unknown[][] } };
  beforeEach(() => {
    vi.useFakeTimers();
    // A sessão registra no console os erros da PeerJS e as mensagens inválidas.
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  async function connectPair(net = new FakeNetwork()): Promise<{ net: FakeNetwork; host: NetSession; guest: NetSession }> {
    const host = NetSession.host(net.factory, () => 0.42);
    await vi.advanceTimersByTimeAsync(20);
    expect(host.state).toBe('waiting');
    expect(host.code).toMatch(/^[A-Z2-9]{5}$/);
    const guest = NetSession.join(host.code, net.factory);
    await vi.advanceTimersByTimeAsync(50);
    return { net, host, guest };
  }

  it('anfitrião abre a sala, visitante entra, os dois se apresentam e trocam mensagens', async () => {
    const { host, guest } = await connectPair();
    expect(host.state).toBe('connected');
    expect(guest.state).toBe('connected');
    const hostEvents = record(host);
    const guestEvents = record(guest);
    guest.send(message({ type: 'select', team: 'LIV', confirmed: true }));
    host.send(message({ type: 'start', teams: ['PAL', 'LIV'], weather: 'night', seed: 77 }));
    await vi.advanceTimersByTimeAsync(10);
    expect(hostEvents).toContainEqual({ kind: 'message', msg: { type: 'select', v: PROTOCOL_VERSION, team: 'LIV', confirmed: true } });
    expect(guestEvents).toContainEqual({
      kind: 'message',
      msg: { type: 'start', v: PROTOCOL_VERSION, teams: ['PAL', 'LIV'], weather: 'night', seed: 77 },
    });
  });

  it('código já em uso no servidor: abre com outro', async () => {
    const net = new FakeNetwork();
    let k = 0;
    const randoms = [0, 0, 0, 0, 0, 0.5, 0.5, 0.5, 0.5, 0.5];
    const first = NetSession.host(net.factory, () => 0);
    await vi.advanceTimersByTimeAsync(20);
    expect(first.code).toBe('AAAAA');
    const second = NetSession.host(net.factory, () => randoms[k++ % randoms.length]!);
    await vi.advanceTimersByTimeAsync(40);
    expect(second.state).toBe('waiting');
    expect(second.code).not.toBe('AAAAA');
  });

  it('sala inexistente: "não encontrada"', async () => {
    const net = new FakeNetwork();
    const guest = NetSession.join('ZZZZZ', net.factory);
    await vi.advanceTimersByTimeAsync(50);
    expect(guest.state).toBe('failed');
    expect(guest.error).toBe('not-found');
  });

  it('rede que não deixa conectar: desiste no prazo com "tente outra rede"', async () => {
    const net = new FakeNetwork();
    const host = NetSession.host(net.factory);
    await vi.advanceTimersByTimeAsync(20);
    net.blockWebRtc = true;
    const guest = NetSession.join(host.code, net.factory);
    await vi.advanceTimersByTimeAsync(NET_CONNECT_TIMEOUT * 1000 - 100);
    expect(guest.state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(200);
    expect(guest.state).toBe('failed');
    expect(guest.error).toBe('unreachable');
    // A sala continua aberta para outro.
    expect(host.state).toBe('waiting');
  });

  it('versões diferentes: os dois avisam e não conectam', async () => {
    const net = new FakeNetwork();
    const host = NetSession.host(net.factory);
    await vi.advanceTimersByTimeAsync(20);
    // Um visitante de outra versão (fala o protocolo na mão).
    const peer = await net.factory();
    await vi.advanceTimersByTimeAsync(10);
    const conn = peer.connect(`derby-pvp-sala-${host.code}`, { reliable: true, serialization: 'json' }) as FakeConn;
    conn.on('open', () => conn.send({ type: 'hello', v: PROTOCOL_VERSION, game: '0.0.1', role: 'guest', session: 'velho' }));
    await vi.advanceTimersByTimeAsync(1000);
    expect(host.state).toBe('failed');
    expect(host.error).toBe('version');
    expect(conn.received).toContainEqual({ type: 'leave', v: PROTOCOL_VERSION, reason: 'version' });
  });

  it('o visitante também recusa um anfitrião de outra versão', async () => {
    const net = new FakeNetwork();
    // Anfitrião "antigo", na mão.
    const peer = (await net.factory('derby-pvp-sala-QQQQQ')) as FakePeer;
    peer.on('connection', (c: unknown) => {
      const conn = c as FakeConn;
      conn.on('data', () => conn.send({ type: 'hello', v: PROTOCOL_VERSION + 1, game: GAME_VERSION, role: 'host', session: 'x' }));
    });
    await vi.advanceTimersByTimeAsync(10);
    const guest = NetSession.join('QQQQQ', net.factory);
    await vi.advanceTimersByTimeAsync(1000);
    expect(guest.state).toBe('failed');
    expect(guest.error).toBe('version');
  });

  it('sala cheia: o terceiro recebe "sala cheia"', async () => {
    const { net, host } = await connectPair();
    const third = NetSession.join(host.code, net.factory);
    await vi.advanceTimersByTimeAsync(1000);
    expect(third.state).toBe('failed');
    expect(third.error).toBe('full');
    expect(host.state).toBe('connected');
  });

  it('visitante que conecta e não se apresenta: a sala volta a esperar', async () => {
    const net = new FakeNetwork();
    const host = NetSession.host(net.factory);
    await vi.advanceTimersByTimeAsync(20);
    const peer = await net.factory();
    await vi.advanceTimersByTimeAsync(10);
    peer.connect(`derby-pvp-sala-${host.code}`, { reliable: true, serialization: 'json' });
    await vi.advanceTimersByTimeAsync(50);
    expect(host.state).toBe('connecting');
    await vi.advanceTimersByTimeAsync(NET_HANDSHAKE_TIMEOUT * 1000);
    expect(host.state).toBe('waiting');
  });

  it('mensagem inválida é ignorada e registrada; o jogo segue', async () => {
    const { net, host } = await connectPair();
    const events = record(host);
    const peer = net.peers.get(`derby-pvp-sala-${host.code}`)!;
    const conn = peer.incoming[0]!.other!;
    conn.sendRaw({ type: 'start', v: PROTOCOL_VERSION, teams: ['XXX'], weather: 'sol', seed: -5 });
    conn.sendRaw('lixo');
    await vi.advanceTimersByTimeAsync(10);
    expect(events.filter((e) => e.kind === 'message')).toHaveLength(0);
    expect(warn.mock.calls.filter((c: unknown[]) => String(c[0]).includes('mensagem inválida'))).toHaveLength(2);
    expect(host.state).toBe('connected');
  });

  it('o outro sai: aviso de saída; a conexão cai: aviso de queda', async () => {
    const a = await connectPair();
    const hostEvents = record(a.host);
    a.guest.close();
    await vi.advanceTimersByTimeAsync(1000);
    expect(hostEvents).toContainEqual({ kind: 'remote-left', reason: 'quit' });
    expect(a.host.state).toBe('closed');

    const b = await connectPair();
    const guestEvents = record(b.guest);
    const peer = b.net.peers.get(`derby-pvp-sala-${b.host.code}`)!;
    peer.incoming[0]!.close();
    await vi.advanceTimersByTimeAsync(100);
    expect(guestEvents).toContainEqual({ kind: 'remote-left', reason: 'dropped' });
  });

  it('sem WebRTC no navegador: "sem suporte", sem exceção', async () => {
    const broken: PeerFactory = () => Promise.reject(new Error('sem WebRTC'));
    const s = NetSession.join('ABCDE', broken);
    await vi.advanceTimersByTimeAsync(10);
    expect(s.state).toBe('failed');
    expect(s.error).toBe('unsupported');
  });
});
