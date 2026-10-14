import { describe, expect, it } from 'vitest';
import { HALF_DURATION, SIM_DT } from '../src/config/constants';
import { placeBall } from '../src/sim/ball';
import { emptyCommand } from '../src/sim/command';
import { createMatch, drainSounds, stepMatch } from '../src/sim/match';
import type { Match } from '../src/sim/match';
import { soundCues } from '../src/sim/sound';
import type { SoundEvent } from '../src/sim/sound';
import { getPlayer, playerId } from '../src/sim/world';
import type { HumanInputs } from '../src/sim/world';
import { withButtons } from './helpers/sim';

const IDLE: HumanInputs = [emptyCommand(), emptyCommand()];

/** Roda `seconds` e devolve os sons emitidos (drenando). */
function run(m: Match, seconds: number, inputs: HumanInputs = IDLE): SoundEvent[] {
  const out: SoundEvent[] = [];
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) {
    stepMatch(m, inputs, SIM_DT);
    out.push(...drainSounds(m));
  }
  return out;
}

/** Roda até a condição (ou estoura) e devolve os sons emitidos. */
function runUntil(m: Match, pred: (m: Match) => boolean, maxSeconds: number): SoundEvent[] {
  const out: SoundEvent[] = [];
  for (let i = 0; i < maxSeconds / SIM_DT; i++) {
    if (pred(m)) return out;
    stepMatch(m, IDLE, SIM_DT);
    out.push(...drainSounds(m));
  }
  throw new Error(`condição não atingida; fase=${m.phase} período=${m.period}`);
}

/** Apito e passe da saída: a bola em jogo. */
function startPlaying(m: Match): SoundEvent[] {
  const out = runUntil(m, (mm) => mm.kickoffLive, 5);
  const inputs: HumanInputs = [emptyCommand(), emptyCommand()];
  inputs[m.kickoffTeam] = withButtons(emptyCommand(), 'tap');
  stepMatch(m, inputs, SIM_DT);
  out.push(...drainSounds(m));
  return out;
}

describe('sons como eventos da simulação', () => {
  it('saída de bola: 1 apito curto quando libera e o som do passe que põe a bola em jogo', () => {
    const m = createMatch(3);
    const before = runUntil(m, (mm) => mm.kickoffLive, 5);
    expect(before.map((s) => s.type)).toEqual(['whistle']);
    expect(before[0]).toMatchObject({ type: 'whistle', pattern: 'short' });
    const inputs: HumanInputs = [withButtons(emptyCommand(), 'tap'), emptyCommand()];
    stepMatch(m, inputs, SIM_DT);
    const sounds = drainSounds(m);
    expect(sounds.map((s) => s.type)).toEqual(['pass']);
    expect(m.phase).toBe('JOGANDO');
  });

  it('chute: som "kick" com a força carregada e a posição X da bola', () => {
    const m = createMatch(5);
    startPlaying(m);
    // Bola com o atacante do J1, que carrega metade e solta.
    const ata = getPlayer(m.world, playerId(0, 'ATA'));
    m.world.ball.owner = null;
    placeBall(m.world.ball, ata.x + 0.45, ata.y, 0);
    run(m, 0.3);
    m.world.controlled[0] = ata.id;
    if (m.world.ball.owner !== ata.id) {
      m.world.ball.owner = ata.id;
    }
    stepMatch(m, [withButtons(emptyCommand(), 'none', 'press'), emptyCommand()], SIM_DT);
    run(m, 0.45 - SIM_DT, [withButtons(emptyCommand(), 'none', 'hold'), emptyCommand()]);
    stepMatch(m, [withButtons(emptyCommand(), 'none', 'release'), emptyCommand()], SIM_DT);
    const kicks = drainSounds(m).filter((s) => s.type === 'kick');
    expect(kicks).toHaveLength(1);
    const k = kicks[0]!;
    if (k.type !== 'kick') throw new Error('tipo');
    expect(k.power).toBeCloseTo(0.5, 1);
    expect(Math.abs(k.x - m.world.ball.x)).toBeLessThan(1e-9);
  });

  it('defesa do goleiro: som "save"', () => {
    const m = createMatch(7);
    startPlaying(m);
    const w = m.world;
    // Todos longe; bola lenta (segura) indo no meio do gol da direita.
    for (const p of w.players) if (p.role !== 'GK') p.x = p.team === 0 ? 5 : 8;
    const gk = getPlayer(w, playerId(1, 'GK'));
    gk.x = 39.3;
    gk.y = 10;
    w.ball.owner = null;
    placeBall(w.ball, 32, 10, 0.4);
    w.ball.vx = 11;
    w.ball.vy = 0;
    w.ball.vz = 0;
    const sounds = run(m, 1.5);
    expect(sounds.some((s) => s.type === 'save')).toBe(true);
    expect(sounds.some((s) => s.type === 'goal')).toBe(false);
  });

  it('gol: som "goal" no mesmo passo do evento do gol', () => {
    const m = createMatch(9);
    startPlaying(m);
    const w = m.world;
    w.ball.owner = null;
    placeBall(w.ball, 37, 10, 0);
    w.ball.vx = 15;
    w.aiEnabled = false;
    for (const p of w.players) if (p.role === 'GK') p.y = p.team === 0 ? 1 : 19;
    const celebrating = (mm: Match): boolean => mm.phase === 'COMEMORACAO_GOL';
    for (let i = 0; i < 3 / SIM_DT && !celebrating(m); i++) {
      stepMatch(m, IDLE, SIM_DT);
      if (!celebrating(m)) drainSounds(m);
    }
    expect(m.phase).toBe('COMEMORACAO_GOL');
    // Os sons do passo do gol (os anteriores foram drenados).
    const sounds = drainSounds(m);
    expect(sounds.filter((s) => s.type === 'goal')).toHaveLength(1);
    expect(sounds[0]!.x).toBeGreaterThan(39);
  });

  it('fim do 1º tempo: 2 apitos curtos', () => {
    const m = createMatch(11);
    startPlaying(m);
    m.clock = HALF_DURATION - 2 * SIM_DT;
    const sounds = run(m, 0.1).filter((s) => s.type === 'whistle');
    expect(sounds).toHaveLength(1);
    expect(sounds[0]).toMatchObject({ pattern: 'double' });
  });

  it('fim do 2º tempo com vencedor: só os 3 apitos do fim de jogo', () => {
    const m = createMatch(13);
    startPlaying(m);
    m.period = '2T';
    m.score = [2, 1];
    m.clock = HALF_DURATION - 2 * SIM_DT;
    const sounds = run(m, 0.1).filter((s) => s.type === 'whistle');
    expect(sounds).toHaveLength(1);
    expect(sounds[0]).toMatchObject({ pattern: 'final' });
    expect(m.phase).toBe('FIM');
  });

  it('partida inteira até os pênaltis: apitos na ordem certa, um "kick" por cobrança e ids crescentes', () => {
    const m = createMatch(21);
    const sounds = runUntil(m, (mm) => mm.over, 60 * 20);
    expect(m.shootout).not.toBeNull();
    const ids = sounds.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).toBeGreaterThan(ids[i - 1]!);

    const whistles = sounds.filter((s) => s.type === 'whistle').map((s) => (s.type === 'whistle' ? s.pattern : ''));
    // 4 períodos: saída (curto) + fim (2 curtos) em cada; depois um curto por cobrança e os 3 do fim.
    const s = m.shootout!;
    const kicksTaken = s.kicks[0].length + s.kicks[1].length;
    expect(whistles.slice(0, 8)).toEqual(['short', 'double', 'short', 'double', 'short', 'double', 'short', 'double']);
    expect(whistles.slice(8, 8 + kicksTaken)).toEqual(Array(kicksTaken).fill('short'));
    expect(whistles.slice(8 + kicksTaken)).toEqual(['final']);
    // Sem toques (IDLE), a saída sai sozinha pelo prazo: 4 passes de saída + os do goleiro.
    expect(sounds.filter((s) => s.type === 'pass').length).toBeGreaterThanOrEqual(4);
    // Um chute por cobrança.
    const penKicks = sounds.filter((x) => x.type === 'kick');
    expect(penKicks).toHaveLength(kicksTaken);
  });
});

