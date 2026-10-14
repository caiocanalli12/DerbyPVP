/**
 * Adversário controlado pelo computador no modo solo (lógica pura, determinística).
 *
 * O `CpuSource` joga como um humano virtual: lê só o estado da partida (o que está na tela), nunca
 * as teclas do jogador, e devolve um `TeamCommand` por tick com os mesmos comandos do humano (mover,
 * passar, carregar e soltar o chute, dar carrinho). A simulação aplica a ele as mesmas regras de
 * troca de controle e a mesma física: não há velocidade extra nem atalho.
 *
 * - Com a bola: conduz rumo ao gol desviando dos marcadores; passa quando está pressionado ou
 *   quando um companheiro está claramente melhor (espaço livre, distância ao gol e linha de passe
 *   sem adversário); chuta ao alcance e com ângulo aberto, no canto mais longe do goleiro.
 * - Sem a bola: pressiona o portador (à distância do nível), fechando a linha de passe mais
 *   perigosa, e intercepta a bola solta; no Médio e no Difícil, tenta carrinhos.
 * - Humanização: decide em intervalos, percebe as mudanças com atraso (tempo de reação) e erra a
 *   mira do passe e do chute e o tempo do carrinho (`CPU_LEVELS`).
 * - Saída de bola: mira um companheiro e passa. Pênalti: escolhe canto e força com o erro do nível.
 *
 * A dificuldade muda só a agressividade (passes, chutes e ataque) e os carrinhos. Ao ser criado, o
 * CPU liga as infiltrações dos companheiros do time dele (`world.aiAttackBoost`).
 */
import {
  BALL_ROLL_DAMPING,
  CPU_ARRIVE_RADIUS,
  CPU_AVOID_RADIUS,
  CPU_AVOID_WEIGHT,
  CPU_BALL_JOLT,
  CPU_BYLINE_DIST,
  CPU_INTERCEPT_HORIZON,
  CPU_INTERCEPT_STEP,
  CPU_KICKOFF_AIM_TOLERANCE_DEG,
  CPU_KICKOFF_THINK_MAX,
  CPU_KICKOFF_THINK_MIN,
  CPU_LANE_SHADE,
  CPU_LEVELS,
  CPU_OWN_ACTION_TIME,
  CPU_PASS_BETTER_MARGIN,
  CPU_PASS_GOAL_WEIGHT,
  CPU_PASS_LANE_CLEARANCE,
  CPU_PASS_MAX_DIST,
  CPU_PASS_MIN_DIST,
  CPU_PASS_PRESSURE_SLACK,
  CPU_PASS_SPACE_CAP,
  CPU_PASS_SPACE_WEIGHT,
  CPU_PEN_CENTER_CHANCE,
  CPU_PEN_CORNER_OFFSET,
  CPU_PEN_DEADLINE_MARGIN,
  CPU_PEN_POWER,
  CPU_PEN_THINK_MAX,
  CPU_PEN_THINK_MIN,
  CPU_PRESS_LEAD,
  CPU_PRESSURE_RADIUS,
  CPU_SHOT_CHARGE_BASE,
  CPU_SHOT_CHARGE_JITTER,
  CPU_SHOT_CHARGE_MAX,
  CPU_SHOT_CHARGE_MIN,
  CPU_SHOT_CHARGE_PER_METER,
  CPU_SHOT_LANE_CLEARANCE,
  CPU_SHOT_MIN_MOUTH_DEG,
  CPU_SHOT_POINT_BLANK,
  CPU_SHOT_LANE_INSET,
  CPU_TACKLE_EPISODE_DIST,
  CPU_TACKLE_IDEAL_DIST,
  CPU_TACKLE_MAX_DIST,
  CPU_TACKLE_MIN_DIST,
  CPU_TIMING_JITTER,
  CPU_WALL_MARGIN,
  CPU_WALL_WEIGHT,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GRAVITY,
  PEN_CURSOR_LIMIT,
  PEN_CURSOR_SPEED,
  PEN_SWAY_AMPLITUDE,
  PEN_TIME_LIMIT,
  PLAYER_RADIUS,
  PLAYER_RUN_SPEED,
  POSSESSION_RADIUS,
  SHOT_CHARGE_TIME,
  SIM_DT,
} from '../config/constants';
import { Rng } from '../core/rng';
import { aiTarget } from './ai';
import type { Ball } from './ball';
import { emptyCommand } from './command';
import type { CommandSource, TeamCommand } from './command';
import { FIELD_CENTER_Y, GOAL_Y_MAX, GOAL_Y_MIN, goalCenter, goalLineX, penaltySpot } from './field';
import type { GoalSide } from './field';
import { kickoffTarget } from './match';
import type { Match } from './match';
import { cursorSway } from './penalties';
import type { PenaltyAttempt } from './penalties';
import type { Player, TeamIndex } from './player';
import { TACKLE_WINDOW_END, TACKLE_WINDOW_START } from './tackle';
import { angleDiff, clamp } from './vec';
import { attackedGoal, getPlayer, playerId } from './world';
import type { World } from './world';

