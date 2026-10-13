import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { audio } from '../audio/AudioManager';
import { CREAM, INK } from '../art/style';
import { filmEffectsEnabled, setFilmEffectsEnabled } from '../render/FilmView';
import { addTitle, ButtonList, readMenuInput } from '../render/menu';
import type { MatchConfig } from './MatchScene';

export interface PauseData {
  config: MatchConfig;
}

/** Comunicação da pausa com a partida. */
export const PAUSE_EVENTS = {
  resume: 'pause-resume',
  filmToggle: 'pause-film',
} as const;

/**
 * Pausa (Esc/P): escurece a partida com uma moldura art déco.
 * Opções: Continuar, Reiniciar partida, Efeitos de filme (ligado/desligado), Sair para o menu.
 */
export class PauseScene extends Phaser.Scene {
  private list!: ButtonList;
  private config!: MatchConfig;
  private closing = false;

  constructor() {
    super('PauseScene');
  }

  init(data: PauseData): void {
    this.config = data.config;
  }

  create(): void {
    this.closing = false;
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x0d0907, 0.62);
    const g = this.add.graphics();
    const w = 520;
    const h = 430;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = GAME_HEIGHT / 2 - h / 2;
    g.fillStyle(INK, 0.96);
    g.fillRoundedRect(x, y, w, h, 18);
    g.lineStyle(4, CREAM, 1);
    g.strokeRoundedRect(x + 10, y + 10, w - 20, h - 20, 12);
    g.lineStyle(1.5, CREAM, 1);
    g.strokeRoundedRect(x + 20, y + 20, w - 40, h - 40, 8);
    // Leques art déco nos cantos.
    for (const [cx, cy, a] of [
      [x + 20, y + 20, 0],
      [x + w - 20, y + 20, Math.PI / 2],
      [x + 20, y + h - 20, -Math.PI / 2],
      [x + w - 20, y + h - 20, Math.PI],
    ] as const) {
      for (let i = 0; i <= 4; i++) {
        const ang = a + (i / 4) * (Math.PI / 2);
        g.lineBetween(cx, cy, cx + Math.cos(ang) * 30, cy + Math.sin(ang) * 30);
      }
    }
    addTitle(this, GAME_WIDTH / 2, y + 66, 'PAUSA', 64);
    this.list = new ButtonList(this, GAME_WIDTH / 2, y + 150, ['CONTINUAR', 'REINICIAR PARTIDA', this.filmLabel(), 'SAIR PARA O MENU'], 70);
    readMenuInput();
  }

  private filmLabel(): string {
    return `EFEITOS DE FILME: ${filmEffectsEnabled(this) ? 'LIGADO' : 'DESLIGADO'}`;
  }

  override update(time: number): void {
    this.list.update(time / 1000);
    if (this.closing) return;
    const input = readMenuInput();
    if (input.pause || input.players.some((p) => p.back)) {
      this.resume();
      return;
    }
    const chosen = this.list.handle(input, () => audio.play('menu-mover'));
    if (chosen === null) return;
    audio.play('menu-confirmar');
    switch (chosen) {
      case 0:
        this.resume();
        break;
      case 1:
        this.closing = true;
        this.scene.stop();
        this.scene.get('MatchScene').scene.restart(this.config);
        break;
      case 2: {
        const on = !filmEffectsEnabled(this);
        setFilmEffectsEnabled(this, on);
        this.list.buttons[2]!.setLabel(this.filmLabel());
        this.game.events.emit(PAUSE_EVENTS.filmToggle, on);
        break;
      }
      case 3:
        this.closing = true;
        this.scene.stop('MatchScene');
        this.scene.start('TitleScene');
        break;
    }
  }

  private resume(): void {
    this.closing = true;
    audio.play('menu-voltar');
    this.scene.stop();
    this.game.events.emit(PAUSE_EVENTS.resume);
    this.scene.resume('MatchScene');
  }
}
