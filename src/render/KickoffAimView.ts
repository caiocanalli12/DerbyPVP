/**
 * Mira da saída de bola: seta no chão saindo da bola na direção do passe, na cor do time, e um
 * anel sob o companheiro que vai receber. Pisca perto do prazo (aí a bola sai sozinha).
 */
import Phaser from 'phaser';
import {
  BOIL_FPS,
  KICKOFF_AIM_ARROW_FROM,
  KICKOFF_AIM_ARROW_TO,
  KICKOFF_AIM_WARN_TIME,
  KICKOFF_DELAY,
  KICKOFF_PASS_DEADLINE,
} from '../config/constants';
import { DEPTH_SHADOWS, project } from '../core/projection';
import { INK } from '../art/style';
import { kickoffTarget } from '../sim/match';
import type { Match } from '../sim/match';
import { getPlayer, playerId } from '../sim/world';

/** Formato da seta (m): meia largura da haste, comprimento e meia largura da ponta. */
const SHAFT_HALF = 0.1;
const HEAD_LEN = 0.6;
const HEAD_HALF = 0.36;
/** Anel sob o receptor (m). */
const RING_R = 0.62;
const RING_SEG = 28;
/** Tremor da linha que ferve (m). */
const BOIL = 0.025;

export class KickoffAimView {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly colors: readonly [number, number],
  ) {
    // No chão: acima das linhas e sombras, abaixo dos jogadores.
    this.g = scene.add.graphics().setDepth(DEPTH_SHADOWS + 5);
  }

  update(match: Match, timeSec: number): void {
    const g = this.g;
    g.clear();
    if (match.phase !== 'SAIDA_DE_BOLA' || !match.kickoffLive) return;
    const left = KICKOFF_DELAY + KICKOFF_PASS_DEADLINE - match.phaseTimer;
    if (left < KICKOFF_AIM_WARN_TIME && Math.floor(timeSec * 8) % 2 === 0) return;

    const world = match.world;
    const team = match.kickoffTeam;
    const color = this.colors[team];
    const ball = world.ball;
    const ux = Math.cos(match.kickoffAim);
    const uy = Math.sin(match.kickoffAim);
    const boil = Math.floor(timeSec * BOIL_FPS) % 3;
    const j = (k: number): number => Math.sin((boil + 1) * 12.9898 + k * 78.233) * BOIL;
    // Ponto no chão a `along` m da bola na direção da mira e `side` m para o lado.
    const at = (along: number, side: number, k: number): Phaser.Math.Vector2 => {
      const s = project(ball.x + ux * along - uy * side + j(k), ball.y + uy * along + ux * side + j(k + 7), 0);
      return new Phaser.Math.Vector2(s.x, s.y);
    };
    const neck = KICKOFF_AIM_ARROW_TO - HEAD_LEN;
    const arrow = [
      at(KICKOFF_AIM_ARROW_FROM, -SHAFT_HALF, 1),
      at(neck, -SHAFT_HALF, 2),
      at(neck, -HEAD_HALF, 3),
      at(KICKOFF_AIM_ARROW_TO, 0, 4),
      at(neck, HEAD_HALF, 5),
      at(neck, SHAFT_HALF, 6),
      at(KICKOFF_AIM_ARROW_FROM, SHAFT_HALF, 7),
    ];
    g.fillStyle(color, 0.95);
    g.fillPoints(arrow, true);
    g.lineStyle(3, INK, 1);
    g.strokePoints(arrow, true);

    // Anel sob quem vai receber.
    const kicker = getPlayer(world, playerId(team, 'ATA'));
    const target = kickoffTarget(world, kicker, match.kickoffAim);
    const pulse = 1 + Math.sin(timeSec * 7) * 0.08;
    const ring: Phaser.Math.Vector2[] = [];
    for (let i = 0; i < RING_SEG; i++) {
      const a = (i / RING_SEG) * Math.PI * 2;
      const s = project(target.x + Math.cos(a) * RING_R * pulse, target.y + Math.sin(a) * RING_R * pulse, 0);
      ring.push(new Phaser.Math.Vector2(s.x, s.y));
    }
    g.lineStyle(6, INK, 1);
    g.strokePoints(ring, true);
    g.lineStyle(3, color, 1);
    g.strokePoints(ring, true);
  }

  destroy(): void {
    this.g.destroy();
  }
}
