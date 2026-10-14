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
export const WALL_BACK_HEIGHT = 1.5;
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
/**
 * Domínio do passe: com a bola chegando a menos desta distância (m), o receptor freia para que a
 * velocidade relativa fique esta folga (m/s) abaixo do limite da posse. Sem isso, quem corre ao
 * encontro do passe soma a própria velocidade à da bola e ela desvia nele. 0 desliga.
 */
export const PASS_RECEIVE_BRAKE_DIST = 2;
export const PASS_RECEIVE_SPEED_MARGIN = 0.5;

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
export const SHOT_MAX_ERROR_DEG = 7;
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
/**
 * Depois do apito, o batedor não sai andando: gira em volta da bola mirando e passa para um
 * companheiro, só na direção do próprio campo (até este ângulo, em graus, da direção do próprio gol).
 */
export const KICKOFF_AIM_MAX_DEG = 90;
/** Prazo (s, depois do apito) para o passe da saída; estourando, ele sai para onde está mirando. */
export const KICKOFF_PASS_DEADLINE = 5;
/** Seta da mira da saída: começa e termina a esta distância da bola (m); pisca nos últimos s do prazo. */
export const KICKOFF_AIM_ARROW_FROM = 0.35;
export const KICKOFF_AIM_ARROW_TO = 2.8;
export const KICKOFF_AIM_WARN_TIME = 1.5;
/**
 * Opacidade do preenchimento da cópia da seta desenhada por cima do batedor (o contorno fica
 * opaco): mirando o fundo do campo ele fica à frente da bola e o corpo cobriria a seta inteira.
 */
export const KICKOFF_AIM_GHOST_ALPHA = 0.55;

// ---------------------------------------------------------------------------
// Troca automática de controle
// ---------------------------------------------------------------------------

/** Antecipação usada para prever a bola: posição + velocidade * isto (s). */
export const CONTROL_PREDICT_TIME = 0.3;
/** O novo candidato precisa estar pelo menos isto mais perto (m) que o atual. */
export const CONTROL_SWITCH_MARGIN = 1;
/** Intervalo mínimo entre trocas automáticas (s). */
export const CONTROL_SWITCH_COOLDOWN = 0.25;
/**
 * Quem está a esta distância da bola (m), de pé ou deslizando, não perde o controle pela regra de
 * distância: com dois companheiros perto da bola, o controle fica com quem já está nela.
 */
export const CONTROL_ENGAGE_DIST = 2;
/** Depois de uma troca, a regra de distância não volta para o jogador anterior antes disto (s). */
export const CONTROL_SWITCH_BACK_TIME = 1.5;
/**
 * Logo depois de uma troca, o novo candidato precisa estar bem mais perto: a margem começa com
 * este extra (m) e cai até CONTROL_SWITCH_MARGIN neste tempo (s).
 */
export const CONTROL_RECENT_EXTRA_MARGIN = 2;
export const CONTROL_RECENT_TIME = 1.5;

// ---------------------------------------------------------------------------
// Indicador do jogador controlado
// ---------------------------------------------------------------------------

/** Altura (m) da ponta do triângulo acima do chão. */
export const INDICATOR_HEIGHT = 2.35;
/** Largura e altura do triângulo (px, na escala 1). */
export const INDICATOR_WIDTH = 24;
export const INDICATOR_TRI_HEIGHT = 18;
/** Flutuação: amplitude (px) e frequência (Hz). */
export const INDICATOR_BOB_AMPLITUDE = 4;
export const INDICATOR_BOB_HZ = 1.6;
/** Linhas que "fervem": deslocamento máximo (px) e trocas por segundo. */
export const BOIL_JITTER = 1.5;
export const BOIL_FPS = 12;

// ---------------------------------------------------------------------------
// Dividida (carrinho)
// ---------------------------------------------------------------------------

/** Distância deslizada (m) e duração do deslize (s). */
export const TACKLE_DISTANCE = 2.5;
export const TACKLE_DURATION = 0.35;
/** Fração de velocidade perdida do início ao fim do deslize (0 = constante). */
export const TACKLE_SLIDE_DECEL = 0.5;
/** Janela ativa (s), centrada no meio do deslize: só nela a dividida acerta. */
export const TACKLE_ACTIVE_WINDOW = 0.12;
/** Raio da hitbox na ponta do pé e distância dela ao centro do corpo (m). */
export const TACKLE_HITBOX_RADIUS = 0.45;
export const TACKLE_FOOT_REACH = 0.5;
/** Velocidade com que a bola sai depois de uma dividida certa. */
export const TACKLE_BALL_SPEED = 6;
/** Tempo cambaleando (sem controle) de quem perdeu a bola. */
export const TACKLE_STUMBLE_TIME = 0.5;
/** Tempo caído depois de errar a dividida. */
export const TACKLE_FALLEN_TIME = 0.8;
/** Recarga entre divididas (s, a partir do início). */
export const TACKLE_COOLDOWN = 1.2;

