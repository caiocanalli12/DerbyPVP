/**
 * "GOOOL!" gigante com animação elástica de 1930: as letras entram esticando e quicando,
 * com contorno grosso e sombra; depois ficam "respirando" (estica e achata) até sumir.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GOAL_TEXT_LETTER_DELAY, GOAL_TEXT_SIZE } from '../config/constants';
import { DEPTH_UI } from '../core/projection';
import { CREAM_CSS, FONT_TITLE, INK_CSS } from '../art/style';
import { css } from '../art/brush';

const WORD = 'GOOOL!';

export class GoalTextView {
  private readonly letters: Phaser.GameObjects.Text[] = [];
  private readonly shadows: Phaser.GameObjects.Text[] = [];
  private shownAt = -1;
  private visible = false;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly colors: readonly [number, number],
  ) {
    const style = {
      fontFamily: FONT_TITLE,
      fontSize: `${GOAL_TEXT_SIZE}px`,
      color: CREAM_CSS,
      stroke: INK_CSS,
      strokeThickness: 16,
    };
    // Mede as letras para centralizar a palavra.
    const widths = [...WORD].map((ch) => {
      const t = scene.add.text(0, 0, ch, style);
      const w = t.width - 10;
      t.destroy();
      return w;
    });
    const total = widths.reduce((a, b) => a + b, 0);
    let x = GAME_WIDTH / 2 - total / 2;
    [...WORD].forEach((ch, i) => {
      const cx = x + widths[i]! / 2;
      x += widths[i]!;
      this.shadows.push(
        scene.add
          .text(cx + 8, 210 + 10, ch, { ...style, color: '#1a1410', stroke: '#1a1410' })
          .setOrigin(0.5, 0.75)
          .setAlpha(0.55)
          .setDepth(DEPTH_UI + 4)
          .setVisible(false),
      );
      this.letters.push(scene.add.text(cx, 210, ch, style).setOrigin(0.5, 0.75).setDepth(DEPTH_UI + 5).setVisible(false));
    });
  }

  /** Mostra para o gol do time `team` (a sombra ganha a cor do time). */
  show(team: 0 | 1, timeSec: number): void {
    this.shownAt = timeSec;
    this.visible = true;
    const shadowColor = css(this.colors[team]);
    this.letters.forEach((l, i) => {
      const s = this.shadows[i]!;
      s.setColor(shadowColor).setStroke(INK_CSS, 16);
      l.setVisible(true).setScale(0);
      s.setVisible(true).setScale(0);
      this.scene.tweens.add({
        targets: [l, s],
        scaleX: 1,
        scaleY: 1,
        duration: 650,
        delay: i * GOAL_TEXT_LETTER_DELAY * 1000,
        ease: 'Elastic.Out',
        easeParams: [1.2, 0.45],
      });
    });
  }

  hide(): void {
    if (!this.visible) return;
    this.visible = false;
    for (const t of [...this.letters, ...this.shadows]) {
      this.scene.tweens.killTweensOf(t);
      t.setVisible(false);
    }
  }

  /** Quique e estica/achata das letras depois da entrada. */
  update(timeSec: number): void {
    if (!this.visible) return;
    const t = timeSec - this.shownAt;
    this.letters.forEach((l, i) => {
      const local = t - i * GOAL_TEXT_LETTER_DELAY - 0.65;
      const s = this.shadows[i]!;
      if (local <= 0) return;
      const ph = local * 7 + i * 0.9;
      const bounce = Math.abs(Math.sin(ph)) * 16;
      const stretch = 1 + Math.sin(ph * 2) * 0.09;
      l.setY(210 - bounce).setScale(1 / stretch, stretch);
      s.setY(220 - bounce * 0.5).setScale(1 / stretch, stretch);
    });
  }

  destroy(): void {
    for (const t of [...this.letters, ...this.shadows]) {
      this.scene.tweens.killTweensOf(t);
      t.destroy();
    }
  }
}
