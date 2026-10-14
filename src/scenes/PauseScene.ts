import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { audio } from '../audio/AudioManager';
import { CREAM, CREAM_CSS, FONT_TEXT, INK } from '../art/style';
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

type PauseOption = 'resume' | 'restart' | 'film' | 'volume' | 'sound' | 'quit';

/**
 * Moldura (px): tamanho, posição do título e dos botões. O topo fica logo abaixo da aba do relógio
 * do placar (que termina em ~106 px), para o tempo de jogo continuar visível na pausa.
 */
const PANEL_W = 540;
const PANEL_H = 520;
const PANEL_TOP = 114;
const TITLE_DY = 62;
const BUTTONS_DY = 140;
const BUTTON_GAP = 60;
const HINT_DY = PANEL_H - 34;

/**
 * Pausa (Esc/P): escurece a partida com uma moldura art déco.
 * Opções: Continuar, Reiniciar partida, Efeitos de filme (ligado/desligado), Volume (A/D ou ←/→),
 * Som (ligado/desligado; a tecla M faz o mesmo em qualquer tela) e Sair para o menu.
 */
export class PauseScene extends Phaser.Scene {
  private list!: ButtonList;
  private options: PauseOption[] = [];
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
    const w = PANEL_W;
    const h = PANEL_H;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = PANEL_TOP;
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
    addTitle(this, GAME_WIDTH / 2, y + TITLE_DY, 'PAUSA', 64);
    this.options = ['resume', 'restart', 'film', 'volume', 'sound', 'quit'];
    this.list = new ButtonList(
      this,
      GAME_WIDTH / 2,
      y + BUTTONS_DY,
      this.options.map((o) => this.labelOf(o)),
      BUTTON_GAP,
    );
    this.add
      .text(GAME_WIDTH / 2, y + HINT_DY, 'A/D ou ←/→ ajustam o volume · M liga/desliga o som', {
        fontFamily: FONT_TEXT,
        fontSize: '17px',
        color: CREAM_CSS,
      })
      .setOrigin(0.5);
    // A tecla M (ou o volume mudado em outro lugar) atualiza os rótulos na hora.
    const off = audio.onChange(() => this.refreshLabels());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, off);
    readMenuInput();
  }

  private labelOf(o: PauseOption): string {
    switch (o) {
      case 'resume':
        return 'CONTINUAR';
      case 'restart':
        return 'REINICIAR PARTIDA';
      case 'film':
        return `EFEITOS DE FILME: ${filmEffectsEnabled(this) ? 'LIGADO' : 'DESLIGADO'}`;
      case 'volume':
        return `VOLUME: ${Math.round(audio.volume * 100)}%`;
      case 'sound':
        return `SOM: ${audio.muted ? 'DESLIGADO' : 'LIGADO'}`;
      case 'quit':
        return 'SAIR PARA O MENU';
    }
  }

  private refreshLabels(): void {
    this.options.forEach((o, i) => this.list.buttons[i]!.setLabel(this.labelOf(o)));
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
    // Volume selecionado: esquerda/direita (de qualquer jogador) descem/sobem um passo.
    if (this.options[this.list.index] === 'volume') {
      for (const p of input.players) {
        if (p.left) audio.stepVolume(-1);
        if (p.right) audio.stepVolume(1);
      }
    }
    if (chosen === null) return;
    audio.play('menu-confirmar');
    switch (this.options[chosen]) {
      case 'resume':
        this.resume();
        break;
      case 'restart':
        this.closing = true;
        this.scene.stop();
        this.scene.get('MatchScene').scene.restart(this.config);
        break;
      case 'film': {
        const on = !filmEffectsEnabled(this);
        setFilmEffectsEnabled(this, on);
        this.refreshLabels();
        this.game.events.emit(PAUSE_EVENTS.filmToggle, on);
        break;
      }
      case 'volume':
        // Confirmar no volume sobe um passo e, no máximo, volta ao mínimo.
        if (audio.volume >= 1) audio.setVolume(0);
        else audio.stepVolume(1);
        break;
      case 'sound':
        audio.toggleMute();
        break;
      case 'quit':
        this.closing = true;
        this.scene.stop('MatchScene');
        this.scene.start('MainMenuScene');
        break;
      case undefined:
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