// ---------------------------------------------------------------------------
// IA dos jogadores de linha
// (coordenadas "de ataque": u = distância a partir do próprio gol, v = lateral com
//  o ala esquerdo em v pequeno, igual à tabela de formação)
// ---------------------------------------------------------------------------

/** Fração do deslocamento da bola (em relação ao centro) que a formação acompanha. */
export const AI_BALL_FOLLOW_U = 0.3;
export const AI_BALL_FOLLOW_V = 0.2;
/** Zonas de cada função (limites em u e v). */
export const AI_ZONES = {
  FIXO: { uMin: 2.5, uMax: 22, vMin: 4, vMax: 16 },
  ALA_E: { uMin: 5, uMax: 35, vMin: 1.2, vMax: 9.5 },
  ALA_D: { uMin: 5, uMax: 35, vMin: 10.5, vMax: 18.8 },
  ATA: { uMin: 13, uMax: 37.5, vMin: 3, vMax: 17 },
} as const;
/** Deslocamento extra para as posições de ataque quando o time tem a bola (m). */
export const AI_ATTACK_SHIFT = {
  FIXO: { du: 4, dv: 0 },
  ALA_E: { du: 8, dv: -2 },
  ALA_D: { du: 8, dv: 2 },
  ATA: { du: 6, dv: 0 },
} as const;
/**
 * Infiltrações (só os companheiros do CPU nos níveis mais altos, `world.aiAttackBoost`): com
 * agressividade 1, o avanço de ataque cresce esta fração e os alas fecham esta fração para o meio.
 */
export const AI_INFILTRATION_FORWARD = 0.4;
export const AI_INFILTRATION_INWARD = 0.3;
/** Quando o adversário tem a bola: recuo (m) e quanto os demais fecham o meio (0..1). */
export const AI_DEFENSE_DROP = 3;
export const AI_DEFENSE_SQUEEZE = 0.4;
/** Distância (m) do marcador ao portador, entre ele e o próprio gol. */
export const AI_MARK_DISTANCE = 2;
/**
 * Se o jogador do humano já pressiona o portador (a esta distância dele, m), o marcador da IA faz a
 * cobertura mais atrás (a esta distância do portador, m): os dois no mesmo lugar disputariam o
 * controle, que ficaria trocando de um para o outro.
 */
export const AI_PRESS_HANDOFF_DIST = 3;
export const AI_COVER_DISTANCE = 4.5;
/** Velocidade com que o alvo da IA se move (1/s; suaviza mudanças de posição). */
export const AI_TARGET_SMOOTHING = 4;
/** Raio de chegada (m): perto do alvo a IA desacelera; abaixo da zona morta, para. */
export const AI_ARRIVE_RADIUS = 1.5;
export const AI_DEAD_ZONE = 0.15;
/** Fração da velocidade de corrida usada pela IA ao se reposicionar. */
export const AI_SPEED_FACTOR = 0.9;

// ---------------------------------------------------------------------------
// Goleiro (IA)
// ---------------------------------------------------------------------------

/** Distância da linha do gol em que o goleiro fica (m). */
export const GK_LINE_OFFSET = 0.6;
/** Limite lateral: largura do gol + esta margem de cada lado (m). */
export const GK_LATERAL_MARGIN = 0.5;
/**
 * Posição lateral do goleiro: 0 = na reta bola -> centro do gol (fecha o ângulo);
 * 1 = no Y da bola (limitado à largura do gol + margem). Valores no meio misturam.
 */
export const GK_Y_FOLLOW = 0.2;
/** Saída do gol: começa quando a bola está a esta distância (m) e avança até o máximo (m). */
export const GK_COME_OUT_RANGE = 12;
export const GK_COME_OUT_MAX = 1.6;
/** Velocidade do goleiro se posicionando (m/s). */
export const GK_MOVE_SPEED = 5;
/** Atraso (constante de tempo, s) com que o goleiro atualiza a posição desejada. */
export const GK_HOME_SMOOTHING = 0.3;
/** Tempo de reação a chutes (s) e variação aleatória máxima somada (s). */
export const GK_REACTION_TIME = 0.15;
export const GK_REACTION_JITTER = 0.08;
/** Considera "chute no gol" bolas acima desta velocidade (m/s) rumo à boca do gol. */
export const GK_THREAT_MIN_SPEED = 6;
/** Margem (m) além dos postes e do travessão para considerar a bola indo para o gol. */
export const GK_THREAT_MARGIN = 0.8;
/** Horizonte (s) de previsão de chute. */
export const GK_THREAT_HORIZON = 1.5;
/** Alcance parado: raio (m) e altura (m) das mãos. */
export const GK_STAND_REACH = 0.55;
export const GK_STAND_REACH_Z = 2.15;
/** Mergulho: preparação (s), duração (s), velocidade lateral do corpo (m/s), braço (m),
 *  raio da mão (m) e altura máxima alcançada (m). */
