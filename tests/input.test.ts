import { describe, expect, it } from 'vitest';
import { actionForEvent, directionFromKeys, KeyboardInput } from '../src/core/input';
import type { KeyEventLike } from '../src/core/input';

interface FakeEvent extends KeyEventLike {
  prevented: boolean;
}

function ev(code: string, key = '', repeat = false): FakeEvent {
  const e: FakeEvent = {
    code,
    key,
    repeat,
    prevented: false,
    preventDefault() {
      e.prevented = true;
    },
  };
  return e;
}

describe('mapeamento de teclas', () => {
  it('J1 usa WASD + F (passe) + G (chute)', () => {
    expect(actionForEvent(ev('KeyW'))).toBe('p1Up');
    expect(actionForEvent(ev('KeyA'))).toBe('p1Left');
    expect(actionForEvent(ev('KeyS'))).toBe('p1Down');
    expect(actionForEvent(ev('KeyD'))).toBe('p1Right');
    expect(actionForEvent(ev('KeyF'))).toBe('p1Pass');
    expect(actionForEvent(ev('KeyG'))).toBe('p1Shoot');
  });

  it('J2 usa setas + ; (passe) + . (chute)', () => {
    expect(actionForEvent(ev('ArrowUp'))).toBe('p2Up');
    expect(actionForEvent(ev('ArrowDown'))).toBe('p2Down');
    expect(actionForEvent(ev('ArrowLeft'))).toBe('p2Left');
    expect(actionForEvent(ev('ArrowRight'))).toBe('p2Right');
    expect(actionForEvent(ev('Period', '.'))).toBe('p2Shoot');
  });

  it('o passe do J2 aceita Slash (ABNT2), Semicolon (US) e key ";"', () => {
    expect(actionForEvent(ev('Slash', ';'))).toBe('p2Pass');
    expect(actionForEvent(ev('Semicolon', ';'))).toBe('p2Pass');
    expect(actionForEvent(ev('IntlRo', ';'))).toBe('p2Pass');
  });

  it('pausa com Esc ou P; Enter confirma; ` alterna o debug', () => {
    expect(actionForEvent(ev('Escape'))).toBe('pause');
    expect(actionForEvent(ev('KeyP'))).toBe('pause');
    expect(actionForEvent(ev('Enter'))).toBe('enter');
    expect(actionForEvent(ev('Backquote'))).toBe('debug');
  });

  it('teclas irrelevantes são ignoradas', () => {
    expect(actionForEvent(ev('KeyQ', 'q'))).toBeNull();
  });
});

describe('preventDefault', () => {
  it('é chamado em setas, espaço, Slash e Period', () => {
    const k = new KeyboardInput();
    for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'Slash', 'Period']) {
      const down = ev(code);
      const up = ev(code);
      k.keyDown(down);
      k.keyUp(up);
      expect(down.prevented, code).toBe(true);
      expect(up.prevented, code).toBe(true);
    }
  });

  it('é chamado no ";" vindo de qualquer código', () => {
    const k = new KeyboardInput();
    const e = ev('IntlRo', ';');
    k.keyDown(e);
    expect(e.prevented).toBe(true);
  });

  it('não é chamado nas letras do J1', () => {
    const k = new KeyboardInput();
    const e = ev('KeyW', 'w');
    k.keyDown(e);
    expect(e.prevented).toBe(false);
  });
});

