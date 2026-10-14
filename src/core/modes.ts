/**
 * Modos de jogo, passados entre as cenas (menu principal → seleção → partida).
 *
 * - `solo`: 1 jogador contra a CPU (campeonato).
 * - `local`: 2 jogadores no mesmo teclado.
 * - `online`: 2 jogadores, cada um no seu computador (sala com código).
 */
export type GameMode = 'solo' | 'local' | 'online';

/** Quem joga com cada lado, para as telas (VS, resultado): no solo, o J2 é o computador. */
export function sideLabel(mode: GameMode, team: 0 | 1): string {
  if (mode === 'solo' && team === 1) return 'COMPUTADOR';
  return team === 0 ? 'JOGADOR 1' : 'JOGADOR 2';
}