export const GK_DIVE_WINDUP = 0.08;
export const GK_DIVE_DURATION = 0.5;
export const GK_DIVE_SPEED = 3.0;
/** Variação aleatória (fração, ±) da velocidade de cada mergulho. */
export const GK_DIVE_SPEED_JITTER = 0.2;
/** Variação aleatória (fração, ±) do alcance dos braços a cada lance. */
export const GK_REACH_JITTER = 0.2;
export const GK_DIVE_ARM = 0.55;
export const GK_HAND_RADIUS = 0.2;
export const GK_DIVE_REACH_Z = 1.6;
/** Só mergulha se a bola for passar a mais disto (m) do corpo. */
export const GK_DIVE_MIN_OFFSET = 0.45;
/** Folga (s) com que o goleiro começa o mergulho antes do último instante possível. */
export const GK_DIVE_TIMING_SLACK = 0.08;
/** Velocidade (m/s) dos passos laterais acompanhando um chute antes de mergulhar. */
export const GK_SHUFFLE_SPEED = 3.0;
/** Tempo deitado depois do mergulho (s). */
export const GK_RECOVER_TIME = 0.45;
/** Até esta velocidade (m/s) segura; acima, espalma. */
export const GK_CATCH_MAX_SPEED = 15;
/** Espalmada: fração da velocidade que volta e impulso lateral/vertical (m/s). */
export const GK_PARRY_SPEED_FACTOR = 0.3;
export const GK_PARRY_LATERAL_SPEED = 5;
export const GK_PARRY_UP_SPEED = 2.5;
/** Depois de espalmar, não toca de novo por (s). */
export const GK_PARRY_NO_TOUCH = 0.5;
/** Tempo segurando a bola antes de lançar (s). */
export const GK_HOLD_TIME = 1;
/** Altura e distância à frente da bola nas mãos (m). */
export const GK_HANDS_Z = 1.0;
export const GK_HANDS_OFFSET = 0.3;
/** Lançamento por cima: velocidade horizontal desejada (m/s) e limites do tempo de voo (s). */
export const GK_THROW_HSPEED = 8.5;
export const GK_THROW_MIN_TIME = 0.6;
export const GK_THROW_MAX_TIME = 1.5;
/**
 * A bola sai acima da cabeça (m), mais alta que o corpo de quem estiver colado no goleiro: saindo
 * da altura das mãos, ela batia nele e voltava para o próprio gol.
 */
export const GK_THROW_RELEASE_Z = 2.1;
/** Escolha do "mais livre": pontos = menor distância a um adversário - distância * peso. */
export const GK_THROW_DIST_WEIGHT = 0.12;
/** Goleiro sai para pegar bola solta lenta (m/s) dentro da área se chegar antes. */
export const GK_CLAIM_MAX_SPEED = 7;
export const GK_CLAIM_ADVANTAGE = 0.5;

// ---------------------------------------------------------------------------
// Pênaltis
// ---------------------------------------------------------------------------

/** Cobranças da série regular para cada time. */
export const PEN_SERIES = 5;
/** Prazo para chutar (s); estourou, chuta com a carga atual. */
export const PEN_TIME_LIMIT = 5;
/** Tempo de preparação antes de liberar a mira (s). */
export const PEN_SETUP_TIME = 0.8;
/** Tempo mostrando o resultado de cada cobrança (s). */
export const PEN_RESULT_TIME = 1.8;
/** Cursor de mira: velocidade (m/s) e limite (m a partir do centro do gol). */
export const PEN_CURSOR_SPEED = 2.2;
export const PEN_CURSOR_LIMIT = 1.5;
/** Balanço automático do cursor: amplitude (m) e frequência (Hz). */
export const PEN_SWAY_AMPLITUDE = 0.2;
export const PEN_SWAY_HZ = 0.7;
/** Probabilidades de o goleiro escolher esquerda / centro / direita. */
export const PEN_GK_LEFT = 0.4;
export const PEN_GK_CENTER = 0.2;
export const PEN_GK_RIGHT = 0.4;
/** Faixa externa (fração da largura do gol, de cada lado) que o goleiro não alcança. */
export const PEN_OUTER_FRACTION = 0.15;
/** Acima desta força o chute é "muito forte": passa mesmo na zona certa com esta chance. */
export const PEN_STRONG_POWER = 0.8;
export const PEN_STRONG_PASS_CHANCE = 0.35;
/** Abaixo desta força o chute é rasteiro e fácil: o goleiro alcança até a faixa externa. */
export const PEN_WEAK_POWER = 0.35;
/** Acima desta força, risco crescente de isolar por cima (até o máximo em 100%). */
export const PEN_OVER_START = 0.9;
export const PEN_OVER_MAX_CHANCE = 0.6;
/** Altura da bola na linha do gol: força 0 e força PEN_OVER_START (m). */
export const PEN_MIN_HEIGHT = 0.12;
export const PEN_MAX_HEIGHT = 1.75;
/** Altura de uma bola isolada (m). */
export const PEN_OVER_HEIGHT = 2.6;

