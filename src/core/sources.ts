/**
 * Fontes de comando do teclado: transformam a leitura do teclado num `TeamCommand` por tick.
 *
 * - `KeyboardTickSampler`: no máximo uma leitura (`snapshot`) do teclado por tick; a partida lê
 *   pausa, depuração e perda de foco desse mesmo quadro, e as fontes também.
 * - `LocalKeyboardSource`: um conjunto de teclas (J1 = WASD + F + G; J2 = setas + ; + .).
 * - `CombinedKeyboardSource`: os dois conjuntos juntos para um só jogador (solo e online).
 */
import { aimDirFromKeys, emptyCommand } from '../sim/command';
import type { CommandSource, TeamCommand } from '../sim/command';
import { directionFromKeys, keyboard } from './input';
import type { InputFrame, KeyboardInput, PlayerInput } from './input';

/** Lê o teclado uma vez por tick e devolve o mesmo quadro para o mesmo tick. */
export class KeyboardTickSampler {
  private tick: number | null = null;
  private cached: InputFrame | null = null;

  constructor(private readonly input: KeyboardInput = keyboard) {}

  /** Quadro do tick: lê o teclado (consumindo os toques travados) só na primeira chamada. */
  frame(tick: number): InputFrame {
    if (this.cached && this.tick === tick) return this.cached;
    this.cached = this.input.snapshot();
    this.tick = tick;
    return this.cached;
  }

  /**
   * Esquece o quadro guardado: a próxima chamada lê o teclado de novo, mesmo que seja o mesmo
   * tick (ao voltar da pausa, senão o quadro antigo, com a pausa apertada, a reabriria).
   */
  reset(): void {
    this.tick = null;
    this.cached = null;
  }
}

/**
 * Comando de um conjunto de teclas, igual ao que a simulação lia do `PlayerInput`.
 * Soltar e apertar de novo dentro do mesmo tick deixa o chute preso (não conta como soltar).
 */
export function commandFromPlayer(p: PlayerInput): TeamCommand {
  return {
    moveX: p.moveX,
    moveY: p.moveY,
    passPressed: p.pass.pressed,
    shootHeld: p.shoot.down,
    shootReleased: p.shoot.released && !p.shoot.down,
    shootPressed: p.shoot.pressed,
    aimDir: aimDirFromKeys(p.up.down, p.down.down, p.left.down, p.right.down),
  };
}

/** Um conjunto de teclas: J1 (0) = WASD + F + G; J2 (1) = setas + ; + . */
export class LocalKeyboardSource implements CommandSource {
  constructor(
    private readonly sampler: KeyboardTickSampler,
    private readonly player: 0 | 1,
  ) {}

  getCommand(tick: number): TeamCommand {
    return commandFromPlayer(this.sampler.frame(tick).players[this.player]);
  }
}

/**
 * Os dois conjuntos de teclas juntos, para um só jogador.
 *
 * - Direção: cada sentido vale se a tecla de qualquer conjunto estiver pressionada (cima = W ou ↑);
 *   opostas se anulam, mesmo em conjuntos diferentes (W + ↓ = parado).
 * - Passe: F ou ; (Slash no ABNT2, Semicolon no americano ou key ';').
 * - Chute: um botão lógico só (G ou .). Fica preso enquanto qualquer um estiver pressionado;
 *   "apertou" só quando estava solto no tick anterior; "soltou" quando estava preso e agora não
 *   está (ou foi um toque inteiro dentro do tick).
 */
export class CombinedKeyboardSource implements CommandSource {
  private lastTick: number | null = null;
  private lastFrame: InputFrame | null = null;
  private last: TeamCommand = emptyCommand();
  /** Botão lógico de chute preso no tick anterior ao último calculado. */
  private shootWasHeld = false;

  constructor(private readonly sampler: KeyboardTickSampler) {}

  getCommand(tick: number): TeamCommand {
    const frame = this.sampler.frame(tick);
    // Mesmo quadro: mesmo comando (pedir de novo não avança o botão lógico).
    if (frame === this.lastFrame) return this.last;
    // Tick novo: parte do estado do último tick calculado. Mesmo tick com quadro novo (o sampler
    // foi reiniciado): recalcula a partir do mesmo estado anterior.
    if (tick !== this.lastTick) this.shootWasHeld = this.last.shootHeld;
    const [a, b] = frame.players;
    const up = a.up.down || b.up.down;
    const down = a.down.down || b.down.down;
    const left = a.left.down || b.left.down;
    const right = a.right.down || b.right.down;
    const dir = directionFromKeys(up, down, left, right);
    const held = a.shoot.down || b.shoot.down;
    const pressed = !this.shootWasHeld && (a.shoot.pressed || b.shoot.pressed);
    this.last = {
      moveX: dir.x,
      moveY: dir.y,
      passPressed: a.pass.pressed || b.pass.pressed,
      shootHeld: held,
      shootReleased: !held && (this.shootWasHeld || pressed),
      shootPressed: pressed,
      aimDir: aimDirFromKeys(up, down, left, right),
    };
    this.lastTick = tick;
    this.lastFrame = frame;
    return this.last;
  }
}
