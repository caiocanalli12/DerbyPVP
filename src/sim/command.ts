/**
 * Comando de um time por passo da simulação (lógica pura).
 *
 * A simulação não sabe de onde o comando veio: teclado (um conjunto de teclas ou os dois juntos),
 * CPU ou jogador remoto. Cada fonte (`CommandSource`) entrega um comando por tick.
 */

export interface TeamCommand {
  /** Direção desejada, já normalizada (|v| <= 1; diagonal não é mais rápida). */
  moveX: number;
  moveY: number;
  /** Passe apertado desde o tick anterior. */
  passPressed: boolean;
  /** Chute (ou dividida) pressionado agora. */
  shootHeld: boolean;
  /** Chute solto desde o tick anterior (nunca junto com `shootHeld`). */
  shootReleased: boolean;
  /** Chute apertado desde o tick anterior. */
  shootPressed: boolean;
  /**
   * Opcional: para onde as teclas mandam o cursor da mira do pênalti (-1 = esquerda ou cima,
   * +1 = direita ou baixo, 0 = as duas ou nenhuma). Vem das teclas cruas porque o direcional já
   * normalizado perde a informação (W + S + A vira só "esquerda", mas o cursor ficava parado).
   * Sem ele, a mira sai do direcional.
   */
  aimDir?: AimDir;
}

/** Direção do cursor da mira do pênalti. */
export type AimDir = -1 | 0 | 1;

/** Quem comanda um time (teclado, CPU, jogador remoto). */
export interface CommandSource {
  getCommand(tick: number): TeamCommand;
}

/** Folga numérica no tamanho da direção (a diagonal normalizada não dá exatamente 1). */
const MOVE_LENGTH_EPS = 1e-6;

const BUTTONS = ['passPressed', 'shootHeld', 'shootReleased', 'shootPressed'] as const;

/** Mira do pênalti pelas teclas: esquerda ou cima = -1, direita ou baixo = +1 (as duas se anulam). */
export function aimDirFromKeys(up: boolean, down: boolean, left: boolean, right: boolean): AimDir {
  return ((right || down ? 1 : 0) - (left || up ? 1 : 0)) as AimDir;
}

/** Comando parado: sem direção e sem botões. */
export function emptyCommand(): TeamCommand {
  return { moveX: 0, moveY: 0, passPressed: false, shootHeld: false, shootReleased: false, shootPressed: false };
}

/**
 * Confere se `c` é um comando válido: direção com números finitos e tamanho até 1, botões
 * booleanos, o chute nunca solto e pressionado ao mesmo tempo e, se houver, `aimDir` em -1, 0 ou 1.
 */
export function isValidCommand(c: unknown): c is TeamCommand {
  if (typeof c !== 'object' || c === null) return false;
  const o = c as Record<string, unknown>;
  const { moveX, moveY } = o;
  if (typeof moveX !== 'number' || typeof moveY !== 'number') return false;
  if (!Number.isFinite(moveX) || !Number.isFinite(moveY)) return false;
  if (Math.hypot(moveX, moveY) > 1 + MOVE_LENGTH_EPS) return false;
  for (const key of BUTTONS) if (typeof o[key] !== 'boolean') return false;
  if (o.aimDir !== undefined && o.aimDir !== -1 && o.aimDir !== 0 && o.aimDir !== 1) return false;
  return !(o.shootReleased && o.shootHeld);
}
