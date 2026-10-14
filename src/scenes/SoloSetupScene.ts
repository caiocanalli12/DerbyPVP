import Phaser from 'phaser';
import {
  BOIL_FPS,
  CHAMPIONSHIP_LEVELS,
  GAME_HEIGHT,
  GAME_WIDTH,
  PREVIEW_BREATH_AMOUNT,
  PREVIEW_BREATH_HZ,
  PREVIEW_SWAY_DEG,
  PREVIEW_SWAY_HZ,
} from '../config/constants';
import { audio } from '../audio/AudioManager';
import { getTeam, TEAMS } from '../data/teams';
import type { TeamId } from '../data/teams';
import { crestKey, generateCrestTextures } from '../art/crest-art';
import { generateKitPreview, previewKey } from '../art/preview-art';
import { CREAM, CREAM_CSS, FONT_TEXT, FONT_TITLE, INK, INK_CSS } from '../art/style';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
import { addSunburst, addTitle, ButtonList, drawLevelStars, readMenuInput } from '../render/menu';
import { kitOf } from '../sim/kits';
import { CHAMPIONSHIP_DIFFICULTIES, createTournament, ROUND_NAMES } from '../sim/tournament';
import type { ChampionshipDifficulty } from '../sim/tournament';
import type { BracketData } from './BracketScene';
import { levelStars } from './BracketScene';

export interface SoloSetupData {
  /** Time que começa escolhido (o do campeonato anterior). */
  team?: TeamId;
}

const COLS = 4;
/** Painel (px), grade de escudos e prévia do uniforme. */
const PANEL = { x: 60, y: 128, w: 1160, h: 520 };
const GRID_X = 770;
const GRID_Y = 280;
const GRID_DX = 128;
const GRID_DY = 130;
const CREST_X = 300;
const PREVIEW_X = 500;
const PREVIEW_SCALE = 0.95;
/** Explicação de cada dificuldade. */
const DIFFICULTY_TEXT: Readonly<Record<ChampionshipDifficulty, string>> = {
  facil: 'Para aprender: o adversário mais forte é de nível médio.',
  dificil: 'Para os craques: a final é contra o adversário mais difícil.',
};
const DIFFICULTY_LABEL: Readonly<Record<ChampionshipDifficulty, string>> = { facil: 'FÁCIL', dificil: 'DIFÍCIL' };

/**
 * Começo do campeonato: escolha do time (grade dos 8, um cursor só, com qualquer conjunto de
 * teclas) e depois da dificuldade (FÁCIL ou DIFÍCIL, com o nível do adversário em cada fase).
 */
export class SoloSetupScene extends Phaser.Scene {
  private step: 'team' | 'difficulty' = 'team';
  private index = 0;
  private rays!: Phaser.GameObjects.Image;
  private film!: FilmView;
  private subtitle!: Phaser.GameObjects.Text;
  private crest!: Phaser.GameObjects.Image;
  private name!: Phaser.GameObjects.Text;
  private preview!: Phaser.GameObjects.Image;
  private grid: Phaser.GameObjects.Image[] = [];
  private cursor!: Phaser.GameObjects.Graphics;
  private difficulty!: ButtonList;
  private explain!: Phaser.GameObjects.Text;
  private roundsGfx!: Phaser.GameObjects.Graphics;
  private roundTexts: Phaser.GameObjects.Text[] = [];
  private hint!: Phaser.GameObjects.Text;
  private leaving = false;
  private initialTeam: TeamId = 'PAL';

  constructor() {
    super('SoloSetupScene');
  }

  init(data: SoloSetupData): void {
    this.initialTeam = data.team ?? 'PAL';
  }

