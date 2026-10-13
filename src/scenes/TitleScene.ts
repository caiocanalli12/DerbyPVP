import Phaser from 'phaser';
import { BOIL_FPS, GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { keyboard } from '../core/input';
import { audio } from '../audio/AudioManager';
import { faceBallKey, generateFaceBall } from '../art/preview-art';
import { CREAM_CSS, FONT_TEXT, INK_CSS } from '../art/style';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
import { addSunburst, addTitle, readMenuInput } from '../render/menu';

/**
 * Tela inicial: logo grande sobre raios girando, "Pressione ENTER" piscando e uma bola com
 * rosto quicando (estica e achata como desenho animado).
 */
export class TitleScene extends Phaser.Scene {
  private rays!: Phaser.GameObjects.Image;
  private logo!: Phaser.GameObjects.Text;
  private press!: Phaser.GameObjects.Text;
  private ball!: Phaser.GameObjects.Image;
  private ballShadow!: Phaser.GameObjects.Ellipse;
  private film!: FilmView;
  private leaving = false;

  constructor() {
    super('TitleScene');
  }

  create(): void {
    this.leaving = false;
    this.cameras.main.setBackgroundColor('#2a1a10');
    this.rays = addSunburst(this);
    generateFaceBall(this);

    addTitle(this, GAME_WIDTH / 2, 196, 'DERBY PVP', 150).setShadow(0, 0, '#ffe27a', 26, true, true).setDepth(5);
    this.logo = addTitle(this, GAME_WIDTH / 2, 196, 'DERBY PVP', 150).setDepth(6);
    addTitle(this, GAME_WIDTH / 2, 300, 'FUTEBOL DE SALÃO · 1930', 34).setDepth(6);

    this.ballShadow = this.add.ellipse(GAME_WIDTH / 2, 560, 90, 18, 0x1a1410, 0.4).setDepth(4);
    this.ball = this.add.image(GAME_WIDTH / 2, 500, faceBallKey(0)).setOrigin(0.5, 1).setDepth(5);

    this.press = this.add
      .text(GAME_WIDTH / 2, 625, 'Pressione ENTER', {
        fontFamily: FONT_TEXT,
        fontSize: '36px',
        fontStyle: '700',
        color: CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 7,
      })
      .setOrigin(0.5)
      .setDepth(6);
    this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 26, 'J1: WASD · F passe · G chute      J2: setas · ; passe · . chute      Esc/P: pausa', {
        fontFamily: FONT_TEXT,
        fontSize: '18px',
        color: CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(6);
    this.film = new FilmView(this, filmEffectsEnabled(this));
    keyboard.snapshot();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.film.destroy());
  }

  override update(time: number): void {
    const t = time / 1000;
    this.rays.setRotation(t * 0.08);
    this.logo.setScale(1 + Math.sin(t * 2.2) * 0.012);
    this.press.setAlpha(Math.floor(t * 2.2) % 2 === 0 ? 1 : 0.25);

    // Bola quicando: parábola, achatando no chão e esticando no ar.
    const period = 1.1;
    const u = (t % period) / period;
    const height = 4 * u * (1 - u);
    const ground = 560;
    const squash = u < 0.06 || u > 0.94 ? 0.78 : 1 + (1 - Math.abs(0.5 - u) * 2) * 0.06;
    this.ball
      .setTexture(faceBallKey(Math.floor(t * BOIL_FPS) % 3))
      .setPosition(GAME_WIDTH / 2 + Math.sin(t * 0.9) * 220, ground - height * 190)
      .setScale(1 / squash, squash)
      .setRotation(Math.sin(t * 0.9) * 0.3);
    this.ballShadow.setPosition(this.ball.x, ground).setScale(1 - height * 0.5).setAlpha(0.45 - height * 0.25);
    this.film.update(t, Math.min(0.25, this.game.loop.rawDelta / 1000));

    const input = readMenuInput();
    if (!this.leaving && (input.enter || input.players.some((p) => p.confirm))) {
      this.leaving = true;
      audio.play('menu-confirmar');
      this.cameras.main.fadeOut(220, 20, 12, 8);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('TeamSelectScene'));
    }
  }
}
