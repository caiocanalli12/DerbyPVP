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

// ---------------------------------------------------------------------------
// Bola
// ---------------------------------------------------------------------------

export const BALL_RADIUS = 0.11;
/** Amortecimento exponencial rolando: v *= exp(-k * dt). */
export const BALL_ROLL_DAMPING = 1.1;
/** Abaixo disso (rolando), a bola para. */
export const BALL_STOP_SPEED = 0.15;
/** Gravidade (valor de jogo, mais arcade). */
export const GRAVITY = 20;
/** Restituição do quique no chão. */
export const BALL_GROUND_RESTITUTION = 0.5;
/** Abaixo desta velocidade vertical (m/s) o quique acaba e a bola passa a rolar. */
export const BALL_MIN_BOUNCE_VZ = 1.0;
/** Restituição em paredes, postes e travessão. */
export const BALL_WALL_RESTITUTION = 0.7;
/** Restituição na rede (absorve quase tudo). */
export const BALL_NET_RESTITUTION = 0.1;
/** Fração da velocidade que sobra (em todas as direções) ao tocar a rede. */
export const BALL_NET_FRICTION = 0.4;
/** Restituição ao bater no corpo de um jogador. */
export const BALL_BODY_RESTITUTION = 0.35;
/** Deslocamento máximo da bola por subpasso de física (evita atravessar postes). */
export const BALL_MAX_SUBSTEP_DIST = 0.05;

// ---------------------------------------------------------------------------
// Posse e condução
// ---------------------------------------------------------------------------

/** Distância máxima (dos pés à bola) para ganhar a posse. */
export const POSSESSION_RADIUS = 0.6;
/** Altura máxima da bola para dominar. */
export const POSSESSION_MAX_Z = 0.5;
/** Velocidade relativa máxima para dominar; acima disso a bola desvia. */
export const POSSESSION_MAX_REL_SPEED = 9;
/** Distância da bola à frente do jogador ao conduzir. */
export const DRIBBLE_OFFSET = 0.45;
/** Balanço da condução: para a frente/para trás (m) e para o lado (m). */
export const DRIBBLE_TOUCH_AMPLITUDE = 0.07;
export const DRIBBLE_SIDE_AMPLITUDE = 0.04;
/** Metros percorridos por ciclo de toque na bola. */
export const DRIBBLE_STRIDE = 1.3;
/** Tempo sem poder recuperar a bola depois de passar ou chutar (s). */
export const KICK_REGAIN_COOLDOWN = 0.25;
/** Depois de a bola desviar no corpo, o jogador não a domina por este tempo (s). */
export const DEFLECT_NO_TOUCH = 0.2;

// ---------------------------------------------------------------------------
// Passe
// ---------------------------------------------------------------------------

/** Abertura total do cone de busca de companheiro (graus). */
export const PASS_CONE_DEG = 60;
/** Pontuação do alvo = ângulo (graus) * peso + distância (m) * peso; menor vence. */
export const PASS_ANGLE_WEIGHT = 1.0;
export const PASS_DIST_WEIGHT = 0.35;
/** Velocidade do passe = base + porMetro * distância, limitada a [mín, máx]. */
export const PASS_SPEED_BASE = 4.5;
export const PASS_SPEED_PER_METER = 1.1;
export const PASS_MIN_SPEED = 7;
export const PASS_MAX_SPEED = 16;
/** Antecipação máxima (m) à frente de um receptor que está correndo. */
export const PASS_MAX_LEAD = 3;
/** Velocidade do toque reto quando não há companheiro no cone. */
export const PASS_NO_TARGET_SPEED = 9;
/** Por quanto tempo (s, além do tempo de voo estimado) o receptor fica "reservado" para o controle. */
export const PASS_RECEIVER_LOCK_EXTRA = 0.6;

// ---------------------------------------------------------------------------
// Chute
// ---------------------------------------------------------------------------

/** Tempo para carregar de 0 a 100% (s). */
export const SHOT_CHARGE_TIME = 0.9;
export const SHOT_MIN_SPEED = 9;
export const SHOT_MAX_SPEED = 24;
/** Se o direcional estiver a até este ângulo do gol, aplica a correção. */
export const SHOT_ASSIST_MAX_ANGLE_DEG = 45;
/** Fração da correção em direção à boca do gol. */
export const SHOT_ASSIST_STRENGTH = 0.25;
/** Margem (m) dentro dos postes usada como alvo da correção. */
export const SHOT_ASSIST_POST_MARGIN = 0.25;
/** A partir desta carga o chute sobe. */
export const SHOT_LOFT_START = 0.5;
/** vz (m/s) com 100% de carga, sem a imprecisão. */
export const SHOT_MAX_VZ = 5.5;
/** A partir desta carga entra a imprecisão aleatória. */
export const SHOT_INACCURACY_START = 0.85;
/** Erro angular horizontal máximo (graus) com 100% de carga. */
export const SHOT_MAX_ERROR_DEG = 10;
/** Erro vertical máximo (m/s em vz) com 100% de carga. */
export const SHOT_MAX_EXTRA_VZ = 4.5;
/** Velocidade a partir da qual o chute é "forte" (rastro visual, etc.). */
export const SHOT_STRONG_SPEED = 15;

// ---------------------------------------------------------------------------
// Desenho (só visual; não afeta a física)
// ---------------------------------------------------------------------------

/** Raio desenhado da bola (m): maior que o físico para ser legível na tela. */
export const BALL_VISUAL_RADIUS = 0.2;

// ---------------------------------------------------------------------------
// Partida (tempos em segundos)
// ---------------------------------------------------------------------------

/** Duração de cada tempo normal. */
export const HALF_DURATION = 90;
/** Duração de cada tempo da prorrogação. */
export const EXTRA_HALF_DURATION = 30;
/** Contagem antes de liberar a saída de bola. */
export const KICKOFF_DELAY = 1;
/** Duração dos cartões de intertítulo (intervalo, prorrogação, pênaltis, fim). */
export const INTERTITLE_DURATION = 2;
/** Duração da comemoração de gol. */
export const GOAL_CELEBRATION_DURATION = 3;
/** A partir deste tempo da comemoração, o botão de passe pula para a saída de bola. */
export const GOAL_CELEBRATION_SKIP_AFTER = 1;
/** Distância do centro em que o atacante do time que não sai fica na saída de bola. */
export const KICKOFF_DEFENDER_DISTANCE = 3.6;