  create(): void {
    this.leaving = false;
    this.step = 'team';
    this.grid = [];
    this.roundTexts = [];
    this.index = Math.max(0, TEAMS.findIndex((t) => t.id === this.initialTeam));
    this.cameras.main.setBackgroundColor('#2a1a10');
    this.cameras.main.fadeIn(200, 20, 12, 8);
    this.rays = addSunburst(this, 0x2f5d8a, 0x264c72);
    generateCrestTextures(this);
    addTitle(this, GAME_WIDTH / 2, 50, 'CAMPEONATO', 56).setDepth(5);
    this.subtitle = this.add
      .text(GAME_WIDTH / 2, 100, '', { fontFamily: FONT_TITLE, fontSize: '26px', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(5);

    const g = this.add.graphics().setDepth(1);
    const { x, y, w, h } = PANEL;
    g.fillStyle(INK, 0.82);
    g.fillRoundedRect(x, y, w, h, 18);
    g.lineStyle(4, CREAM, 1);
    g.strokeRoundedRect(x + 10, y + 10, w - 20, h - 20, 12);
    g.lineStyle(1.5, CREAM, 1);
    g.strokeRoundedRect(x + 20, y + 20, w - 40, h - 40, 8);
    // Divisória entre o time escolhido e as opções.
    g.lineStyle(2, CREAM, 0.6);
    g.lineBetween(640, y + 50, 640, y + h - 50);

    // Time escolhido: escudo, nome e o jogador com o uniforme titular.
    this.crest = this.add.image(CREST_X, 320, crestKey('PAL')).setScale(1.15).setDepth(5);
    this.name = this.add
      .text(CREST_X + 100, 512, '', { fontFamily: FONT_TITLE, fontSize: '34px', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 7 })
      .setOrigin(0.5)
      .setDepth(5);
    this.add.ellipse(PREVIEW_X, 446, 120, 24, 0x1a1410, 0.45).setDepth(4);
    this.preview = this.add.image(PREVIEW_X, 452, crestKey('PAL')).setOrigin(0.5, 1).setScale(PREVIEW_SCALE).setDepth(5);

    // Grade dos 8 times.
    TEAMS.forEach((t, k) => {
      const gx = GRID_X + (k % COLS) * GRID_DX;
      const gy = GRID_Y + Math.floor(k / COLS) * GRID_DY;
      this.grid.push(this.add.image(gx, gy, crestKey(t.id)).setScale(0.62).setDepth(5));
    });
    this.cursor = this.add.graphics().setDepth(6);

    // Dificuldade (aparece no segundo passo, no lugar da grade).
    this.difficulty = new ButtonList(this, 930, 240, CHAMPIONSHIP_DIFFICULTIES.map((d) => DIFFICULTY_LABEL[d]), 70, 10);
    this.explain = this.add
      .text(930, 360, '', { fontFamily: FONT_TEXT, fontSize: '20px', color: CREAM_CSS, align: 'center', wordWrap: { width: 500 } })
      .setOrigin(0.5)
      .setDepth(5);
    this.roundsGfx = this.add.graphics().setDepth(5);
    ROUND_NAMES.forEach((r, i) => {
      this.roundTexts.push(
        this.add
          .text(800, 420 + i * 44, r, { fontFamily: FONT_TEXT, fontSize: '20px', fontStyle: '700', color: CREAM_CSS })
          .setOrigin(0, 0.5)
          .setDepth(5),
      );
    });

    this.hint = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT - 30, '', { fontFamily: FONT_TEXT, fontSize: '18px', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(6);

    this.film = new FilmView(this, filmEffectsEnabled(this));
    readMenuInput();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.film.destroy());
    this.setStep('team');
    this.refreshTeam();
  }

  private team(): TeamId {
    return TEAMS[this.index]!.id;
  }

  private setStep(step: 'team' | 'difficulty'): void {
    this.step = step;
    const team = step === 'team';
    this.subtitle.setText(team ? 'ESCOLHA SEU TIME' : 'ESCOLHA A DIFICULDADE');
    for (const c of this.grid) c.setVisible(team);
    this.cursor.setVisible(team);
    this.difficulty.setVisible(!team);
    this.explain.setVisible(!team);
    this.roundsGfx.setVisible(!team);
    for (const t of this.roundTexts) t.setVisible(!team);
    this.hint.setText(
      team
        ? 'W A S D ou setas escolhem · F, ; ou Enter confirmam · G ou . voltam ao menu'
        : 'W/S ou ↑/↓ escolhem · F, ; ou Enter começam o campeonato · G ou . voltam ao time',
    );
    if (!team) this.refreshDifficulty();
  }

  private refreshTeam(): void {
    const team = getTeam(this.team());
    this.crest.setTexture(crestKey(team.id));
    this.name.setText(team.name.toUpperCase());
    const kitId = `${team.id}-home`;
    generateKitPreview(this, kitId, kitOf(team.id, 'home'), 9);
    this.preview.setTexture(previewKey(kitId));
  }

  /** Explicação e as estrelas do adversário em cada fase, para a dificuldade selecionada. */
  private refreshDifficulty(): void {
    const d = CHAMPIONSHIP_DIFFICULTIES[this.difficulty.index]!;
    this.explain.setText(DIFFICULTY_TEXT[d]);
    const g = this.roundsGfx;
    g.clear();
    CHAMPIONSHIP_LEVELS[d].forEach((level, i) => drawLevelStars(g, 1000, 420 + i * 44, levelStars(level)));
  }

  override update(time: number): void {
    const t = time / 1000;
    this.rays.setRotation(-t * 0.05);
    this.film.update(t, Math.min(0.25, this.game.loop.rawDelta / 1000));
    this.difficulty.update(t);
    // Prévia viva, mas calma: respira e balança devagar, presa pelos pés.
    const breath = Math.sin(t * PREVIEW_BREATH_HZ * Math.PI * 2);
    const sway = Math.sin(t * PREVIEW_SWAY_HZ * Math.PI * 2);
    this.preview
      .setScale(PREVIEW_SCALE * (1 - breath * PREVIEW_BREATH_AMOUNT * 0.4), PREVIEW_SCALE * (1 + breath * PREVIEW_BREATH_AMOUNT))
      .setAngle(sway * PREVIEW_SWAY_DEG);
    this.crest.setScale(1.15 + Math.sin(t * 3) * 0.02);
    if (this.step === 'team') this.drawCursor(t);

    if (this.leaving) return;
    const input = readMenuInput();
    const back = input.players.some((p) => p.back);
    const confirm = input.enter || input.players.some((p) => p.confirm);

    if (this.step === 'difficulty') {
      if (back) {
        audio.play('menu-voltar');
        this.setStep('team');
        return;
      }
      const before = this.difficulty.index;
      const chosen = this.difficulty.handle(input, () => audio.play('menu-mover'));
      if (this.difficulty.index !== before) this.refreshDifficulty();
      if (chosen === null) return;
      audio.play('menu-confirmar');
      const tournament = createTournament(this.team(), CHAMPIONSHIP_DIFFICULTIES[chosen]!, (Date.now() ^ 0xc0ffee) >>> 0);
      const data: BracketData = { tournament, stage: 'draw' };
      this.leave('BracketScene', data);
      return;
    }

    if (back) {
      audio.play('menu-voltar');
      this.leave('MainMenuScene', {});
      return;
    }
    let col = this.index % COLS;
    let row = Math.floor(this.index / COLS);
    const rows = Math.ceil(TEAMS.length / COLS);
    for (const p of input.players) {
      if (p.left) col = (col + COLS - 1) % COLS;
      if (p.right) col = (col + 1) % COLS;
      if (p.up) row = (row + rows - 1) % rows;
      if (p.down) row = (row + 1) % rows;
    }
    const next = Math.min(TEAMS.length - 1, row * COLS + col);
    if (next !== this.index) {
      this.index = next;
      audio.play('menu-mover');
      this.refreshTeam();
    }
    if (confirm) {
      audio.play('menu-confirmar');
      this.setStep('difficulty');
    }
  }

  /** Moldura dourada fervendo em volta do escudo escolhido. */
  private drawCursor(t: number): void {
    const img = this.grid[this.index]!;
    const g = this.cursor;
    g.clear();
    const j = ((Math.floor(t * BOIL_FPS) % 3) - 1) * 1.5;
    const size = 96 + Math.sin(t * 6) * 3;
    g.lineStyle(7, INK, 1);
    g.strokeRoundedRect(img.x - size / 2 + j, img.y - size / 2 - j, size, size, 10);
    g.lineStyle(4, 0xffd24a, 1);
    g.strokeRoundedRect(img.x - size / 2 + j, img.y - size / 2 - j, size, size, 10);
  }

  private leave(scene: string, data: object): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(220, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