describe('estado por leitura', () => {
  it('pressed/down/released com latch entre leituras', () => {
    const k = new KeyboardInput();
    k.keyDown(ev('KeyF'));
    let f = k.snapshot();
    expect(f.players[0].pass).toEqual({ down: true, pressed: true, released: false });
    f = k.snapshot();
    expect(f.players[0].pass).toEqual({ down: true, pressed: false, released: false });
    k.keyUp(ev('KeyF'));
    f = k.snapshot();
    expect(f.players[0].pass).toEqual({ down: false, pressed: false, released: true });
    f = k.snapshot();
    expect(f.players[0].pass).toEqual({ down: false, pressed: false, released: false });
  });

  it('um toque rápido entre duas leituras não se perde', () => {
    const k = new KeyboardInput();
    k.keyDown(ev('KeyG'));
    k.keyUp(ev('KeyG'));
    const f = k.snapshot();
    expect(f.players[0].shoot).toEqual({ down: false, pressed: true, released: true });
  });

  it('auto-repetição do teclado não gera novo "pressed"', () => {
    const k = new KeyboardInput();
    k.keyDown(ev('KeyG'));
    k.snapshot();
    k.keyDown(ev('KeyG', 'g', true));
    expect(k.snapshot().players[0].shoot.pressed).toBe(false);
  });

  it('o passe do J2 com ";" de código desconhecido solta no keyup do mesmo código', () => {
    const k = new KeyboardInput();
    k.keyDown(ev('IntlRo', ';'));
    expect(k.snapshot().players[1].pass.down).toBe(true);
    // No keyup, o `key` pode vir diferente (ex.: com Shift); o código decide.
    k.keyUp(ev('IntlRo', ':'));
    const f = k.snapshot();
    expect(f.players[1].pass.down).toBe(false);
    expect(f.players[1].pass.released).toBe(true);
  });

  it('Slash e Semicolon juntos: soltar um não solta o passe', () => {
    const k = new KeyboardInput();
    k.keyDown(ev('Slash', ';'));
    k.keyDown(ev('Semicolon', ';'));
    k.keyUp(ev('Slash', ';'));
    expect(k.snapshot().players[1].pass.down).toBe(true);
    k.keyUp(ev('Semicolon', ';'));
    expect(k.snapshot().players[1].pass.down).toBe(false);
  });

  it('os dois jogadores funcionam ao mesmo tempo com várias teclas', () => {
    const k = new KeyboardInput();
    for (const code of ['KeyW', 'KeyD', 'KeyG', 'ArrowDown', 'ArrowLeft', 'Period']) k.keyDown(ev(code));
    k.keyDown(ev('Slash', ';'));
    const f = k.snapshot();
    const [p1, p2] = f.players;
    expect(p1.moveX).toBeCloseTo(Math.SQRT1_2);
    expect(p1.moveY).toBeCloseTo(-Math.SQRT1_2);
    expect(p1.shoot.down).toBe(true);
    expect(p1.pass.down).toBe(false);
    expect(p2.moveX).toBeCloseTo(-Math.SQRT1_2);
    expect(p2.moveY).toBeCloseTo(Math.SQRT1_2);
    expect(p2.shoot.down).toBe(true);
    expect(p2.pass.down).toBe(true);
  });

  it('blur solta todas as teclas e avisa', () => {
    const k = new KeyboardInput();
    k.keyDown(ev('KeyW'));
    k.keyDown(ev('ArrowLeft'));
    k.snapshot();
    k.blur();
    const f = k.snapshot();
    expect(f.blurred).toBe(true);
    expect(f.players[0].up).toEqual({ down: false, pressed: false, released: true });
    expect(f.players[1].left.down).toBe(false);
    expect(f.players[0].moveY).toBe(0);
    expect(f.players[1].moveX).toBe(0);
    expect(k.snapshot().blurred).toBe(false);
  });

  it('depois do blur, a repetição de uma tecla ainda segurada não conta como novo toque', () => {
    const k = new KeyboardInput();
    k.keyDown(ev('KeyG'));
    k.blur();
    k.snapshot();
    k.keyDown(ev('KeyG', 'g', true));
    const f = k.snapshot();
    expect(f.players[0].shoot.pressed).toBe(false);
    expect(f.players[0].shoot.down).toBe(true);
  });
});

describe('direção em 8 sentidos', () => {
  it('diagonais normalizadas (não andam mais rápido)', () => {
    for (const [u, d, l, r] of [
      [true, false, false, true],
      [true, false, true, false],
      [false, true, false, true],
      [false, true, true, false],
    ] as const) {
      const v = directionFromKeys(u, d, l, r);
      expect(Math.hypot(v.x, v.y)).toBeCloseTo(1, 10);
    }
  });

  it('teclas opostas se anulam', () => {
    expect(directionFromKeys(true, true, false, false)).toEqual({ x: 0, y: 0 });
    const v = directionFromKeys(false, false, true, true);
    expect(v.x).toBe(0);
    expect(v.y).toBe(0);
  });

  it('cima = y negativo (fundo do campo), baixo = y positivo (frente)', () => {
    expect(directionFromKeys(true, false, false, false)).toEqual({ x: 0, y: -1 });
    expect(directionFromKeys(false, true, false, false)).toEqual({ x: 0, y: 1 });
  });
});
