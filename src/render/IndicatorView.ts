/**
 * Indicador estilo FIFA: triângulo para baixo acima da cabeça do jogador controlado,
 * flutuando e com a linha "fervendo".
 */
import Phaser from 'phaser';
import { BOIL_FPS, INDICATOR_BOB_AMPLITUDE, INDICATOR_BOB_HZ, INDICATOR_HEIGHT } from '../config/constants';
import { DEPTH_UI, project } from '../core/projection';
import { BOIL_VARIANTS, generateIndicatorTextures, INDICATOR_TEXTURE_SCALE, indicatorKey } from '../art/ui-art';
import type { World } from '../sim/world';

export class IndicatorView {
  private readonly images: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];

  constructor(
    scene: Phaser.Scene,
    private readonly colors: readonly [number, number],
  ) {
    for (const c of colors) generateIndicatorTextures(scene, c);
    this.images = [0, 1].map((team) =>
      scene.add
        .image(0, 0, indicatorKey(colors[team as 0 | 1], 0))
        .setOrigin(0.5, 1)
        .setDepth(DEPTH_UI - 20),
    ) as [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  }

  update(world: World, alpha: number, timeSec: number, visible: boolean): void {
    const boil = Math.floor(timeSec * BOIL_FPS) % BOIL_VARIANTS;
    for (const team of [0, 1] as const) {
      const img = this.images[team];
      img.setVisible(visible);
      if (!visible) continue;
      const p = world.players[world.controlled[team]];
      if (!p) continue;
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const y = p.prevY + (p.y - p.prevY) * alpha;
      const pos = project(x, y, INDICATOR_HEIGHT);
      // Os dois indicadores flutuam fora de fase para não "piscarem" juntos.
      const bob = Math.sin((timeSec * INDICATOR_BOB_HZ + team * 0.5) * Math.PI * 2) * INDICATOR_BOB_AMPLITUDE;
      img
        .setTexture(indicatorKey(this.colors[team], boil))
        .setPosition(pos.x, pos.y + bob * pos.scale)
        .setScale(pos.scale * INDICATOR_TEXTURE_SCALE);
    }
  }

  destroy(): void {
    for (const i of this.images) i.destroy();
  }
}