// ---------------------------------------------------------------------------
// Uniformes (conflito de cores)
// ---------------------------------------------------------------------------

/** Pesos da "cor de leitura" (o que aparece de longe): camisa, calção e meias. */
export const KIT_WEIGHT_SHIRT = 0.6;
export const KIT_WEIGHT_SHORTS = 0.25;
export const KIT_WEIGHT_SOCKS = 0.15;
/** Distância perceptual (CIEDE2000) abaixo da qual dois uniformes conflitam. */
export const KIT_CONFLICT_THRESHOLD = 22;
/** Cores possíveis dos goleiros: laranja, verde-limão, cinza, rosa, amarelo, preto. */
export const KEEPER_COLORS: readonly number[] = [0xff8c1a, 0xa4e22a, 0x8c8c8c, 0xff6fb5, 0xffd60a, 0x1e1e1e];

/** Resolução da arte dos jogadores: px da textura por metro (a tela usa PPM). */
export const PLAYER_ART_PPM = 46;

// ---------------------------------------------------------------------------
// Animação dos personagens (quadros por segundo)
// ---------------------------------------------------------------------------

/** Troca de pose na corrida (na velocidade máxima) e o mínimo ao andar devagar. */
export const ANIM_RUN_FPS = 14;
export const ANIM_RUN_MIN_FPS = 9;
/** Poses de ação (passe, chute, comemoração, lançamento). */
export const ANIM_ACTION_FPS = 14;
/** Respiração/balanço das poses paradas. */
export const ANIM_IDLE_POSE_FPS = 2;
/** Velocidade (m/s) acima da qual o jogador usa a animação de corrida. */
export const ANIM_RUN_THRESHOLD = 0.6;
/** "Achatar ao frear": desaceleração (m/s²) que dispara e duração (s) do achatamento. */
export const ANIM_BRAKE_DECEL = 30;
export const ANIM_BRAKE_SQUASH_TIME = 0.12;

// ---------------------------------------------------------------------------
// Estádio, torcida, placas e clima (só visual)
// ---------------------------------------------------------------------------

/** Altura (px) da faixa de céu no topo da tela. */
export const SKY_HEIGHT = 66;
/** Torcida: fileiras na arquibancada do fundo, espaço entre torcedores (px) e escala. */
export const CROWD_ROWS = 9;
export const CROWD_SPACING = 21;
export const CROWD_SCALE_FRONT = 0.92;
export const CROWD_SCALE_BACK = 0.7;
/** Torcedores nas arquibancadas laterais (colunas por lado). */
export const CROWD_SIDE_COLUMNS = 3;
/** Balanço da torcida: frequência (Hz) calma e agitada; pulo (px) agitada e no gol. */
export const CROWD_SWAY_HZ = 1.1;
export const CROWD_EXCITED_HZ = 3;
export const CROWD_EXCITED_JUMP = 3;
export const CROWD_GOAL_JUMP = 9;
/** A torcida se agita quando o time ataca a menos disto (m) do gol adversário. */
export const CROWD_ATTACK_DISTANCE = 12;
/** Fração de torcedores com bandeira. */
export const CROWD_FLAG_FRACTION = 0.05;
/** Placas de patrocínio: quantas na parede do fundo, troca (s) e duração da virada (s). */
export const SPONSOR_BOARDS = 5;
export const SPONSOR_SWITCH_TIME = 8;
export const SPONSOR_FLIP_TIME = 0.6;
/** Lâminas verticais de cada placa (efeito de placa giratória de três faces). */
export const SPONSOR_SLATS = 9;
/** Chuva: quantidade de traços, velocidade (px/s) e inclinação (px por px de queda). */
export const RAIN_DROPS = 170;
export const RAIN_SPEED = 900;
export const RAIN_SLANT = 0.35;
/** Respingos por segundo no gramado. */
export const RAIN_SPLASHES_PER_SEC = 40;
/** Rede: duração (s) e amplitude (m) do balanço depois do gol. */
export const NET_WAVE_TIME = 1.6;
export const NET_WAVE_AMPLITUDE = 0.38;

// ---------------------------------------------------------------------------
// Efeitos visuais
// ---------------------------------------------------------------------------

/** Rastro de velocidade: só acima desta velocidade (m/s) e comprimento dos traços (s de voo). */
export const TRAIL_MIN_SPEED = 15;
export const TRAIL_LENGTH_TIME = 0.09;
/** Partículas de grama: a cada quantos metros corridos e quantas no carrinho. */
export const GRASS_STEP_DISTANCE = 1.6;
export const GRASS_RUN_MIN_SPEED = 4;
export const GRASS_SLIDE_BURST = 14;
export const GRASS_PARTICLE_LIFE = 0.45;
/** Linhas de impacto (dividida certa, defesa do goleiro): duração (s). */
export const IMPACT_TIME = 0.28;
/** Gol: tremor (ms, intensidade) e flash branco (ms). */
export const GOAL_SHAKE_MS = 420;
export const GOAL_SHAKE_INTENSITY = 0.009;
export const GOAL_FLASH_MS = 160;
/** "GOOOL!": atraso entre letras (s) e tamanho (px). */
export const GOAL_TEXT_LETTER_DELAY = 0.07;
export const GOAL_TEXT_SIZE = 120;
/** Pulo extra do autor do gol na comemoração (px). */
export const CELEBRATION_HOP = 7;

