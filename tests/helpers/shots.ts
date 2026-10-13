/**
 * Cenários de chute contra o goleiro (time 1 defende o gol da direita).
 */
import { SIM_DT } from '../../src/config/constants';
import { emptyPlayerInput } from '../../src/core/input';
import { Rng } from '../../src/core/rng';
import { releaseBall, shotVelocity } from '../../src/sim/kick';
import { createWorld, getPlayer, givePossession, playerId, stepWorld } from '../../src/sim/world';
import type { HumanInputs, World } from '../../src/sim/world';

export type ShotOutcome = 'goal' | 'catch' | 'parry' | 'other';

const IDLE: HumanInputs = [emptyPlayerInput(), emptyPlayerInput()];

/** Jogadores de linha longe da jogada (perto do gol da esquerda). */
function clearField(w: World): void {
  w.players.forEach((p, i) => {
    if (p.role !== 'GK') {
      p.x = 3 + (i % 5);
      p.y = i < 5 ? 1 : 19;
    }
  });
}

function finish(w: World): ShotOutcome {
  for (let i = 0; i < 2 / SIM_DT; i++) {
    stepWorld(w, IDLE, SIM_DT);
    if (w.goal !== null) return 'goal';
    if (w.ball.owner === playerId(1, 'GK')) return 'catch';
  }
  return w.events.some((e) => e.type === 'save' && e.result === 'parry') ? 'parry' : 'other';
}

/** Chute parado de (x0, y0), com a carga dada, mirando (40, aimY). */
export function shotFrom(seed: number, x0: number, y0: number, charge: number, aimY: number): ShotOutcome {
  const w = createWorld(seed);
  clearField(w);
  const s = getPlayer(w, playerId(0, 'ATA'));
  s.x = x0;
  s.y = y0;
  s.facing = Math.atan2(10 - y0, 40 - x0);
  w.controlled[0] = s.id;
  givePossession(w, s);
  for (let i = 0; i < 1.2 / SIM_DT; i++) stepWorld(w, IDLE, SIM_DT);
  const b = w.ball;
  const v = shotVelocity(b.x, b.y, charge, { x: 40 - b.x, y: aimY - b.y }, 1, new Rng(seed * 7 + 1));
  releaseBall(b, s, v);
  return finish(w);
}

/**
 * Troca de lado: passe cruzado de (x, y0) para (x, y1), domínio, tempo real de carga e
 * chute no canto oposto ao lado de onde a bola veio.
 */
export function switchShot(seed: number, x: number, y0: number, y1: number, charge: number): ShotOutcome {
  const w = createWorld(seed);
  clearField(w);
  const a = getPlayer(w, playerId(0, 'ATA'));
  const b = getPlayer(w, playerId(0, 'ALA_D'));
  a.x = x;
  a.y = y0;
  a.facing = (Math.PI / 2) * Math.sign(y1 - y0);
  w.controlled[0] = a.id;
  givePossession(w, a);
  for (let i = 0; i < 1.2 / SIM_DT; i++) stepWorld(w, IDLE, SIM_DT);
  const hold = (): void => {
    b.x = x;
    b.y = y1;
    b.vx = 0;
    b.vy = 0;
    b.aiTargetX = x;
    b.aiTargetY = y1;
  };
  hold();
  releaseBall(w.ball, a, { x: 0, y: 16 * Math.sign(y1 - y0), z: 0 });
  for (let i = 0; i < 2 / SIM_DT && w.ball.owner !== b.id; i++) {
    stepWorld(w, IDLE, SIM_DT);
    if (w.ball.owner !== b.id) hold();
  }
  if (w.ball.owner !== b.id) return 'other';
  for (let i = 0; i < (charge * 0.9) / SIM_DT; i++) stepWorld(w, IDLE, SIM_DT);
  if (w.ball.owner !== b.id) return 'other';
  const aim = y1 > y0 ? 8.75 : 11.25;
  const v = shotVelocity(w.ball.x, w.ball.y, charge, { x: 40 - w.ball.x, y: aim - w.ball.y }, 1, new Rng(seed));
  releaseBall(w.ball, b, v);
  return finish(w);
}

/** Taxa de gols (0..1) de uma lista de chutes parados, em várias seeds. */
export function goalRate(cases: Array<[number, number, number, number]>, seeds = 10): number {
  let g = 0;
  for (const [x, y, c, aim] of cases) for (let s = 1; s <= seeds; s++) if (shotFrom(s, x, y, c, aim) === 'goal') g++;
  return g / (cases.length * seeds);
}
