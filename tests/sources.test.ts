import { describe, expect, it } from 'vitest';
import { KeyboardInput } from '../src/core/input';
import type { KeyEventLike } from '../src/core/input';
import { Rng } from '../src/core/rng';
import { CombinedKeyboardSource, KeyboardTickSampler, LocalKeyboardSource } from '../src/core/sources';
import { isValidCommand } from '../src/sim/command';

function ev(code: string, key = '', repeat = false): KeyEventLike {
  return { code, key, repeat, preventDefault() {} };
}

/** Teclado de teste com as fontes ligadas a ele. */
function setup() {
  const kb = new KeyboardInput();
  const sampler = new KeyboardTickSampler(kb);
  return {
    kb,
    sampler,
    combined: new CombinedKeyboardSource(sampler),
    local: [new LocalKeyboardSource(sampler, 0), new LocalKeyboardSource(sampler, 1)] as const,
    down: (code: string, key = '') => kb.keyDown(ev(code, key)),
    up: (code: string, key = '') => kb.keyUp(ev(code, key)),
  };
}

const S = Math.SQRT1_2;

/** Teclas de jogo dos dois conjuntos (para as sequências aleatórias). */
const GAME_CODES = [
  'KeyW',
  'KeyA',
  'KeyS',
  'KeyD',
  'KeyF',
  'KeyG',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'Slash',
  'Semicolon',
  'Period',
];

describe('amostragem do teclado por tick', () => {
  it('devolve o mesmo quadro no mesmo tick e consome os toques uma vez só', () => {
    const { kb, sampler, down } = setup();
    down('KeyF');
    const f0 = sampler.frame(0);
    expect(f0.players[0].pass.pressed).toBe(true);
    down('KeyG');
    // Mesmo tick: o mesmo quadro (o G apertado agora fica para o próximo).
    expect(sampler.frame(0)).toBe(f0);
    expect(sampler.frame(0).players[0].shoot.pressed).toBe(false);
    const f1 = sampler.frame(1);
    expect(f1).not.toBe(f0);
    expect(f1.players[0].pass.pressed).toBe(false);
    expect(f1.players[0].pass.down).toBe(true);
    expect(f1.players[0].shoot.pressed).toBe(true);
    // Os toques já foram consumidos pelo sampler.
    expect(kb.snapshot().players[0].shoot.pressed).toBe(false);
  });

  it('reset esquece o quadro guardado e lê de novo no mesmo tick', () => {
    const { sampler, down } = setup();
    down('Escape');
    const f = sampler.frame(5);
    expect(f.pause.pressed).toBe(true);
    sampler.reset();
    const g = sampler.frame(5);
    expect(g).not.toBe(f);
    expect(g.pause.pressed).toBe(false);
  });
});

describe('um conjunto de teclas (modo local)', () => {
  it('J1 só vê WASD + F + G e J2 só vê setas + ; + .', () => {
    const { local, down } = setup();
    down('KeyD');
    down('KeyF');
    down('ArrowUp');
    down('Period', '.');
    const j1 = local[0].getCommand(0);
    const j2 = local[1].getCommand(0);
    expect(j1).toEqual({ moveX: 1, moveY: 0, passPressed: true, shootHeld: false, shootReleased: false, shootPressed: false, aimDir: 1 });
    expect(j2).toEqual({ moveX: 0, moveY: -1, passPressed: false, shootHeld: true, shootReleased: false, shootPressed: true, aimDir: -1 });
  });

  it('toque dentro do mesmo tick: apertou e soltou, sem ficar preso', () => {
    const { local, down, up } = setup();
    down('KeyG');
    up('KeyG');
    const c = local[0].getCommand(0);
    expect(c.shootPressed).toBe(true);
    expect(c.shootReleased).toBe(true);
    expect(c.shootHeld).toBe(false);
  });

  it('dá o mesmo comando que a leitura antiga do teclado daquele jogador', () => {
    const rng = new Rng(2024);
    const { kb, local } = setup();
    // Um segundo teclado recebe os mesmos eventos e é lido do jeito antigo (snapshot direto).
    const old = new KeyboardInput();
    for (let tick = 0; tick < 3000; tick++) {
      const n = rng.int(0, 3);
      for (let i = 0; i < n; i++) {
        const code = GAME_CODES[rng.int(0, GAME_CODES.length - 1)]!;
        const e = ev(code, code === 'Slash' || code === 'Semicolon' ? ';' : '');
        if (rng.chance(0.5)) {
          kb.keyDown(e);
          old.keyDown(e);
        } else {
          kb.keyUp(e);
          old.keyUp(e);
        }
      }
      const frame = old.snapshot();
      for (const p of [0, 1] as const) {
        const c = local[p].getCommand(tick);
        const o = frame.players[p];
        expect(c.moveX).toBe(o.moveX);
        expect(c.moveY).toBe(o.moveY);
        expect(c.passPressed).toBe(o.pass.pressed);
        expect(c.shootPressed).toBe(o.shoot.pressed);
        expect(c.shootHeld).toBe(o.shoot.down);
        expect(c.shootReleased).toBe(o.shoot.released && !o.shoot.down);
        // Mira do pênalti como a simulação lia antes: esquerda ou cima / direita ou baixo.
        const oldAim = (o.right.down || o.down.down ? 1 : 0) - (o.left.down || o.up.down ? 1 : 0);
        expect(c.aimDir).toBe(oldAim);
        expect(isValidCommand(c)).toBe(true);
      }
    }
  });
});

