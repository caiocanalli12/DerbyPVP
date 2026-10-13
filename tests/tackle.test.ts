import { describe, expect, it } from 'vitest';
import {
  SIM_DT,
  TACKLE_BALL_SPEED,
  TACKLE_COOLDOWN,
  TACKLE_DISTANCE,
  TACKLE_DURATION,
  TACKLE_FALLEN_TIME,
  TACKLE_STUMBLE_TIME,
} from '../src/config/constants';
import { placeBall } from '../src/sim/ball';
import { createPlayer } from '../src/sim/player';
import {
  integrateSlide,
  isTackleActive,
  slideSpeedAt,
  startTackle,
  TACKLE_WINDOW_END,
  TACKLE_WINDOW_START,
  updateBodyState,
} from '../src/sim/tackle';
import { createWorld, getPlayer, givePossession, playerId } from '../src/sim/world';
import type { World } from '../src/sim/world';
import { clearPlayers, idle, move, steps, withButtons } from './helpers/sim';

const tackleBtn = (x = 0, y = 0) => withButtons(move(x, y), 'none', 'tap');

function put(w: World, id: number, x: number, y: number, facing = 0): void {
  const p = getPlayer(w, id);
  p.x = x;
  p.y = y;
  p.prevX = x;
  p.prevY = y;
  p.vx = 0;
  p.vy = 0;
  p.facing = facing;
}

/**
 * J1 (atacante, controlado) em (10, 10) virado para +x; J2 conduz a bola parado em
 * (10 + gap, 10), virado para -x (bola entre os dois).
 */
function duel(gap: number): World {
  const w = createWorld();
  clearPlayers(w);
  put(w, playerId(0, 'ATA'), 10, 10, 0);
  put(w, playerId(1, 'ATA'), 10 + gap, 10, Math.PI);
  w.controlled = [playerId(0, 'ATA'), playerId(1, 'ATA')];
  w.controlSwitchTimer = [0, 0];
  givePossession(w, getPlayer(w, playerId(1, 'ATA')));
  steps(w, 1);
  return w;
}

describe('janela ativa', () => {
  it('dura 0,12 s, no meio do deslize de 0,35 s', () => {
    expect(TACKLE_WINDOW_END - TACKLE_WINDOW_START).toBeCloseTo(0.12, 10);
    expect((TACKLE_WINDOW_START + TACKLE_WINDOW_END) / 2).toBeCloseTo(TACKLE_DURATION / 2, 10);
  });

  it('isTackleActive só é verdadeiro dentro da janela', () => {
    const p = createPlayer(0, 0, 'ATA');
    startTackle(p, 1, 0);
    const active: number[] = [];
    for (let i = 0; i < 40; i++) {
      updateBodyState(p, SIM_DT);
      if (p.state === 'tackling') integrateSlide(p, SIM_DT);
      if (isTackleActive(p)) active.push(p.stateTimer);
    }
    expect(p.state).not.toBe('tackling');
    expect(active.length).toBeGreaterThan(0);
    for (const t of active) {
      expect(t).toBeGreaterThanOrEqual(TACKLE_WINDOW_START - 1e-9);
      expect(t).toBeLessThanOrEqual(TACKLE_WINDOW_END + 1e-9);
    }
  });

  it('acerta quando a bola entra na hitbox dentro da janela', () => {
    // Bola do J2 a ~1,6 m: o pé chega nela no meio do deslize.
    const w = duel(2.1);
    const victim = getPlayer(w, playerId(1, 'ATA'));
    steps(w, 1, [tackleBtn(1, 0), idle()]);
    let hitAt = -1;
    for (let i = 0; i < 30 && hitAt < 0; i++) {
      steps(w, 1);
      if (w.ball.owner === null) hitAt = getPlayer(w, playerId(0, 'ATA')).stateTimer;
    }
    expect(hitAt).toBeGreaterThanOrEqual(TACKLE_WINDOW_START - 1e-9);
    expect(hitAt).toBeLessThanOrEqual(TACKLE_WINDOW_END + 1e-9);
    expect(victim.state).toBe('stumbling');
    expect(w.events.some((e) => e.type === 'tackle' && e.result === 'steal')).toBe(true);
  });

  it('bola ao alcance ANTES da janela: nenhum efeito até a janela abrir', () => {
    // Bola já colada no pé desde o início.
    const w = duel(1.0);
    steps(w, 1, [tackleBtn(1, 0), idle()]);
    const t = getPlayer(w, playerId(0, 'ATA'));
    while (t.stateTimer < TACKLE_WINDOW_START - SIM_DT * 1.5) {
      steps(w, 1);
      expect(w.ball.owner).toBe(playerId(1, 'ATA'));
    }
    steps(w, 3);
    expect(w.ball.owner).toBeNull();
  });

  it('bola só ao alcance DEPOIS da janela: nenhum efeito e o jogador cai', () => {
    // Bola a ~3 m: o pé só chega perto no fim do deslize (depois da janela).
    const w = duel(3.75);
    steps(w, 1, [tackleBtn(1, 0), idle()]);
    const t = getPlayer(w, playerId(0, 'ATA'));
    let stolen = false;
    for (let i = 0; i < Math.ceil(TACKLE_DURATION / SIM_DT) + 2; i++) {
      steps(w, 1);
      if (w.ball.owner !== playerId(1, 'ATA')) stolen = true;
    }
    expect(stolen).toBe(false);
    expect(t.state).toBe('fallen');
  });
});

