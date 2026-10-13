import { describe, expect, it } from 'vitest';
import { CONTROL_SWITCH_BACK_TIME, CONTROL_SWITCH_COOLDOWN, SIM_DT } from '../src/config/constants';
import { placeBall } from '../src/sim/ball';
import { setControlled, updateAutoControl } from '../src/sim/control';
import { createWorld, getPlayer, givePossession, playerId, stepWorld } from '../src/sim/world';
import type { PlayerInput } from '../src/core/input';
import type { World } from '../src/sim/world';
import { clearPlayers, idle, move, steps, withButtons } from './helpers/sim';

function put(w: World, id: number, x: number, y: number): void {
  const p = getPlayer(w, id);
  p.x = x;
  p.y = y;
  p.prevX = x;
  p.prevY = y;
  p.vx = 0;
  p.vy = 0;
}

/** Mundo com o time 0 em posições conhecidas e a bola solta parada. */
function setup(ballX: number, ballY: number): World {
  const w = createWorld();
  clearPlayers(w);
  put(w, playerId(0, 'ATA'), 20, 10);
  put(w, playerId(0, 'ALA_E'), 10, 5);
  put(w, playerId(0, 'ALA_D'), 10, 15);
  put(w, playerId(0, 'FIXO'), 5, 10);
  put(w, playerId(0, 'GK'), 1.5, 10);
  placeBall(w.ball, ballX, ballY, 0);
  w.controlled[0] = playerId(0, 'ATA');
  w.controlSwitchTimer = [1, 1];
  return w;
}

describe('troca automática de controle', () => {
  it('sem posse, controla o jogador de linha mais perto da bola prevista', () => {
    const w = setup(11, 13);
    updateAutoControl(w, 0, SIM_DT);
    expect(w.controlled[0]).toBe(playerId(0, 'ALA_D'));
  });

  it('usa a posição prevista (posição + velocidade x 0,3 s)', () => {
    // Bola em (15, 10) indo para cima a 20 m/s: prevista em (15, 4) -> ala esquerdo.
    const w = setup(15, 10);
    w.ball.vy = -20;
    updateAutoControl(w, 0, SIM_DT);
    expect(w.controlled[0]).toBe(playerId(0, 'ALA_E'));
  });

  it('o goleiro nunca é controlado', () => {
    const w = setup(2, 10);
    updateAutoControl(w, 0, SIM_DT);
    expect(getPlayer(w, w.controlled[0]).role).not.toBe('GK');
    setControlled(w, 0, playerId(0, 'GK'));
    expect(getPlayer(w, w.controlled[0]).role).not.toBe('GK');
  });

  it('histerese: só troca se o novo estiver pelo menos 1 m mais perto', () => {
    // ATA em (20,10), ALA_D em (10,15). Bola no meio, levemente mais perto do ala.
    const w = setup(14.5, 12.5);
    const dAta = Math.hypot(20 - 14.5, 10 - 12.5);
    const dAla = Math.hypot(10 - 14.5, 15 - 12.5);
    expect(dAla).toBeLessThan(dAta);
    expect(dAta - dAla).toBeLessThan(1);
    updateAutoControl(w, 0, SIM_DT);
    expect(w.controlled[0]).toBe(playerId(0, 'ATA'));
    // Mais perto do ala por mais de 1 m: troca.
    placeBall(w.ball, 12, 14, 0);
    updateAutoControl(w, 0, SIM_DT);
    expect(w.controlled[0]).toBe(playerId(0, 'ALA_D'));
  });

  it('no máximo uma troca a cada 0,25 s', () => {
    const w = setup(11, 14);
    updateAutoControl(w, 0, SIM_DT);
    expect(w.controlled[0]).toBe(playerId(0, 'ALA_D'));
    // A bola "pula" para perto do ala esquerdo logo em seguida.
    placeBall(w.ball, 10, 5.5, 0);
    updateAutoControl(w, 0, SIM_DT);
    expect(w.controlled[0]).toBe(playerId(0, 'ALA_D'));
    for (let t = 0; t < CONTROL_SWITCH_COOLDOWN; t += SIM_DT) updateAutoControl(w, 0, SIM_DT);
    expect(w.controlled[0]).toBe(playerId(0, 'ALA_E'));
  });

  it('com posse do time, controla quem está com a bola', () => {
    const w = setup(30, 10);
    givePossession(w, getPlayer(w, playerId(0, 'FIXO')));
    updateAutoControl(w, 0, SIM_DT);
    expect(w.controlled[0]).toBe(playerId(0, 'FIXO'));
  });

  it('troca na hora quando um companheiro ganha a bola (ignora a recarga)', () => {
    const w = setup(11, 14);
    updateAutoControl(w, 0, SIM_DT);
    expect(w.controlled[0]).toBe(playerId(0, 'ALA_D'));
    givePossession(w, getPlayer(w, playerId(0, 'ALA_E')));
    expect(w.controlled[0]).toBe(playerId(0, 'ALA_E'));
  });

  it('durante um passe, o receptor continua controlado até a bola chegar', () => {
    const w = createWorld();
    clearPlayers(w);
    const passer = getPlayer(w, playerId(0, 'ATA'));
    put(w, passer.id, 10, 10);
    put(w, playerId(0, 'ALA_D'), 22, 10);
    put(w, playerId(0, 'ALA_E'), 12, 12); // perto da trajetória no começo
    givePossession(w, passer);
    steps(w, 1);
    steps(w, 1, [withButtons(move(1, 0), 'tap'), idle()]);
    expect(w.controlled[0]).toBe(playerId(0, 'ALA_D'));
    const seen = new Set<number>();
    for (let i = 0; i < 120 && w.ball.owner === null; i++) {
      steps(w, 1);
      seen.add(w.controlled[0]);
    }
    expect([...seen]).toEqual([playerId(0, 'ALA_D')]);
  });

  it('trocar o controle cancela a carga do chute', () => {
    const w = setup(11, 14);
    w.humans[0].charging = true;
    w.humans[0].charge = 0.6;
    setControlled(w, 0, playerId(0, 'ALA_E'));
    expect(w.humans[0].charging).toBe(false);
    expect(w.humans[0].charge).toBe(0);
  });
});

