/**
 * Snapshots da partida online (lógica pura): o anfitrião tira uma foto do que a tela precisa e o
 * visitante a aplica num espelho da partida (que ele nunca simula), interpolando entre duas fotos.
 *
 * Só vai o que o desenho lê (ver as vistas em `src/render`), em listas de números arredondados a
 * 2 casas para o pacote ficar pequeno, mais os eventos desde a foto anterior, cada um com um id
 * único (para som e efeito não tocarem duas vezes).
 */
import { SIM_DT } from '../config/constants';
import type { SimEvent } from '../sim/events';
import type { KeeperMode } from '../sim/goalkeeper';
import type { GoalRecord, Match, MatchEvent, MatchPhase, Period } from '../sim/match';
import type { AttemptPhase, PenaltyResult, PenaltyShotPlan, PenaltyZone, Shootout } from '../sim/penalties';
import type { PlayerState } from '../sim/player';
import type { SoundCue } from '../sim/sound';
import { angleDiff } from '../sim/vec';

const PHASES: readonly MatchPhase[] = ['SAIDA_DE_BOLA', 'JOGANDO', 'COMEMORACAO_GOL', 'INTERVALO', 'PRORROGACAO', 'PENALTIS', 'FIM'];
const PERIODS: readonly Period[] = ['1T', '2T', 'PR1', 'PR2'];
const STATES: readonly PlayerState[] = ['normal', 'tackling', 'fallen', 'stumbling'];
const KEEPER_MODES: readonly KeeperMode[] = ['position', 'windup', 'dive', 'recover', 'hold'];
const ATTEMPT_PHASES: readonly AttemptPhase[] = ['setup', 'aiming', 'flight', 'result'];
const ZONES: readonly PenaltyZone[] = ['L', 'C', 'R'];
const RESULTS: readonly PenaltyResult[] = ['goal', 'saved', 'miss'];
const REASONS: readonly PenaltyShotPlan['reason'][] = ['goal', 'saved', 'wide', 'over', 'strongPass', 'outer'];
const KICK_CHARS: Readonly<Record<PenaltyResult, string>> = { goal: 'g', saved: 's', miss: 'm' };

/** Campos de cada parte (posições nas listas). */
const M_FIELDS = 13;
const P_FIELDS = 8;
const B_FIELDS = 7;
const AT_FIELDS = 8;
const PL_FIELDS = 5;
const PLAYERS = 10;
/** Um jogador que andou mais que isto (m) entre duas fotos foi reposicionado: não desliza até lá. */
const TELEPORT_DIST = 3;
const MAX_TEXT = 60;
const MAX_EVENTS = 64;

/** Evento da partida pela rede: do mundo (`w`), da partida (`m`) ou som (`s`), com id e tick. */
export type NetEvent =
  | { id: number; t: number; k: 'w'; e: SimEvent }
  | { id: number; t: number; k: 'm'; e: MatchEvent }
  | { id: number; t: number; k: 's'; e: SoundCue };

export interface SnapshotMessage {
  type: 'snapshot';
  v: number;
  /** Tick do anfitrião. */
  tick: number;
  /** Último comando do visitante já aplicado (`seq`). */
  ack: number;
  /** Partida: fase, período, relógio, tempo na fase, placar (2), quem sai, saída liberada, mira da saída, fim, lados (2), bola nas mãos. */
  m: number[];
  /** Intertítulo em exibição. */
  it: string | null;
  /** Último gol: time, autor (-1 = ninguém), contra (0/1). */
  g: number[] | null;
  /** Jogador controlado de cada time. */
  c: number[];
  /** Carga do chute de cada time: carregando (0/1) e carga, duas vezes. */
  h: number[];
  /** Goleiros: modo e direção do mergulho em Y, duas vezes. */
  k: number[];
  /** Jogadores: x, y, vx, vy, direção, estado, direção do carrinho (2), para cada um dos 10. */
  p: number[];
  /** Bola: x, y, z, vx, vy, vz, dono (-1 = solta). */
  b: number[];
  /** Pênaltis: cobranças de cada time ('g'/'s'/'m') e vencedor (-1 = ainda não). */
  so: [string, string, number] | null;
  /** Cobrança: time, batedor, fase, tempo, tempo de mira, cursor, carregando (0/1), carga. */
  at: number[] | null;
  /** Plano da cobrança: deslocamento, altura, zona do goleiro, resultado, motivo. */
  pl: number[] | null;
  e: NetEvent[];
}

const r2 = (v: number): number => Math.round(v * 100) / 100;
const b01 = (v: boolean): number => (v ? 1 : 0);

