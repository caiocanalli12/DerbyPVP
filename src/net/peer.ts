/**
 * Conexão do modo online pela PeerJS: o servidor público de sinalização dela apresenta os dois
 * navegadores, que depois conversam direto (WebRTC). Sem servidor próprio e sem login.
 *
 * - Anfitrião: abre a sala com o id do código (`roomPeerId`) e espera um visitante (um só: um
 *   segundo recebe "sala cheia"). Código já em uso no servidor: sorteia outro.
 * - Visitante: conecta ao id da sala.
 * - Apresentação: o visitante manda `hello` com as versões; o anfitrião confere e responde. Versões
 *   diferentes: os dois avisam e a partida não começa.
 * - Tudo vai num canal confiável e ordenado, em JSON: a PeerJS 1.5.4 não cria canal não confiável
 *   (`reliable: false` só desliga a ordem), então os pacotes ficam pequenos.
 * - Erros viram um motivo legível (`NET_ERROR_TEXT`); nada aqui lança exceção para quem usa.
 *
 * A PeerJS só é carregada quando alguém entra no modo online.
 */
import {
  NET_CONNECT_TIMEOUT,
  NET_HANDSHAKE_TIMEOUT,
  NET_HOST_ID_RETRIES,
  NET_LEAVE_FLUSH,
  NET_MAX_INVALID_LOGS,
  NET_OPEN_TIMEOUT,
  NET_PING_INTERVAL,
  NET_RECONNECT_INTERVAL,
} from '../config/constants';
import { compatible, GAME_VERSION, message, parseMessage } from './protocol';
import type { LeaveReason, NetMessage, NetRole } from './protocol';
import { generateRoomCode, roomPeerId } from './roomCode';
import { PingMeter } from './sync';

// ---------------------------------------------------------------------------
// O mínimo da PeerJS que usamos (a de verdade ou uma falsa nos testes)
// ---------------------------------------------------------------------------

type Listener = (...args: never[]) => void;

export interface ConnLike {
  readonly open: boolean;
  on(event: 'open' | 'data' | 'close' | 'error', fn: Listener): unknown;
  send(data: unknown): unknown;
  close(): void;
}

export interface PeerLike {
  readonly destroyed: boolean;
  /** Sem o servidor de sinalização (a PeerJS tenta voltar com `reconnect()`). */
  readonly disconnected: boolean;
  on(event: 'open' | 'connection' | 'disconnected' | 'error', fn: Listener): unknown;
  connect(id: string, options: { reliable: boolean; serialization: string }): ConnLike;
  reconnect(): void;
  destroy(): void;
}

/** Cria um peer no servidor de sinalização (com o id pedido, ou um aleatório). */
export type PeerFactory = (id?: string) => Promise<PeerLike>;

/** A PeerJS de verdade, carregada só na hora (fica fora do pacote principal). */
export const peerjsFactory: PeerFactory = async (id) => {
  if (typeof RTCPeerConnection === 'undefined') throw new Error('sem WebRTC');
  const { Peer } = await import('peerjs');
  // Sem o registro próprio da PeerJS: os erros chegam aqui e viram um aviso legível (e uma linha no console).
  const peer = id ? new Peer(id, { debug: 0 }) : new Peer({ debug: 0 });
  // A tipagem da PeerJS (eventos genéricos) não casa com a interface mínima: a forma é a mesma.
  return peer as unknown as PeerLike;
};

// ---------------------------------------------------------------------------
// Sessão
// ---------------------------------------------------------------------------

/** Por que não deu para conectar (ou a conexão acabou). */
export type NetErrorKind = 'not-found' | 'unreachable' | 'unsupported' | 'version' | 'full';

export const NET_ERROR_TEXT: Readonly<Record<NetErrorKind, string>> = {
  'not-found': 'Sala não encontrada. Confira o código.',
  unreachable: 'Não foi possível conectar. Tente outra rede.',
  unsupported: 'Este navegador não tem suporte ao modo online.',
  version: 'Versões diferentes do jogo. Atualize a página nos dois computadores.',
  full: 'Esta sala já está com dois jogadores.',
};