describe('não fica piscando', () => {
  it('bola parada entre dois jogadores equidistantes: nenhuma troca', () => {
    const w = setup(15, 10);
    put(w, playerId(0, 'ALA_E'), 10, 10);
    let switches = 0;
    let last = w.controlled[0];
    for (let i = 0; i < 300; i++) {
      // Pequena oscilação da bola (como num quique) para cada lado.
      placeBall(w.ball, 15 + Math.sin(i * 0.7) * 0.4, 10, 0);
      updateAutoControl(w, 0, SIM_DT);
      if (w.controlled[0] !== last) switches++;
      last = w.controlled[0];
    }
    expect(switches).toBe(0);
  });

  it('bola rolando devagar de um lado para o outro: poucas trocas', () => {
    const w = setup(5, 10);
    put(w, playerId(0, 'ALA_E'), 10, 9);
    put(w, playerId(0, 'ATA'), 20, 11);
    let switches = 0;
    let last = w.controlled[0];
    for (let i = 0; i <= 600; i++) {
      placeBall(w.ball, 5 + i * 0.03, 10, 0);
      w.ball.vx = 1.8;
      updateAutoControl(w, 0, SIM_DT);
      if (w.controlled[0] !== last) switches++;
      last = w.controlled[0];
    }
    // De um extremo ao outro há no máximo uma troca por "fronteira" entre jogadores.
    expect(switches).toBeLessThanOrEqual(3);
  });
});

describe('adversário conduzindo com dois defensores perto', () => {
  /**
   * O J2 conduz para o gol do J1 com zigue-zague; o FIXO e o ALA_E do J1 estão colados nele.
   * `j1` decide o que o J1 aperta a cada passo. Devolve as trocas [tempo, de, para] de controle.
   */
  function play(seed: number, j1: (w: World) => PlayerInput): [number, number, number][] {
    const w = createWorld(seed);
    const carrier = getPlayer(w, playerId(1, 'ATA'));
    carrier.x = 24;
    carrier.y = 10;
    carrier.facing = Math.PI;
    givePossession(w, carrier);
    put(w, playerId(0, 'FIXO'), 21, 9.5);
    put(w, playerId(0, 'ALA_E'), 22.5, 11.5);
    w.controlled[0] = playerId(0, 'ALA_E');
    const out: [number, number, number][] = [];
    for (let i = 0; i < 5 / SIM_DT && w.ball.owner === carrier.id; i++) {
      const before = w.controlled[0];
      stepWorld(w, [j1(w), move(-1, Math.sin(i * SIM_DT * (1 + (seed % 5))) * 0.8)], SIM_DT);
      if (w.controlled[0] !== before) out.push([w.time, before, w.controlled[0]]);
    }
    return out;
  }

  const chase = (w: World): PlayerInput => {
    const me = getPlayer(w, w.controlled[0]);
    return move(w.ball.x - me.x, w.ball.y - me.y);
  };

  it('quem persegue a bola não perde o controle para o companheiro ao lado', () => {
    for (let seed = 1; seed <= 12; seed++) expect(play(seed, chase)).toEqual([]);
  });

  it('com o J1 parado o controle acompanha a jogada, mas nunca volta logo para o anterior', () => {
    for (let seed = 1; seed <= 12; seed++) {
      const sw = play(seed, () => idle());
      for (let k = 1; k < sw.length; k++) {
        const [t, from, to] = sw[k]!;
        const [tPrev, fromPrev] = sw[k - 1]!;
        if (to === fromPrev) expect(t - tPrev).toBeGreaterThanOrEqual(CONTROL_SWITCH_BACK_TIME - 1e-9);
        expect(from).toBe(sw[k - 1]![2]);
      }
    }
  });
});