/** Tira a foto da partida no tick `tick`, com os eventos desde a anterior. */
export function encodeSnapshot(match: Match, tick: number, ack: number, events: NetEvent[], version: number): SnapshotMessage {
  const w = match.world;
  const p: number[] = [];
  for (const pl of w.players) p.push(r2(pl.x), r2(pl.y), r2(pl.vx), r2(pl.vy), r2(pl.facing), STATES.indexOf(pl.state), r2(pl.tackleDirX), r2(pl.tackleDirY));
  const ball = w.ball;
  const last = match.goals[match.goals.length - 1];
  const a = match.attempt;
  const s = match.shootout;
  return {
    type: 'snapshot',
    v: version,
    tick,
    ack,
    m: [
      PHASES.indexOf(match.phase),
      PERIODS.indexOf(match.period),
      r2(match.clock),
      r2(match.phaseTimer),
      match.score[0],
      match.score[1],
      match.kickoffTeam,
      b01(match.kickoffLive),
      r2(match.kickoffAim),
      b01(match.over),
      w.defends[0],
      w.defends[1],
      b01(w.ballInHands),
    ],
    it: match.intertitle,
    g: last ? [last.team, last.scorer ?? -1, b01(last.ownGoal)] : null,
    c: [w.controlled[0], w.controlled[1]],
    h: [b01(w.humans[0].charging), r2(w.humans[0].charge), b01(w.humans[1].charging), r2(w.humans[1].charge)],
    k: [KEEPER_MODES.indexOf(w.keepers[0].mode), r2(w.keepers[0].diveY), KEEPER_MODES.indexOf(w.keepers[1].mode), r2(w.keepers[1].diveY)],
    p,
    b: [r2(ball.x), r2(ball.y), r2(ball.z), r2(ball.vx), r2(ball.vy), r2(ball.vz), ball.owner ?? -1],
    so: s ? [s.kicks[0].map((k) => KICK_CHARS[k]).join(''), s.kicks[1].map((k) => KICK_CHARS[k]).join(''), s.winner ?? -1] : null,
    at: a ? [a.team, a.kicker, ATTEMPT_PHASES.indexOf(a.phase), r2(a.timer), r2(a.aimTime), r2(a.cursor), b01(a.charging), r2(a.charge)] : null,
    pl: a?.plan ? [r2(a.plan.offset), r2(a.plan.height), ZONES.indexOf(a.plan.keeperZone), RESULTS.indexOf(a.plan.result), REASONS.indexOf(a.plan.reason)] : null,
    e: events,
  };
}

// ---------------------------------------------------------------------------
// Validação
// ---------------------------------------------------------------------------

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === 'object' && x !== null && !Array.isArray(x);
const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x) && Math.abs(x) < 1e6;
const isInt = (x: unknown, min: number, max: number): x is number => typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
const isUint = (x: unknown): x is number => isInt(x, 0, 0xffffffff);
const isId = (x: unknown): x is number => isInt(x, 0, PLAYERS - 1);
const isIdOrNull = (x: unknown): boolean => x === null || isId(x);
const isTeam = (x: unknown): x is 0 | 1 => x === 0 || x === 1;

function numList(x: unknown, n: number): x is number[] {
  return Array.isArray(x) && x.length === n && x.every(isNum);
}

/** Índices válidos nas listas (fase, estado, modo...). */
function indexesOk(list: number[], checks: readonly [number, number][]): boolean {
  return checks.every(([i, n]) => isInt(list[i], 0, n - 1));
}

function validSimEvent(e: Obj): boolean {
  switch (e.type) {
    case 'pass':
      return isId(e.player) && isIdOrNull(e.target);
    case 'shot':
      return isId(e.player) && isNum(e.charge) && isNum(e.speed);
    case 'tackleStart':
      return isId(e.player);
    case 'tackle':
      return isId(e.player) && (e.result === 'steal' || e.result === 'loose') && isIdOrNull(e.victim);
    case 'save':
      return isId(e.player) && (e.result === 'catch' || e.result === 'parry');
    case 'contact':
      return ['wall', 'post', 'bar', 'net', 'ground'].includes(e.kind as string) && isNum(e.speed);
    case 'goal':
      return isTeam(e.side) && isIdOrNull(e.lastTouch);
    default:
      return false;
  }
}

function validMatchEvent(e: Obj): boolean {
  switch (e.type) {
    case 'goal': {
      const g = e.goal;
      return isObj(g) && isTeam(g.team) && isIdOrNull(g.scorer) && typeof g.ownGoal === 'boolean' && PERIODS.includes(g.period as Period) && isNum(g.clock);
    }
    case 'penaltyKick':
      return isTeam(e.team) && isNum(e.power);
    case 'penaltyResult':
      return isTeam(e.team) && RESULTS.includes(e.result as PenaltyResult);
    default:
      return false;
  }
}

