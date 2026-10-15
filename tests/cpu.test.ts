import { describe, expect, it } from 'vitest';
import {
  CPU_LEVELS,
  CPU_PEN_CORNER_OFFSET,
  CPU_PEN_POWER,
  EXTRA_HALF_DURATION,
  GOAL_CELEBRATION_DURATION,
  KICKOFF_DELAY,
  KICKOFF_PASS_DEADLINE,
  PEN_TIME_LIMIT,
  PLAYER_RUN_SPEED,
  SHOT_CHARGE_TIME,
  SIM_DT,
} from '../src/config/constants';
import { sideLabel } from '../src/core/modes';
import { aiTarget, toAttackFrame } from '../src/sim/ai';
import { placeBall } from '../src/sim/ball';
import { emptyCommand, isValidCommand } from '../src/sim/command';
import type { CommandSource, TeamCommand } from '../src/sim/command';
import { CPU_LEVEL_IDS, CpuSource, isCpuLevel } from '../src/sim/cpu';
import type { CpuLevel } from '../src/sim/cpu';
import type { SimEvent } from '../src/sim/events';
import { goalLineX } from '../src/sim/field';
import { createMatch, drainMatchEvents, drainSounds, setupKickoff, stepMatch } from '../src/sim/match';
import type { Match } from '../src/sim/match';
import { attackedGoal, drainEvents, getPlayer, givePossession, playerId } from '../src/sim/world';
import { clearPlayers } from './helpers/sim';

/** Fonte parada (o adversário que não faz nada). */
const IDLE_SOURCE: CommandSource = { getCommand: () => emptyCommand() };

interface RunLog {
  events: SimEvent[];
  /** Comandos de cada time, por tick. */
  commands: [TeamCommand[], TeamCommand[]];
  /** Comandos dados durante a comemoração de gol. */
  celebration: [TeamCommand[], TeamCommand[]];
  /** Maior velocidade de um jogador de pé, por time. */
  maxSpeed: [number, number];
  ticks: number;
}

/** Roda a partida com as duas fontes até `stop` (ou o fim), guardando eventos e comandos. */
function play(m: Match, sources: [CommandSource, CommandSource], stop: (m: Match) => boolean = (mm) => mm.over, maxTicks = 60 * 60 * 15): RunLog {
  const log: RunLog = { events: [], commands: [[], []], celebration: [[], []], maxSpeed: [0, 0], ticks: 0 };
  for (let tick = 0; tick < maxTicks && !stop(m); tick++) {
    const c: [TeamCommand, TeamCommand] = [sources[0].getCommand(tick), sources[1].getCommand(tick)];
    for (const t of [0, 1] as const) {
      log.commands[t].push(c[t]);
      if (m.phase === 'COMEMORACAO_GOL') log.celebration[t].push(c[t]);
    }
    stepMatch(m, c, SIM_DT);
    for (const p of m.world.players) {
      if (p.state === 'normal') log.maxSpeed[p.team] = Math.max(log.maxSpeed[p.team], Math.hypot(p.vx, p.vy));
    }
    log.events.push(...drainEvents(m.world));
    drainMatchEvents(m);
    drainSounds(m);
    log.ticks++;
  }
  return log;
}

const teamOf = (id: number): 0 | 1 => (id < 5 ? 0 : 1);
const count = (log: RunLog, type: SimEvent['type'], team: 0 | 1): number =>
  log.events.filter((e) => e.type === type && 'player' in e && teamOf(e.player) === team).length;

/** Coloca a partida em jogo corrido, sem a saída de bola. */
function inPlay(m: Match): void {
  m.phase = 'JOGANDO';
  m.phaseTimer = 0;
  m.kickoffLive = false;
}