export type CpuLevel = keyof typeof CPU_LEVELS;

/** Níveis do CPU, do mais fácil ao mais difícil. */
export const CPU_LEVEL_IDS: readonly CpuLevel[] = ['facil', 'medio', 'dificil'];

/** Parâmetros de um nível (ver `CPU_LEVELS`). */
export interface CpuParams {
  readonly reactionTime: number;
  readonly decisionInterval: number;
  readonly passAimErrorDeg: number;
  readonly shotAimErrorDeg: number;
  readonly maxShotDistance: number;
  readonly pressDistance: number;
  readonly infiltration: number;
  readonly tackleChance: number;
  readonly tackleTimingError: number;
  readonly shotPostInset: number;
  readonly penaltyAimError: number;
  readonly penaltyPowerError: number;
}

export function isCpuLevel(v: unknown): v is CpuLevel {
  return typeof v === 'string' && (CPU_LEVEL_IDS as readonly string[]).includes(v);
}

export function cpuParams(level: CpuLevel): CpuParams {
  return CPU_LEVELS[level];
}

const DEG = Math.PI / 180;
/** Meio da janela ativa do carrinho (s desde o início do deslize). */
const TACKLE_MID = (TACKLE_WINDOW_START + TACKLE_WINDOW_END) / 2;

/**
 * O que o CPU está tentando fazer. O plano (ponto de destino ou rumo) é decidido em intervalos e
 * seguido a cada tick até a próxima decisão, como alguém que decide "vou para lá" e corre.
 */
type Intent =
  | { kind: 'idle' }
  /** Ir até (x, y), a posição da formação (um goleiro está com a bola). */
  | { kind: 'position'; x: number; y: number }
  /** Ir até (x, y), onde dá para alcançar a bola solta (ou o passe que vem). */
  | { kind: 'chase'; x: number; y: number }
  /** Ir até (x, y), o ponto de pressão no portador adversário. */
  | { kind: 'press'; x: number; y: number }
  /** Conduzir no rumo (dx, dy): para o gol, desviando dos marcadores. */
  | { kind: 'dribble'; dx: number; dy: number }
  /** Carregar (conduzindo no rumo) e soltar o chute: carga alvo, erro de mira (rad) e canto preferido (sinal em Y). */
  | { kind: 'shoot'; dx: number; dy: number; charge: number; error: number; corner: 1 | -1 }
  /** Passar para `receiver`, com erro de mira (rad). */
  | { kind: 'pass'; receiver: number; error: number };

/** Botão de chute neste tick: apertar (e segurar), segurar, toque (apertar e soltar) ou soltar/nada. */
type ShootButton = 'press' | 'hold' | 'tap' | 'none';

/** Uma chance de carrinho por portador enquanto ele está perto do jogador do CPU. */
interface TackleEpisode {
  carrier: number;
  player: number;
  rolled: boolean;
}

interface KickoffPlan {
  receiver: number;
  /** A partir de quando (s) começa a mirar (depois de perceber o apito). */
  aimFrom: number;
  /** A partir de quando (s) passa, se a mira estiver no companheiro. */
  passAt: number;
}

interface PenaltyPlan {
  /** Posição do cursor (m) que, somada ao balanço na hora de soltar, dá o canto escolhido. */
  cursor: number;
  /** Ticks segurando o chute (força = ticks * SIM_DT / SHOT_CHARGE_TIME). */
  holdTicks: number;
  /** Tempo de mira (s) em que solta. */
  release: number;
}

/** Comandos do time `team` decididos pelo computador. */
export class CpuSource implements CommandSource {
  readonly params: CpuParams;
  private readonly rng: Rng;
  private lastTick: number | null = null;
  private last: TeamCommand = emptyCommand();
  /** Botão de chute preso no último comando. */
  private shootDown = false;
  private intent: Intent = { kind: 'idle' };
  private nextDecision = 0;
  /** Até quando (s) ainda não percebeu a última mudança de situação (repete o último movimento). */
  private reactUntil = 0;
  private situation: string | null = null;
  /** Quando (s) passou, chutou ou deu carrinho: a mudança que vem logo depois é a esperada. */
  private ownActionAt = -Infinity;
  private ballVX = 0;
  private ballVY = 0;
  private episode: TackleEpisode | null = null;
  private tackleAt: number | null = null;
  private kick: KickoffPlan | null = null;
  private pen: PenaltyPlan | null = null;

  constructor(
    private readonly match: Match,
    readonly team: TeamIndex,
    readonly level: CpuLevel,
    seed: number,
  ) {
    this.params = cpuParams(level);
    this.rng = new Rng(seed);
    match.world.aiAttackBoost[team] = this.params.infiltration;
  }

  /** O que o CPU está fazendo agora (para a depuração). */
  get intentKind(): string {
    return this.intent.kind;
  }

