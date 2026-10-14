/**
 * Modos de jogo, passados entre as cenas (menu principal → seleção → partida).
 *
 * - `solo`: 1 jogador contra a CPU (campeonato).
 * - `local`: 2 jogadores no mesmo teclado.
 * - `online`: 2 jogadores, cada um no seu computador (sala com código).
 */
export type GameMode = 'solo' | 'local' | 'online';
