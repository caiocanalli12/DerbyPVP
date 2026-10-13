/**
 * Teclado dos 2 jogadores.
 *
 * - Na seleção de times, H (J1) e `,` (J2) alternam entre o uniforme 1 e o 2.
 * - Usa KeyboardEvent.code (posição física), com exceção do passe do J2, que aceita
 *   `Slash` (ABNT2), `Semicolon` (US) ou qualquer tecla cujo `key` seja ';'.
 * - Guarda o estado de cada ação e "trava" (latch) os eventos de apertar/soltar até a
 *   próxima leitura (`snapshot`). Assim nenhum toque se perde entre passos fixos da
 *   simulação e nenhum toque é contado duas vezes.
 * - `blur` solta todas as teclas e avisa quem lê (para pausar a partida).
 */

export type Action =
  | 'p1Up'
  | 'p1Down'
  | 'p1Left'
  | 'p1Right'
  | 'p1Pass'
  | 'p1Shoot'
  | 'p1Kit'
  | 'p2Up'
  | 'p2Down'
  | 'p2Left'
  | 'p2Right'
  | 'p2Pass'
  | 'p2Shoot'
  | 'p2Kit'
  | 'pause'
  | 'enter'
  | 'debug';

export const ALL_ACTIONS: readonly Action[] = [
  'p1Up',
  'p1Down',
  'p1Left',
  'p1Right',
  'p1Pass',
  'p1Shoot',
  'p1Kit',
  'p2Up',
  'p2Down',
  'p2Left',
  'p2Right',
  'p2Pass',
  'p2Shoot',
  'p2Kit',
  'pause',
  'enter',
  'debug',
];

/** Mapa de KeyboardEvent.code -> ação. */
export const CODE_TO_ACTION: Readonly<Record<string, Action>> = {
  KeyW: 'p1Up',
  KeyS: 'p1Down',
  KeyA: 'p1Left',
  KeyD: 'p1Right',
  KeyF: 'p1Pass',
  KeyG: 'p1Shoot',
  KeyH: 'p1Kit', // uniforme 1/2 na seleção de times
  ArrowUp: 'p2Up',
  ArrowDown: 'p2Down',
  ArrowLeft: 'p2Left',
  ArrowRight: 'p2Right',
  Slash: 'p2Pass', // ';' no ABNT2
  Semicolon: 'p2Pass', // ';' no teclado americano
  Period: 'p2Shoot',
  Comma: 'p2Kit', // uniforme 1/2 na seleção de times (ao lado do '.' no ABNT2 e no americano)
  Escape: 'pause',
  KeyP: 'pause',
  Enter: 'enter',
  NumpadEnter: 'enter',
  Backquote: 'debug',
};

/**
 * Teclas cujo comportamento padrão do navegador atrapalha o jogo:
 * setas e espaço rolam a página; no Firefox, '/' e "'" abrem a busca rápida
 * (no ABNT2, a tecla `Backquote` digita "'").
 */
export const PREVENT_DEFAULT_CODES: ReadonlySet<string> = new Set([
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Space',
  'Slash',
  'Period',
  'Backquote',
]);

export interface ButtonState {
  /** Está pressionada agora. */
  down: boolean;
  /** Foi pressionada desde a leitura anterior. */
  pressed: boolean;
  /** Foi solta desde a leitura anterior. */
  released: boolean;
}

export interface PlayerInput {
  /** Direção desejada, já normalizada (diagonal não é mais rápida). */
  moveX: number;
  moveY: number;
  up: ButtonState;
  down: ButtonState;
  left: ButtonState;
  right: ButtonState;
  pass: ButtonState;
  shoot: ButtonState;
}

export interface InputFrame {
  players: [PlayerInput, PlayerInput];
  pause: ButtonState;
  enter: ButtonState;
  debug: ButtonState;
  /** Troca de uniforme na seleção de times: H (J1) e `,` (J2). */
  kit: [ButtonState, ButtonState];
  /** A janela perdeu o foco desde a leitura anterior. */
  blurred: boolean;
}

/** Evento mínimo (facilita testes sem DOM). */
export interface KeyEventLike {
  code: string;
  key: string;
  repeat?: boolean;
  preventDefault(): void;
}

/** Resolve a ação de um evento (ou null se a tecla não interessa ao jogo). */
export function actionForEvent(e: Pick<KeyEventLike, 'code' | 'key'>): Action | null {
  const byCode = CODE_TO_ACTION[e.code];
  if (byCode) return byCode;
  if (e.key === ';') return 'p2Pass';
  return null;
}

export function emptyButton(): ButtonState {
  return { down: false, pressed: false, released: false };
}

export function emptyPlayerInput(): PlayerInput {
  return {
    moveX: 0,
    moveY: 0,
    up: emptyButton(),
    down: emptyButton(),
    left: emptyButton(),
    right: emptyButton(),
    pass: emptyButton(),
    shoot: emptyButton(),
  };
}

