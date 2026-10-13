import { describe, expect, it } from 'vitest';
import { ANIMS, frameName, framesFor } from '../src/art/player-art';
import type { AnimName } from '../src/art/player-art';
import { buildLooks } from '../src/art/match-art';
import { chooseKits } from '../src/sim/kits';
import { PlayerAnimator, viewFor } from '../src/render/PlayerAnimator';
import type { AnimContext } from '../src/render/PlayerAnimator';
import { createPlayer } from '../src/sim/player';
import type { KeeperMode } from '../src/sim/goalkeeper';
import type { PlayerState } from '../src/sim/player';

describe('animações (quantidade de quadros da especificação)', () => {
  it.each([
    ['idle', 2],
    ['run', 6],
    ['dribble', 6],
    ['pass', 3],
    ['kick', 4],
    ['slide', 2],
    ['fallen', 2],
    ['stumble', 2],
    ['gkDive', 3],
    ['gkHold', 2],
    ['gkThrow', 3],
  ] as [AnimName, number][])('%s tem %i quadros', (anim, n) => {
    expect(ANIMS[anim].frames).toBe(n);
  });

  it('comemoração tem de 4 a 6 quadros e o goleiro tem posição de espera', () => {
    expect(ANIMS.celebrate.frames).toBeGreaterThanOrEqual(4);
    expect(ANIMS.celebrate.frames).toBeLessThanOrEqual(6);
    expect(ANIMS.gkReady.frames).toBeGreaterThanOrEqual(1);
  });

  it('parado e correndo existem nas 3 vistas', () => {
    for (const a of ['idle', 'run'] as const) expect([...ANIMS[a].views].sort()).toEqual(['back', 'front', 'side']);
  });

  it('poses de 1–2 quadros têm 3 variações de fervura', () => {
    for (const a of Object.keys(ANIMS) as AnimName[]) {
      if (ANIMS[a].frames <= 2) expect(ANIMS[a].boilVariants, a).toBe(3);
    }
  });

  it('goleiro tem as animações extras; jogador de linha não', () => {
    const field = new Set(framesFor(false).map((f) => f.anim));
    const gk = new Set(framesFor(true).map((f) => f.anim));
    expect(field.has('gkDive')).toBe(false);
    expect(gk.has('gkDive')).toBe(true);
    expect(gk.has('run')).toBe(true);
  });
});

describe('vista pela direção do corpo', () => {
  it('direita/esquerda = lateral (esquerda espelhada); baixo = frente; cima = costas', () => {
    expect(viewFor(0)).toEqual({ view: 'side', flipX: false });
    expect(viewFor(Math.PI)).toEqual({ view: 'side', flipX: true });
    expect(viewFor(Math.PI / 2).view).toBe('front');
    expect(viewFor(-Math.PI / 2).view).toBe('back');
    // Diagonais usam a vista mais próxima (lateral).
    expect(viewFor(Math.PI / 4).view).toBe('side');
    expect(viewFor((3 * Math.PI) / 4)).toEqual({ view: 'side', flipX: true });
  });
});

describe('o animador só pede quadros que existem no atlas', () => {
  const ctx = (o: Partial<AnimContext> = {}): AnimContext => ({
    time: 0,
    charging: false,
    dribbling: false,
    celebrating: false,
    keeperMode: null,
    diveY: 1,
    frozen: false,
    ...o,
  });

  it('jogador de linha em todos os estados e ações', () => {
    const names = new Set(framesFor(false).map((f) => frameName(f.anim, f.view, f.frame, f.variant)));
    const states: PlayerState[] = ['normal', 'tackling', 'fallen', 'stumbling'];
    for (const state of states) {
      for (let a = -Math.PI; a <= Math.PI; a += Math.PI / 8) {
        for (const speed of [0, 3, 6.5]) {
          for (const o of [{}, { charging: true }, { dribbling: true }, { celebrating: true }, { frozen: true }]) {
            const anim = new PlayerAnimator();
            const p = createPlayer(4, 0, 'ATA');
            p.state = state;
            p.facing = a;
            p.vx = Math.cos(a) * speed;
            p.vy = Math.sin(a) * speed;
            for (let t = 0; t < 1.2; t += 1 / 30) {
              if (t > 0.3 && t < 0.34) anim.trigger(t < 0.32 ? 'pass' : 'kick');
              const out = anim.update(p, ctx({ ...o, time: t }), 1 / 30);
              expect(names.has(out.frame), out.frame).toBe(true);
            }
          }
        }
      }
    }
  });

  it('goleiro em todos os modos', () => {
    const names = new Set(framesFor(true).map((f) => frameName(f.anim, f.view, f.frame, f.variant)));
    const modes: KeeperMode[] = ['position', 'windup', 'dive', 'recover', 'hold'];
    for (const mode of modes) {
      for (let a = -Math.PI; a <= Math.PI; a += Math.PI / 6) {
        const anim = new PlayerAnimator();
        const p = createPlayer(0, 0, 'GK');
        p.facing = a;
        for (let t = 0; t < 1.5; t += 1 / 30) {
          if (t > 0.5 && t < 0.52) anim.trigger('gkThrow');
          const out = anim.update(p, ctx({ keeperMode: mode, time: t, diveY: a > 0 ? 1 : -1 }), 1 / 30);
          expect(names.has(out.frame), out.frame).toBe(true);
        }
      }
    }
  });

  it('carrinho, caído e cambaleando usam as poses certas', () => {
    const p = createPlayer(4, 0, 'ATA');
    for (const [state, anim] of [
      ['tackling', 'slide'],
      ['fallen', 'fallen'],
      ['stumbling', 'stumble'],
    ] as const) {
      p.state = state;
      expect(new PlayerAnimator().update(p, ctx(), 1 / 60).frame.startsWith(anim + ':')).toBe(true);
    }
  });
});

describe('aparência dos jogadores da partida', () => {
  it('10 jogadores; números por função; tons de pele variados dentro do time', () => {
    const looks = buildLooks(['PAL', 'COR'], chooseKits('PAL', 'COR'), 5);
    expect(looks).toHaveLength(10);
    expect(looks.map((l) => l.number)).toEqual([1, 4, 7, 11, 9, 1, 4, 7, 11, 9]);
    expect(looks.filter((l) => l.isKeeper)).toHaveLength(2);
    for (const team of [0, 1]) {
      const skins = new Set(looks.slice(team * 5, team * 5 + 5).map((l) => l.skin));
      expect(skins.size).toBe(5);
    }
  });
});