describe('níveis do CPU', () => {
  it('três níveis; a dificuldade não tem parâmetro de velocidade nem de goleiro', () => {
    expect(CPU_LEVEL_IDS).toEqual(['facil', 'medio', 'dificil']);
    for (const id of CPU_LEVEL_IDS) expect(isCpuLevel(id)).toBe(true);
    expect(isCpuLevel('impossivel')).toBe(false);
    expect(isCpuLevel(undefined)).toBe(false);
    const keys = Object.keys(CPU_LEVELS.facil).sort();
    for (const id of CPU_LEVEL_IDS) expect(Object.keys(CPU_LEVELS[id]).sort()).toEqual(keys);
    for (const k of keys) expect(k).not.toMatch(/speed|velocidade|keeper|goleiro|gk/i);
    expect(CPU_LEVELS.facil.tackleChance).toBe(0);
  });

  it('nas telas, o lado do CPU aparece como COMPUTADOR (só no solo)', () => {
    expect(sideLabel('solo', 0)).toBe('JOGADOR 1');
    expect(sideLabel('solo', 1)).toBe('COMPUTADOR');
    expect(sideLabel('local', 1)).toBe('JOGADOR 2');
    expect(sideLabel('online', 1, 1)).toBe('VOCÊ');
    expect(sideLabel('online', 0, 1)).toBe('ADVERSÁRIO');
    expect(sideLabel('online', 0)).toBe('JOGADOR 1');
  });

  it('criar o CPU só liga as infiltrações dos companheiros (nada de velocidade, física ou goleiro)', () => {
    for (const level of CPU_LEVEL_IDS) {
      const plain = createMatch(5);
      const withCpu = createMatch(5);
      new CpuSource(withCpu, 1, level, 1);
      expect(withCpu.world.aiAttackBoost).toEqual([0, CPU_LEVELS[level].infiltration]);
      withCpu.world.aiAttackBoost = [0, 0];
      expect(withCpu).toEqual(plain);
    }
  });

  it('infiltrações: com agressividade, os companheiros avançam mais no ataque e os alas fecham para o meio', () => {
    const m = createMatch(3);
    const w = m.world;
    w.controlled = [playerId(0, 'FIXO'), playerId(1, 'FIXO')];
    givePossession(w, getPlayer(w, playerId(1, 'FIXO')));
    const ala = getPlayer(w, playerId(1, 'ALA_E'));
    const before = toAttackFrame(w, 1, aiTarget(w, ala, null).x, aiTarget(w, ala, null).y);
    w.aiAttackBoost[1] = 1;
    const t = aiTarget(w, ala, null);
    const after = toAttackFrame(w, 1, t.x, t.y);
    expect(after.u).toBeGreaterThan(before.u);
    expect(Math.abs(after.v - 10)).toBeLessThan(Math.abs(before.v - 10));
    // O outro time não muda.
    const rival = getPlayer(w, playerId(0, 'ALA_E'));
    const r0 = aiTarget(w, rival, null);
    w.aiAttackBoost[1] = 0;
    expect(aiTarget(w, rival, null)).toEqual(r0);
  });
});