function validSound(e: Obj): boolean {
  if (!isNum(e.x)) return false;
  switch (e.type) {
    case 'kick':
      return isNum(e.power);
    case 'whistle':
      return e.pattern === 'short' || e.pattern === 'double' || e.pattern === 'final';
    case 'pass':
    case 'goal':
    case 'save':
      return true;
    default:
      return false;
  }
}

function validEvent(x: unknown): x is NetEvent {
  if (!isObj(x) || !isUint(x.id) || !isUint(x.t) || !isObj(x.e)) return false;
  if (x.k === 'w') return validSimEvent(x.e);
  if (x.k === 'm') return validMatchEvent(x.e);
  if (x.k === 's') return validSound(x.e);
  return false;
}

/** Confere um snapshot recebido (formato e limites). `v` já foi conferido. */
export function parseSnapshotBody(d: Obj, v: number): SnapshotMessage | null {
  if (!isUint(d.tick) || !isUint(d.ack)) return null;
  const { m, c, h, k, p, b } = d;
  if (!numList(m, M_FIELDS) || !indexesOk(m, [[0, PHASES.length], [1, PERIODS.length], [6, 2], [7, 2], [9, 2], [10, 2], [11, 2], [12, 2]])) return null;
  if (!isInt(m[4], 0, 999) || !isInt(m[5], 0, 999)) return null;
  if (!numList(c, 2) || !isId(c[0]) || !isId(c[1])) return null;
  if (!numList(h, 4) || !indexesOk(h, [[0, 2], [2, 2]])) return null;
  if (!numList(k, 4) || !indexesOk(k, [[0, KEEPER_MODES.length], [2, KEEPER_MODES.length]])) return null;
  if (!numList(p, PLAYERS * P_FIELDS)) return null;
  for (let i = 0; i < PLAYERS; i++) if (!isInt(p[i * P_FIELDS + 5], 0, STATES.length - 1)) return null;
  if (!numList(b, B_FIELDS) || !isInt(b[6], -1, PLAYERS - 1)) return null;
  const it = d.it;
  if (it !== null && (typeof it !== 'string' || it.length > MAX_TEXT)) return null;
  const g = d.g;
  if (g !== null && (!numList(g, 3) || !isTeam(g[0]) || !isInt(g[1], -1, PLAYERS - 1) || !isInt(g[2], 0, 1))) return null;
  const so = d.so;
  let shootout: [string, string, number] | null = null;
  if (so !== null) {
    if (!Array.isArray(so) || so.length !== 3) return null;
    const [k0, k1, win] = so as unknown[];
    const kicks = (x: unknown): x is string => typeof x === 'string' && x.length <= 40 && /^[gsm]*$/.test(x);
    if (!kicks(k0) || !kicks(k1) || !isInt(win, -1, 1)) return null;
    shootout = [k0, k1, win];
  }
  const at = d.at;
  if (at !== null && (!numList(at, AT_FIELDS) || !isTeam(at[0]) || !isId(at[1]) || !indexesOk(at, [[2, ATTEMPT_PHASES.length], [6, 2]]))) return null;
  const pl = d.pl;
  if (pl !== null && (!numList(pl, PL_FIELDS) || !indexesOk(pl, [[2, ZONES.length], [3, RESULTS.length], [4, REASONS.length]]))) return null;
  if (!Array.isArray(d.e) || d.e.length > MAX_EVENTS || !d.e.every(validEvent)) return null;
  return {
    type: 'snapshot',
    v,
    tick: d.tick,
    ack: d.ack,
    m,
    it: it as string | null,
    g: g as number[] | null,
    c,
    h,
    k,
    p,
    b,
    so: shootout,
    at: at as number[] | null,
    pl: pl as number[] | null,
    e: d.e,
  };
}

// ---------------------------------------------------------------------------
// Aplicação no espelho do visitante
// ---------------------------------------------------------------------------

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function decodeKicks(s: string): PenaltyResult[] {
  return [...s].map((ch) => (ch === 'g' ? 'goal' : ch === 's' ? 'saved' : 'miss'));
}

/**
 * Escreve no espelho `mirror` o estado entre as fotos `a` e `b` (fração `alpha`): posições ficam
 * em prev (de `a`) e atual (de `b`), para as vistas interpolarem com o mesmo `alpha`; o resto vem
 * de `a` (o que mudou aparece quando o desenho chega na foto em que mudou).
 */