  getCommand(tick: number): TeamCommand {
    if (tick === this.lastTick) return this.last;
    this.lastTick = tick;
    const now = tick * SIM_DT;
    const m = this.match;
    let cmd: TeamCommand;
    if (m.phase === 'JOGANDO') {
      cmd = this.play(now);
    } else {
      // Fora do jogo corrido: ao voltar, a situação é percebida de novo (com reação).
      this.situation = null;
      this.intent = { kind: 'idle' };
      this.episode = null;
      this.tackleAt = null;
      if (m.phase === 'SAIDA_DE_BOLA') cmd = this.kickoff(now);
      else if (m.phase === 'PENALTIS') cmd = this.penalty();
      // Comemoração, cartões e fim: nada (nunca pula a comemoração do adversário).
      else cmd = this.compose(0, 0);
    }
    if (m.phase !== 'SAIDA_DE_BOLA') this.kick = null;
    if (m.phase !== 'PENALTIS') this.pen = null;
    this.last = cmd;
    return cmd;
  }

  // -------------------------------------------------------------------------
  // Jogo corrido: percepção, decisão e execução
  // -------------------------------------------------------------------------

  private play(now: number): TeamCommand {
    const w = this.match.world;
    const ball = w.ball;
    const key = situationKey(w, this.team);
    const jolt = ball.owner === null && Math.hypot(ball.vx - this.ballVX, ball.vy - this.ballVY) > CPU_BALL_JOLT;
    this.ballVX = ball.vx;
    this.ballVY = ball.vy;
    if (key !== this.situation || jolt) {
      this.situation = key;
      this.tackleAt = null;
      if (now - this.ownActionAt <= CPU_OWN_ACTION_TIME) {
        // Consequência do próprio passe/chute: já sabia, decide na hora.
        this.reactUntil = now;
        this.nextDecision = now;
      } else {
        this.reactUntil = now + this.jitter(this.params.reactionTime);
        this.nextDecision = this.reactUntil;
      }
    }
    // Ainda não percebeu: continua fazendo o que fazia.
    if (now < this.reactUntil - 1e-9) return this.compose(this.last.moveX, this.last.moveY, this.shootDown ? 'hold' : 'none');
    if (now >= this.nextDecision - 1e-9) {
      this.decide(now);
      this.nextDecision = now + this.jitter(this.params.decisionInterval);
    }
    return this.act(now);
  }

  private decide(now: number): void {
    const w = this.match.world;
    const me = getPlayer(w, w.controlled[this.team]);
    const owner = w.ball.owner !== null ? getPlayer(w, w.ball.owner) : null;
    if (owner && owner.id === me.id && !w.ballInHands) {
      this.decideWithBall(me);
      return;
    }
    if (owner && (owner.team === this.team || w.ballInHands)) {
      // Um goleiro está com a bola nas mãos: ocupa a posição da formação.
      const t = aiTarget(w, me, null);
      this.intent = { kind: 'position', x: t.x, y: t.y };
      return;
    }
    if (owner) {
      const t = this.pressPoint(w, owner);
      this.intent = { kind: 'press', x: t.x, y: t.y };
      this.planTackle(now, me, owner);
      return;
    }
    const t = interceptPoint(w.ball, me);
    this.intent = { kind: 'chase', x: t.x, y: t.y };
  }

  /** Com a bola: chuta, passa ou conduz. */
  private decideWithBall(me: Player): void {
    const w = this.match.world;
    // No meio da carga, não muda de ideia (soltaria um chute fraco); só corrige o rumo.
    if (this.intent.kind === 'shoot' && this.shootDown) {
      const d = this.dribbleDir(w, me);
      this.intent = { ...this.intent, dx: d.x, dy: d.y };
      return;
    }
    const ball = w.ball;
    const side = attackedGoal(w, this.team);
    const gc = goalCenter(side);
    const distGoal = Math.hypot(gc.x - ball.x, gc.y - ball.y);
    const d = this.dribbleDir(w, me);
    if (distGoal <= this.params.maxShotDistance && this.canShoot(w, side, distGoal)) {
      const charge =
        clamp(CPU_SHOT_CHARGE_BASE + CPU_SHOT_CHARGE_PER_METER * distGoal, CPU_SHOT_CHARGE_MIN, CPU_SHOT_CHARGE_MAX) +
        this.rng.range(-CPU_SHOT_CHARGE_JITTER, CPU_SHOT_CHARGE_JITTER);
      this.intent = {
        kind: 'shoot',
        dx: d.x,
        dy: d.y,
        charge: clamp(charge, 0.05, 1),
        error: this.rng.range(-1, 1) * this.params.shotAimErrorDeg * DEG,
        corner: this.rng.chance(0.5) ? 1 : -1,
      };
      return;
    }
    const receiver = this.choosePass(w, me, side);
    if (receiver) {
      this.intent = { kind: 'pass', receiver: receiver.id, error: this.rng.range(-1, 1) * this.params.passAimErrorDeg * DEG };
      return;
    }
    this.intent = { kind: 'dribble', dx: d.x, dy: d.y };
  }

