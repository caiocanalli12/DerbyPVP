/**
 * Sombras no chão conforme o clima: curtas ao sol, longas e diagonais no pôr do sol,
 * quatro suaves à noite (uma por refletor) e difusas na chuva.
 */
import { FIELD_LENGTH, FIELD_WIDTH } from '../config/constants';
import type { WeatherId } from '../data/weather';

export interface ShadowCast {
  /** Deslocamento do centro da sombra (m, no chão). */
  dx: number;
  dy: number;
  /** Alongamento na direção do deslocamento. */
  stretch: number;
  alpha: number;
}

/** Posição (m, no chão) dos 4 refletores da noite. */
export const FLOODLIGHTS: readonly { x: number; y: number }[] = [
  { x: -6, y: -9 },
  { x: FIELD_LENGTH + 6, y: -9 },
  { x: -6, y: FIELD_WIDTH + 9 },
  { x: FIELD_LENGTH + 6, y: FIELD_WIDTH + 9 },
];

/** Sombras de um objeto em (x, y) do mundo. */
export function shadowsAt(weather: WeatherId, x: number, y: number): ShadowCast[] {
  switch (weather) {
    case 'sunset':
      // Sol baixo à esquerda e ao fundo: sombra longa para a direita e para a frente.
      return [{ dx: 0.95, dy: 0.32, stretch: 2.6, alpha: 0.3 }];
    case 'night':
      return FLOODLIGHTS.map((l) => {
        const vx = x - l.x;
        const vy = y - l.y;
        const d = Math.hypot(vx, vy) || 1;
        return { dx: (vx / d) * 0.42, dy: (vy / d) * 0.42, stretch: 1.55, alpha: 0.13 };
      });
    case 'rain':
      return [{ dx: 0, dy: 0, stretch: 1.1, alpha: 0.17 }];
    default:
      return [{ dx: 0.14, dy: 0.06, stretch: 1.05, alpha: 0.32 }];
  }
}

/** Quantas sombras cada objeto tem no clima. */
export function shadowCount(weather: WeatherId): number {
  return weather === 'night' ? FLOODLIGHTS.length : 1;
}
