/**
 * Escolhe a animação, a vista e o quadro de cada jogador a partir do estado da simulação.
 * Poses trocam a 12–15 qps; posição e física continuam suaves a 60.
 */
import {
  ANIM_ACTION_FPS,
  ANIM_BRAKE_DECEL,
  ANIM_BRAKE_SQUASH_TIME,
  ANIM_IDLE_POSE_FPS,
  ANIM_RUN_FPS,
  ANIM_RUN_MIN_FPS,
  ANIM_RUN_THRESHOLD,
  BOIL_FPS,
  PLAYER_RUN_SPEED,
} from '../config/constants';
import { ANIMS, frameName } from '../art/player-art';
import type { AnimName, View } from '../art/player-art';
import type { KeeperMode } from '../sim/goalkeeper';
import type { Player } from '../sim/player';

export type ActionAnim = 'pass' | 'kick' | 'gkThrow';

export interface AnimContext {
  /** Tempo real (s) para a fervura. */
  time: number;
  /** Este jogador está carregando o chute (antecipação). */
  charging: boolean;
  /** Este jogador está com a bola nos pés. */
  dribbling: boolean;
  /** Comemorando um gol (o autor). */
  celebrating: boolean;
  /** Estado do goleiro (só para goleiros). */
  keeperMode: KeeperMode | null;
  /** Lado do mergulho em Y do mundo (só no mergulho). */
  diveY: number;
  /** Mundo congelado (saída de bola, cartões): fica parado. */
  frozen: boolean;
}

export interface AnimOutput {
  frame: string;
  wide: boolean;
  flipX: boolean;
  /** Rotação extra do sprite (rad). */
  rotation: number;
  /** Achatar/esticar (exagero de desenho animado). */
  sx: number;
  sy: number;
}

/** Vista a partir da direção do corpo: lateral (espelhada) ou de frente/costas. */
export function viewFor(facing: number): { view: View; flipX: boolean } {
  const c = Math.cos(facing);
  const s = Math.sin(facing);
  // Diagonais usam a vista lateral (mais legível na corrida).
  if (Math.abs(s) > 0.86) return { view: s > 0 ? 'front' : 'back', flipX: false };
  return { view: 'side', flipX: c < 0 };
}

export class PlayerAnimator {
  private action: ActionAnim | null = null;
  private actionTime = 0;
  private runPhase = 0;
  private lastSpeed = 0;
  private brake = 0;
  private keeperMode: KeeperMode | null = null;
  private keeperModeTime = 0;
  private celebrateTime = 0;

  /** Dispara uma animação de ação (passe, chute, lançamento). */
  trigger(action: ActionAnim): void {
    this.action = action;
    // O chute começa no golpe (a antecipação já apareceu enquanto carregava).
    this.actionTime = action === 'kick' ? 2 / ANIM_ACTION_FPS : 0;
  }

  update(p: Player, ctx: AnimContext, dt: number): AnimOutput {
    const speed = Math.hypot(p.vx, p.vy);
    const decel = (this.lastSpeed - speed) / Math.max(dt, 1e-3);
    if (decel > ANIM_BRAKE_DECEL && this.lastSpeed > 3) this.brake = ANIM_BRAKE_SQUASH_TIME;
    this.lastSpeed = speed;
    this.brake = Math.max(0, this.brake - dt);
    if (ctx.keeperMode !== this.keeperMode) {
      this.keeperMode = ctx.keeperMode;
      this.keeperModeTime = 0;
    } else {
      this.keeperModeTime += dt;
    }
    this.celebrateTime = ctx.celebrating ? this.celebrateTime + dt : 0;

    const boil = Math.floor(ctx.time * BOIL_FPS) % 3;
    const { view, flipX } = viewFor(p.facing);
    const out = (anim: AnimName, v: View, frame: number, flip: boolean, rotation = 0): AnimOutput => {
      const spec = ANIMS[anim];
      const vv = spec.views.includes(v) ? v : spec.views[0]!;
      const variant = spec.boilVariants > 1 ? boil : 0;
      const f = Math.max(0, Math.min(spec.frames - 1, frame));
      const squash = this.brake > 0 ? 1 - 0.5 * (this.brake / ANIM_BRAKE_SQUASH_TIME) * 0.16 : 1;
      return {
        frame: frameName(anim, vv, f, variant),
        wide: spec.wide,
        flipX: vv === 'side' ? flip : false,
        rotation,
        sx: 2 - squash,
        sy: squash,
      };
    };
    // Poses de 2 quadros "respiram" devagar; a fervura troca a 12 qps.
    const slowPose = Math.floor(ctx.time * ANIM_IDLE_POSE_FPS) % 2;
    const fastPose = Math.floor(ctx.time * 6) % 2;

    // Estados do corpo têm prioridade.
    if (p.state === 'tackling') return out('slide', 'side', fastPose, flipX);
    if (p.state === 'fallen') return out('fallen', 'side', slowPose, flipX);
    if (p.state === 'stumbling') return out('stumble', 'side', fastPose, flipX);

    if (ctx.celebrating) {
      const f = Math.floor(this.celebrateTime * 8) % ANIMS.celebrate.frames;
      return out('celebrate', 'front', f, false);
    }

    // Goleiro.
    if (p.role === 'GK' && ctx.keeperMode) {
      switch (ctx.keeperMode) {
        case 'windup':
        case 'dive': {
          const f = this.keeperMode === 'windup' ? 0 : Math.min(2, Math.floor(this.keeperModeTime * 7) + 1);
          // Mergulho em Y do mundo = para cima/baixo na tela: inclina o corpo nessa direção.
          const rot = ctx.diveY < 0 ? -0.95 : 0.55;
          return out('gkDive', 'side', f, flipX, flipX ? -rot : rot);
        }
        case 'recover': {
          const rot = ctx.diveY < 0 ? -0.35 : 0.25;
          return out('gkDive', 'side', 2, flipX, flipX ? -rot : rot);
        }
        case 'hold':
          if (this.action !== 'gkThrow') return out('gkHold', view === 'side' ? 'side' : 'front', slowPose, flipX);
          break;
        case 'position':
          break;
      }
    }

    // Ações disparadas (passe, chute, lançamento).
    if (this.action) {
      this.actionTime += dt;
      const anim: AnimName = this.action;
      const f = Math.floor(this.actionTime * ANIM_ACTION_FPS);
      if (f < ANIMS[anim].frames) return out(anim, 'side', f, flipX);
      this.action = null;
    }

    // Antecipação do chute enquanto carrega.
    if (ctx.charging) return out('kick', 'side', fastPose, flipX);

    if (!ctx.frozen && speed > ANIM_RUN_THRESHOLD) {
      const fps = Math.max(ANIM_RUN_MIN_FPS, ANIM_RUN_FPS * Math.min(1, speed / PLAYER_RUN_SPEED));
      this.runPhase = (this.runPhase + fps * dt) % 6;
      const f = Math.floor(this.runPhase);
      const anim: AnimName = ctx.dribbling && view === 'side' ? 'dribble' : 'run';
      return out(anim, view, f, flipX);
    }

    if (p.role === 'GK') return out('gkReady', view === 'back' ? 'side' : view === 'front' ? 'front' : 'side', slowPose, flipX);
    return out('idle', view, slowPose, flipX);
  }
}