  private act(now: number): TeamCommand {
    const w = this.match.world;
    const me = getPlayer(w, w.controlled[this.team]);
    const it = this.intent;
    switch (it.kind) {
      case 'idle':
        return this.compose(0, 0);
      case 'position':
        return this.moveTo(me, it.x, it.y, CPU_ARRIVE_RADIUS);
      case 'chase':
        return this.moveTo(me, it.x, it.y, 0);
      case 'press':
        return this.pressAct(now, me, it);
      case 'dribble':
        if (w.ball.owner !== me.id) return this.chaseNow(me);
        return this.compose(it.dx, it.dy);
      case 'shoot':
        return this.shootAct(now, me, it);
      case 'pass':
        return this.passAct(now, me, it);
    }
  }

  /** Perdeu a bola antes de agir: vai atrás dela até a próxima decisão. */
  private chaseNow(me: Player): TeamCommand {
    const t = interceptPoint(this.match.world.ball, me);
    this.intent = { kind: 'chase', x: t.x, y: t.y };
    return this.moveTo(me, t.x, t.y, 0);
  }

  private shootAct(now: number, me: Player, it: Extract<Intent, { kind: 'shoot' }>): TeamCommand {
    const w = this.match.world;
    if (w.ball.owner !== me.id) return this.chaseNow(me);
    if (!this.shootDown) return this.compose(it.dx, it.dy, 'press');
    const h = w.humans[this.team];
    // Segura até a carga alvo (o passo soma SIM_DT / SHOT_CHARGE_TIME por tick segurando).
    if (h.charging && h.charge < it.charge - SIM_DT / SHOT_CHARGE_TIME / 2) return this.compose(it.dx, it.dy, 'hold');
    // Solta no canto mais longe do goleiro, com o erro sorteado na decisão.
    const a = this.shotAngle(w, it);
    this.intent = { kind: 'idle' };
    this.ownActionAt = now;
    return this.compose(Math.cos(a), Math.sin(a), 'none');
  }

  private passAct(now: number, me: Player, it: Extract<Intent, { kind: 'pass' }>): TeamCommand {
    const w = this.match.world;
    if (w.ball.owner !== me.id) return this.chaseNow(me);
    const r = getPlayer(w, it.receiver);
    const a = Math.atan2(r.y - me.y, r.x - me.x) + it.error;
    this.intent = { kind: 'idle' };
    this.ownActionAt = now;
    return this.compose(Math.cos(a), Math.sin(a), 'none', true);
  }

  // -------------------------------------------------------------------------
  // Defesa: pressão e carrinho
  // -------------------------------------------------------------------------

  private pressAct(now: number, me: Player, it: Extract<Intent, { kind: 'press' }>): TeamCommand {
    const w = this.match.world;
    const ball = w.ball;
    const carrier = ball.owner !== null ? getPlayer(w, ball.owner) : null;
    if (!carrier || carrier.team === this.team || w.ballInHands) return this.chaseNow(me);
    if (this.tackleAt !== null && now >= this.tackleAt - 1e-9) {
      this.tackleAt = null;
      if (me.state === 'normal' && me.tackleCooldown <= 0) {
        // Na direção de onde a bola vai estar no meio da janela ativa.
        this.ownActionAt = now;
        const tx = ball.x + ball.vx * TACKLE_MID - me.x;
        const ty = ball.y + ball.vy * TACKLE_MID - me.y;
        const l = Math.hypot(tx, ty) || 1;
        return this.compose(tx / l, ty / l, 'tap');
      }
    }
    this.updateEpisode(me, carrier);
    return this.moveTo(me, it.x, it.y, CPU_ARRIVE_RADIUS);
  }

  /** Entre o portador (um pouco à frente dele) e o próprio gol, deslocado para a linha de passe perigosa. */
  private pressPoint(w: World, carrier: Player): { x: number; y: number } {
    const own = goalCenter(w.defends[this.team]);
    const cx = carrier.x + carrier.vx * CPU_PRESS_LEAD;
    const cy = carrier.y + carrier.vy * CPU_PRESS_LEAD;
    const dx = own.x - cx;
    const dy = own.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const k = Math.min(this.params.pressDistance, Math.max(0, d - PLAYER_RADIUS));
    let px = cx + (dx / d) * k;
    let py = cy + (dy / d) * k;
    const danger = this.dangerousReceiver(w, carrier);
    if (danger) {
      const q = closestOnSegment(px, py, cx, cy, danger.x, danger.y);
      const sx = q.x - px;
      const sy = q.y - py;
      const sl = Math.hypot(sx, sy);
      if (sl > 1e-6) {
        const m = Math.min(CPU_LANE_SHADE, sl);
        px += (sx / sl) * m;
        py += (sy / sl) * m;
      }
    }
    return { x: clamp(px, PLAYER_RADIUS, FIELD_LENGTH - PLAYER_RADIUS), y: clamp(py, PLAYER_RADIUS, FIELD_WIDTH - PLAYER_RADIUS) };
  }