// ---------------------------------------------------------------------------
// Filme antigo (camada por cima de tudo, desligável no menu de pausa)
// ---------------------------------------------------------------------------

/** Opacidade do grão e trocas por segundo. */
export const FILM_GRAIN_ALPHA = 0.16;
export const FILM_GRAIN_FPS = 24;
/** Riscos verticais: chance por segundo de aparecer um e duração (s). */
export const FILM_SCRATCH_RATE = 1.4;
export const FILM_SCRATCH_TIME = 0.35;
/** Poeira: chance por segundo e duração (s). */
export const FILM_DUST_RATE = 3;
export const FILM_DUST_TIME = 0.12;
/** Flicker: variação máxima de brilho global (±). */
export const FILM_FLICKER = 0.03;
/** Opacidade da vinheta e do papel envelhecido. */
export const FILM_VIGNETTE_ALPHA = 0.85;
export const FILM_PAPER_ALPHA = 0.5;

// ---------------------------------------------------------------------------
// Menus
// ---------------------------------------------------------------------------

/** Duração da tela VS (s). */
export const VERSUS_DURATION = 2.5;

/**
 * Tempo (ms) por quadro gasto gerando as texturas da partida (na tela VS e no carregamento): o
 * maior entre o mínimo e uma fração da duração do quadro (em máquina lenta, cada quadro já é longo
 * e um orçamento fixo faria a geração demorar demais), sem passar do teto.
 */
export const ART_STEP_BUDGET_MS = 8;
export const ART_STEP_FRAME_SHARE = 0.5;
export const ART_STEP_MAX_BUDGET_MS = 100;
/** Quadros de animação de jogador desenhados (e rasterizados) por passo da geração. */
export const ART_CELLS_PER_STEP = 3;

/**
 * Prévia do jogador na seleção de times: respiração (Hz e fração da altura) e balanço (Hz e graus),
 * lentos e pequenos, para ele parecer vivo sem tremer.
 */
export const PREVIEW_BREATH_HZ = 0.4;
export const PREVIEW_BREATH_AMOUNT = 0.014;
export const PREVIEW_SWAY_HZ = 0.22;
export const PREVIEW_SWAY_DEG = 1.2;

/** Tempo (s) do aviso quando uma troca de uniforme é recusada por cores parecidas. */
export const KIT_REFUSED_FLASH = 1.4;

/** Resolução do fundo de raios dos menus em relação à tela (é ampliado ao desenhar). */
export const MENU_SUNBURST_RES = 0.6;

// ---------------------------------------------------------------------------
// Som (sintetizado com Web Audio, sem arquivos)
// ---------------------------------------------------------------------------

/** Volume master inicial (0..1) e passo do ajuste na pausa. O ganho aplicado é volume². */
export const AUDIO_DEFAULT_VOLUME = 0.8;
export const AUDIO_VOLUME_STEP = 0.1;
/** Filtro "rádio antigo": corta abaixo e acima destas frequências (Hz), de leve. */
export const AUDIO_RADIO_LOW_HZ = 150;
export const AUDIO_RADIO_HIGH_HZ = 6000;
/** Pan estéreo máximo (bola numa ponta do campo = ±isto). */
export const AUDIO_PAN_MAX = 0.4;
/** No máximo estas vozes do mesmo tipo tocando juntas (a mais antiga é cortada). */
export const AUDIO_MAX_VOICES_PER_TYPE = 2;
/**
 * Proteção contra estouro depois do master: linear até este nível e curva suave acima dele, que
 * só chega ao máximo (1) com entrada de AUDIO_CLIP_HEADROOM (vários sons fortes juntos).
 */
export const AUDIO_CLIP_KNEE = 0.7;
export const AUDIO_CLIP_HEADROOM = 2.5;
/** Tempo (s) do corte suave de uma voz e da mudança de volume (sem estalos). */
export const AUDIO_FADE_TIME = 0.03;
/** Atraso (s) entre agendar e tocar (o relógio do áudio anda em blocos). */
export const AUDIO_START_DELAY = 0.005;
/** Aviso do botão M (som ligado/desligado): duração (s). */
export const AUDIO_TOAST_TIME = 1.4;

