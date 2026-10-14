import { SIM_DT } from '../../src/config/constants';
import { emptyCommand } from '../../src/sim/command';
import type { TeamCommand } from '../../src/sim/command';
import { stepWorld } from '../../src/sim/world';
import type { HumanInputs, World } from '../../src/sim/world';

export function idle(): TeamCommand {
  return emptyCommand();
}

export function move(x: number, y: number): TeamCommand {
  const i = emptyCommand();
  const l = Math.hypot(x, y);
  i.moveX = l > 0 ? x / l : 0;
  i.moveY = l > 0 ? y / l : 0;
  return i;
}

/** Comando com botões: pass/shoot = 'tap' (aperta e solta no mesmo passo), 'press', 'hold', 'release'. */
export type BtnAction = 'tap' | 'press' | 'hold' | 'release' | 'none';

export function withButtons(base: TeamCommand, pass: BtnAction = 'none', shoot: BtnAction = 'none'): TeamCommand {
  const s = btn(shoot);
  return {
    ...base,
    passPressed: btn(pass).pressed,
    shootHeld: s.held,
    shootReleased: s.released,
    shootPressed: s.pressed,
  };
}

function btn(a: BtnAction): { held: boolean; pressed: boolean; released: boolean } {
  switch (a) {
    case 'tap':
      return { held: false, pressed: true, released: true };
    case 'press':
      return { held: true, pressed: true, released: false };
    case 'hold':
      return { held: true, pressed: false, released: false };
    case 'release':
      return { held: false, pressed: false, released: true };
    default:
      return { held: false, pressed: false, released: false };
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
