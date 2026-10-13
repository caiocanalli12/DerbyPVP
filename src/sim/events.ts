/**
 * Eventos que a simulação emite a cada passo (consumidos pelo desenho, áudio e regras).
 */
import type { BallContact } from './ball';
import type { GoalSide } from './field';

export type SimEvent =
  | { type: 'pass'; player: number; target: number | null }
  | { type: 'shot'; player: number; charge: number; speed: number }
  | { type: 'possession'; player: number; previousOwner: number | null }
  | { type: 'deflect'; player: number }
  | { type: 'contact'; kind: BallContact; speed: number }
  | { type: 'goal'; side: GoalSide; lastTouch: number | null }
  | { type: 'tackleStart'; player: number }
  | { type: 'tackle'; player: number; result: 'steal' | 'loose'; victim: number | null }
  | { type: 'tackleMiss'; player: number };