/** Chute: "tum" grave com queda de afinação, mais um estalo de ruído. Volume e brilho crescem com a força. */
export const SFX_KICK_FREQ_START = 180;
export const SFX_KICK_FREQ_END = 60;
export const SFX_KICK_DROP_TIME = 0.12;
export const SFX_KICK_DECAY = 0.3;
export const SFX_KICK_GAIN_MIN = 0.45;
export const SFX_KICK_GAIN_MAX = 0.95;
export const SFX_KICK_CLICK_GAIN = 0.32;
export const SFX_KICK_CLICK_HZ_MIN = 900;
export const SFX_KICK_CLICK_HZ_MAX = 3400;
export const SFX_KICK_CLICK_TIME = 0.05;
/** Passe: toque mais leve, curto e agudo que o chute, com pouco ruído. */
export const SFX_PASS_FREQ_START = 260;
export const SFX_PASS_FREQ_END = 120;
export const SFX_PASS_DROP_TIME = 0.07;
export const SFX_PASS_DECAY = 0.15;
export const SFX_PASS_GAIN = 0.42;
export const SFX_PASS_CLICK_GAIN = 0.07;
export const SFX_PASS_CLICK_HZ = 2200;
export const SFX_PASS_CLICK_TIME = 0.025;
/** Apito: dois osciladores próximos (Hz) com trilo (vibrato rápido). Durações e pausa em s. */
export const SFX_WHISTLE_FREQ = 2800;
export const SFX_WHISTLE_DETUNE_HZ = 38;
export const SFX_WHISTLE_TRILL_HZ = 24;
export const SFX_WHISTLE_TRILL_DEPTH_HZ = 85;
export const SFX_WHISTLE_GAIN = 0.11;
export const SFX_WHISTLE_SHORT = 0.2;
export const SFX_WHISTLE_LONG = 0.9;
export const SFX_WHISTLE_GAP = 0.13;
/** Gol: sino (parciais inarmônicos, decaimento longo) e o apito de êmbolo subindo depois dele. */
export const SFX_GOAL_BELL_HZ = 640;
export const SFX_GOAL_BELL_PARTIALS: readonly number[] = [0.56, 0.92, 1.19, 1.71, 2.0, 2.74, 3.0, 3.76];
/** Ganho relativo e duração relativa de cada parcial (os graves duram mais). */
export const SFX_GOAL_BELL_PARTIAL_GAINS: readonly number[] = [0.6, 0.45, 0.7, 1, 0.8, 0.5, 0.4, 0.3];
export const SFX_GOAL_BELL_PARTIAL_DECAYS: readonly number[] = [1, 0.9, 0.65, 0.55, 0.4, 0.35, 0.25, 0.2];
export const SFX_GOAL_BELL_DECAY = 2.4;
export const SFX_GOAL_BELL_GAIN = 0.16;
export const SFX_GOAL_SLIDE_DELAY = 0.2;
export const SFX_GOAL_SLIDE_FROM = 440;
export const SFX_GOAL_SLIDE_TO = 1760;
export const SFX_GOAL_SLIDE_TIME = 0.7;
export const SFX_GOAL_SLIDE_VIBRATO_HZ = 7;
export const SFX_GOAL_SLIDE_VIBRATO_DEPTH = 0.025;
export const SFX_GOAL_SLIDE_GAIN = 0.16;
/** Defesa: "tum" abafado das luvas e um "boing" de mola (vibrato que se acalma). */
export const SFX_SAVE_THUMP_FREQ_START = 150;
export const SFX_SAVE_THUMP_FREQ_END = 70;
export const SFX_SAVE_THUMP_LOWPASS_HZ = 500;
export const SFX_SAVE_THUMP_DECAY = 0.16;
export const SFX_SAVE_THUMP_GAIN = 0.7;
export const SFX_SAVE_BOING_DELAY = 0.03;
export const SFX_SAVE_BOING_HZ = 300;
export const SFX_SAVE_BOING_RISE = 1.35;
export const SFX_SAVE_BOING_WOBBLE_HZ = 13;
export const SFX_SAVE_BOING_WOBBLE_DEPTH = 0.3;
export const SFX_SAVE_BOING_TIME = 0.5;
export const SFX_SAVE_BOING_GAIN = 0.16;

// ---------------------------------------------------------------------------
// CPU do adversário (modo solo)
// ---------------------------------------------------------------------------

