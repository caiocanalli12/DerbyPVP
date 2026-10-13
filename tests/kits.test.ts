import { describe, expect, it } from 'vitest';
import { KEEPER_COLORS, KIT_CONFLICT_THRESHOLD } from '../src/config/constants';
import { TEAMS } from '../src/data/teams';
import type { TeamId } from '../src/data/teams';
import { chooseKits, deltaE2000, kitDistance, readingColor, toLab } from '../src/sim/kits';

describe('troca de uniforme por conflito de cores (obrigatórios)', () => {
  it.each([
    ['COR', 'RMA'],
    ['BAR', 'INT'],
    ['MIL', 'LIV'],
  ] as [TeamId, TeamId][])('%s x %s: o J2 usa o reserva', (a, b) => {
    const c = chooseKits(a, b);
    expect(c.variants).toEqual(['home', 'away']);
    // E na ordem inversa também troca.
    expect(chooseKits(b, a).variants).toEqual(['home', 'away']);
  });

  it('Palmeiras x Corinthians não troca', () => {
    expect(chooseKits('PAL', 'COR').variants).toEqual(['home', 'home']);
    expect(chooseKits('COR', 'PAL').variants).toEqual(['home', 'home']);
  });
});

describe('regras de uniforme', () => {
  it('mesmo time dos dois lados: o J2 usa o reserva', () => {
    for (const t of TEAMS) expect(chooseKits(t.id, t.id).variants).toEqual(['home', 'away']);
  });

  it('nenhum confronto termina com uniformes conflitantes', () => {
    for (const a of TEAMS) {
      for (const b of TEAMS) {
        const c = chooseKits(a.id, b.id);
        expect(kitDistance(c.kits[0], c.kits[1]), `${a.id} x ${b.id}`).toBeGreaterThanOrEqual(KIT_CONFLICT_THRESHOLD);
      }
    }
  });

  it('a cor de leitura das listras fica entre as duas cores', () => {
    const bar = TEAMS.find((t) => t.id === 'BAR')!;
    const r = readingColor({ ...bar.home, shorts: 0x004d98, socks: 0x004d98 });
    expect((r >> 16) & 0xff).toBeGreaterThan(0);
    expect(r & 0xff).toBeGreaterThan(0x44);
  });

  it('CIEDE2000: cores iguais têm distância 0 e branco x preto é enorme', () => {
    expect(deltaE2000(toLab(0x336699), toLab(0x336699))).toBeCloseTo(0, 6);
    expect(deltaE2000(toLab(0xffffff), toLab(0x000000))).toBeGreaterThan(90);
  });
});

describe('goleiros', () => {
  it('cada goleiro recebe uma cor diferente da lista, longe dos dois uniformes de linha', () => {
    for (const a of TEAMS) {
      for (const b of TEAMS) {
        const c = chooseKits(a.id, b.id);
        const [g1, g2] = c.keeperColors;
        expect(KEEPER_COLORS).toContain(g1);
        expect(KEEPER_COLORS).toContain(g2);
        expect(g1).not.toBe(g2);
        const d = (x: number, y: number) => deltaE2000(toLab(x), toLab(y));
        const r1 = readingColor(c.kits[0]);
        const r2 = readingColor(c.kits[1]);
        const worst = Math.min(d(g1, r1), d(g1, r2), d(g2, r1), d(g2, r2), d(g1, g2));
        expect(worst, `${a.id} x ${b.id}`).toBeGreaterThan(15);
      }
    }
  });

  it('a escolha maximiza a menor diferença (nenhum par da lista é melhor)', () => {
    const c = chooseKits('PAL', 'LIV');
    const r1 = toLab(readingColor(c.kits[0]));
    const r2 = toLab(readingColor(c.kits[1]));
    const score = (x: number, y: number) =>
      Math.min(
        deltaE2000(toLab(x), r1),
        deltaE2000(toLab(x), r2),
        deltaE2000(toLab(y), r1),
        deltaE2000(toLab(y), r2),
        deltaE2000(toLab(x), toLab(y)),
      );
    const chosen = score(c.keeperColors[0], c.keeperColors[1]);
    for (const x of KEEPER_COLORS) for (const y of KEEPER_COLORS) if (x !== y) expect(score(x, y)).toBeLessThanOrEqual(chosen + 1e-9);
  });
});
