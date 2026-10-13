import { describe, expect, it } from 'vitest';
import {
  EXTRA_HALF_DURATION,
  GOAL_CELEBRATION_DURATION,
  HALF_DURATION,
  INTERTITLE_DURATION,
  KICKOFF_DELAY,
  KICKOFF_PASS_DEADLINE,
  SIM_DT,
} from '../src/config/constants';
import { emptyPlayerInput } from '../src/core/input';
import type { PlayerInput } from '../src/core/input';
import { placeBall } from '../src/sim/ball';
import { createMatch, formatClock, stepMatch, teamAttacking } from '../src/sim/match';
import type { Match } from '../src/sim/match';
import { getPlayer, playerId } from '../src/sim/world';
import type { HumanInputs } from '../src/sim/world';
import { withButtons } from './helpers/sim';

const IDLE: HumanInputs = [emptyPlayerInput(), emptyPlayerInput()];

function run(m: Match, seconds: number, inputs: HumanInputs = IDLE): void {
  const n = Math.round(seconds / SIM_DT);
  for (let i = 0; i < n; i++) stepMatch(m, inputs, SIM_DT);
}

/** Roda até a partida entrar no estado pedido (ou estoura). */
function runUntil(m: Match, pred: (m: Match) => boolean, maxSeconds = 400): void {
  const n = Math.round(maxSeconds / SIM_DT);
  for (let i = 0; i < n; i++) {
    if (pred(m)) return;
    stepMatch(m, IDLE, SIM_DT);
  }
  throw new Error(`condição não atingida; fase=${m.phase} período=${m.period}`);
}

/** Faz um gol no gol do lado `side` (bola chutada de perto, sem ninguém no caminho). */
function scoreIn(m: Match, side: 0 | 1, lastTouchTeam: 0 | 1): void {
  const w = m.world;
  w.ball.owner = null;
  placeBall(w.ball, side === 0 ? 3 : 37, 10, 0);
  w.ball.vx = side === 0 ? -15 : 15;
  w.ball.lastTouch = playerId(lastTouchTeam, 'ATA');
  // Sem IA durante o lance (goleiros fora), para o gol ser garantido.
  w.aiEnabled = false;
  for (const p of w.players) if (p.role === 'GK') p.y = p.team === 0 ? 1 : 19;
  runUntil(m, (mm) => mm.phase === 'COMEMORACAO_GOL', 3);
  w.aiEnabled = true;
}

/** Entrada de um humano: direção e, opcionalmente, um toque no passe ou no chute. */
function aim(x: number, y: number, button: 'pass' | 'shoot' | null = null): PlayerInput {
  const i: PlayerInput = { ...emptyPlayerInput(), moveX: x, moveY: y };
  const tap = { down: false, pressed: true, released: true };
  if (button === 'pass') i.pass = tap;
  if (button === 'shoot') i.shoot = tap;
  return i;
}

/** Espera o apito da saída e dá o passe (para trás) com o time que sai. */
function startPlaying(m: Match): void {
  runUntil(m, (mm) => mm.kickoffLive, 5);
  const inputs: HumanInputs = [emptyPlayerInput(), emptyPlayerInput()];
  inputs[m.kickoffTeam] = withButtons(emptyPlayerInput(), 'tap');
  stepMatch(m, inputs, SIM_DT);
  expect(m.phase).toBe('JOGANDO');
}