  /** O companheiro do portador mais perto do gol do CPU (o passe mais perigoso). */
  private dangerousReceiver(w: World, carrier: Player): Player | null {
    const own = goalCenter(w.defends[this.team]);
    let best: Player | null = null;
    let bestD = Infinity;
    for (const o of w.players) {
      if (o.team !== carrier.team || o.id === carrier.id || o.role === 'GK') continue;
      const d = Math.hypot(o.x - own.x, o.y - own.y);
      if (d < bestD) {
        bestD = d;
        best = o;
      }
    }
    return best;
  }

  /** Abre ou encerra o episódio de carrinho (uma chance por portador enquanto estiver perto). */
  private updateEpisode(me: Player, carrier: Player): void {
    if (this.params.tackleChance <= 0) return;
    const d = Math.hypot(me.x - carrier.x, me.y - carrier.y);
    const ep = this.episode;
    if (ep && (ep.carrier !== carrier.id || ep.player !== me.id || d > CPU_TACKLE_EPISODE_DIST + 0.5)) {
      this.episode = null;
      this.tackleAt = null;
    }
    if (!this.episode && d <= CPU_TACKLE_EPISODE_DIST) this.episode = { carrier: carrier.id, player: me.id, rolled: false };
  }

  /**
   * Na decisão: se houver uma oportunidade de carrinho até a próxima decisão, sorteia uma vez (por
   * episódio) se tenta e, tentando, marca o instante com o erro de tempo do nível.
   */
  private planTackle(now: number, me: Player, carrier: Player): void {
    if (this.params.tackleChance <= 0 || carrier.team === this.team || this.match.world.ballInHands) return;
    this.updateEpisode(me, carrier);
    const ep = this.episode;
    if (!ep || ep.rolled || this.tackleAt !== null || me.state !== 'normal') return;
    const horizon = this.params.decisionInterval * (1 + CPU_TIMING_JITTER);
    const tau = tackleMoment(this.match.world.ball, me, horizon);
    if (tau === null || me.tackleCooldown > tau) return;
    ep.rolled = true;
    if (!this.rng.chance(this.params.tackleChance)) return;
    const err = this.rng.range(-1, 1) * this.params.tackleTimingError;
    this.tackleAt = now + Math.max(0, tau + err);
  }

  // -------------------------------------------------------------------------
  // Ataque: chute, passe e condução
  // -------------------------------------------------------------------------

  /** Ângulo aberto e (longe do gol) linha livre até o canto. */
  private canShoot(w: World, side: GoalSide, distGoal: number): boolean {
    const ball = w.ball;
    if (mouthAngle(ball.x, ball.y, side) < CPU_SHOT_MIN_MOUTH_DEG * DEG) return false;
    if (distGoal <= CPU_SHOT_POINT_BLANK) return true;
    const lineX = goalLineX(side);
    for (const ty of [GOAL_Y_MIN + CPU_SHOT_LANE_INSET, GOAL_Y_MAX - CPU_SHOT_LANE_INSET]) {
      if (laneClear(w, this.team, ball.x, ball.y, lineX, ty, CPU_SHOT_LANE_CLEARANCE, false)) return true;
    }
    return false;
  }

  /** Direção do chute: canto oposto ao goleiro (ou o preferido, com ele no meio) + erro. */
  private shotAngle(w: World, it: Extract<Intent, { kind: 'shoot' }>): number {
    const side = attackedGoal(w, this.team);
    const ball = w.ball;
    const gk = getPlayer(w, playerId(this.team === 0 ? 1 : 0, 'GK'));
    let corner = it.corner;
    if (Math.abs(gk.y - FIELD_CENTER_Y) > 0.15) corner = gk.y < FIELD_CENTER_Y ? 1 : -1;
    const inset = this.params.shotPostInset;
    const ty = corner > 0 ? GOAL_Y_MAX - inset : GOAL_Y_MIN + inset;
    return Math.atan2(ty - ball.y, goalLineX(side) - ball.x) + it.error;
  }

  /** Companheiro para passar agora, ou null para seguir conduzindo. */
  private choosePass(w: World, me: Player, side: GoalSide): Player | null {
    const ball = w.ball;
    const pressured = nearestOpponentDist(w, this.team, me.x, me.y, false) < CPU_PRESSURE_RADIUS;
    const selfScore = positionScore(w, this.team, me.x, me.y, side);
    let best: Player | null = null;
    let bestScore = -Infinity;
    for (const m of w.players) {
      if (m.team !== this.team || m.id === me.id || m.role === 'GK' || m.state !== 'normal') continue;
      const d = Math.hypot(m.x - me.x, m.y - me.y);
      if (d < CPU_PASS_MIN_DIST || d > CPU_PASS_MAX_DIST) continue;
      if (!laneClear(w, this.team, ball.x, ball.y, m.x, m.y, CPU_PASS_LANE_CLEARANCE, true)) continue;
      const s = positionScore(w, this.team, m.x, m.y, side);
      if (s > bestScore) {
        bestScore = s;
        best = m;
      }
    }
    if (!best) return null;
    if (bestScore > selfScore + CPU_PASS_BETTER_MARGIN) return best;
    if (pressured && bestScore > selfScore - CPU_PASS_PRESSURE_SLACK) return best;
    return null;
  }

