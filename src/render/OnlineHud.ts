/**
 * O que só a partida online mostra: a faixa de aviso (esperando o adversário, desconectado com a
 * contagem), o menu do Esc/P (não pausa: o jogo continua) com Sair da partida (com confirmação) e o
 * cartão de intertítulo do fim por W.O.
 */
import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/constants';
import { DEPTH_UI } from '../core/projection';
import { CREAM, CREAM_CSS, FONT_TEXT, FONT_TITLE, INK, INK_CSS } from '../art/style';
import { IntertitleView } from './IntertitleView';
import { ButtonList, ConfirmDialog } from './menu';
import type { MenuInput } from './menu';

/** Faixa de aviso e menu (px). */
const BANNER_Y = 196;
const BANNER_H = 64;
const MENU_W = 460;
const MENU_H = 250;
const MENU_Y = 330;

export class OnlineHud {
  private readonly banner: Phaser.GameObjects.Graphics;
  private readonly bannerText: Phaser.GameObjects.Text;
  private menuObjects: Phaser.GameObjects.GameObject[] = [];
  private list: ButtonList | null = null;
  private confirm: ConfirmDialog | null = null;
  private card: IntertitleView | null = null;
  private cardText = '';
  private bannerShown: string | null = null;

  constructor(private readonly scene: Phaser.Scene) {
    const d = DEPTH_UI + 20;
    this.banner = scene.add.graphics().setDepth(d).setVisible(false);
    this.bannerText = scene.add
      .text(GAME_WIDTH / 2, BANNER_Y, '', { fontFamily: FONT_TITLE, fontSize: '28px', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(d + 1)
      .setVisible(false);
  }

  /** Mostra (ou esconde, com null) a faixa de aviso. */
  setBanner(text: string | null): void {
    if (text === this.bannerShown) return;
    this.bannerShown = text;
    this.banner.setVisible(text !== null);
    this.bannerText.setVisible(text !== null);
    if (text === null) return;
    this.bannerText.setText(text);
    const w = Math.max(420, this.bannerText.width + 80);
    const g = this.banner;
    g.clear();
    g.fillStyle(INK, 0.92);
    g.fillRoundedRect(GAME_WIDTH / 2 - w / 2, BANNER_Y - BANNER_H / 2, w, BANNER_H, 14);
    g.lineStyle(3, CREAM, 1);
    g.strokeRoundedRect(GAME_WIDTH / 2 - w / 2 + 7, BANNER_Y - BANNER_H / 2 + 7, w - 14, BANNER_H - 14, 9);
  }

  get menuOpen(): boolean {
    return this.list !== null;
  }

  /** Menu do Esc/P: a partida continua rodando por trás. */
  openMenu(): void {
    if (this.list) return;
    const d = DEPTH_UI + 30;
    const x = GAME_WIDTH / 2 - MENU_W / 2;
    const y = MENU_Y - MENU_H / 2;
    const g = this.scene.add.graphics().setDepth(d);
    g.fillStyle(INK, 0.95);
    g.fillRoundedRect(x, y, MENU_W, MENU_H, 16);
    g.lineStyle(4, CREAM, 1);
    g.strokeRoundedRect(x + 9, y + 9, MENU_W - 18, MENU_H - 18, 11);
    this.menuObjects = [
      g,
      this.scene.add
        .text(GAME_WIDTH / 2, y + 42, 'PARTIDA ONLINE', { fontFamily: FONT_TITLE, fontSize: '30px', color: CREAM_CSS })
        .setOrigin(0.5)
        .setDepth(d + 1),
      this.scene.add
        .text(GAME_WIDTH / 2, y + 76, 'Sem pausa: o jogo continua enquanto este menu está aberto.', {
          fontFamily: FONT_TEXT,
          fontSize: '17px',
          color: CREAM_CSS,
        })
        .setOrigin(0.5)
        .setDepth(d + 1),
    ];
    this.list = new ButtonList(this.scene, GAME_WIDTH / 2, y + 130, ['CONTINUAR', 'SAIR DA PARTIDA'], 62, d + 1);
  }

  closeMenu(): void {
    this.confirm?.destroy();
    this.confirm = null;
    this.list?.destroy();
    this.list = null;
    for (const o of this.menuObjects) o.destroy();
    this.menuObjects = [];
  }

  /** Teclas no menu: 'close' (voltou ao jogo), 'quit' (confirmou sair) ou null. */
  handleMenu(input: MenuInput): 'close' | 'quit' | null {
    if (this.confirm) {
      const answer = this.confirm.handle(input);
      if (answer === null) return null;
      this.confirm.destroy();
      this.confirm = null;
      return answer === 'ok' ? 'quit' : null;
    }
    if (input.pause || input.players.some((p) => p.back)) return 'close';
    const chosen = this.list?.handle(input) ?? null;
    if (chosen === null) return null;
    if (chosen === 0) return 'close';
    this.confirm = new ConfirmDialog(this.scene, 'SAIR DA PARTIDA?', 'Quem sai perde por W.O.', ['CONTINUAR JOGANDO', 'SAIR'], DEPTH_UI + 40);
    return null;
  }

  /** Cartão de intertítulo por cima de tudo (fim por W.O., conexão perdida). */
  showCard(text: string): void {
    this.closeMenu();
    this.setBanner(null);
    this.cardText = text;
    this.card ??= new IntertitleView(this.scene, DEPTH_UI + 50);
  }

  update(timeSec: number): void {
    this.list?.update(timeSec);
    this.confirm?.update(timeSec);
    this.card?.update(this.cardText, timeSec);
  }

  destroy(): void {
    this.closeMenu();
    this.card?.destroy();
    this.banner.destroy();
    this.bannerText.destroy();
  }
}
