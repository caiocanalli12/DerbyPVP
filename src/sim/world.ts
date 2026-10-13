/**
 * Estado do mundo da partida e o passo da simulação (lógica pura, sem Phaser).
 */
import { PLAYER_RUN_SPEED } from '../config/constants';
import type { PlayerInput } from '../core/input';
import type { GoalSide } from './field';
import { separatePlayers } from './physics';
import { clampToField, createPlayer, formationPosition, integrateMovement, ROLES } from './player';
import type { Player, Role, TeamIndex } from './player';

export interface World {
  /** Tempo simulado (s). */
  time: number;
  /** Jogadores: ids 0–4 = time 0 (J1), 5–9 = time 1 (J2), na ordem de ROLES. */
  players: Player[];
  /** Gol que cada time defende (troca no intervalo). */
  defends: [GoalSide, GoalSide];
  /** Jogador controlado por cada humano (J1 controla o time 0, J2 o time 1). */
  controlled: [number, number];
}

/** Entrada humana por passo (só o que a simulação precisa). */
export type HumanInputs = [PlayerInput, PlayerInput];

export function createWorld(): World {
  const players: Player[] = [];
  for (const team of [0, 1] as const) {
    ROLES.forEach((role, i) => players.push(createPlayer(team * ROLES.length + i, team, role)));
  }
  const world: World = {
    time: 0,
    players,
    defends: [0, 1],
    controlled: [playerId(0, 'ATA'), playerId(1, 'ATA')],
  };
  resetToFormation(world);
  return world;
}

export function playerId(team: TeamIndex, role: Role): number {
  return team * ROLES.length + ROLES.indexOf(role);
}

export function getPlayer(world: World, id: number): Player {
  const p = world.players[id];
  if (!p) throw new Error(`Jogador inexistente: ${id}`);
  return p;
}

export function teamPlayers(world: World, team: TeamIndex): Player[] {
  return world.players.filter((p) => p.team === team);
}

/** Sentido de ataque de um time no eixo X (+1 = para a direita). */
export function attackDir(world: World, team: TeamIndex): 1 | -1 {
  return world.defends[team] === 0 ? 1 : -1;
}

/** Coloca todos na formação base, parados e virados para o ataque. */
export function resetToFormation(world: World): void {
  for (const p of world.players) {
    const pos = formationPosition(p.role, world.defends[p.team]);
    p.x = pos.x;
    p.y = pos.y;
    p.prevX = pos.x;
    p.prevY = pos.y;
    p.vx = 0;
    p.vy = 0;
    p.moveX = 0;
    p.moveY = 0;
    p.facing = attackDir(world, p.team) === 1 ? 0 : Math.PI;
  }
}

/** Avança a simulação um passo fixo. */
export function stepWorld(world: World, inputs: HumanInputs, dt: number): void {
  for (const p of world.players) {
    p.prevX = p.x;
    p.prevY = p.y;
    p.moveX = 0;
    p.moveY = 0;
    p.maxSpeed = PLAYER_RUN_SPEED;
  }

  // Humanos: cada um move o jogador que controla.
  for (const team of [0, 1] as const) {
    const p = getPlayer(world, world.controlled[team]);
    const input = inputs[team];
    p.moveX = input.moveX;
    p.moveY = input.moveY;
  }

  for (const p of world.players) integrateMovement(p, dt);
  separatePlayers(world.players);
  for (const p of world.players) clampToField(p);

  world.time += dt;
}