/**
 * - opening: registrando no servidor de sinalização;
 * - waiting: (anfitrião) sala aberta, esperando o visitante;
 * - connecting: abrindo o canal e se apresentando;
 * - connected: pronto para jogar;
 * - reconnecting: o canal caiu no meio do jogo; o visitante tenta voltar e o anfitrião espera (quem
 *   decide desistir, depois de NET_WO_TIMEOUT, é a cena);
 * - failed: não deu (veja `error`); closed: encerrada.
 */
export type SessionState = 'opening' | 'waiting' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'closed';

export type SessionEvent =
  | { kind: 'state'; state: SessionState }
  | { kind: 'message'; msg: NetMessage }
  /** O outro saiu ('quit') ou a conexão caiu ('dropped'). */
  | { kind: 'remote-left'; reason: LeaveReason | 'dropped' }
  /** O canal voltou depois de uma queda. */
  | { kind: 'reconnected' };

/** Tipo do erro da PeerJS (`err.type`). */
function errorType(err: unknown): string {
  return typeof err === 'object' && err !== null && typeof (err as { type?: unknown }).type === 'string'
    ? (err as { type: string }).type
    : '';
}

type Hello = Extract<NetMessage, { type: 'hello' }>;

export class NetSession {
  state: SessionState = 'opening';
  error: NetErrorKind | null = null;
  /** Código da sala (o anfitrião só sabe depois de sortear). */
  code: string;
  /** Token desta sessão (vai no `hello`). */
  readonly token: string;
  /** Hora (ms, Date.now) da última mensagem recebida do outro. */
  lastReceivedAt = 0;
  private peer: PeerLike | null = null;
  private conn: ConnLike | null = null;
  /** (Anfitrião) token do visitante aceito: só ele volta depois de uma queda. */
  private guestToken: string | null = null;
  private readonly listeners = new Set<(e: SessionEvent) => void>();
  private readonly timers = new Set<ReturnType<typeof setTimeout>>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setInterval> | null = null;
  private readonly ping = new PingMeter();
  private invalidLogs = 0;

  private constructor(
    readonly role: NetRole,
    code: string,
    private readonly factory: PeerFactory,
    private readonly random: () => number,
  ) {
    this.code = code;
    this.token = Math.floor(random() * 0xffffffff).toString(36) + Math.floor(random() * 0xffffffff).toString(36);
  }

  /** Abre uma sala nova (código sorteado). */
  static host(factory: PeerFactory = peerjsFactory, random: () => number = Math.random): NetSession {
    const s = new NetSession('host', '', factory, random);
    void s.openHost(0);
    return s;
  }

  /** Entra na sala `code` (já normalizado). */
  static join(code: string, factory: PeerFactory = peerjsFactory, random: () => number = Math.random): NetSession {
    const s = new NetSession('guest', code, factory, random);
    void s.openGuest();
    return s;
  }

  /** Ping (ida e volta, ms), se já houver medida. */
  get pingMs(): number | null {
    return this.ping.ms;
  }

