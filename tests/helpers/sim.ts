import { emptyPlayerInput } from '../../src/core/input';
import type { PlayerInput } from '../../src/core/input';
import { SIM_DT } from '../../src/config/constants';
import { stepWorld } from '../../src/sim/world';
import type { HumanInputs, World } from '../../src/sim/world';

export function idle(): PlayerInput {
  return emptyPlayerInput();
}

export function move(x: number, y: number): PlayerInput {
  const i = emptyPlayerInput();
  const l = Math.hypot(x, y);
  i.moveX = l > 0 ? x / l : 0;
  i.moveY = l > 0 ? y / l : 0;
  return i;
}

/** Entrada com botões: pass/shoot = 'tap' (aperta e solta no mesmo passo), 'press', 'hold', 'release'. */
export type BtnAction = 'tap' | 'press' | 'hold' | 'release' | 'none';

export function withButtons(base: PlayerInput, pass: BtnAction = 'none', shoot: BtnAction = 'none'): PlayerInput {
  const i: PlayerInput = { ...base, pass: btn(pass), shoot: btn(shoot) };
  return i;
}

function btn(a: BtnAction): { down: boolean; pressed: boolean; released: boolean } {
  switch (a) {
    case 'tap':
      return { down: false, pressed: true, released: true };
    case 'press':
      return { down: true, pressed: true, released: false };
    case 'hold':
      return { down: true, pressed: false, released: false };
    case 'release':
      return { down: false, pressed: false, released: true };
    default:
      return { down: false, pressed: false, released: false };
  }
}

export function steps(world: World, n: number, inputs: HumanInputs = [idle(), idle()]): void {
  for (let i = 0; i < n; i++) stepWorld(world, inputs, SIM_DT);
}

export function seconds(world: World, s: number, inputs: HumanInputs = [idle(), idle()]): void {
  steps(world, Math.round(s / SIM_DT), inputs);
}

/** Tira todos os jogadores do caminho (cantos do campo; goleiros no canto da própria área). */
export function clearPlayers(world: World): void {
  world.players.forEach((p, i) => {
    if (p.role === 'GK') {
      const left = world.defends[p.team] === 0;
      p.x = left ? 0.5 : 39.5;
      p.y = left ? 4.6 : 15.4;
    } else {
      p.x = 1 + (i % 5) * 0.9;
      p.y = i < 5 ? 0.5 : 19.5;
    }
    p.prevX = p.x;
    p.prevY = p.y;
    p.vx = 0;
    p.vy = 0;
  });
}