export function applySnapshot(mirror: Match, a: SnapshotMessage, b: SnapshotMessage, alpha: number): void {
  const w = mirror.world;
  const m = a.m;
  w.players.forEach((pl, i) => {
    const o = i * P_FIELDS;
    const ax = a.p[o]!;
    const ay = a.p[o + 1]!;
    const bx = b.p[o]!;
    const by = b.p[o + 1]!;
    const jump = Math.hypot(bx - ax, by - ay) > TELEPORT_DIST;
    pl.prevX = jump ? bx : ax;
    pl.prevY = jump ? by : ay;
    pl.x = bx;
    pl.y = by;
    pl.vx = lerp(a.p[o + 2]!, b.p[o + 2]!, alpha);
    pl.vy = lerp(a.p[o + 3]!, b.p[o + 3]!, alpha);
    pl.facing = a.p[o + 4]! + angleDiff(a.p[o + 4]!, b.p[o + 4]!) * alpha;
    pl.state = STATES[a.p[o + 5]!]!;
    pl.tackleDirX = a.p[o + 6]!;
    pl.tackleDirY = a.p[o + 7]!;
  });
  const ball = w.ball;
  const jump = Math.hypot(b.b[0]! - a.b[0]!, b.b[1]! - a.b[1]!) > TELEPORT_DIST * 2;
  ball.prevX = jump ? b.b[0]! : a.b[0]!;
  ball.prevY = jump ? b.b[1]! : a.b[1]!;
  ball.prevZ = jump ? b.b[2]! : a.b[2]!;
  ball.x = b.b[0]!;
  ball.y = b.b[1]!;
  ball.z = b.b[2]!;
  ball.vx = lerp(a.b[3]!, b.b[3]!, alpha);
  ball.vy = lerp(a.b[4]!, b.b[4]!, alpha);
  ball.vz = lerp(a.b[5]!, b.b[5]!, alpha);
  ball.owner = a.b[6]! < 0 ? null : a.b[6]!;
  w.controlled = [a.c[0]!, a.c[1]!];
  w.humans[0].charging = a.h[0] === 1;
  w.humans[0].charge = a.h[1]!;
  w.humans[1].charging = a.h[2] === 1;
  w.humans[1].charge = a.h[3]!;
  w.keepers[0].mode = KEEPER_MODES[a.k[0]!]!;
  w.keepers[0].diveY = a.k[1]!;
  w.keepers[1].mode = KEEPER_MODES[a.k[2]!]!;
  w.keepers[1].diveY = a.k[3]!;
  w.defends = [m[10] as 0 | 1, m[11] as 0 | 1];
  w.ballInHands = m[12] === 1;
  w.time = a.tick * SIM_DT;

  const samePeriod = a.m[0] === b.m[0] && a.m[1] === b.m[1];
  mirror.phase = PHASES[m[0]!]!;
  mirror.period = PERIODS[m[1]!]!;
  mirror.clock = samePeriod ? lerp(m[2]!, b.m[2]!, alpha) : m[2]!;
  mirror.phaseTimer = samePeriod ? lerp(m[3]!, b.m[3]!, alpha) : m[3]!;
  mirror.score = [m[4]!, m[5]!];
  mirror.kickoffTeam = m[6] as 0 | 1;
  mirror.kickoffLive = m[7] === 1;
  mirror.kickoffAim = m[8]!;
  mirror.over = m[9] === 1;
  mirror.intertitle = a.it;
  mirror.goals = a.g
    ? [{ team: a.g[0] as 0 | 1, scorer: a.g[1]! < 0 ? null : a.g[1]!, ownGoal: a.g[2] === 1, period: mirror.period, clock: mirror.clock } satisfies GoalRecord]
    : [];
  mirror.shootout = a.so ? ({ kicks: [decodeKicks(a.so[0]), decodeKicks(a.so[1])], turn: 0, winner: a.so[2] < 0 ? null : (a.so[2] as 0 | 1) } satisfies Shootout) : null;
  const at = a.at;
  if (!at) {
    mirror.attempt = null;
  } else {
    const sameAttempt = b.at !== null && b.at[1] === at[1] && b.at[2] === at[2];
    const pl = a.pl;
    mirror.attempt = {
      team: at[0] as 0 | 1,
      kicker: at[1]!,
      keeper: 0,
      phase: ATTEMPT_PHASES[at[2]!]!,
      timer: sameAttempt ? lerp(at[3]!, b.at![3]!, alpha) : at[3]!,
      aimTime: sameAttempt ? lerp(at[4]!, b.at![4]!, alpha) : at[4]!,
      cursor: sameAttempt ? lerp(at[5]!, b.at![5]!, alpha) : at[5]!,
      charging: at[6] === 1,
      charge: at[7]!,
      plan: pl
        ? {
            offset: pl[0]!,
            height: pl[1]!,
            power: at[7]!,
            speed: 0,
            keeperZone: ZONES[pl[2]!]!,
            result: RESULTS[pl[3]!]!,
            reason: REASONS[pl[4]!]!,
          }
        : null,
    };
  }
}
