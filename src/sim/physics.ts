/**
 * Colisões entre corpos (lógica pura).
 */
import { PLAYER_RADIUS, PLAYER_SEPARATION_STIFFNESS } from '../config/constants';
import type { Player } from './player';

/**
 * Separação suave: jogadores sobrepostos se afastam um pouco a cada passo.
 * Encostar não tira a bola de ninguém; só empurra.
 */
export function separatePlayers(players: readonly Player[]): void {
  const minDist = PLAYER_RADIUS * 2;
  for (let i = 0; i < players.length; i++) {
    const a = players[i] as Player;
    for (let j = i + 1; j < players.length; j++) {
      const b = players[j] as Player;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      if (d >= minDist) continue;
      if (d < 1e-6) {
        // Exatamente no mesmo ponto: separa numa direção fixa determinística.
        dx = a.id < b.id ? 1 : -1;
        dy = 0;
        d = 1;
      }
      const push = ((minDist - Math.min(d, minDist)) * PLAYER_SEPARATION_STIFFNESS) / 2;
      const nx = dx / d;
      const ny = dy / d;
      a.x -= nx * push;
      a.y -= ny * push;
      b.x += nx * push;
      b.y += ny * push;
    }
  }
}
