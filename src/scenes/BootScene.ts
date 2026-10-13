import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { CREAM_CSS, FONT_TEXT, FONT_TITLE, INK_CSS } from '../art/style';

/**
 * Fase 1: tela de teste. Confirma que Phaser, fontes empacotadas e escala FIT funcionam.
 */
export class BootScene extends Phaser.Scene {
  private fpsText!: Phaser.GameObjects.Text;

  constructor() {
    super('BootScene');
  }

  create(): void {
    const cx = GAME_WIDTH / 2;
    const cy = GAME_HEIGHT / 2;

    this.cameras.main.setBackgroundColor('#2E6B3A');

    // Moldura marcando os limites exatos da resolução lógica.
    const frame = this.add.graphics();
    frame.lineStyle(6, 0x1a1410, 1);
    frame.strokeRect(3, 3, GAME_WIDTH - 6, GAME_HEIGHT - 6);
    frame.lineStyle(2, 0xf3e6c4, 1);
    frame.strokeRect(12, 12, GAME_WIDTH - 24, GAME_HEIGHT - 24);

    this.add
      .text(cx, cy - 60, 'DERBY PVP', {
        fontFamily: FONT_TITLE,
        fontSize: '120px',
        color: CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 12,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 50, 'FASE 1 · TELA DE TESTE · 1280 x 720', {
        fontFamily: FONT_TEXT,
        fontSize: '32px',
        fontStyle: '700',
        color: CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 6,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy + 100, 'Acentuação: PÊNALTIS · PRORROGAÇÃO · 1º TEMPO', {
        fontFamily: FONT_TEXT,
        fontSize: '24px',
        color: CREAM_CSS,
      })
      .setOrigin(0.5);

    this.fpsText = this.add
      .text(24, GAME_HEIGHT - 24, '', { fontFamily: FONT_TEXT, fontSize: '18px', color: CREAM_CSS })
      .setOrigin(0, 1);
  }

  override update(): void {
    this.fpsText.setText(`FPS ${this.game.loop.actualFps.toFixed(0)}`);
  }
}
