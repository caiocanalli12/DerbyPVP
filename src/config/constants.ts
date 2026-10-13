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

// ---------------------------------------------------------------------------
// Campo (mundo, em metros)
// ---------------------------------------------------------------------------

/** Comprimento do campo (eixo X; gols nas extremidades). */
export const FIELD_LENGTH = 40;
/** Largura do campo (eixo Y; 0 = fundo, FIELD_WIDTH = frente). */
export const FIELD_WIDTH = 20;
/** Largura da boca do gol (entre os postes). */
export const GOAL_WIDTH = 3;
/** Altura do travessão. */
export const GOAL_HEIGHT = 2;
/** Profundidade do gol (para fora do campo). */
export const GOAL_DEPTH = 1;
/** Raio da área do goleiro (semicírculo centrado no centro do gol). */
export const GOAL_AREA_RADIUS = 6;
/** Raio do círculo central. */
export const CENTER_CIRCLE_RADIUS = 3;
/** Distância da marca do pênalti até a linha do gol. */
export const PENALTY_SPOT_DISTANCE = 6;
/** Raio de postes e travessão (colisão e desenho). */
export const POST_RADIUS = 0.06;

/** Alturas visuais das paredes (só desenho; para a física as paredes não têm topo). */
export const WALL_BACK_HEIGHT = 1.1;
export const WALL_SIDE_HEIGHT = 0.8;
export const WALL_FRONT_HEIGHT = 0.45;
/** Altura visual da parede atrás do gol (acima do travessão). */
export const WALL_GOAL_HEIGHT = 2.6;
/** Opacidade da parede da frente (nunca pode esconder jogadores). */
export const WALL_FRONT_ALPHA = 0.35;

// ---------------------------------------------------------------------------
// Projeção (visão inclinada)
// ---------------------------------------------------------------------------

/** Fração da largura da tela ocupada pelo campo (na linha da frente). */
export const FIELD_SCREEN_WIDTH_FRACTION = 0.85;
/** Espaço livre abaixo da linha da frente do campo (px), para a parede da frente. */
export const FIELD_SCREEN_BOTTOM_MARGIN = 44;
/** Escala por profundidade: fundo (y = 0) e frente (y = FIELD_WIDTH). */
export const PROJ_SCALE_BACK = 0.86;
export const PROJ_SCALE_FRONT = 1.0;
/** Achatamento vertical do eixo Y. */
export const PROJ_Y_SQUASH = 0.6;
/** Achatamento extra do Y no fundo / na frente (perspectiva leve). */
export const PROJ_Y_DEPTH_BACK = 0.92;
export const PROJ_Y_DEPTH_FRONT = 1.0;

// ---------------------------------------------------------------------------
// Jogadores
// ---------------------------------------------------------------------------

/** Raio do círculo de colisão do corpo. */
export const PLAYER_RADIUS = 0.4;
/** Velocidade máxima de corrida. */
export const PLAYER_RUN_SPEED = 6.5;
/** Fração da velocidade ao conduzir a bola. */
export const PLAYER_DRIBBLE_SPEED_FACTOR = 0.9;
/** Aceleração ao ganhar velocidade (m/s²): chega no máximo em ~0,15 s. */
export const PLAYER_ACCEL = 45;
/** Desaceleração ao frear ou inverter (m/s²): resposta firme, sem "gelo". */
export const PLAYER_BRAKE = 65;
/** Velocidade de giro do corpo (rad/s). */
export const PLAYER_TURN_RATE = 16;
/** Fração da sobreposição corrigida por passo na separação suave entre jogadores. */
export const PLAYER_SEPARATION_STIFFNESS = 0.35;
/** Altura do jogador (para a bola passar por cima ou bater no corpo). */
export const PLAYER_HEIGHT = 1.75;

/**
 * Formação base para o time que ataca para a direita (defende o gol x = 0).
 * O outro time usa o reflexo pelo centro do campo: (40 - x, 20 - y).
 */
export const FORMATION = {
  GK: { x: 1.5, y: 10 },
  FIXO: { x: 9, y: 10 },
  ALA_E: { x: 15, y: 4 },
  ALA_D: { x: 15, y: 16 },
  ATA: { x: 18.5, y: 10 },
} as const;
