import Phaser from 'phaser';
import { BOIL_FPS, GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { audio } from '../audio/AudioManager';
import { CREAM, CREAM_CSS, FONT_TEXT, FONT_TITLE, INK, INK_CSS } from '../art/style';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
import { addSunburst, addTitle, ButtonList, readMenuInput } from '../render/menu';

interface ModeOption {
  label: string;
  /** Cena que a opção abre (null = ainda não disponível). */
  scene: string | null;
}

/** Os três modos. O solo (fases 18/19) e o online (fase 20) ainda não estão ligados. */
const OPTIONS: readonly ModeOption[] = [
  { label: '1 JOGADOR — CAMPEONATO', scene: null },
  { label: '2 JOGADORES — LOCAL', scene: 'TeamSelectScene' },
  { label: 'ONLINE — SALA', scene: null },
];

/** Moldura dos botões: centro, tamanho e espaço entre os botões (px). */
const PANEL_Y = 425;
const PANEL_W = 600;
const PANEL_H = 350;
const BUTTON_GAP = 95;
/** Transparência das opções indisponíveis. */
const DIMMED_ALPHA = 0.5;
/** Carimbo "EM BREVE": posição em relação ao centro do botão e inclinação (graus). */
const STAMP_DX = 196;
const STAMP_DY = -31;
const STAMP_ANGLE = -10;

/**
 * Menu principal: escolha do modo de jogo sobre raios girando, num cartaz art déco.
 * Navega com W/S ou setas, confirma com F, ; ou Enter, volta para a tela inicial com G ou .
 */
export class MainMenuScene extends Phaser.Scene {
  private rays!: Phaser.GameObjects.Image;
  private logo!: Phaser.GameObjects.Text;
  private list!: ButtonList;
  private stamps: Phaser.GameObjects.Text[] = [];
  private film!: FilmView;
  private leaving = false;
  /** Última opção escolhida (a cena é reaproveitada; o cursor volta para ela). */
  private lastIndex = OPTIONS.findIndex((o) => o.scene !== null);

  constructor() {
    super('MainMenuScene');
  }

  create(): void {
    this.leaving = false;
    this.stamps = [];
    this.cameras.main.setBackgroundColor('#2a1a10');
    this.cameras.main.fadeIn(200, 20, 12, 8);
    this.rays = addSunburst(this, 0x2e8b7e, 0x24766b);

    const cx = GAME_WIDTH / 2;
    addTitle(this, cx, 112, 'DERBY PVP', 96).setShadow(0, 0, '#ffe27a', 22, true, true).setDepth(5);
    this.logo = addTitle(this, cx, 112, 'DERBY PVP', 96).setDepth(6);
    const subtitle = addTitle(this, cx, 196, 'MENU PRINCIPAL', 32).setDepth(6);
    this.drawOrnaments(cx, 196, subtitle.width);
    this.drawPanel(cx, PANEL_Y);

    const y0 = PANEL_Y - BUTTON_GAP;
    this.list = new ButtonList(this, cx, y0, OPTIONS.map((o) => o.label), BUTTON_GAP, 10);
    OPTIONS.forEach((o, i) => {
      if (o.scene) return;
      this.list.buttons[i]!.setAlpha(DIMMED_ALPHA);
      this.stamps.push(
        this.add
          .text(cx + STAMP_DX, y0 + i * BUTTON_GAP + STAMP_DY, 'EM BREVE', {
            fontFamily: FONT_TITLE,
            fontSize: '22px',
            color: '#c8102e',
            stroke: '#fff3d6',
            strokeThickness: 6,
          })
          .setOrigin(0.5)
          .setAngle(STAMP_ANGLE)
          .setDepth(13),
      );
    });
    this.list.index = Math.max(0, this.lastIndex);
    this.list.refresh();

    this.add
      .text(cx, GAME_HEIGHT - 26, 'J1: W/S · F confirma · G volta      J2: setas · ; confirma · . volta      Enter: confirma', {
        fontFamily: FONT_TEXT,
        fontSize: '18px',
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

  /** Linhas art déco dos dois lados do subtítulo, com losangos nas pontas. */
  private drawOrnaments(cx: number, y: number, textW: number): void {
    const g = this.add.graphics().setDepth(5);
    for (const s of [-1, 1]) {
      const inner = cx + s * (textW / 2 + 22);
      const outer = cx + s * (PANEL_W / 2);
      for (const [w, color] of [
        [7, INK],
        [3, CREAM],
      ] as const) {
        g.lineStyle(w, color, 1);
        g.lineBetween(inner, y - 5, outer, y - 5);
        g.lineBetween(inner + s * 14, y + 5, outer - s * 14, y + 5);
      }
      for (const [r, color] of [
        [10, INK],
        [6, CREAM],
      ] as const) {
        g.fillStyle(color, 1);
        g.fillPoints(
          [
            { x: outer, y: y - r },
            { x: outer + r, y },
            { x: outer, y: y + r },
            { x: outer - r, y },
          ],
          true,
        );
      }
    }
  }

  /** Cartaz escuro com borda dupla creme e leques nos cantos (como a pausa). */
  private drawPanel(cx: number, cy: number): void {
    const g = this.add.graphics().setDepth(4);
    const x = cx - PANEL_W / 2;
    const y = cy - PANEL_H / 2;
    g.fillStyle(INK, 0.72);
    g.fillRoundedRect(x, y, PANEL_W, PANEL_H, 18);
    g.lineStyle(4, CREAM, 1);
    g.strokeRoundedRect(x + 10, y + 10, PANEL_W - 20, PANEL_H - 20, 12);
    g.lineStyle(1.5, CREAM, 1);
    g.strokeRoundedRect(x + 20, y + 20, PANEL_W - 40, PANEL_H - 40, 8);
    for (const [fx, fy, a] of [
      [x + 20, y + 20, 0],
      [x + PANEL_W - 20, y + 20, Math.PI / 2],
      [x + 20, y + PANEL_H - 20, -Math.PI / 2],
      [x + PANEL_W - 20, y + PANEL_H - 20, Math.PI],
    ] as const) {
      for (let i = 0; i <= 4; i++) {
        const ang = a + (i / 4) * (Math.PI / 2);
        g.lineBetween(fx, fy, fx + Math.cos(ang) * 30, fy + Math.sin(ang) * 30);
      }
    }
  }

  override update(time: number): void {
    const t = time / 1000;
    this.rays.setRotation(t * 0.07);
    this.logo.setScale(1 + Math.sin(t * 2.2) * 0.012);
    this.list.update(t);
    // Os carimbos fervem junto com as placas.
    const boil = (Math.floor(t * BOIL_FPS) % 3) - 1;
    for (const s of this.stamps) s.setAngle(STAMP_ANGLE + boil * 0.8);
    this.film.update(t, Math.min(0.25, this.game.loop.rawDelta / 1000));

    if (this.leaving) return;
    const input = readMenuInput();
    if (input.players.some((p) => p.back)) {
      audio.play('menu-voltar');
      this.leave('TitleScene');
      return;
    }
    const chosen = this.list.handle(input, () => audio.play('menu-mover'));
    if (chosen === null) return;
    const scene = OPTIONS[chosen]!.scene;
    // Opção "EM BREVE": confirmar não faz nada.
    if (!scene) return;
    audio.play('menu-confirmar');
    this.lastIndex = chosen;
    this.leave(scene);
  }

  private leave(scene: string): void {
    this.leaving = true;
    this.cameras.main.fadeOut(220, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene));
  }
}