/**
 * Níveis do CPU. A dificuldade muda só a agressividade (passes, chutes e ataque) e os carrinhos:
 * velocidade dos jogadores e goleiro são os mesmos em todos os níveis.
 *
 * - reactionTime: atraso (s) para perceber uma mudança de situação (posse, controle, bola desviada).
 * - decisionInterval: intervalo (s) entre decisões (não decide a cada quadro).
 * - passAimErrorDeg / shotAimErrorDeg: erro de mira (±graus) no passe e no chute.
 * - maxShotDistance: distância máxima (m) do gol para chutar.
 * - pressDistance: distância (m) que mantém do portador ao pressionar.
 * - infiltration: infiltrações dos companheiros no ataque (0 = baixa, a IA de sempre; 1 = alta).
 * - tackleChance: chance de tentar o carrinho numa oportunidade; tackleTimingError: erro (±s).
 * - shotPostInset: no chute, mira o canto oposto ao goleiro a esta distância (m) para dentro do poste
 *   (agressividade no chute: quanto menor, mais no canto e mais arriscado).
 * - penaltyAimError (±m) e penaltyPowerError (±): erro do canto e da força na cobrança de pênalti.
 *
 * Ajuste (fase 18, partidas simuladas contra um "humano" de teclado: o próprio CPU em 8 direções,
 * chutando no meio do gol quando a direção não dá): a tabela da spec, exceto a reação do Fácil
 * (0,35 → 0,45 s; com 0,35 o iniciante perdia ~75% das partidas, agora ~60%) e o carrinho do
 * Difícil (35% → 25%; com 35% um jogador bom ganhava ~10%, agora ~27%). Médio ficou como na spec
 * (o jogador médio ganha ~37%).
 */
export const CPU_LEVELS = {
  facil: {
    reactionTime: 0.45,
    decisionInterval: 0.4,
    passAimErrorDeg: 14,
    shotAimErrorDeg: 12,
    maxShotDistance: 9,
    pressDistance: 2.5,
    infiltration: 0,
    tackleChance: 0,
    tackleTimingError: 0,
    shotPostInset: 1.05,
    penaltyAimError: 0.55,
    penaltyPowerError: 0.22,
  },
  medio: {
    reactionTime: 0.22,
    decisionInterval: 0.25,
    passAimErrorDeg: 8,
    shotAimErrorDeg: 7,
    maxShotDistance: 12,
    pressDistance: 1.6,
    infiltration: 0.5,
    tackleChance: 0.15,
    tackleTimingError: 0.08,
    shotPostInset: 0.75,
    penaltyAimError: 0.35,
    penaltyPowerError: 0.14,
  },
  dificil: {
    reactionTime: 0.12,
    decisionInterval: 0.15,
    passAimErrorDeg: 4,
    shotAimErrorDeg: 3.5,
    maxShotDistance: 15,
    pressDistance: 1.0,
    infiltration: 1,
    tackleChance: 0.25,
    tackleTimingError: 0.04,
    shotPostInset: 0.6,
    penaltyAimError: 0.18,
    penaltyPowerError: 0.08,
  },
} as const;

/** Variação aleatória (± fração) do tempo de reação e do intervalo entre decisões. */
export const CPU_TIMING_JITTER = 0.2;
/** A bola solta mudou de velocidade mais que isto (m/s) num passo (desvio, trave, defesa): o CPU reage. */
export const CPU_BALL_JOLT = 3;
/** Até este tempo (s) depois de passar ou chutar, a mudança de situação é a esperada (sem reação). */
export const CPU_OWN_ACTION_TIME = 0.3;

/** Saída de bola: pausa (s) depois de perceber o apito, mín. e máx., e tolerância da mira (graus). */
export const CPU_KICKOFF_THINK_MIN = 0.3;
export const CPU_KICKOFF_THINK_MAX = 1.0;
export const CPU_KICKOFF_AIM_TOLERANCE_DEG = 4;

/** Com a bola: está pressionado com um adversário de linha a menos disto (m). */
export const CPU_PRESSURE_RADIUS = 2.2;
/**
 * Passe: pontuação de uma posição = espaço livre (m até o adversário mais perto, com teto) * peso
 * - distância ao gol atacado (m) * peso. Passa se um companheiro com linha livre for "claramente
 * melhor" (margem) ou, pressionado, se não for muito pior (folga).
 */
export const CPU_PASS_SPACE_WEIGHT = 1;
export const CPU_PASS_SPACE_CAP = 5;
export const CPU_PASS_GOAL_WEIGHT = 0.35;
export const CPU_PASS_BETTER_MARGIN = 2.5;
export const CPU_PASS_PRESSURE_SLACK = 1;
/** Linha de passe livre: nenhum adversário a menos disto (m) do trajeto. */
export const CPU_PASS_LANE_CLEARANCE = 1.1;
/** Distância (m) mínima e máxima de um passe. */
export const CPU_PASS_MIN_DIST = 3;
export const CPU_PASS_MAX_DIST = 22;

/** Chute: ângulo mínimo (graus) da boca do gol vista da bola e folga (m) da linha do chute aos adversários. */
export const CPU_SHOT_MIN_MOUTH_DEG = 12;
export const CPU_SHOT_LANE_CLEARANCE = 0.7;
/** Tão perto do gol (m), chuta mesmo com a linha fechada. */
export const CPU_SHOT_POINT_BLANK = 5;
/** Para ver se a linha do chute está livre, testa os cantos a esta distância (m) para dentro dos postes. */
export const CPU_SHOT_LANE_INSET = 0.6;
/** Carga do chute: base + por metro de distância ao gol, limitada, com variação (±). */
export const CPU_SHOT_CHARGE_BASE = 0.35;
export const CPU_SHOT_CHARGE_PER_METER = 0.035;
export const CPU_SHOT_CHARGE_MIN = 0.45;
export const CPU_SHOT_CHARGE_MAX = 0.8;
export const CPU_SHOT_CHARGE_JITTER = 0.05;