describe('saída de bola', () => {
  it('começa em SAIDA_DE_BOLA com o J1, bola no centro com o atacante', () => {
    const m = createMatch();
    expect(m.phase).toBe('SAIDA_DE_BOLA');
    expect(m.period).toBe('1T');
    expect(m.kickoffTeam).toBe(0);
    expect(m.world.ball.owner).toBe(playerId(0, 'ATA'));
    expect(m.world.ball.x).toBeCloseTo(20, 6);
    expect(m.world.ball.y).toBeCloseTo(10, 6);
  });

  it('o atacante adversário fica fora do círculo central', () => {
    const m = createMatch();
    const rival = getPlayer(m.world, playerId(1, 'ATA'));
    expect(Math.hypot(rival.x - 20, rival.y - 10)).toBeGreaterThan(3);
  });

  it('apita depois de 1 s; ninguém se mexe antes', () => {
    const m = createMatch();
    const p = getPlayer(m.world, playerId(0, 'ATA'));
    const x0 = p.x;
    const push: HumanInputs = [aim(1, 0), aim(-1, 0)];
    run(m, KICKOFF_DELAY - 0.05, push);
    expect(m.kickoffLive).toBe(false);
    expect(p.x).toBe(x0);
    run(m, 0.1, push);
    expect(m.kickoffLive).toBe(true);
    expect(m.events.some((e) => e.type === 'whistle')).toBe(true);
  });

  it('depois do apito o batedor não sai andando com a bola: só gira em volta dela', () => {
    const m = createMatch();
    const p = getPlayer(m.world, playerId(0, 'ATA'));
    const rival = getPlayer(m.world, playerId(1, 'ATA'));
    const r0 = { x: rival.x, y: rival.y };
    run(m, KICKOFF_DELAY + 2, [aim(1, 0.3), aim(-1, 0)]);
    expect(m.phase).toBe('SAIDA_DE_BOLA');
    expect(m.world.ball.owner).toBe(p.id);
    expect(m.world.ball.x).toBeCloseTo(20, 6);
    expect(m.world.ball.y).toBeCloseTo(10, 6);
    expect(Math.hypot(p.x - 20, p.y - 10)).toBeCloseTo(0.45, 2);
    expect({ x: rival.x, y: rival.y }).toEqual(r0);
    expect(m.clock).toBe(0);
  });

  it('a mira fica no próprio campo: nunca aponta para o gol adversário', () => {
    const m = createMatch();
    // O J1 defende a esquerda: mirar no próprio campo é ter componente x <= 0.
    for (const [x, y] of [[1, 0], [1, 1], [1, -1], [0, 1], [-1, 1], [0, -1], [1, 0]] as const) {
      run(m, 0.5, [aim(x, y), emptyPlayerInput()]);
      expect(Math.cos(m.kickoffAim)).toBeLessThanOrEqual(1e-9);
    }
    // Para cima e para trás: mira entre o gol e a lateral de cima.
    run(m, 0.5, [aim(-1, -1), emptyPlayerInput()]);
    expect(Math.cos(m.kickoffAim)).toBeLessThan(-0.5);
    expect(Math.sin(m.kickoffAim)).toBeLessThan(-0.5);
  });

  it('o passe vai para um companheiro no próprio campo e põe a bola em jogo', () => {
    const m = createMatch();
    run(m, KICKOFF_DELAY + 0.5, [aim(-1, -1), emptyPlayerInput()]);
    stepMatch(m, [aim(-1, -1, 'pass'), emptyPlayerInput()], SIM_DT);
    expect(m.phase).toBe('JOGANDO');
    const receiver = getPlayer(m.world, playerId(0, 'ALA_E'));
    expect(m.world.passLock?.receiver).toBe(receiver.id);
    expect(m.world.controlled[0]).toBe(receiver.id);
    expect(m.world.ball.owner).toBeNull();
    expect(m.world.ball.vx).toBeLessThan(0);
    expect(receiver.x).toBeLessThan(20);
    // Depois disso o jogo corre normalmente (relógio andando).
    run(m, 1);
    expect(m.clock).toBeGreaterThan(0.9);
  });

  it('o chute não tira a bola na saída', () => {
    const m = createMatch();
    run(m, KICKOFF_DELAY + 0.2);
    stepMatch(m, [aim(-1, 0, 'shoot'), emptyPlayerInput()], SIM_DT);
    run(m, 0.3);
    expect(m.phase).toBe('SAIDA_DE_BOLA');
    expect(m.world.ball.owner).toBe(playerId(0, 'ATA'));
  });

  it('se ninguém passar, a bola sai sozinha para trás depois do prazo', () => {
    const m = createMatch();
    run(m, KICKOFF_DELAY + KICKOFF_PASS_DEADLINE - 0.1);
    expect(m.phase).toBe('SAIDA_DE_BOLA');
    run(m, 0.2);
    expect(m.phase).toBe('JOGANDO');
    const pass = m.world.events.find((e) => e.type === 'pass');
    expect(pass && pass.type === 'pass' && pass.target !== null).toBe(true);
    expect(m.world.ball.vx).toBeLessThan(0);
  });

  it('o J2 também passa só para o próprio campo (a direita no 1º tempo)', () => {
    const m = createMatch();
    startPlaying(m);
    scoreIn(m, 1, 0);
    runUntil(m, (mm) => mm.phase === 'SAIDA_DE_BOLA', 5);
    run(m, KICKOFF_DELAY + 0.5, [emptyPlayerInput(), aim(-1, 0)]);
    expect(Math.cos(m.kickoffAim)).toBeGreaterThanOrEqual(-1e-9);
    stepMatch(m, [emptyPlayerInput(), aim(-1, 0, 'pass')], SIM_DT);
    expect(m.phase).toBe('JOGANDO');
    expect(m.world.ball.vx).toBeGreaterThan(0);
  });
});

describe('relógio', () => {
  it('só corre em JOGANDO', () => {
    const m = createMatch();
    run(m, KICKOFF_DELAY - 0.1);
    expect(m.clock).toBe(0);
    startPlaying(m);
    run(m, 10);
    expect(m.clock).toBeCloseTo(10, 1);
    scoreIn(m, 1, 0);
    const c = m.clock;
    run(m, 1.5);
    expect(m.phase).toBe('COMEMORACAO_GOL');
    expect(m.clock).toBe(c);
  });

  it('formata como 01:12', () => {
    expect(formatClock(72)).toBe('01:12');
    expect(formatClock(0)).toBe('00:00');
    expect(formatClock(90)).toBe('01:30');
  });
});