  /** Ouve os acontecimentos da sessão. Devolve a função que para de ouvir. */
  listen(fn: (e: SessionEvent) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  /** Manda uma mensagem (se a conexão estiver aberta). */
  send(msg: NetMessage): void {
    const c = this.conn;
    if (!c || !c.open) return;
    try {
      void c.send(msg);
    } catch (err) {
      console.warn('[online] falha ao enviar:', err);
    }
  }

  /** Encerra a sessão (avisa o outro, se estiver conectado). */
  close(reason: LeaveReason = 'quit'): void {
    if (this.state === 'closed') return;
    const wasConnected = this.state === 'connected';
    if (wasConnected) this.send(message({ type: 'leave', reason }));
    this.setState('closed');
    this.stopLoops();
    this.listeners.clear();
    const conn = this.conn;
    const peer = this.peer;
    this.conn = null;
    this.peer = null;
    // Dá tempo da mensagem de saída chegar antes de fechar.
    setTimeout(
      () => {
        try {
          conn?.close();
          if (peer && !peer.destroyed) peer.destroy();
        } catch {
          // Já estava fechado.
        }
      },
      wasConnected ? NET_LEAVE_FLUSH * 1000 : 0,
    );
  }

  // -------------------------------------------------------------------------

  private emit(e: SessionEvent): void {
    for (const fn of [...this.listeners]) {
      try {
        fn(e);
      } catch (err) {
        console.warn('[online] erro num ouvinte:', err);
      }
    }
  }

  private setState(state: SessionState): void {
    if (this.state === state) return;
    this.state = state;
    this.emit({ kind: 'state', state });
  }

  private fail(error: NetErrorKind): void {
    if (this.state === 'failed' || this.state === 'closed') return;
    this.error = error;
    this.stopLoops();
    this.setState('failed');
    const conn = this.conn;
    const peer = this.peer;
    this.conn = null;
    this.peer = null;
    try {
      conn?.close();
      if (peer && !peer.destroyed) peer.destroy();
    } catch {
      // Já estava fechado.
    }
  }

  private timer(seconds: number, fn: () => void): ReturnType<typeof setTimeout> {
    const id = setTimeout(() => {
      this.timers.delete(id);
      fn();
    }, seconds * 1000);
    this.timers.add(id);
    return id;
  }

  private clearTimer(id: ReturnType<typeof setTimeout>): void {
    clearTimeout(id);
    this.timers.delete(id);
  }

  private stopLoops(): void {
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    if (this.pingTimer !== null) clearInterval(this.pingTimer);
    this.pingTimer = null;
    this.stopReconnecting();
  }

  private stopReconnecting(): void {
    if (this.reconnectTimer !== null) clearInterval(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  private async createPeer(id?: string): Promise<PeerLike | null> {
    try {
      const peer = await this.factory(id);
      if (this.state === 'closed' || this.state === 'failed') {
        peer.destroy();
        return null;
      }
      return peer;
    } catch (err) {
      console.warn('[online] sem suporte:', err);
      this.fail('unsupported');
      return null;
    }
  }

  /** Erros do servidor e da rede (fora os tratados à parte) → motivo. */
  private networkError(type: string): NetErrorKind {
    return type === 'browser-incompatible' ? 'unsupported' : 'unreachable';
  }

  /** Conectou (ou voltou): mede o ping a cada NET_PING_INTERVAL. */
  private connected(): void {
    this.stopReconnecting();
    this.lastReceivedAt = Date.now();
    const wasReconnecting = this.state === 'reconnecting';
    this.setState('connected');
    if (this.pingTimer === null) {
      this.pingTimer = setInterval(() => this.send(message({ type: 'ping', t: Date.now(), reply: false })), NET_PING_INTERVAL * 1000);
    }
    if (wasReconnecting) this.emit({ kind: 'reconnected' });
  }

  /** O canal caiu no meio do jogo: avisa e espera (o visitante tenta voltar). */
  private dropped(): void {
    this.conn = null;
    this.setState('reconnecting');
    this.emit({ kind: 'remote-left', reason: 'dropped' });
    if (this.role === 'guest') this.startReconnecting();
  }

  // --- anfitrião ------------------------------------------------------------

  private async openHost(attempt: number): Promise<void> {
    this.code = generateRoomCode(this.random);
    const peer = await this.createPeer(roomPeerId(this.code));
    if (!peer) return;
    this.peer = peer;
    const opening = this.timer(NET_OPEN_TIMEOUT, () => this.fail('unreachable'));
    peer.on('open', () => {
      this.clearTimer(opening);
      if (this.state === 'opening') this.setState('waiting');
    });
    peer.on('error', (err: unknown) => {
      const type = errorType(err);
      console.warn('[online] erro da PeerJS:', type || err);
      if (type === 'unavailable-id' && this.state === 'opening' && attempt < NET_HOST_ID_RETRIES) {
        // Código já em uso no servidor: outra sala com outro código.
        this.clearTimer(opening);
        this.peer = null;
        peer.destroy();
        void this.openHost(attempt + 1);
        return;
      }
      // Já jogando, o canal é direto: a falta do servidor de sinalização não atrapalha.
      if (this.state === 'connected' || this.state === 'reconnecting') return;
      this.fail(this.networkError(type));
    });
    peer.on('disconnected', () => {
      // Perdeu o servidor de sinalização: tenta voltar (as conexões abertas continuam).
      if (this.peer === peer && !peer.destroyed && this.state !== 'closed' && this.state !== 'failed') peer.reconnect();
    });
    peer.on('connection', (conn: ConnLike) => this.acceptGuest(conn));
  }

  private acceptGuest(conn: ConnLike): void {
    // Esperando alguém, ou o visitante de antes voltando: apresenta-se e o `hello` decide.
    const returning = this.guestToken !== null && (this.state === 'reconnecting' || this.state === 'connected');
    if (!returning && (this.conn || this.state !== 'waiting')) {
      this.refuse(conn);
      return;
    }
    if (!returning) {
      this.conn = conn;
      this.setState('connecting');
    }
    const handshake = this.timer(NET_HANDSHAKE_TIMEOUT, () => {
      // Abriu mas não se apresentou.
      if (this.conn === conn && this.state === 'connecting') this.dropGuest(conn);
      else if (returning && this.conn !== conn) conn.close();
    });
    conn.on('data', (data: unknown) => {
      if (this.conn !== conn) {
        // Voltando: só vale um `hello` com o token de quem estava jogando.
        const hello = parseMessage(data);
        if (hello?.type !== 'hello' || hello.session !== this.guestToken || !compatible(hello)) {
          this.refuse(conn);
          return;
        }
        this.clearTimer(handshake);
        const old = this.conn;
        this.conn = conn;
        if (old) {
          try {
            old.close();
          } catch {
            // Já fechou.
          }
        }
        this.send(message({ type: 'hello', game: GAME_VERSION, role: 'host', session: this.token }));
        this.connected();
        return;
      }
      const before = this.state;
      this.receive(data, conn);
      if (before === 'connecting' && this.state !== 'connecting') this.clearTimer(handshake);
    });
    conn.on('close', () => this.connectionClosed(conn));
    conn.on('error', (err: unknown) => console.warn('[online] erro na conexão:', err));
  }

  /** Sala ocupada: avisa "sala cheia" e fecha. */
  private refuse(conn: ConnLike): void {
    const bye = (): void => {
      try {
        void conn.send(message({ type: 'leave', reason: 'full' }));
      } catch {
        // Já fechou.
      }
      setTimeout(() => conn.close(), NET_LEAVE_FLUSH * 1000);
    };
    if (conn.open) bye();
    else conn.on('open', bye);
  }

  /** O visitante caiu antes de se apresentar: a sala continua aberta. */
  private dropGuest(conn: ConnLike): void {
    if (this.conn !== conn) return;
    this.conn = null;
    try {
      conn.close();
    } catch {
      // Já fechou.
    }
    if (this.state === 'connecting') this.setState('waiting');
  }

  // --- visitante ------------------------------------------------------------

  private async openGuest(): Promise<void> {
    const peer = await this.createPeer();
    if (!peer) return;
    this.peer = peer;
    // A conexão inteira (servidor, WebRTC e apresentação) precisa caber no prazo.
    this.timer(NET_CONNECT_TIMEOUT, () => {
      if (this.state !== 'connected') this.fail('unreachable');
    });
    peer.on('open', () => {
      if (this.state !== 'opening') return;
      this.setState('connecting');
      this.dial(peer);
    });
    peer.on('error', (err: unknown) => {
      const type = errorType(err);
      console.warn('[online] erro da PeerJS:', type || err);
      // Voltando de uma queda, os erros de cada tentativa não encerram nada (a cena decide o W.O.).
      if (this.state === 'connected' || this.state === 'reconnecting') return;
      this.fail(type === 'peer-unavailable' ? 'not-found' : this.networkError(type));
    });
    peer.on('disconnected', () => {
      if (this.peer === peer && !peer.destroyed && (this.state === 'connected' || this.state === 'reconnecting')) peer.reconnect();
    });
  }

  /** Abre um canal com o anfitrião e se apresenta quando abrir. */
  private dial(peer: PeerLike): void {
    const conn = peer.connect(roomPeerId(this.code), { reliable: true, serialization: 'json' });
    this.conn = conn;
    conn.on('open', () => {
      if (this.conn === conn) this.send(message({ type: 'hello', game: GAME_VERSION, role: 'guest', session: this.token }));
    });
    conn.on('data', (data: unknown) => this.receive(data, conn));
    conn.on('close', () => this.connectionClosed(conn));
    conn.on('error', (err: unknown) => console.warn('[online] erro na conexão:', err));
  }

  /** Depois de uma queda: tenta um canal novo a cada NET_RECONNECT_INTERVAL. */
  private startReconnecting(): void {
    this.stopReconnecting();
    const attempt = (): void => {
      const peer = this.peer;
      if (!peer || peer.destroyed || this.state !== 'reconnecting') {
        this.stopReconnecting();
        return;
      }
      if (peer.disconnected) peer.reconnect();
      const old = this.conn;
      this.conn = null;
      if (old) {
        try {
          old.close();
        } catch {
          // Já fechou.
        }
      }
      this.dial(peer);
    };
    this.reconnectTimer = setInterval(attempt, NET_RECONNECT_INTERVAL * 1000);
    attempt();
  }

  // --- mensagens ------------------------------------------------------------

  private receive(data: unknown, conn: ConnLike): void {
    if (conn !== this.conn) return;
    const msg = parseMessage(data);
    if (!msg) {
      if (this.invalidLogs++ < NET_MAX_INVALID_LOGS) console.warn('[online] mensagem inválida ignorada:', data);
      return;
    }
    this.lastReceivedAt = Date.now();
    if (msg.type === 'hello') {
      this.handshake(msg);
      return;
    }
    if (msg.type === 'ping') {
      if (msg.reply) this.ping.sample(msg.t, Date.now());
      else this.send(message({ type: 'ping', t: msg.t, reply: true }));
      return;
    }
    if (msg.type === 'leave') {
      if (this.state === 'connected') {
        this.emit({ kind: 'remote-left', reason: msg.reason });
        this.close();
      } else if (msg.reason === 'full') {
        this.fail('full');
      } else if (msg.reason === 'version') {
        this.fail('version');
      } else if (this.role === 'guest') {
        this.fail('unreachable');
      } else if (this.conn) {
        this.dropGuest(this.conn);
      }
      return;
    }
    // Antes da apresentação, nada mais vale.
    if (this.state !== 'connected') return;
    this.emit({ kind: 'message', msg });
  }

  private handshake(hello: Hello): void {
    if (this.state !== 'connecting' && this.state !== 'reconnecting') return;
    const expected: NetRole = this.role === 'host' ? 'guest' : 'host';
    if (hello.role !== expected) return;
    if (!compatible(hello)) {
      this.send(message({ type: 'leave', reason: 'version' }));
      this.stopLoops();
      // Deixa o aviso chegar antes de fechar.
      setTimeout(() => this.fail('version'), NET_LEAVE_FLUSH * 1000);
      return;
    }
    if (this.role === 'host') {
      this.guestToken = hello.session;
      this.send(message({ type: 'hello', game: GAME_VERSION, role: 'host', session: this.token }));
    }
    for (const id of this.timers) clearTimeout(id);
    this.timers.clear();
    this.connected();
  }

  private connectionClosed(conn: ConnLike): void {
    if (this.conn !== conn) return;
    if (this.state === 'connected') {
      this.dropped();
      return;
    }
    if (this.state === 'reconnecting') {
      // Uma tentativa de voltar que não deu: a próxima vem pelo intervalo.
      this.conn = null;
      return;
    }
    if (this.role === 'host') this.dropGuest(conn);
    else this.fail('unreachable');
  }
}

// ---------------------------------------------------------------------------
// A sessão em uso (passa de uma cena para outra)
// ---------------------------------------------------------------------------

let current: NetSession | null = null;

export function currentSession(): NetSession | null {
  return current;
}

/** Troca a sessão em uso (a anterior é encerrada). */
export function setCurrentSession(s: NetSession | null): void {
  if (current && current !== s) current.close();
  current = s;
}