export function emptyInputFrame(): InputFrame {
  return {
    players: [emptyPlayerInput(), emptyPlayerInput()],
    pause: emptyButton(),
    enter: emptyButton(),
    debug: emptyButton(),
    kit: [emptyButton(), emptyButton()],
    blurred: false,
  };
}

/** Direção normalizada a partir de 4 teclas (8 direções). */
export function directionFromKeys(up: boolean, down: boolean, left: boolean, right: boolean): { x: number; y: number } {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (down ? 1 : 0) - (up ? 1 : 0);
  if (x !== 0 && y !== 0) return { x: x * Math.SQRT1_2, y: y * Math.SQRT1_2 };
  return { x, y };
}

export class KeyboardInput {
  /** Códigos físicos que mantêm cada ação pressionada. */
  private readonly held = new Map<Action, Set<string>>();
  /** Código -> ação, guardado no keydown (o keyup usa o mesmo, mesmo que `key` mude). */
  private readonly codeAction = new Map<string, Action>();
  private readonly pressedLatch = new Set<Action>();
  private readonly releasedLatch = new Set<Action>();
  private blurLatch = false;
  private attached: Window | null = null;

  private readonly onKeyDown = (e: KeyEventLike): void => {
    if (PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
    const action = this.codeAction.get(e.code) ?? actionForEvent(e);
    if (!action) return;
    if (action === 'p2Pass') e.preventDefault();
    this.codeAction.set(e.code, action);
    let codes = this.held.get(action);
    if (!codes) {
      codes = new Set();
      this.held.set(action, codes);
    }
    const wasDown = codes.size > 0;
    codes.add(e.code);
    if (!wasDown && !e.repeat) this.pressedLatch.add(action);
  };

  private readonly onKeyUp = (e: KeyEventLike): void => {
    if (PREVENT_DEFAULT_CODES.has(e.code)) e.preventDefault();
    const action = this.codeAction.get(e.code) ?? actionForEvent(e);
    if (!action) return;
    const codes = this.held.get(action);
    if (!codes || !codes.has(e.code)) return;
    codes.delete(e.code);
    if (codes.size === 0) this.releasedLatch.add(action);
  };

  private readonly onBlur = (): void => {
    this.releaseAll();
    this.blurLatch = true;
  };

  attach(target: Window): void {
    this.detach();
    this.attached = target;
    target.addEventListener('keydown', this.onKeyDown);
    target.addEventListener('keyup', this.onKeyUp);
    target.addEventListener('blur', this.onBlur);
  }

  detach(): void {
    if (!this.attached) return;
    this.attached.removeEventListener('keydown', this.onKeyDown);
    this.attached.removeEventListener('keyup', this.onKeyUp);
    this.attached.removeEventListener('blur', this.onBlur);
    this.attached = null;
  }

  /** Entradas diretas (usadas pelos testes e pelos ouvintes do DOM). */
  keyDown(e: KeyEventLike): void {
    this.onKeyDown(e);
  }

  keyUp(e: KeyEventLike): void {
    this.onKeyUp(e);
  }

  blur(): void {
    this.onBlur();
  }

  /** Solta todas as teclas (gera "released" para as que estavam pressionadas). */
  releaseAll(): void {
    for (const [action, codes] of this.held) {
      if (codes.size > 0) this.releasedLatch.add(action);
      codes.clear();
    }
  }

  isDown(action: Action): boolean {
    return (this.held.get(action)?.size ?? 0) > 0;
  }

  /** Lê o estado atual e consome os eventos travados desde a última leitura. */
  snapshot(): InputFrame {
    const btn = (a: Action): ButtonState => ({
      down: this.isDown(a),
      pressed: this.pressedLatch.has(a),
      released: this.releasedLatch.has(a),
    });
    const player = (prefix: 'p1' | 'p2'): PlayerInput => {
      const up = btn(`${prefix}Up`);
      const down = btn(`${prefix}Down`);
      const left = btn(`${prefix}Left`);
      const right = btn(`${prefix}Right`);
      const dir = directionFromKeys(up.down, down.down, left.down, right.down);
      return {
        moveX: dir.x,
        moveY: dir.y,
        up,
        down,
        left,
        right,
        pass: btn(`${prefix}Pass`),
        shoot: btn(`${prefix}Shoot`),
      };
    };
    const frame: InputFrame = {
      players: [player('p1'), player('p2')],
      pause: btn('pause'),
      enter: btn('enter'),
      debug: btn('debug'),
      kit: [btn('p1Kit'), btn('p2Kit')],
      blurred: this.blurLatch,
    };
    this.pressedLatch.clear();
    this.releasedLatch.clear();
    this.blurLatch = false;
    return frame;
  }
}

/** Instância única do jogo, ligada à janela em main.ts. */
export const keyboard = new KeyboardInput();
