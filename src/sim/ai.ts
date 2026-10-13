/**
 * IA dos jogadores de linha não controlados (lógica pura).
 *
 * - Ficam na posição da formação, deslocada em direção à bola (30% em X, 20% em Y),
 *   sempre presos à zona da função.
 * - Ataque (o time tem a bola): avançam suavemente para as posições de ataque.
 * - Defesa (o adversário tem a bola): o IA cuja zona contém o portador fica entre ele e o
 *   próprio gol, a ~2 m, bloqueando; os demais recuam e fecham o meio.
 * - A IA nunca conduz nem dá carrinho: quem pega a bola passa a ser controlado pelo humano.
 */
import {
  AI_ARRIVE_RADIUS,
  AI_ATTACK_SHIFT,
  AI_BALL_FOLLOW_U,
  AI_BALL_FOLLOW_V,
  AI_DEAD_ZONE,
  AI_DEFENSE_DROP,
  AI_DEFENSE_SQUEEZE,
  AI_MARK_DISTANCE,
  AI_SPEED_FACTOR,
  AI_TARGET_SMOOTHING,
  AI_ZONES,
  FIELD_LENGTH,
  FIELD_WIDTH,
  FORMATION,
  PLAYER_RADIUS,
  PLAYER_RUN_SPEED,
  PLAYER_TURN_RATE,
} from '../config/constants';
import { FIELD_CENTER_X, FIELD_CENTER_Y, goalCenter } from './field';
import type { Player, Role, TeamIndex } from './player';
import { clamp, rotateTowards } from './vec';
import type { World } from './world';

type FieldRole = Exclude<Role, 'GK'>;

/** Mundo -> coordenadas de ataque do time (u a partir do próprio gol; v com o ala esquerdo em v pequeno). */
export function toAttackFrame(world: World, team: TeamIndex, x: number, y: number): { u: number; v: number } {
  return world.defends[team] === 0 ? { u: x, v: y } : { u: FIELD_LENGTH - x, v: FIELD_WIDTH - y };
}

/** Coordenadas de ataque -> mundo (a transformação é a própria inversa). */
export function fromAttackFrame(world: World, team: TeamIndex, u: number, v: number): { x: number; y: number } {
  return world.defends[team] === 0 ? { x: u, y: v } : { x: FIELD_LENGTH - u, y: FIELD_WIDTH - v };
}

export function zoneContains(role: FieldRole, u: number, v: number, margin = 0): boolean {
  const z = AI_ZONES[role];
  return u >= z.uMin - margin && u <= z.uMax + margin && v >= z.vMin - margin && v <= z.vMax + margin;
}

function clampToZone(role: FieldRole, u: number, v: number, margin = 0): { u: number; v: number } {
  const z = AI_ZONES[role];
  return { u: clamp(u, z.uMin - margin, z.uMax + margin), v: clamp(v, z.vMin - margin, z.vMax + margin) };
}

/** Jogadores de linha do time que estão sob a IA neste passo. */
export function isAiFieldPlayer(world: World, p: Player): boolean {
  return p.role !== 'GK' && world.controlled[p.team] !== p.id;
}

/** Portador adversário que deve ser marcado (jogador de linha com a bola nos pés). */
function opponentCarrier(world: World, team: TeamIndex): Player | null {
  const id = world.ball.owner;
  if (id === null || world.ballInHands) return null;
  const owner = world.players[id];
  return owner && owner.team !== team ? owner : null;
}

/**
 * Escolhe o marcador: entre os IA de linha do time cuja zona contém o portador,
 * o mais perto dele. Null se nenhuma zona o contém.
 */
export function chooseMarker(world: World, team: TeamIndex): Player | null {
  const carrier = opponentCarrier(world, team);
  if (!carrier) return null;
  const c = toAttackFrame(world, team, carrier.x, carrier.y);
  let best: Player | null = null;
  let bestD = Infinity;
  for (const p of world.players) {
    if (p.team !== team || !isAiFieldPlayer(world, p) || p.state !== 'normal') continue;
    if (!zoneContains(p.role as FieldRole, c.u, c.v)) continue;
    const d = Math.hypot(p.x - carrier.x, p.y - carrier.y);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}

/** Alvo (em coordenadas do mundo) de um jogador de linha da IA. `marker` = id do marcador do time. */
export function aiTarget(world: World, p: Player, marker: number | null): { x: number; y: number } {
  const role = p.role as FieldRole;
  const team = p.team;
  const ball = world.ball;
  const b = toAttackFrame(world, team, ball.x, ball.y);
  const base = FORMATION[role];
  let u = base.x + (b.u - FIELD_CENTER_X) * AI_BALL_FOLLOW_U;
  let v = base.y + (b.v - FIELD_CENTER_Y) * AI_BALL_FOLLOW_V;

  const ownerId = ball.owner;
  const owner = ownerId !== null ? (world.players[ownerId] ?? null) : null;

  if (owner && owner.team === team) {
    // Ataque: abre espaço avançando.
    const shift = AI_ATTACK_SHIFT[role];
    u += shift.du;
    v += shift.dv;
  } else if (owner && owner.team !== team) {
    const carrier = opponentCarrier(world, team);
    if (carrier && marker === p.id) {
      // Marca: entre o portador e o próprio gol, a ~2 m dele.
      const g = goalCenter(world.defends[team]);
      const dx = g.x - carrier.x;
      const dy = g.y - carrier.y;
      const d = Math.hypot(dx, dy) || 1;
      const k = Math.min(AI_MARK_DISTANCE, Math.max(0, d - PLAYER_RADIUS));
      const tx = carrier.x + (dx / d) * k;
      const ty = carrier.y + (dy / d) * k;
      const t = toAttackFrame(world, team, tx, ty);
      const c = clampToZone(role, t.u, t.v, AI_MARK_DISTANCE);
      return fromAttackFrame(world, team, c.u, c.v);
    }
    // Os demais recuam e fecham o meio.
    u -= AI_DEFENSE_DROP;
    v += (FIELD_CENTER_Y - v) * AI_DEFENSE_SQUEEZE;
  }

  const c = clampToZone(role, u, v);
  return fromAttackFrame(world, team, c.u, c.v);
}

/** Define a intenção de movimento de um jogador de linha da IA neste passo. */
export function updateFieldAi(world: World, p: Player, marker: number | null, dt: number): void {
  const target = aiTarget(world, p, marker);
  // O alvo se move suavemente (sem trancos quando a posse muda).
  const k = 1 - Math.exp(-AI_TARGET_SMOOTHING * dt);
  p.aiTargetX += (target.x - p.aiTargetX) * k;
  p.aiTargetY += (target.y - p.aiTargetY) * k;

  const dx = p.aiTargetX - p.x;
  const dy = p.aiTargetY - p.y;
  const d = Math.hypot(dx, dy);
  p.maxSpeed = PLAYER_RUN_SPEED * AI_SPEED_FACTOR;
  if (d < AI_DEAD_ZONE) {
    p.moveX = 0;
    p.moveY = 0;
  } else {
    const mag = Math.min(1, d / AI_ARRIVE_RADIUS);
    p.moveX = (dx / d) * mag;
    p.moveY = (dy / d) * mag;
  }
}

/** Jogador parado (ou quase) vira o corpo para a bola. */
export function faceBallWhenIdle(world: World, p: Player, dt: number): void {
  if (Math.hypot(p.vx, p.vy) > 1) return;
  const a = Math.atan2(world.ball.y - p.y, world.ball.x - p.x);
  p.facing = rotateTowards(p.facing, a, PLAYER_TURN_RATE * 0.5 * dt);
}