  /** Rumo da condução: para o gol, desviando dos adversários à frente e das paredes. */
  private dribbleDir(w: World, me: Player): { x: number; y: number } {
    const side = attackedGoal(w, this.team);
    let target = goalCenter(side);
    // Colado na linha de fundo sem ângulo: volta para a marca do pênalti.
    if (Math.abs(goalLineX(side) - me.x) < CPU_BYLINE_DIST && mouthAngle(w.ball.x, w.ball.y, side) < CPU_SHOT_MIN_MOUTH_DEG * DEG) {
      target = penaltySpot(side);
    }
    let dx = target.x - me.x;
    let dy = target.y - me.y;
    const dl = Math.hypot(dx, dy) || 1;
    dx /= dl;
    dy /= dl;
    let sx = 0;
    let sy = 0;
    // Sentido de Y que leva ao meio do campo.
    const towardCenter = me.y < FIELD_CENTER_Y ? 1 : -1;
    for (const o of w.players) {
      if (o.team === this.team) continue;
      const ox = o.x - me.x;
      const oy = o.y - me.y;
      const d = Math.hypot(ox, oy);
      if (d > CPU_AVOID_RADIUS || d < 1e-6) continue;
      const ahead = (ox * dx + oy * dy) / d;
      if (ahead < -0.2) continue;
      const wgt = (1 - d / CPU_AVOID_RADIUS) * (0.5 + 0.5 * ahead);
      // Desvia pela perpendicular ao rumo, (-dy, dx) vezes `away`, para o lado oposto ao do
      // marcador; com ele bem na frente, para o lado do meio do campo (o Y da perpendicular é dx).
      const cross = dx * oy - dy * ox;
      const away = Math.abs(cross) > 0.05 * d ? -Math.sign(cross) : Math.sign(dx * towardCenter) || 1;
      sx += -dy * away * wgt * CPU_AVOID_WEIGHT - (ox / d) * wgt * 0.5;
      sy += dx * away * wgt * CPU_AVOID_WEIGHT - (oy / d) * wgt * 0.5;
    }
    if (me.y < CPU_WALL_MARGIN) sy += ((CPU_WALL_MARGIN - me.y) / CPU_WALL_MARGIN) * CPU_WALL_WEIGHT;
    if (me.y > FIELD_WIDTH - CPU_WALL_MARGIN) sy -= ((me.y - (FIELD_WIDTH - CPU_WALL_MARGIN)) / CPU_WALL_MARGIN) * CPU_WALL_WEIGHT;
    const rx = dx + sx;
    const ry = dy + sy;
    const rl = Math.hypot(rx, ry);
    return rl > 1e-9 ? { x: rx / rl, y: ry / rl } : { x: dx, y: dy };
  }

  // -------------------------------------------------------------------------
  // Saída de bola e pênaltis
  // -------------------------------------------------------------------------

  /** Na própria saída: percebe o apito, mira um companheiro do próprio campo e passa. */
  private kickoff(now: number): TeamCommand {
    const m = this.match;
    const w = m.world;
    if (m.kickoffTeam !== this.team || !m.kickoffLive) {
      this.kick = null;
      return this.compose(0, 0);
    }
    if (!this.kick) {
      const role = this.rng.pick(['FIXO', 'ALA_E', 'ALA_D'] as const);
      const aimFrom = now + this.jitter(this.params.reactionTime);
      this.kick = { receiver: playerId(this.team, role), aimFrom, passAt: aimFrom + this.rng.range(CPU_KICKOFF_THINK_MIN, CPU_KICKOFF_THINK_MAX) };
    }
    if (now < this.kick.aimFrom) return this.compose(0, 0);
    const kicker = getPlayer(w, playerId(this.team, 'ATA'));
    const r = getPlayer(w, this.kick.receiver);
    const want = Math.atan2(r.y - w.ball.y, r.x - w.ball.x);
    const aimed =
      Math.abs(angleDiff(m.kickoffAim, want)) <= CPU_KICKOFF_AIM_TOLERANCE_DEG * DEG &&
      kickoffTarget(w, kicker, m.kickoffAim).id === r.id;
    // Se a mira não chegar no escolhido (outro no caminho), passa assim mesmo pouco depois.
    const pass = now >= this.kick.passAt && (aimed || now >= this.kick.passAt + 1);
    if (pass) this.ownActionAt = now;
    return this.compose(Math.cos(want), Math.sin(want), 'none', pass);
  }

