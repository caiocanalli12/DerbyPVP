/**
 * Cartões de intertítulo do cinema mudo ("FIM DO 1º TEMPO", "PRORROGAÇÃO", "PÊNALTIS",
 * "FIM DE JOGO"): fundo escuro, moldura ornamentada art déco, letras creme em Limelight,
 * com grão e flicker.
 */
import Phaser from 'phaser';
import { FILM_GRAIN_FPS, GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { DEPTH_UI } from '../core/projection';
import { DECO_FRAME_KEY, generateDecoFrame } from '../art/ui-art';
import { generateFilmTextures, GRAIN_VARIANTS, grainKey } from '../art/film-fx';
import { CREAM_CSS, FONT_TITLE } from '../art/style';

export class IntertitleView {
  private readonly bg: Phaser.GameObjects.Rectangle;
  private readonly frame: Phaser.GameObjects.Image;
  private readonly text: Phaser.GameObjects.Text;
  private readonly grain: Phaser.GameObjects.TileSprite;
  private shownText: string | null = null;
  private shownAt = 0;
  private grainVariant = 0;

  constructor(scene: Phaser.Scene, depth = DEPTH_UI + 10) {
    generateDecoFrame(scene, GAME_WIDTH, GAME_HEIGHT);
    generateFilmTextures(scene);
    this.bg = scene.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x120e0a, 1).setDepth(depth);
    this.frame = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, DECO_FRAME_KEY).setDepth(depth + 1);
    this.text = scene.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        fontFamily: FONT_TITLE,
        fontSize: '70px',
        color: CREAM_CSS,
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 280 },
        lineSpacing: 10,
      })
      .setOrigin(0.5)
      .setDepth(depth + 2);
    this.grain = scene.add
      .tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, grainKey(0))
      .setDepth(depth + 3)
      .setAlpha(0.55);
    this.setVisible(false);
  }

  private setVisible(v: boolean): void {
    this.bg.setVisible(v);
    this.frame.setVisible(v);
    this.text.setVisible(v);
    this.grain.setVisible(v);
  }

  /** Mostra `text` (ou esconde com null). */
  update(text: string | null, timeSec: number): void {
    if (text === null) {
      if (this.shownText !== null) this.setVisible(false);
      this.shownText = null;
      return;
    }
    if (text !== this.shownText) {
      this.shownText = text;
      this.shownAt = timeSec;
      this.text.setText(text.toUpperCase());
      this.setVisible(true);
    }
    const t = timeSec - this.shownAt;
    // Entrada rápida e flicker sutil (±3%) de projetor.
    const fade = Math.min(1, t / 0.18);
    const flicker = 1 + (Math.sin(timeSec * 53) * 0.5 + Math.sin(timeSec * 31.7) * 0.5) * 0.03;
    this.bg.setAlpha(0.97 * fade);
    this.frame.setAlpha(fade * flicker);
    this.text.setAlpha(fade * flicker).setScale(1 + (1 - fade) * 0.06);
    // Trocar a textura de um TileSprite reenvia o padrão para a GPU: só quando muda.
    const v = Math.floor(timeSec * FILM_GRAIN_FPS) % GRAIN_VARIANTS;
    if (v !== this.grainVariant) {
      this.grainVariant = v;
      this.grain.setTexture(grainKey(v));
    }
    this.grain.setTilePosition(Math.floor(timeSec * 997) % 256, Math.floor(timeSec * 613) % 256);
  }

  destroy(): void {
    this.bg.destroy();
    this.frame.destroy();
    this.text.destroy();
    this.grain.destroy();
  }
}
