/**
 * Fase 4: bola simples (a arte final entra na fase 10).
 * A bola sobe na tela com a altura; a sombra fica no chão e mostra onde ela está.
 */
import Phaser from 'phaser';
import { BALL_VISUAL_RADIUS } from '../config/constants';
import { DEPTH_SHADOWS, depthFor, PPM, project } from '../core/projection';
import { INK } from '../art/style';
import type { Ball } from '../sim/ball';

export class BallView {
  private readonly shadow: Phaser.GameObjects.Ellipse;
  private readonly body: Phaser.GameObjects.Arc;

  constructor(scene: Phaser.Scene) {
    this.shadow = scene.add.ellipse(0, 0, 1, 1, 0x000000, 0.3).setDepth(DEPTH_SHADOWS + 2);
    this.body = scene.add.circle(0, 0, BALL_VISUAL_RADIUS * PPM, 0xf6ecd0).setStrokeStyle(2.5, INK);
  }

  update(ball: Ball, alpha: number): void {
    const x = ball.prevX + (ball.x - ball.prevX) * alpha;
    const y = ball.prevY + (ball.y - ball.prevY) * alpha;
    const z = ball.prevZ + (ball.z - ball.prevZ) * alpha;
    const ground = project(x, y, 0);
    const s = ground.scale;
    // Sombra menor e mais fraca quanto mais alta a bola.
    const k = 1 / (1 + z * 0.35);
    this.shadow
      .setPosition(ground.x, ground.y)
      .setDisplaySize(BALL_VISUAL_RADIUS * 2.2 * PPM * s * k, BALL_VISUAL_RADIUS * 1.1 * PPM * s * k)
      .setAlpha(0.3 * k + 0.05);
    const p = project(x, y, z + BALL_VISUAL_RADIUS);
    // Ordena pelo Y do chão (não pela altura).
    this.body.setPosition(p.x, p.y).setScale(s).setDepth(depthFor(y) + 0.05);
  }

  destroy(): void {
    this.shadow.destroy();
    this.body.destroy();
  }
}