  /** Na própria cobrança: leva o cursor ao canto escolhido (com o balanço), carrega e solta. */
  private penalty(): TeamCommand {
    const a = this.match.attempt;
    if (!a || a.team !== this.team || a.phase !== 'aiming') {
      this.pen = null;
      return this.compose(0, 0);
    }
    if (!this.pen) this.pen = this.planPenalty(a);
    const pen = this.pen;
    // `updateAiming` soma o passo ao tempo de mira antes de usá-lo.
    const t = a.aimTime + SIM_DT;
    const diff = pen.cursor - a.cursor;
    const dir = Math.abs(diff) > (PEN_CURSOR_SPEED * SIM_DT) / 2 ? Math.sign(diff) : 0;
    if (!a.charging) {
      const pressAt = pen.release - pen.holdTicks * SIM_DT;
      return this.compose(dir, 0, t >= pressAt - 1e-6 ? 'press' : 'none');
    }
    return this.compose(dir, 0, t >= pen.release - 1e-6 ? 'none' : 'hold');
  }

  private planPenalty(a: PenaltyAttempt): PenaltyPlan {
    const sign = this.rng.chance(CPU_PEN_CENTER_CHANCE) ? 0 : this.rng.chance(0.5) ? 1 : -1;
    const target = sign * CPU_PEN_CORNER_OFFSET + this.rng.range(-1, 1) * this.params.penaltyAimError;
    const power = clamp(CPU_PEN_POWER + this.rng.range(-1, 1) * this.params.penaltyPowerError, 0.05, 1);
    const holdTicks = Math.max(1, Math.round((power * SHOT_CHARGE_TIME) / SIM_DT));
    // Solta depois de pensar, com tempo para o cursor chegar, e antes do prazo.
    const travel = (Math.abs(target) + PEN_SWAY_AMPLITUDE) / PEN_CURSOR_SPEED + 0.1;
    const think = this.jitter(this.params.reactionTime) + this.rng.range(CPU_PEN_THINK_MIN, CPU_PEN_THINK_MAX);
    const earliest = a.aimTime + Math.max(travel, holdTicks * SIM_DT);
    const latest = PEN_TIME_LIMIT - CPU_PEN_DEADLINE_MARGIN;
    const release = Math.ceil(clamp(a.aimTime + think + holdTicks * SIM_DT, earliest, Math.max(earliest, latest)) / SIM_DT) * SIM_DT;
    const cursor = clamp(target - cursorSway(release), -PEN_CURSOR_LIMIT, PEN_CURSOR_LIMIT);
    return { cursor, holdTicks, release };
  }

  // -------------------------------------------------------------------------
  // Comando
  // -------------------------------------------------------------------------

  private moveTo(me: Player, tx: number, ty: number, arrive: number): TeamCommand {
    const dx = tx - me.x;
    const dy = ty - me.y;
    const d = Math.hypot(dx, dy);
    if (d < 0.1) return this.compose(0, 0);
    const mag = arrive > 0 ? Math.min(1, d / arrive) : 1;
    return this.compose((dx / d) * mag, (dy / d) * mag);
  }

  /** Monta o comando do tick, coerente com o botão de chute do tick anterior. */
  private compose(mx: number, my: number, shoot: ShootButton = 'none', pass = false): TeamCommand {
    let x = Number.isFinite(mx) ? mx : 0;
    let y = Number.isFinite(my) ? my : 0;
    const l = Math.hypot(x, y);
    if (l > 1) {
      x /= l;
      y /= l;
    }
    let held = false;
    let pressed = false;
    let released = false;
    switch (shoot) {
      case 'press':
        held = true;
        pressed = !this.shootDown;
        break;
      case 'hold':
        held = this.shootDown;
        break;
      case 'tap':
        // Toque: aperta e solta no mesmo tick (preso antes: só solta agora).
        released = true;
        pressed = !this.shootDown;
        break;
      case 'none':
        released = this.shootDown;
        break;
    }
    this.shootDown = held;
    return { moveX: x, moveY: y, passPressed: pass, shootHeld: held, shootReleased: released, shootPressed: pressed };
  }

  /** Valor com a variação aleatória de tempo (± CPU_TIMING_JITTER). */
  private jitter(v: number): number {
    return v * (1 + this.rng.range(-CPU_TIMING_JITTER, CPU_TIMING_JITTER));
  }
}

// ---------------------------------------------------------------------------
// Geometria (pura)
// ---------------------------------------------------------------------------

/** O que o CPU percebe como "a situação": quem tem a bola, quem ele controla, passe em andamento. */
function situationKey(w: World, team: TeamIndex): string {
  const lock = w.passLock;
  return `${w.ball.owner ?? '-'}|${w.ballInHands ? 1 : 0}|${w.controlled[team]}|${lock ? lock.receiver : '-'}`;
}

