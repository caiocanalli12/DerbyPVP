import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { audio } from '../audio/AudioManager';
import { CREAM, CREAM_CSS, FONT_TEXT, INK, INK_CSS } from '../art/style';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
import { addSunburst, addTitle, ButtonList, readMenuInput, setGlow } from '../render/menu';
import { setCurrentSession } from '../net/peer';
import type { OnlineLobbyData } from './OnlineLobbyScene';

/** Moldura dos botões (px). */
const PANEL_Y = 410;
const PANEL_W = 600;
const PANEL_H = 330;
const BUTTON_GAP = 88;

/**
 * Online — sala: criar uma sala (e mandar o código ou o link) ou entrar com o código de alguém.
 */
export class OnlineMenuScene extends Phaser.Scene {
  private rays!: Phaser.GameObjects.Image;
  private list!: ButtonList;
  private film!: FilmView;
  private leaving = false;

  constructor() {
    super('OnlineMenuScene');
  }

  create(): void {
    this.leaving = false;
    // Voltou para cá: nenhuma sessão continua aberta.
    setCurrentSession(null);
    this.cameras.main.setBackgroundColor('#2a1a10');
    this.cameras.main.fadeIn(200, 20, 12, 8);
    this.rays = addSunburst(this, 0x6a3d8f, 0x58307a);
    const cx = GAME_WIDTH / 2;
    setGlow(addTitle(this, cx, 104, 'ONLINE', 92), '#ffe27a', 22).setDepth(5);
    addTitle(this, cx, 182, 'SALA COM CÓDIGO OU LINK', 28).setDepth(5);

    const g = this.add.graphics().setDepth(4);
    const x = cx - PANEL_W / 2;
    const y = PANEL_Y - PANEL_H / 2;
    g.fillStyle(INK, 0.72);
    g.fillRoundedRect(x, y, PANEL_W, PANEL_H, 18);
    g.lineStyle(4, CREAM, 1);
    g.strokeRoundedRect(x + 10, y + 10, PANEL_W - 20, PANEL_H - 20, 12);
    g.lineStyle(1.5, CREAM, 1);
    g.strokeRoundedRect(x + 20, y + 20, PANEL_W - 40, PANEL_H - 40, 8);

    this.list = new ButtonList(this, cx, PANEL_Y - BUTTON_GAP, ['CRIAR SALA', 'ENTRAR COM CÓDIGO', 'VOLTAR'], BUTTON_GAP, 10);
    this.add
      .text(cx, GAME_HEIGHT - 58, 'Quem cria a sala joga com o time da esquerda no 1º tempo. Os dois conjuntos de teclas funcionam juntos.', {
        fontFamily: FONT_TEXT,
        fontSize: '18px',
        color: CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(6);
    this.add
      .text(cx, GAME_HEIGHT - 28, 'W/S ou setas · F, ; ou Enter confirma · G ou . volta', {
        fontFamily: FONT_TEXT,
        fontSize: '17px',
        color: CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(6);
    this.film = new FilmView(this, filmEffectsEnabled(this));
    readMenuInput();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.film.destroy());
  }

  override update(time: number): void {
    const t = time / 1000;
    this.rays.setRotation(t * 0.06);
    this.list.update(t);
    this.film.update(t, Math.min(0.25, this.game.loop.rawDelta / 1000));
    if (this.leaving) return;
    const input = readMenuInput();
    if (input.players.some((p) => p.back)) {
      audio.play('menu-voltar');
      this.leave('MainMenuScene', {});
      return;
    }
    const chosen = this.list.handle(input, () => audio.play('menu-mover'));
    if (chosen === null) return;
    audio.play('menu-confirmar');
    if (chosen === 0) this.leave('OnlineLobbyScene', { mode: 'host' } satisfies OnlineLobbyData);
    else if (chosen === 1) this.leave('OnlineLobbyScene', { mode: 'join' } satisfies OnlineLobbyData);
    else this.leave('MainMenuScene', {});
  }

  private leave(scene: string, data: object): void {
    this.leaving = true;
    this.cameras.main.fadeOut(220, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
