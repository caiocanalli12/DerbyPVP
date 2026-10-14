import Phaser from 'phaser';
import { AUDIO_TOAST_TIME, GAME_WIDTH } from '../config/constants';
import { audio } from '../audio/AudioManager';
import type { AudioSettings } from '../audio/settings';
import { CREAM, CREAM_CSS, FONT_TEXT, INK } from '../art/style';

/** Aviso no canto superior direito (px). */
const TOAST_RIGHT = 18;
const TOAST_TOP = 16;
const TOAST_PAD_X = 16;
const TOAST_H = 38;

/** Texto do aviso do som. */
export function soundToastText(s: Readonly<AudioSettings>): string {
  return s.muted ? 'SOM DESLIGADO  (M)' : `SOM LIGADO · ${Math.round(s.volume * 100)}%  (M)`;
}

/**
 * Camada por cima de todas as cenas (fica rodando desde o início): mostra um aviso curto quando o
 * som é ligado ou desligado (tecla M) ou o volume muda.
 */
export class OverlayScene extends Phaser.Scene {
  private plate!: Phaser.GameObjects.Graphics;
  private label!: Phaser.GameObjects.Text;
  /** Instante (s, relógio real) em que o aviso some. */
  private hideAt = 0;

  constructor() {
    super('OverlayScene');
  }

  create(): void {
    this.plate = this.add.graphics().setVisible(false);
    this.label = this.add
      .text(0, TOAST_TOP + TOAST_H / 2, '', { fontFamily: FONT_TEXT, fontSize: '19px', fontStyle: '700', color: CREAM_CSS })
      .setOrigin(1, 0.5)
      .setVisible(false);
    const off = audio.onChange((s) => this.show(s));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
  }

  private show(s: Readonly<AudioSettings>): void {
    this.label.setText(soundToastText(s));
    const w = this.label.width + TOAST_PAD_X * 2;
    const right = GAME_WIDTH - TOAST_RIGHT;
    this.label.setX(right - TOAST_PAD_X);
    const g = this.plate;
    g.clear();
    g.fillStyle(INK, 0.9);
    g.fillRoundedRect(right - w, TOAST_TOP, w, TOAST_H, 10);
    g.lineStyle(2, CREAM, 1);
    g.strokeRoundedRect(right - w + 4, TOAST_TOP + 4, w - 8, TOAST_H - 8, 7);
    this.hideAt = performance.now() / 1000 + AUDIO_TOAST_TIME;
    this.plate.setVisible(true).setAlpha(1);
    this.label.setVisible(true).setAlpha(1);
  }

  override update(): void {
    if (!this.plate.visible) return;
    // Relógio real: o aviso some no tempo certo mesmo com a partida pausada.
    const left = this.hideAt - performance.now() / 1000;
    if (left <= 0) {
      this.plate.setVisible(false);
      this.label.setVisible(false);
      return;
    }
    const a = Math.min(1, left / 0.25);
    this.plate.setAlpha(a);
    this.label.setAlpha(a);
  }
}