/**
 * Posição prevista da bola solta daqui a `t` s: no ar sem atrito até cair, depois rolando com o
 * amortecimento (ignora quiques e paredes; fica dentro do campo).
 */
export function predictBall(b: Ball, t: number): { x: number; y: number } {
  let x = b.x;
  let y = b.y;
  let rem = t;
  if (b.z > 1e-6 || b.vz > 1e-6) {
    const land = (b.vz + Math.sqrt(b.vz * b.vz + 2 * GRAVITY * Math.max(0, b.z))) / GRAVITY;
    const ta = Math.min(rem, land);
    x += b.vx * ta;
    y += b.vy * ta;
    rem -= ta;
  }
  if (rem > 0) {
    const f = (1 - Math.exp(-BALL_ROLL_DAMPING * rem)) / BALL_ROLL_DAMPING;
    x += b.vx * f;
    y += b.vy * f;
  }
  return { x: clamp(x, 0, FIELD_LENGTH), y: clamp(y, 0, FIELD_WIDTH) };
}

/** Primeiro ponto da trajetória da bola que o jogador alcança correndo (ou o último previsto). */
export function interceptPoint(b: Ball, p: Player): { x: number; y: number } {
  for (let t = 0; t <= CPU_INTERCEPT_HORIZON + 1e-9; t += CPU_INTERCEPT_STEP) {
    const q = predictBall(b, t);
    if (Math.hypot(q.x - p.x, q.y - p.y) <= PLAYER_RUN_SPEED * t + POSSESSION_RADIUS * 0.5) return q;
  }
  return predictBall(b, CPU_INTERCEPT_HORIZON);
}

/** Ângulo (rad) da boca do gol vista do ponto (x, y). */
export function mouthAngle(x: number, y: number, side: GoalSide): number {
  const lx = goalLineX(side);
  const a1 = Math.atan2(GOAL_Y_MIN - y, lx - x);
  const a2 = Math.atan2(GOAL_Y_MAX - y, lx - x);
  return Math.abs(angleDiff(a1, a2));
}

function closestOnSegment(px: number, py: number, ax: number, ay: number, bx: number, by: number): { x: number; y: number } {
  const vx = bx - ax;
  const vy = by - ay;
  const l2 = vx * vx + vy * vy;
  const t = l2 > 1e-12 ? clamp(((px - ax) * vx + (py - ay) * vy) / l2, 0, 1) : 0;
  return { x: ax + vx * t, y: ay + vy * t };
}

/** Nenhum adversário de `team` a menos de `clearance` do trajeto (x0,y0)→(x1,y1). Goleiro opcional. */
function laneClear(
  w: World,
  team: TeamIndex,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  clearance: number,
  withKeeper: boolean,
): boolean {
  for (const o of w.players) {
    if (o.team === team || (!withKeeper && o.role === 'GK')) continue;
    const q = closestOnSegment(o.x, o.y, x0, y0, x1, y1);
    if (Math.hypot(o.x - q.x, o.y - q.y) < clearance) return false;
  }
  return true;
}

/** Distância do ponto ao adversário mais perto (com ou sem o goleiro). */
function nearestOpponentDist(w: World, team: TeamIndex, x: number, y: number, withKeeper: boolean): number {
  let best = Infinity;
  for (const o of w.players) {
    if (o.team === team || (!withKeeper && o.role === 'GK')) continue;
    best = Math.min(best, Math.hypot(o.x - x, o.y - y));
  }
  return best;
}

/** Quanto vale ter a bola em (x, y): espaço livre (com teto) menos a distância ao gol atacado. */
function positionScore(w: World, team: TeamIndex, x: number, y: number, side: GoalSide): number {
  const g = goalCenter(side);
  const space = Math.min(nearestOpponentDist(w, team, x, y, true), CPU_PASS_SPACE_CAP);
  return CPU_PASS_SPACE_WEIGHT * space - CPU_PASS_GOAL_WEIGHT * Math.hypot(g.x - x, g.y - y);
}

/**
 * Daqui a quanto tempo (s, até `horizon`) começar um carrinho deixaria a bola, no meio da janela
 * ativa, à distância ideal do jogador (os dois mantendo a velocidade). Null se não houver chance.
 */
function tackleMoment(ball: Ball, p: Player, horizon: number): number | null {
  let best: number | null = null;
  let bestErr = Infinity;
  for (let s = 0; s <= horizon + 1e-9; s += SIM_DT) {
    const bx = ball.x + ball.vx * (s + TACKLE_MID);
    const by = ball.y + ball.vy * (s + TACKLE_MID);
    const d = Math.hypot(bx - (p.x + p.vx * s), by - (p.y + p.vy * s));
    if (d < CPU_TACKLE_MIN_DIST || d > CPU_TACKLE_MAX_DIST) continue;
    const e = Math.abs(d - CPU_TACKLE_IDEAL_DIST);
    if (e < bestErr) {
      bestErr = e;
      best = s;
    }
  }
  return best;
}