/** Condução: raio (m) e peso do desvio dos marcadores; distância (m) das paredes a evitar e peso. */
export const CPU_AVOID_RADIUS = 3.5;
export const CPU_AVOID_WEIGHT = 1.4;
export const CPU_WALL_MARGIN = 2;
export const CPU_WALL_WEIGHT = 1.2;
/** Perto da linha de fundo (m) sem ângulo para chutar: volta para a marca do pênalti. */
export const CPU_BYLINE_DIST = 4;

/** Defesa: antecipação (s) do portador e raio (m) em que desacelera ao chegar ao ponto de pressão. */
export const CPU_PRESS_LEAD = 0.15;
export const CPU_ARRIVE_RADIUS = 0.8;
/** Ao pressionar, desloca o ponto até isto (m) para a linha de passe mais perigosa. */
export const CPU_LANE_SHADE = 0.8;

/**
 * Carrinho: oportunidade quando a bola, prevista para o meio da janela ativa, fica nesta faixa de
 * distância (m) do jogador; o episódio (uma chance por portador) acaba quando ele se afasta disto (m).
 */
export const CPU_TACKLE_MIN_DIST = 1.2;
export const CPU_TACKLE_IDEAL_DIST = 1.9;
export const CPU_TACKLE_MAX_DIST = 2.5;
export const CPU_TACKLE_EPISODE_DIST = 3.5;

/** Bola solta: previsão para interceptar (horizonte e passo, s). */
export const CPU_INTERCEPT_HORIZON = 2.5;
export const CPU_INTERCEPT_STEP = 0.05;

/** Pênalti: canto (m do centro do gol), chance de bater no meio e força alvo. */
export const CPU_PEN_CORNER_OFFSET = 1.0;
export const CPU_PEN_CENTER_CHANCE = 0.1;
export const CPU_PEN_POWER = 0.7;
/** Pênalti: pausa (s) antes de chutar, mín. e máx., e folga (s) antes do prazo. */
export const CPU_PEN_THINK_MIN = 0.8;
export const CPU_PEN_THINK_MAX = 1.8;
export const CPU_PEN_DEADLINE_MARGIN = 0.4;

// ---------------------------------------------------------------------------
// Campeonato (modo solo)
// ---------------------------------------------------------------------------

/**
 * Nível do CPU em cada fase do campeonato (quartas, semifinal, final) para cada dificuldade
 * escolhida: FÁCIL = Fácil, Médio, Médio; DIFÍCIL = Fácil, Médio, Difícil.
 */
export const CHAMPIONSHIP_LEVELS = {
  facil: ['facil', 'medio', 'medio'],
  dificil: ['facil', 'medio', 'dificil'],
} as const;
/** Jogos simulados: média de gols de cada time (Poisson) e acerto de cada cobrança de pênalti. */
export const TOURNAMENT_GOALS_MEAN = 1.4;
export const TOURNAMENT_PEN_SCORE_CHANCE = 0.75;

/** Sorteio da chave: tempo (s) de cada vaga "rodando" antes de parar, e entre uma vaga e a próxima. */
export const BRACKET_DRAW_SPIN = 0.55;
export const BRACKET_DRAW_STEP = 0.24;
/** Troca de escudo (por s) enquanto a vaga roda no sorteio. */
export const BRACKET_DRAW_SPIN_RATE = 14;
/** Depois de uma vitória: atraso (s) antes de mostrar os outros jogos da fase e entre um e outro. */
export const BRACKET_REVEAL_DELAY = 0.6;
export const BRACKET_REVEAL_STEP = 0.55;
/** Cartão "ELIMINADO": tempo mínimo (s) antes de poder pular e tempo até sair sozinho. */
export const ELIMINATED_CARD_MIN = 0.8;
export const ELIMINATED_CARD_TIME = 2.6;

// ---------------------------------------------------------------------------
// Online
// ---------------------------------------------------------------------------

/** Prazos (s): registrar a sala no servidor, conectar ao anfitrião e a apresentação (versões). */
export const NET_OPEN_TIMEOUT = 10;
export const NET_CONNECT_TIMEOUT = 15;
export const NET_HANDSHAKE_TIMEOUT = 8;
/** Tentativas de abrir a sala com outro código se o sorteado já estiver em uso. */
export const NET_HOST_ID_RETRIES = 3;
/** Espera (s) para a mensagem de saída chegar antes de fechar a conexão. */
export const NET_LEAVE_FLUSH = 0.3;
/** No máximo tantas mensagens inválidas registradas no console por sessão. */
export const NET_MAX_INVALID_LOGS = 20;
