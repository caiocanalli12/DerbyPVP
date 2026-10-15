/**
 * Mensagens do modo online (lógica pura): tipos com discriminador, versão do protocolo e validação.
 *
 * Tudo trafega como JSON no canal da PeerJS. Toda mensagem recebida passa por `parseMessage`
 * (formato e limites); uma inválida é ignorada e registrada no console, nunca derruba o jogo.
 */
import { version as packageVersion } from '../../package.json';
import { isTeamId } from '../data/teams';
import type { TeamId } from '../data/teams';
import { isWeatherId } from '../data/weather';
import type { WeatherId } from '../data/weather';
import { parseSnapshotBody } from './snapshot';
import type { SnapshotMessage } from './snapshot';

/** Versão do protocolo (muda quando o formato das mensagens muda). */
export const PROTOCOL_VERSION = 1;
/** Versão do jogo (do package.json): os dois lados precisam estar na mesma. */
export const GAME_VERSION: string = packageVersion;

export type NetRole = 'host' | 'guest';
/** Por que alguém saiu: saiu de propósito, versões diferentes ou sala cheia. */
export type LeaveReason = 'quit' | 'version' | 'full';

const LEAVE_REASONS: readonly LeaveReason[] = ['quit', 'version', 'full'];
/** Limites de tamanho dos textos (evita mensagens enormes). */
const MAX_TEXT = 40;

export type NetMessage =
  /** Apresentação (os dois lados): versões e um token da sessão (para voltar depois de uma queda). */
  | { type: 'hello'; v: number; game: string; role: NetRole; session: string }
  /** Time no cursor e se confirmou (seleção de times, em tempo real). */
  | { type: 'select'; v: number; team: TeamId; confirmed: boolean }
  /** Anfitrião → visitante: os dois confirmaram; times, clima e semente da partida. */
  | { type: 'start'; v: number; teams: [TeamId, TeamId]; weather: WeatherId; seed: number }
  /** Pronto para a partida começar (texturas desenhadas). */
  | { type: 'ready'; v: number }
  /** Revanche: aceita (true) ou desiste (false). */
  | { type: 'rematch'; v: number; accept: boolean }
  /** Saiu da sala. */
  | { type: 'leave'; v: number; reason: LeaveReason }
  /** Medida de ping: `t` é o relógio de quem mandou; a resposta devolve o mesmo `t`. */
  | { type: 'ping'; v: number; t: number; reply: boolean }
  /** Visitante → anfitrião, a cada tick (ver `net/inputs.ts`). */
  | InputMessage
  /** Anfitrião → visitante, a 30 Hz (ver `net/snapshot.ts`). */
  | SnapshotMessage;

/**
 * Comando do visitante num tick: direção (`mx`, `my`), chute preso (`held`), mira do pênalti
 * (`aim`) e os contadores acumulados de passe (`pass`), "apertou o chute" (`sp`) e "soltou o
 * chute" (`sr`). `seq` cresce a cada mensagem; `tick` é o tick do visitante.
 */
export interface InputMessage {
  type: 'input';
  v: number;
  seq: number;
  tick: number;
  mx: number;
  my: number;
  held: boolean;
  aim: -1 | 0 | 1;
  pass: number;
  sp: number;
  sr: number;
}

export type NetMessageType = NetMessage['type'];

type Obj = Record<string, unknown>;

const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isText = (x: unknown): x is string => typeof x === 'string' && x.length > 0 && x.length <= MAX_TEXT;
const isUint32 = (x: unknown): x is number => typeof x === 'number' && Number.isInteger(x) && x >= 0 && x <= 0xffffffff;
const isTeam = (x: unknown): x is TeamId => typeof x === 'string' && isTeamId(x);
const isUnit = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && x >= -1 && x <= 1;

/** Valida uma mensagem recebida. Devolve a mensagem (só com os campos conhecidos) ou null. */
export function parseMessage(data: unknown): NetMessage | null {
  if (!isObj(data) || typeof data.type !== 'string') return null;
  const v = data.v;
  if (data.type === 'hello') {
    // A apresentação é lida mesmo com outra versão do protocolo (para avisar "versões diferentes").
    if (!isUint32(v) || !isText(data.game) || (data.role !== 'host' && data.role !== 'guest') || !isText(data.session)) return null;
    return { type: 'hello', v, game: data.game, role: data.role, session: data.session };
  }
  if (v !== PROTOCOL_VERSION) return null;
  switch (data.type) {
    case 'select':
      if (!isTeam(data.team) || typeof data.confirmed !== 'boolean') return null;
      return { type: 'select', v, team: data.team, confirmed: data.confirmed };
    case 'start': {
      const t = data.teams;
      if (!Array.isArray(t) || t.length !== 2 || !isTeam(t[0]) || !isTeam(t[1])) return null;
      if (typeof data.weather !== 'string' || !isWeatherId(data.weather) || !isUint32(data.seed)) return null;
      return { type: 'start', v, teams: [t[0], t[1]], weather: data.weather, seed: data.seed };
    }
    case 'ready':
      return { type: 'ready', v };
    case 'rematch':
      if (typeof data.accept !== 'boolean') return null;
      return { type: 'rematch', v, accept: data.accept };
    case 'leave':
      if (!LEAVE_REASONS.includes(data.reason as LeaveReason)) return null;
      return { type: 'leave', v, reason: data.reason as LeaveReason };
    case 'ping':
      if (typeof data.t !== 'number' || !Number.isFinite(data.t) || data.t < 0 || typeof data.reply !== 'boolean') return null;
      return { type: 'ping', v, t: data.t, reply: data.reply };
    case 'input': {
      const { seq, tick, mx, my, held, aim, pass, sp, sr } = data;
      if (!isUint32(seq) || !isUint32(tick) || !isUint32(pass) || !isUint32(sp) || !isUint32(sr)) return null;
      if (!isUnit(mx) || !isUnit(my) || Math.hypot(mx, my) > 1.01) return null;
      if (typeof held !== 'boolean' || (aim !== -1 && aim !== 0 && aim !== 1)) return null;
      return { type: 'input', v, seq, tick, mx, my, held, aim, pass, sp, sr };
    }
    case 'snapshot':
      return parseSnapshotBody(data, v);
    default:
      return null;
  }
}

/** Uma mensagem sem o campo da versão (distribui pelo tipo de cada mensagem). */
export type MessageBody = NetMessage extends infer M ? (M extends NetMessage ? Omit<M, 'v'> : never) : never;

/** Mensagem pronta para enviar (com a versão do protocolo). */
export function message<B extends MessageBody>(m: B): B & { v: number } {
  return { ...m, v: PROTOCOL_VERSION };
}

/** As duas versões batem (protocolo e jogo)? */
export function compatible(hello: Extract<NetMessage, { type: 'hello' }>): boolean {
  return hello.v === PROTOCOL_VERSION && hello.game === GAME_VERSION;
}