describe('soundCues (puro)', () => {
  it('converte cada evento no seu som e usa o X da bola', () => {
    const cues = soundCues(
      [
        { type: 'shot', player: 4, charge: 0.8, speed: 21 },
        { type: 'pass', player: 3, target: 4 },
        { type: 'save', player: 5, result: 'catch' },
        { type: 'tackleStart', player: 2 },
        { type: 'contact', kind: 'post', speed: 9 },
      ],
      [{ type: 'whistle' }, { type: 'penaltyKick', team: 0, power: 0.4 }, { type: 'penaltyResult', team: 0, result: 'goal' }],
      12.5,
    );
    expect(cues).toEqual([
      { type: 'kick', x: 12.5, power: 0.8 },
      { type: 'pass', x: 12.5 },
      { type: 'save', x: 12.5 },
      { type: 'whistle', x: 12.5, pattern: 'short' },
      { type: 'kick', x: 12.5, power: 0.4 },
      { type: 'goal', x: 12.5 },
    ]);
  });

  it('fim de período: 2 apitos; com o apito final no mesmo passo, só os 3 do fim', () => {
    expect(soundCues([], [{ type: 'periodEnd', period: '1T' }], 20)).toEqual([{ type: 'whistle', x: 20, pattern: 'double' }]);
    expect(soundCues([], [{ type: 'periodEnd', period: '2T' }, { type: 'finalWhistle' }], 20)).toEqual([
      { type: 'whistle', x: 20, pattern: 'final' },
    ]);
    expect(soundCues([], [{ type: 'finalWhistle' }], 20)).toEqual([{ type: 'whistle', x: 20, pattern: 'final' }]);
  });

  it('pênalti perdido não toca gol; força fora de 0..1 é limitada', () => {
    expect(soundCues([], [{ type: 'penaltyResult', team: 1, result: 'saved' }], 34)).toEqual([]);
    expect(soundCues([{ type: 'shot', player: 1, charge: 1.7, speed: 30 }], [], 0)).toEqual([{ type: 'kick', x: 0, power: 1 }]);
    expect(soundCues([{ type: 'shot', player: 1, charge: Number.NaN, speed: 30 }], [], 0)).toEqual([{ type: 'kick', x: 0, power: 0 }]);
  });
});
