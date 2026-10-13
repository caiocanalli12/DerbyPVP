/**
 * Bola na tela: couro desenhado por código, contorno fervendo, girando conforme a velocidade.
 * Sobe na tela com a altura; a sombra fica no chão e mostra onde ela está.
 */
import Phaser from 'phaser';
import { BALL_VISUAL_RADIUS, BOIL_FPS } from '../config/constants';
import { DEPTH_SHADOWS, depthFor, PPM, project } from '../core/projection';
import { BALL_TEXTURE_RADIUS, BALL_VARIANTS, ballKey } from '../art/ball-art';
import type { Ball } from '../sim/ball';
import type { WeatherId } from '../data/weather';
import { drawShadows } from './PlayersView';
import { shadowCount, shadowsAt } from './shadows';

export class BallView {
  private readonly shadows: Phaser.GameObjects.Ellipse[];
  private readonly sprite: Phaser.GameObjects.Image;
  private spin = 0;

  constructor(
    scene: Phaser.Scene,
    private readonly weather: WeatherId,
  ) {
    this.shadows = Array.from({ length: shadowCount(weather) }, () =>
      scene.add.ellipse(0, 0, 1, 1, 0x1a1410, 0.32).setDepth(DEPTH_SHADOWS + 2),
    );
    this.sprite = scene.add.image(0, 0, ballKey(0));
  }

  update(ball: Ball, alpha: number, timeSec: number, dt: number): void {
    const x = ball.prevX + (ball.x - ball.prevX) * alpha;
    const y = ball.prevY + (ball.y - ball.prevY) * alpha;
    const z = ball.prevZ + (ball.z - ball.prevZ) * alpha;
    const s = project(x, y, 0).scale;
    // Sombra menor e mais fraca quanto mais alta a bola (ela fica no chão e mostra a altura).
    const k = 1 / (1 + z * 0.35);
    drawShadows(this.shadows, shadowsAt(this.weather, x, y), x, y, BALL_VISUAL_RADIUS * 1.1 * k, BALL_VISUAL_RADIUS * 0.55 * k, k + 0.15);

    // Rotação visual proporcional à velocidade (sentido pelo movimento na tela).
    const speed = Math.hypot(ball.vx, ball.vy);
    const dir = Math.abs(ball.vx) >= Math.abs(ball.vy) ? Math.sign(ball.vx) : Math.sign(ball.vy);
    this.spin += (speed / BALL_VISUAL_RADIUS) * dt * (dir || 1);

    const p = project(x, y, z + BALL_VISUAL_RADIUS);
    const scale = (BALL_VISUAL_RADIUS * PPM * s) / BALL_TEXTURE_RADIUS;
    this.sprite
      .setTexture(ballKey(Math.floor(timeSec * BOIL_FPS) % BALL_VARIANTS))
      .setPosition(p.x, p.y)
      .setScale(scale)
      .setRotation(this.spin)
      // Ordena pelo Y do chão (não pela altura).
      .setDepth(depthFor(y) + 0.05);
  }

  destroy(): void {
    for (const sh of this.shadows) sh.destroy();
    this.sprite.destroy();
  }
}
