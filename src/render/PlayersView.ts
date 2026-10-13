/**
 * Fase 3: jogadores como círculos coloridos (a arte final entra na fase 10).
 * Espelha a simulação: posição interpolada, ordenação por Y e sombra no chão.
 */
import Phaser from 'phaser';
import { PLAYER_RADIUS } from '../config/constants';
import { DEPTH_SHADOWS, depthFor, PPM, project } from '../core/projection';
import { FONT_TEXT, INK } from '../art/style';
import type { World } from '../sim/world';

const TEAM_COLORS: readonly [number, number] = [0xd8402f, 0x2f6fd8];
const GK_COLORS: readonly [number, number] = [0xf2a33a, 0x7ad83a];
/** Altura (m) do centro do "corpo" desenhado. */
const BODY_Z = 0.85;
const BODY_R = 0.42;

interface PlayerGfx {
  shadow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Arc;
  facing: Phaser.GameObjects.Line;
  number: Phaser.GameObjects.Text;
  tag: Phaser.GameObjects.Text;
}

export class PlayersView {
  private readonly gfx: PlayerGfx[] = [];

  constructor(scene: Phaser.Scene, world: World) {
    for (const p of world.players) {
      const color = p.role === 'GK' ? GK_COLORS[p.team] : TEAM_COLORS[p.team];
      const shadow = scene.add.ellipse(0, 0, 1, 1, 0x000000, 0.28).setDepth(DEPTH_SHADOWS);
      const body = scene.add.circle(0, 0, BODY_R * PPM, color).setStrokeStyle(3, INK);
      const facing = scene.add.line(0, 0, 0, 0, 0, 0, INK).setLineWidth(3).setOrigin(0, 0);
      const number = scene.add
        .text(0, 0, String(p.number), { fontFamily: FONT_TEXT, fontSize: '16px', fontStyle: '700', color: '#ffffff' })
        .setOrigin(0.5);
      const tag = scene.add
        .text(0, 0, p.team === 0 ? 'J1' : 'J2', {
          fontFamily: FONT_TEXT,
          fontSize: '14px',
          fontStyle: '700',
          color: '#ffffff',
          stroke: '#1A1410',
          strokeThickness: 4,
        })
        .setOrigin(0.5, 1);
      this.gfx.push({ shadow, body, facing, number, tag });
    }
  }

  /** Atualiza a partir da simulação; `alpha` interpola entre o passo anterior e o atual. */
  update(world: World, alpha: number): void {
    world.players.forEach((p, i) => {
      const g = this.gfx[i];
      if (!g) return;
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const y = p.prevY + (p.y - p.prevY) * alpha;
      const ground = project(x, y, 0);
      const s = ground.scale;
      const depth = depthFor(y);

      g.shadow.setPosition(ground.x, ground.y).setSize(PLAYER_RADIUS * 2 * PPM * s, PLAYER_RADIUS * 1.1 * PPM * s);
      g.shadow.setDisplaySize(PLAYER_RADIUS * 2 * PPM * s, PLAYER_RADIUS * 1.1 * PPM * s);

      const bodyPos = project(x, y, BODY_Z);
      g.body.setPosition(bodyPos.x, bodyPos.y).setScale(s).setDepth(depth);
      g.number.setPosition(bodyPos.x, bodyPos.y).setScale(s).setDepth(depth + 0.1);

      const tip = project(x + Math.cos(p.facing) * 0.7, y + Math.sin(p.facing) * 0.7, 0);
      g.facing.setTo(ground.x, ground.y, tip.x, tip.y).setPosition(0, 0).setDepth(DEPTH_SHADOWS + 1);

      const controlled = world.controlled[p.team] === p.id;
      g.tag.setVisible(controlled);
      if (controlled) {
        const head = project(x, y, BODY_Z + BODY_R + 0.25);
        g.tag.setPosition(head.x, head.y).setDepth(depth + 0.2);
      }
    });
  }

  destroy(): void {
    for (const g of this.gfx) {
      g.shadow.destroy();
      g.body.destroy();
      g.facing.destroy();
      g.number.destroy();
      g.tag.destroy();
    }
    this.gfx.length = 0;
  }
}
