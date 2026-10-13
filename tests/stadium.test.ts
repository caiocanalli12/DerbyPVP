import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import { randomWeather, WEATHERS } from '../src/data/weather';
import { SPONSORS } from '../src/data/sponsors';
import { FLOODLIGHTS, shadowCount, shadowsAt } from '../src/render/shadows';
import { crowdColors } from '../src/art/crowd-art';
import { chooseKits } from '../src/sim/kits';

describe('clima', () => {
  it('os 4 climas existem e são sorteados de forma uniforme', () => {
    expect(WEATHERS.map((w) => w.id)).toEqual(['sunny', 'sunset', 'night', 'rain']);
    const rng = new Rng(3);
    const n = 8000;
    const count: Record<string, number> = {};
    for (let i = 0; i < n; i++) {
      const w = randomWeather(() => rng.next());
      count[w] = (count[w] ?? 0) + 1;
    }
    for (const w of WEATHERS) expect(count[w.id]! / n).toBeCloseTo(0.25, 1);
  });

  it('sol: sombra curta; pôr do sol: longa e diagonal; noite: 4 sombras suaves; chuva: difusa', () => {
    const sun = shadowsAt('sunny', 20, 10);
    const sunset = shadowsAt('sunset', 20, 10);
    const night = shadowsAt('night', 20, 10);
    expect(sun).toHaveLength(1);
    expect(sunset).toHaveLength(1);
    expect(sunset[0]!.stretch).toBeGreaterThan(sun[0]!.stretch * 2);
    expect(Math.abs(sunset[0]!.dx) + Math.abs(sunset[0]!.dy)).toBeGreaterThan(0.8);
    expect(night).toHaveLength(4);
    expect(shadowCount('night')).toBe(4);
    for (const s of night) expect(s.alpha).toBeLessThan(sun[0]!.alpha);
    expect(shadowsAt('rain', 20, 10)[0]!.alpha).toBeLessThan(sun[0]!.alpha);
  });

  it('à noite, cada sombra aponta para longe do seu refletor', () => {
    const x = 12;
    const y = 7;
    shadowsAt('night', x, y).forEach((s, i) => {
      const l = FLOODLIGHTS[i]!;
      expect(s.dx * (x - l.x) + s.dy * (y - l.y)).toBeGreaterThan(0);
    });
  });
});

describe('placas de patrocínio', () => {
  it('as 5 placas da especificação, com o Asilo do Rods azul e rosa sobre branco', () => {
    expect(SPONSORS.map((s) => s.text)).toEqual(['Marlburo', 'bet366', 'Chopp Brama', 'Asilo do Rods', 'Miami Hot']);
    const asilo = SPONSORS.find((s) => s.id === 'asilo')!;
    expect(asilo.bg).toBe(0xffffff);
    expect([asilo.main, asilo.accent]).toEqual([0x1f5fbf, 0xff5fa8]);
  });
});

describe('torcida', () => {
  it('segue o uniforme que está em campo (inclusive o reserva)', () => {
    const kits = chooseKits('COR', 'RMA');
    expect(crowdColors(kits.kits[0]).main).toBe(0xffffff);
    // O Real Madrid entra de roxo: a torcida dele também.
    expect(crowdColors(kits.kits[1]).main).toBe(0x4b2e83);
  });

  it('listras: camisa na primeira cor e cachecol na segunda', () => {
    const kits = chooseKits('MIL', 'PAL');
    expect(crowdColors(kits.kits[0])).toEqual({ main: 0xfb090b, second: 0x161616 });
  });
});