describe('CPU em partidas inteiras', () => {
  // Fácil (J1) contra Difícil (J2) e Médio contra Médio: as mesmas regras e a mesma física.
  const runs = (
    [
      ['facil', 'dificil', 31],
      ['medio', 'medio', 32],
    ] as const
  ).map(([a, b, seed]) => {
    const m = createMatch(seed);
    const log = play(m, [new CpuSource(m, 0, a, seed * 3 + 1), new CpuSource(m, 1, b, seed * 7 + 2)]);
    return { levels: [a, b] as [CpuLevel, CpuLevel], m, log };
  });

  it('a partida termina e o CPU só envia comandos válidos', () => {
    for (const { m, log } of runs) {
      expect(m.over).toBe(true);
      for (const t of [0, 1] as const) for (const c of log.commands[t]) expect(isValidCommand(c)).toBe(true);
    }
  });

  it('ninguém passa da velocidade de corrida, em nenhum nível', () => {
    for (const { log } of runs) {
      expect(log.maxSpeed[0]).toBeLessThanOrEqual(PLAYER_RUN_SPEED + 1e-9);
      expect(log.maxSpeed[1]).toBeLessThanOrEqual(PLAYER_RUN_SPEED + 1e-9);
    }
  });

  it('o Fácil nunca dá carrinho; o Médio e o Difícil dão', () => {
    const [fd, mm] = runs;
    expect(count(fd!.log, 'tackleStart', 0)).toBe(0);
    expect(count(fd!.log, 'tackleStart', 1)).toBeGreaterThan(0);
    expect(count(mm!.log, 'tackleStart', 0) + count(mm!.log, 'tackleStart', 1)).toBeGreaterThan(0);
  });

  it('conduz, passa e chuta', () => {
    for (const { log } of runs) for (const t of [0, 1] as const) expect(count(log, 'pass', t)).toBeGreaterThan(5);
    // Chutes: os dois Médios e o Difícil (o Fácil, contra o Difícil, quase não chega).
    const [fd, mm] = runs;
    expect(count(fd!.log, 'shot', 1)).toBeGreaterThan(5);
    expect(count(mm!.log, 'shot', 0)).toBeGreaterThan(0);
    expect(count(mm!.log, 'shot', 1)).toBeGreaterThan(0);
  });

  it('nunca aperta o passe na comemoração do gol (não pula a comemoração do adversário)', () => {
    let seen = 0;
    for (const { log } of runs) {
      for (const t of [0, 1] as const) {
        seen += log.celebration[t].length;
        for (const c of log.celebration[t]) expect(c.passPressed).toBe(false);
      }
    }
    // Houve gols (e a comemoração durou o tempo todo, sem ninguém pular).
    expect(seen).toBeGreaterThanOrEqual(2 * Math.round(GOAL_CELEBRATION_DURATION / SIM_DT));
  });

  it('o mais difícil vence o mais fácil', () => {
    const fd = runs[0]!.m;
    expect(fd.score[1]).toBeGreaterThan(fd.score[0]);
  });

  it('a mesma semente dá a mesma partida', () => {
    const m = createMatch(32);
    const log = play(m, [new CpuSource(m, 0, 'medio', 32 * 3 + 1), new CpuSource(m, 1, 'medio', 32 * 7 + 2)]);
    expect(m.score).toEqual(runs[1]!.m.score);
    expect(log.commands).toEqual(runs[1]!.log.commands);
  });
});

