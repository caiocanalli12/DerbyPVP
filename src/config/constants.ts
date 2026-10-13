/**
 * Todos os números ajustáveis do jogo ficam aqui.
 * Unidades: metros, segundos, metros/segundo (salvo indicação em px).
 */

// ---------------------------------------------------------------------------
// Tela e laço de simulação
// ---------------------------------------------------------------------------

/** Resolução lógica do jogo (px). */
export const GAME_WIDTH = 1280;
export const GAME_HEIGHT = 720;

/** Passo fixo da simulação (s). */
export const SIM_DT = 1 / 60;
/** Maior intervalo de quadro aceito pelo acumulador (s); evita a "espiral da morte" após travadas. */
export const MAX_FRAME_DT = 0.25;