describe('gol', () => {
  it('soma para quem ataca aquele gol e a saída é de quem tomou', () => {
    const m = createMatch();
    startPlaying(m);
    scoreIn(m, 1, 0);
    expect(m.score).toEqual([1, 0]);
    expect(m.kickoffTeam).toBe(1);
    expect(m.goals[0]).toMatchObject({ team: 0, ownGoal: false, period: '1T' });
  });

  it('gol contra conta para o adversário', () => {
    const m = createMatch();
    startPlaying(m);
    scoreIn(m, 0, 0); // J1 chuta no próprio gol
    expect(m.score).toEqual([0, 1]);
    expect(m.goals[0]?.ownGoal).toBe(true);
  });

  it('comemoração dura ~3 s e volta para a saída de bola do time que tomou', () => {
    const m = createMatch();
    startPlaying(m);
    scoreIn(m, 1, 0);
    run(m, GOAL_CELEBRATION_DURATION - 0.1);
    expect(m.phase).toBe('COMEMORACAO_GOL');
    run(m, 0.2);
    expect(m.phase).toBe('SAIDA_DE_BOLA');
    expect(m.world.ball.owner).toBe(playerId(1, 'ATA'));
  });

  it('botão de passe pula a comemoração só depois de 1 s', () => {
    const m = createMatch();
    startPlaying(m);
    scoreIn(m, 1, 0);
    const skip: HumanInputs = [emptyPlayerInput(), withButtons(emptyPlayerInput(), 'tap')];
    stepMatch(m, skip, SIM_DT);
    expect(m.phase).toBe('COMEMORACAO_GOL');
    run(m, 1);
    stepMatch(m, skip, SIM_DT);
    expect(m.phase).toBe('SAIDA_DE_BOLA');
  });
});

describe('tempos, intervalo e troca de lado', () => {
  it('2 tempos de 90 s; no intervalo há cartão de 2 s e os times trocam de lado', () => {
    const m = createMatch();
    startPlaying(m);
    run(m, HALF_DURATION - 1);
    expect(m.phase).toBe('JOGANDO');
    runUntil(m, (mm) => mm.phase === 'INTERVALO', 2);
    expect(m.intertitle).toBe('FIM DO 1º TEMPO');
    expect(m.world.defends).toEqual([0, 1]);
    run(m, INTERTITLE_DURATION + SIM_DT);
    expect(m.period).toBe('2T');
    expect(m.phase).toBe('SAIDA_DE_BOLA');
    expect(m.world.defends).toEqual([1, 0]);
    // 2º tempo: saída do J2.
    expect(m.kickoffTeam).toBe(1);
    expect(m.clock).toBe(0);
  });

  it('depois da troca, o gol à direita é do J2', () => {
    const m = createMatch();
    startPlaying(m);
    runUntil(m, (mm) => mm.period === '2T' && mm.phase === 'JOGANDO');
    expect(teamAttacking(m.world, 0)).toBe(0);
    expect(teamAttacking(m.world, 1)).toBe(1);
    scoreIn(m, 1, 1);
    expect(m.score).toEqual([0, 1]);
  });

  it('vitória no tempo normal termina a partida', () => {
    const m = createMatch();
    startPlaying(m);
    scoreIn(m, 1, 0);
    runUntil(m, (mm) => mm.phase === 'FIM');
    expect(m.period).toBe('2T');
    expect(m.intertitle).toBe('FIM DE JOGO');
    run(m, INTERTITLE_DURATION + SIM_DT);
    expect(m.over).toBe(true);
  });

  it('empate: prorrogação de 2 x 30 s, troca na 2ª metade, depois pênaltis', () => {
    const m = createMatch();
    runUntil(m, (mm) => mm.phase === 'PRORROGACAO');
    expect(m.intertitle).toBe('PRORROGAÇÃO');
    runUntil(m, (mm) => mm.period === 'PR1' && mm.phase === 'JOGANDO');
    const sidesPR1 = [...m.world.defends];
    run(m, EXTRA_HALF_DURATION - 1);
    expect(m.phase).toBe('JOGANDO');
    runUntil(m, (mm) => mm.phase === 'INTERVALO');
    runUntil(m, (mm) => mm.period === 'PR2');
    expect(m.world.defends).toEqual([sidesPR1[1], sidesPR1[0]]);
    runUntil(m, (mm) => mm.phase === 'PENALTIS');
    expect(m.intertitle).toBe('PÊNALTIS');
  });

  it('prorrogação sem gol de ouro: gol não encerra, joga-se o tempo todo', () => {
    const m = createMatch();
    runUntil(m, (mm) => mm.period === 'PR1' && mm.phase === 'JOGANDO');
    scoreIn(m, m.world.defends[0] === 0 ? 1 : 0, 0);
    expect(m.score).toEqual([1, 0]);
    run(m, 5);
    expect(m.phase === 'SAIDA_DE_BOLA' || m.phase === 'JOGANDO').toBe(true);
    runUntil(m, (mm) => mm.phase === 'FIM');
    expect(m.period).toBe('PR2');
  });
});