describe('CPU: lances', () => {
  it('saída de bola: mira um companheiro do próprio campo e passa antes do prazo', () => {
    for (const level of CPU_LEVEL_IDS) {
      const m = createMatch(8);
      setupKickoff(m, 1);
      const log = play(m, [IDLE_SOURCE, new CpuSource(m, 1, level, 4)], (mm) => mm.phase === 'JOGANDO', 600);
      expect(m.phase).toBe('JOGANDO');
      expect(log.ticks * SIM_DT).toBeLessThan(KICKOFF_DELAY + KICKOFF_PASS_DEADLINE - 1);
      const pass = log.events.find((e) => e.type === 'pass');
      if (pass?.type !== 'pass') throw new Error('sem passe');
      expect(pass.player).toBe(playerId(1, 'ATA'));
      expect(pass.target).not.toBeNull();
      const r = getPlayer(m.world, pass.target!);
      expect(r.team).toBe(1);
      expect(r.role).not.toBe('GK');
    }
  });

  it('chute: com o ângulo aberto, chuta no canto mais longe do goleiro', () => {
    for (const level of CPU_LEVEL_IDS) {
      const m = createMatch(9);
      inPlay(m);
      const w = m.world;
      clearPlayers(w);
      const side = attackedGoal(w, 1);
      const lineX = goalLineX(side);
      const dir = side === 0 ? 1 : -1;
      // Goleiro adversário um pouco para um lado (Y menor); atacante do CPU a 7 m, de frente.
      const gk = getPlayer(w, playerId(0, 'GK'));
      gk.x = lineX + dir * 0.6;
      gk.y = 9.4;
      const ata = getPlayer(w, playerId(1, 'ATA'));
      ata.x = lineX + dir * 7.5;
      ata.y = 10;
      ata.facing = side === 0 ? Math.PI : 0;
      w.controlled[1] = ata.id;
      givePossession(w, ata);
      w.ball.x = ata.x - dir * 0.45;
      w.ball.y = ata.y;
      const log = play(m, [IDLE_SOURCE, new CpuSource(m, 1, level, 6)], (mm) => mm.world.ball.owner === null, 180);
      const shot = log.events.find((e) => e.type === 'shot');
      expect(shot, level).toBeDefined();
      expect(log.ticks * SIM_DT).toBeLessThan(CPU_LEVELS[level].reactionTime * 1.25 + CPU_LEVELS[level].decisionInterval * 1.25 + SHOT_CHARGE_TIME);
      // Onde a bola cruza a linha do gol: do lado oposto ao goleiro (Y maior que o centro).
      const b = w.ball;
      const t = (lineX - b.x) / b.vx;
      expect(t).toBeGreaterThan(0);
      expect(b.y + b.vy * t, level).toBeGreaterThan(10);
    }
  });

  // O erro aceito é menor que o balanço do cursor (PEN_SWAY_AMPLITUDE): o CPU compensa o balanço.
  it('pênaltis: escolhe o canto e a força com o erro do nível, sempre antes do prazo', () => {
    for (const level of CPU_LEVEL_IDS) {
      const m = createMatch(12);
      inPlay(m);
      m.period = 'PR2';
      m.clock = EXTRA_HALF_DURATION - SIM_DT / 2;
      const p = CPU_LEVELS[level];
      const kicks: { offset: number; power: number; aimTime: number }[] = [];
      const sources: [CommandSource, CommandSource] = [new CpuSource(m, 0, level, 2), new CpuSource(m, 1, level, 3)];
      for (let tick = 0; tick < 60 * 120 && !m.over; tick++) {
        const c: [TeamCommand, TeamCommand] = [sources[0].getCommand(tick), sources[1].getCommand(tick)];
        const a = m.attempt;
        const aiming = a?.phase === 'aiming';
        stepMatch(m, c, SIM_DT);
        if (aiming && a.plan) kicks.push({ offset: a.plan.offset, power: a.plan.power, aimTime: a.aimTime });
        drainEvents(m.world);
        drainMatchEvents(m);
        drainSounds(m);
      }
      expect(m.over).toBe(true);
      expect(m.shootout?.winner).not.toBeNull();
      expect(kicks.length).toBeGreaterThanOrEqual(6);
      for (const k of kicks) {
        expect(k.aimTime).toBeLessThan(PEN_TIME_LIMIT);
        const side = Math.abs(Math.abs(k.offset) - CPU_PEN_CORNER_OFFSET);
        expect(Math.min(side, Math.abs(k.offset)), level).toBeLessThanOrEqual(p.penaltyAimError + 0.03);
        expect(Math.abs(k.power - CPU_PEN_POWER), level).toBeLessThanOrEqual(p.penaltyPowerError + SIM_DT / SHOT_CHARGE_TIME);
      }
    }
  });

  it('tempo de reação: ao perder a bola, continua o que fazia até perceber', () => {
    const m = createMatch(15);
    inPlay(m);
    const w = m.world;
    const level: CpuLevel = 'facil';
    const cpu = new CpuSource(m, 1, level, 7);
    // Bola solta rolando: o CPU vai atrás dela.
    w.ball.owner = null;
    placeBall(w.ball, 24, 6, 0);
    w.ball.vx = -3;
    w.ball.vy = 2;
    let tick = 0;
    for (; tick < 60; tick++) stepMatch(m, [emptyCommand(), cpu.getCommand(tick)], SIM_DT);
    const before = cpu.getCommand(tick - 1);
    expect(Math.hypot(before.moveX, before.moveY)).toBeGreaterThan(0.5);
    // O adversário domina a bola: durante a reação mínima, o comando de movimento não muda.
    givePossession(w, getPlayer(w, playerId(0, 'ALA_E')));
    const minReaction = CPU_LEVELS[level].reactionTime * 0.8;
    for (let i = 0; i * SIM_DT < minReaction - SIM_DT; i++, tick++) {
      const c = cpu.getCommand(tick);
      expect(c.moveX).toBe(before.moveX);
      expect(c.moveY).toBe(before.moveY);
      expect(c.passPressed || c.shootPressed).toBe(false);
      stepMatch(m, [emptyCommand(), c], SIM_DT);
    }
  });

  it('o mesmo tick devolve o mesmo comando', () => {
    const m = createMatch(16);
    const cpu = new CpuSource(m, 1, 'dificil', 1);
    for (let tick = 0; tick < 200; tick++) {
      const a = cpu.getCommand(tick);
      expect(cpu.getCommand(tick)).toBe(a);
      stepMatch(m, [emptyCommand(), a], SIM_DT);
    }
  });
});
