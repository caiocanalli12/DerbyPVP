import { describe, expect, it } from 'vitest';
import { emptyCommand, isValidCommand } from '../src/sim/command';

describe('comando de time', () => {
  it('o comando vazio é válido e não aperta nada', () => {
    const c = emptyCommand();
    expect(isValidCommand(c)).toBe(true);
    expect(c).toEqual({ moveX: 0, moveY: 0, passPressed: false, shootHeld: false, shootReleased: false, shootPressed: false });
  });

  it('aceita direções normalizadas (inclusive a diagonal) e todos os botões', () => {
    const d = Math.SQRT1_2;
    for (const [x, y] of [[1, 0], [0, -1], [d, d], [-d, d], [0.3, -0.4]] as const) {
      expect(isValidCommand({ ...emptyCommand(), moveX: x, moveY: y })).toBe(true);
    }
    const all = { moveX: 1, moveY: 0, passPressed: true, shootHeld: true, shootReleased: false, shootPressed: true };
    expect(isValidCommand(all)).toBe(true);
    expect(isValidCommand({ ...emptyCommand(), shootPressed: true, shootReleased: true })).toBe(true);
  });

  it('recusa direção maior que 1 ou com números não finitos', () => {
    expect(isValidCommand({ ...emptyCommand(), moveX: 1, moveY: 1 })).toBe(false);
    expect(isValidCommand({ ...emptyCommand(), moveX: 1.001 })).toBe(false);
    expect(isValidCommand({ ...emptyCommand(), moveX: 1 + 1e-9 })).toBe(true);
    expect(isValidCommand({ ...emptyCommand(), moveX: Number.NaN })).toBe(false);
    expect(isValidCommand({ ...emptyCommand(), moveY: Number.POSITIVE_INFINITY })).toBe(false);
    expect(isValidCommand({ ...emptyCommand(), moveX: Number.NEGATIVE_INFINITY })).toBe(false);
  });

  it('recusa campos ausentes ou de tipo errado', () => {
    expect(isValidCommand(null)).toBe(false);
    expect(isValidCommand(undefined)).toBe(false);
    expect(isValidCommand(42)).toBe(false);
    expect(isValidCommand('comando')).toBe(false);
    expect(isValidCommand([])).toBe(false);
    expect(isValidCommand({})).toBe(false);
    expect(isValidCommand({ ...emptyCommand(), moveX: '0' })).toBe(false);
    expect(isValidCommand({ ...emptyCommand(), passPressed: 1 })).toBe(false);
    expect(isValidCommand({ ...emptyCommand(), shootHeld: 'true' })).toBe(false);
    expect(isValidCommand({ ...emptyCommand(), shootPressed: null })).toBe(false);
    const { shootReleased: _omit, ...missing } = emptyCommand();
    expect(isValidCommand(missing)).toBe(false);
  });

  it('aimDir é opcional e, se vier, só -1, 0 ou 1', () => {
    for (const aimDir of [-1, 0, 1]) expect(isValidCommand({ ...emptyCommand(), aimDir })).toBe(true);
    for (const aimDir of [2, -2, 0.5, '1', null, Number.NaN, true]) {
      expect(isValidCommand({ ...emptyCommand(), aimDir }), String(aimDir)).toBe(false);
    }
  });

  it('chute solto e pressionado ao mesmo tempo é inválido', () => {
    expect(isValidCommand({ ...emptyCommand(), shootHeld: true, shootReleased: true })).toBe(false);
  });
});