describe('os dois conjuntos juntos (solo e online)', () => {
  it('os dois conjuntos movem o jogador', () => {
    const { combined, down, up } = setup();
    down('KeyW');
    expect(combined.getCommand(0)).toMatchObject({ moveX: 0, moveY: -1 });
    up('KeyW');
    down('ArrowLeft');
    expect(combined.getCommand(1)).toMatchObject({ moveX: -1, moveY: 0 });
    // Um sentido de cada conjunto: diagonal normalizada.
    down('KeyS');
    const c = combined.getCommand(2);
    expect(c.moveX).toBeCloseTo(-S, 12);
    expect(c.moveY).toBeCloseTo(S, 12);
    expect(Math.hypot(c.moveX, c.moveY)).toBeCloseTo(1, 12);
    // O mesmo sentido nos dois conjuntos não soma.
    up('KeyS');
    down('KeyA');
    expect(combined.getCommand(3)).toMatchObject({ moveX: -1, moveY: 0 });
  });

  it('opostos em conjuntos diferentes se anulam', () => {
    const { combined, down, up } = setup();
    down('KeyW');
    down('ArrowDown');
    expect(combined.getCommand(0)).toMatchObject({ moveX: 0, moveY: 0 });
    up('KeyW');
    up('ArrowDown');
    down('KeyA');
    down('ArrowRight');
    expect(combined.getCommand(1)).toMatchObject({ moveX: 0, moveY: 0 });
    // Opostos anulados + uma terceira: vale a terceira.
    down('ArrowUp');
    expect(combined.getCommand(2)).toMatchObject({ moveX: 0, moveY: -1 });
  });

  it('passe com F, Slash (ABNT2), Semicolon (US) ou key ";"', () => {
    const presses: [string, string][] = [
      ['KeyF', 'f'],
      ['Slash', ';'],
      ['Semicolon', ';'],
      ['IntlRo', ';'],
    ];
    for (const [code, key] of presses) {
      const { combined, down, up } = setup();
      expect(combined.getCommand(0).passPressed).toBe(false);
      down(code, key);
      expect(combined.getCommand(1).passPressed, code).toBe(true);
      // Segurando não repete o passe.
      expect(combined.getCommand(2).passPressed).toBe(false);
      up(code, key);
      expect(combined.getCommand(3).passPressed).toBe(false);
    }
  });

  it('chute é um botão só: segurar G, apertar ".", soltar G continua preso; soltar "." solta', () => {
    const { combined, down, up } = setup();
    down('KeyG');
    expect(combined.getCommand(0)).toMatchObject({ shootPressed: true, shootHeld: true, shootReleased: false });
    expect(combined.getCommand(1)).toMatchObject({ shootPressed: false, shootHeld: true, shootReleased: false });
    down('Period', '.');
    expect(combined.getCommand(2)).toMatchObject({ shootPressed: false, shootHeld: true, shootReleased: false });
    up('KeyG');
    expect(combined.getCommand(3)).toMatchObject({ shootPressed: false, shootHeld: true, shootReleased: false });
    up('Period', '.');
    expect(combined.getCommand(4)).toMatchObject({ shootPressed: false, shootHeld: false, shootReleased: true });
    expect(combined.getCommand(5)).toMatchObject({ shootPressed: false, shootHeld: false, shootReleased: false });
    // Depois de solto, apertar de novo (com o outro conjunto) é um novo toque.
    down('Period', '.');
    expect(combined.getCommand(6)).toMatchObject({ shootPressed: true, shootHeld: true, shootReleased: false });
  });

  it('apertar os dois no mesmo tick conta um toque só', () => {
    const { combined, down } = setup();
    down('KeyG');
    down('Period', '.');
    expect(combined.getCommand(0)).toMatchObject({ shootPressed: true, shootHeld: true, shootReleased: false });
  });

  it('toque dentro do mesmo tick: apertou e soltou, sem ficar preso', () => {
    for (const [code, key] of [
      ['KeyG', 'g'],
      ['Period', '.'],
    ] as const) {
      const { combined, down, up } = setup();
      down(code, key);
      up(code, key);
      expect(combined.getCommand(0)).toMatchObject({ shootPressed: true, shootHeld: false, shootReleased: true });
      expect(combined.getCommand(1)).toMatchObject({ shootPressed: false, shootHeld: false, shootReleased: false });
    }
  });

  it('tecla já pressionada antes da partida não vira um toque', () => {
    const { kb, combined, down, up } = setup();
    down('KeyG');
    kb.snapshot(); // a partida descarta o que foi apertado antes de começar
    expect(combined.getCommand(0)).toMatchObject({ shootPressed: false, shootHeld: true, shootReleased: false });
    up('KeyG');
    expect(combined.getCommand(1)).toMatchObject({ shootPressed: false, shootHeld: false, shootReleased: true });
  });

  it('pedir o comando de novo no mesmo tick não avança o botão', () => {
    const { combined, sampler, down } = setup();
    down('KeyG');
    const c = combined.getCommand(0);
    expect(combined.getCommand(0)).toEqual(c);
    expect(c.shootPressed).toBe(true);
    // Mesmo tick com um quadro novo (sampler reiniciado): recalcula a partir do mesmo estado.
    sampler.reset();
    expect(combined.getCommand(0)).toMatchObject({ shootPressed: false, shootHeld: true });
    expect(combined.getCommand(1)).toMatchObject({ shootPressed: false, shootHeld: true });
  });

  it('recalcular o mesmo tick parte do estado de antes dele (soltar agora não conta como "soltou")', () => {
    const { combined, sampler, down, up } = setup();
    down('KeyG');
    expect(combined.getCommand(0)).toMatchObject({ shootPressed: true, shootHeld: true });
    // O tick 0 é recalculado com o G já solto: antes do tick 0 o botão estava solto, então não
    // houve "soltou" (o toque inteiro foi consumido pelo quadro descartado).
    up('KeyG');
    sampler.reset();
    expect(combined.getCommand(0)).toMatchObject({ shootPressed: false, shootHeld: false, shootReleased: false });
  });

  it('mira do pênalti: esquerda ou cima / direita ou baixo de qualquer conjunto, opostas se anulam', () => {
    const cases: [string[], number][] = [
      [['KeyA'], -1],
      [['ArrowUp'], -1],
      [['KeyD'], 1],
      [['ArrowDown'], 1],
      [['KeyW', 'KeyS', 'KeyA'], 0],
      [['KeyA', 'ArrowRight'], 0],
      [['KeyW', 'ArrowRight'], 0],
      [['KeyA', 'KeyD', 'ArrowUp'], 0],
    ];
    for (const [codes, aim] of cases) {
      const { combined, down } = setup();
      for (const code of codes) down(code);
      expect(combined.getCommand(0).aimDir, codes.join('+')).toBe(aim);
    }
  });

  it('só produz comandos válidos', () => {
    const rng = new Rng(77);
    const { combined, down, up } = setup();
    for (let tick = 0; tick < 3000; tick++) {
      const n = rng.int(0, 3);
      for (let i = 0; i < n; i++) {
        const code = GAME_CODES[rng.int(0, GAME_CODES.length - 1)]!;
        const key = code === 'Slash' || code === 'Semicolon' ? ';' : '';
        if (rng.chance(0.5)) down(code, key);
        else up(code, key);
      }
      const c = combined.getCommand(tick);
      expect(isValidCommand(c)).toBe(true);
      if (c.shootPressed) expect(c.shootHeld || c.shootReleased).toBe(true);
    }
  });
});