describe('resultado da dividida', () => {
  it('roubo: bola sai a 6 m/s na direção do carrinho e o adversário cambaleia 0,5 s sem controle', () => {
    const w = duel(2.1);
    const victim = getPlayer(w, playerId(1, 'ATA'));
    steps(w, 1, [tackleBtn(1, 0), idle()]);
    while (w.ball.owner !== null) steps(w, 1);
    expect(Math.hypot(w.ball.vx, w.ball.vy)).toBeCloseTo(TACKLE_BALL_SPEED, 0);
    expect(w.ball.vx).toBeGreaterThan(0);
    // Sem controle: o J2 aperta para a esquerda, mas não anda.
    const x0 = victim.x;
    steps(w, Math.floor((TACKLE_STUMBLE_TIME * 0.8) / SIM_DT), [idle(), move(-1, 0)]);
    expect(victim.state).toBe('stumbling');
    expect(victim.x).toBeGreaterThanOrEqual(x0 - 0.05);
    steps(w, Math.ceil((TACKLE_STUMBLE_TIME * 0.3) / SIM_DT));
    expect(victim.state).toBe('normal');
  });

  it('quem acerta não cai', () => {
    const w = duel(2.1);
    steps(w, 1, [tackleBtn(1, 0), idle()]);
    steps(w, Math.ceil(TACKLE_DURATION / SIM_DT) + 1);
    expect(getPlayer(w, playerId(0, 'ATA')).state).not.toBe('fallen');
  });

  it('bola solta: o carrinho empurra a bola', () => {
    const w = createWorld();
    clearPlayers(w);
    put(w, playerId(0, 'ATA'), 10, 10, 0);
    w.controlled[0] = playerId(0, 'ATA');
    // Bola solta parada a 1,6 m (fora do alcance de domínio).
    placeBall(w.ball, 11.6, 10, 0);
    steps(w, 1, [tackleBtn(1, 0), idle()]);
    steps(w, 20);
    expect(w.ball.vx).toBeGreaterThan(2);
    expect(w.events.some((e) => e.type === 'tackle' && e.result === 'loose')).toBe(true);
  });

  it('errou: fica caído 0,8 s sem poder se mexer', () => {
    const w = createWorld();
    clearPlayers(w);
    put(w, playerId(0, 'ATA'), 10, 10, 0);
    w.controlled[0] = playerId(0, 'ATA');
    placeBall(w.ball, 30, 15, 0);
    const p = getPlayer(w, playerId(0, 'ATA'));
    steps(w, 1, [tackleBtn(0, 1), idle()]);
    steps(w, Math.ceil(TACKLE_DURATION / SIM_DT));
    expect(p.state).toBe('fallen');
    expect(w.events.some((e) => e.type === 'tackleMiss')).toBe(true);
    const x0 = p.x;
    const y0 = p.y;
    steps(w, Math.floor((TACKLE_FALLEN_TIME * 0.9) / SIM_DT), [move(1, 0), idle()]);
    expect(p.state).toBe('fallen');
    expect(p.x).toBeCloseTo(x0, 6);
    expect(p.y).toBeCloseTo(y0, 6);
    steps(w, Math.ceil((TACKLE_FALLEN_TIME * 0.2) / SIM_DT));
    expect(p.state).toBe('normal');
  });

  it('desliza 2,5 m em 0,35 s na direção do direcional', () => {
    const w = createWorld();
    clearPlayers(w);
    put(w, playerId(0, 'ATA'), 10, 5, 0);
    w.controlled[0] = playerId(0, 'ATA');
    placeBall(w.ball, 35, 18, 0);
    const p = getPlayer(w, playerId(0, 'ATA'));
    const y0 = p.y;
    steps(w, 1, [tackleBtn(0, 1), idle()]);
    steps(w, Math.round(TACKLE_DURATION / SIM_DT) + 2);
    expect(p.y - y0).toBeCloseTo(TACKLE_DISTANCE, 3);
    expect(p.x).toBeCloseTo(10, 6);
  });

  it('sem direcional, desliza para onde está virado', () => {
    const p = createPlayer(0, 0, 'ATA');
    p.facing = Math.PI;
    startTackle(p, 0, 0);
    expect(p.tackleDirX).toBeCloseTo(-1, 10);
  });

  it('o perfil de velocidade soma exatamente 2,5 m', () => {
    let d = 0;
    const n = 1000;
    for (let i = 0; i < n; i++) d += ((slideSpeedAt((i * TACKLE_DURATION) / n) + slideSpeedAt(((i + 1) * TACKLE_DURATION) / n)) / 2) * (TACKLE_DURATION / n);
    expect(d).toBeCloseTo(TACKLE_DISTANCE, 6);
  });

  it('recarga de 1,2 s entre divididas', () => {
    const w = createWorld();
    clearPlayers(w);
    put(w, playerId(0, 'ATA'), 10, 10, 0);
    w.controlled[0] = playerId(0, 'ATA');
    placeBall(w.ball, 35, 18, 0);
    const p = getPlayer(w, playerId(0, 'ATA'));
    steps(w, 1, [tackleBtn(0, 1), idle()]);
    // Espera levantar (0,35 + 0,8 = 1,15 s) e tenta de novo antes de 1,2 s.
    steps(w, Math.ceil(1.16 / SIM_DT));
    expect(p.state).toBe('normal');
    steps(w, 1, [tackleBtn(0, -1), idle()]);
    expect(p.state).toBe('normal');
    steps(w, Math.ceil((TACKLE_COOLDOWN - 1.16) / SIM_DT) + 1);
    steps(w, 1, [tackleBtn(0, -1), idle()]);
    expect(p.state).toBe('tackling');
  });

  it('não rouba a bola de companheiro', () => {
    const w = createWorld();
    clearPlayers(w);
    put(w, playerId(0, 'ATA'), 10, 10, 0);
    put(w, playerId(0, 'ALA_D'), 12.1, 10, Math.PI);
    w.controlled[0] = playerId(0, 'ATA');
    givePossession(w, getPlayer(w, playerId(0, 'ALA_D')));
    w.controlled[0] = playerId(0, 'ATA');
    // O J1 controla o ala que tem a bola; força o atacante a dar o carrinho.
    const atk = getPlayer(w, playerId(0, 'ATA'));
    startTackle(atk, 1, 0);
    steps(w, Math.ceil(TACKLE_DURATION / SIM_DT));
    expect(w.ball.owner).toBe(playerId(0, 'ALA_D'));
  });

  it('a IA nunca dá carrinho: só o botão do humano inicia', () => {
    const w = createWorld();
    for (let i = 0; i < 600; i++) steps(w, 1, [move(Math.sin(i * 0.05), Math.cos(i * 0.03)), move(-1, 0.2)]);
    for (const p of w.players) expect(p.state).not.toBe('tackling');
    expect(w.events.some((e) => e.type === 'tackleStart')).toBe(false);
  });
});
