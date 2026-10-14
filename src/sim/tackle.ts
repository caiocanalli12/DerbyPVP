/**
 * Dividida (carrinho): possível, mas não fácil (lógica pura).
 *
 * - Desliza TACKLE_DISTANCE em TACKLE_DURATION na direção do direcional (ou de onde está virado).
 * - Só acerta dentro da janela ativa (TACKLE_ACTIVE_WINDOW, no meio do deslize), com uma
 *   hitbox circular na ponta do pé.
 * - Acertou a bola de quem conduz: bola solta na direção do carrinho e o adversário cambaleia.
 * - Acertou bola solta: empurra a bola. Errou: fica caído. Sem faltas.
 * - Só quem é comandado (humano ou o CPU do modo solo, pelo mesmo comando) dá carrinho; os
 *   companheiros da IA não.
 */
import {
  BALL_RADIUS,
  POSSESSION_MAX_Z,
  TACKLE_ACTIVE_WINDOW,
  TACKLE_BALL_SPEED,
  TACKLE_COOLDOWN,
  TACKLE_DISTANCE,
  TACKLE_DURATION,
  TACKLE_FALLEN_TIME,
  TACKLE_FOOT_REACH,
  TACKLE_HITBOX_RADIUS,
  TACKLE_SLIDE_DECEL,
  TACKLE_STUMBLE_TIME,
} from '../config/constants';
import type { Ball } from './ball';
import type { SimEvent } from './events';
import { setPlayerState } from './player';
import type { Player } from './player';

/** Início e fim da janela ativa (s desde o começo do deslize). */
export const TACKLE_WINDOW_START = (TACKLE_DURATION - TACKLE_ACTIVE_WINDOW) / 2;
export const TACKLE_WINDOW_END = TACKLE_WINDOW_START + TACKLE_ACTIVE_WINDOW;

/** Velocidade inicial para percorrer TACKLE_DISTANCE com a desaceleração linear configurada. */
const SLIDE_V0 = TACKLE_DISTANCE / (TACKLE_DURATION * (1 - TACKLE_SLIDE_DECEL / 2));

export function canStartTackle(p: Player): boolean {
  return p.state === 'normal' && p.tackleCooldown <= 0 && p.role !== 'GK';
}

/** Começa um carrinho na direção (dx, dy). Devolve se começou. */
export function startTackle(p: Player, dx: number, dy: number): boolean {
  if (!canStartTackle(p)) return false;
  let l = Math.hypot(dx, dy);
  if (l < 1e-9) {
    dx = Math.cos(p.facing);
    dy = Math.sin(p.facing);
    l = 1;
  }
  p.tackleDirX = dx / l;
  p.tackleDirY = dy / l;
  p.facing = Math.atan2(p.tackleDirY, p.tackleDirX);
  p.tackleHit = false;
  p.tackleCooldown = TACKLE_COOLDOWN;
  setPlayerState(p, 'tackling');
  return true;
}

/** A dividida está na janela em que pode acertar? */
export function isTackleActive(p: Player): boolean {
  return p.state === 'tackling' && p.stateTimer >= TACKLE_WINDOW_START - 1e-9 && p.stateTimer <= TACKLE_WINDOW_END + 1e-9;
}

/** Centro da hitbox (ponta do pé) de quem está dando o carrinho. */
export function tackleFootTip(p: Player): { x: number; y: number } {
  return { x: p.x + p.tackleDirX * TACKLE_FOOT_REACH, y: p.y + p.tackleDirY * TACKLE_FOOT_REACH };
}

/** Velocidade do deslize no instante `t` do carrinho. */
export function slideSpeedAt(t: number): number {
  const k = Math.min(1, Math.max(0, t / TACKLE_DURATION));
  return SLIDE_V0 * (1 - TACKLE_SLIDE_DECEL * k);
}

/**
 * Avança os cronômetros e as transições de estado do corpo; define a velocidade
 * de quem está deslizando ou caído.
 */
export function updateBodyState(p: Player, dt: number): void {
  if (p.tackleCooldown > 0) p.tackleCooldown = Math.max(0, p.tackleCooldown - dt);
  if (p.state === 'normal') return;
  // O cronômetro do carrinho avança em integrateSlide (junto com o deslize).
  if (p.state !== 'tackling') p.stateTimer += dt;
  switch (p.state) {
    case 'tackling':
      if (p.stateTimer >= TACKLE_DURATION - 1e-9) {
        if (p.tackleHit) setPlayerState(p, 'normal');
        else setPlayerState(p, 'fallen');
        p.vx = 0;
        p.vy = 0;
      }
      break;
    case 'fallen':
      p.vx = 0;
      p.vy = 0;
      if (p.stateTimer >= TACKLE_FALLEN_TIME - 1e-9) setPlayerState(p, 'normal');
      break;
    case 'stumbling':
      if (p.stateTimer >= TACKLE_STUMBLE_TIME - 1e-9) setPlayerState(p, 'normal');
      break;
  }
}

/**
 * Integra o deslize de um carrinho no intervalo [t, t + dt] do perfil e avança o cronômetro.
 * Como o perfil é linear, a velocidade média do intervalo dá a distância exata (TACKLE_DISTANCE).
 */
export function integrateSlide(p: Player, dt: number): void {
  const t0 = p.stateTimer;
  const t1 = Math.min(t0 + dt, TACKLE_DURATION);
  const span = Math.max(0, t1 - t0);
  const v = span > 0 ? (slideSpeedAt(t0) + slideSpeedAt(t1)) / 2 : 0;
  p.vx = p.tackleDirX * v;
  p.vy = p.tackleDirY * v;
  p.x += p.tackleDirX * v * span;
  p.y += p.tackleDirY * v * span;
  p.stateTimer = t0 + dt;
}

/**
 * Checa se o carrinho acerta a bola nesta janela.
 * `owner` é quem está com a bola (ou null). Bola na mão do goleiro não pode ser roubada.
 */
export function resolveTackleHit(
  tackler: Player,
  ball: Ball,
  owner: Player | null,
  ballInHands: boolean,
  events: SimEvent[],
): boolean {
  if (!isTackleActive(tackler) || tackler.tackleHit) return false;
  if (owner && owner.team === tackler.team) return false;
  if (owner && ballInHands) return false;
  if (!owner && ball.z >= POSSESSION_MAX_Z) return false;
  const tip = tackleFootTip(tackler);
  if (Math.hypot(ball.x - tip.x, ball.y - tip.y) >= TACKLE_HITBOX_RADIUS + BALL_RADIUS) return false;

  tackler.tackleHit = true;
  ball.owner = null;
  ball.lastTouch = tackler.id;
  ball.vx = tackler.tackleDirX * TACKLE_BALL_SPEED;
  ball.vy = tackler.tackleDirY * TACKLE_BALL_SPEED;
  ball.vz = 0;
  ball.z = 0;
  if (owner) {
    setPlayerState(owner, 'stumbling');
    events.push({ type: 'tackle', player: tackler.id, result: 'steal', victim: owner.id });
  } else {
    events.push({ type: 'tackle', player: tackler.id, result: 'loose', victim: null });
  }
  return true;
}
