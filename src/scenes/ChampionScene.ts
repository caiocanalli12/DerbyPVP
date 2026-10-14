import Phaser from 'phaser';
import { BOIL_FPS, GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { audio } from '../audio/AudioManager';
import { getTeam } from '../data/teams';
import { crestKey, generateCrestTextures } from '../art/crest-art';
import { CROWD_KEY, FAN_BOILS, FAN_VARIANTS, fanFrame } from '../art/crowd-art';
import { playerTextureKey } from '../art/match-art';
import { frameName, ORIGIN_TALL } from '../art/player-art';
import { CREAM_CSS, FONT_TEXT, INK_CSS } from '../art/style';
import { generateTrophyTextures, TROPHY_KEY, TROPHY_ORIGIN, trophyFrame } from '../art/trophy-art';
import { BOIL_VARIANTS } from '../art/ui-art';
import { kitOf } from '../sim/kits';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
import { addSunburst, addTitle, ButtonList, readMenuInput, setGlow } from '../render/menu';
import { ROLES } from '../sim/player';
import type { Tournament } from '../sim/tournament';

export interface ChampionData {
  tournament: Tournament;
}

/** Troféu (px): pé e escala. */
const TROPHY_X = GAME_WIDTH / 2;
const TROPHY_Y = 412;
const TROPHY_SCALE = 0.86;
/** Brilhos em volta do troféu: posição relativa ao pé (px), tamanho e fase. */
const SPARKLES: readonly [dx: number, dy: number, size: number, phase: number][] = [
  [-150, -250, 16, 0],
  [138, -268, 13, 1.7],
  [-120, -120, 10, 3.1],
  [160, -150, 15, 4.4],
  [-62, -300, 9, 2.4],
  [80, -40, 11, 5.2],
  [-170, -30, 12, 0.9],
  [24, -330, 14, 3.8],
];
/** Jogadores comemorando: posições X, pés em Y, escala e animação (quadros por s). */
const CELEBRATE_X: readonly number[] = [400, 520, 640, 760, 880];
const CELEBRATE_Y = 690;
const CELEBRATE_SCALE = 1.35;
const CELEBRATE_FPS = 10;
const CELEBRATE_FRAMES = 5;
/** Entrada elástica do título (s). */
const TITLE_IN = 0.7;

/**
 * Título do campeonato: "CAMPEÃO!" com um troféu dourado (fervendo, com brilhos), o time do
 * jogador comemorando e a torcida pulando. Opções: Novo campeonato e Menu principal.
 */
export class ChampionScene extends Phaser.Scene {
  private t!: Tournament;
  private rays!: Phaser.GameObjects.Image;
  private film!: FilmView;
  private title!: Phaser.GameObjects.Text;
  private trophy!: Phaser.GameObjects.Image;
  private sparkles!: Phaser.GameObjects.Graphics;
  private crest!: Phaser.GameObjects.Image;
  private players: { img: Phaser.GameObjects.Image; key: string; phase: number }[] = [];
  private fans: { img: Phaser.GameObjects.Image; v: number; phase: number; baseY: number }[] = [];
  private list!: ButtonList;
  private startedAt = 0;
  private leaving = false;

  constructor() {
    super('ChampionScene');
  }

  init(data: ChampionData): void {
    this.t = data.tournament;
  }

  create(): void {
    this.leaving = false;
    this.players = [];
    this.fans = [];
    this.startedAt = performance.now() / 1000;
    this.cameras.main.setBackgroundColor('#2a1a10');
    this.cameras.main.fadeIn(300, 20, 12, 8);
    this.rays = addSunburst(this, 0xe8b04b, 0xd3913a);
    generateCrestTextures(this);
    generateTrophyTextures(this);
    const team = getTeam(this.t.player);
    const color = kitOf(team.id, 'home').shirt;

    this.title = setGlow(addTitle(this, GAME_WIDTH / 2, 72, 'CAMPEÃO!', 92), '#fff2b0', 26).setDepth(8);
    this.trophy = this.add
      .image(TROPHY_X, TROPHY_Y, TROPHY_KEY, trophyFrame(0))
      .setOrigin(TROPHY_ORIGIN.x, TROPHY_ORIGIN.y)
      .setScale(TROPHY_SCALE)
      .setDepth(4);
    this.sparkles = this.add.graphics().setDepth(5);

    // O time campeão à esquerda; as opções à direita.
    this.crest = this.add.image(290, 236, crestKey(team.id)).setScale(1.1).setDepth(5);
    const name = addTitle(this, 290, 342, team.name.toUpperCase(), 40, color).setDepth(5);
    if (name.width > 400) name.setFontSize(Math.floor((40 * 400) / name.width));
    this.add
      .text(290, 388, `CAMPEONATO · DIFICULDADE ${this.t.difficulty === 'facil' ? 'FÁCIL' : 'DIFÍCIL'}`, {
        fontFamily: FONT_TEXT,
        fontSize: '19px',
        fontStyle: '700',
        color: CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(5);
    this.list = new ButtonList(this, 990, 236, ['NOVO CAMPEONATO', 'MENU PRINCIPAL'], 66, 10);

    // A torcida (mesma textura da final; o jogador é sempre o lado esquerdo, o time 0) pulando.
    if (this.textures.exists(CROWD_KEY)) {
      for (let row = 0; row < 3; row++) {
        for (let x = 10 + row * 9; x < GAME_WIDTH; x += 30) {
          const v = (x * 7 + row * 3) % FAN_VARIANTS;
          const baseY = GAME_HEIGHT - 6 - row * 26;
          const img = this.add
            .image(x, baseY, CROWD_KEY, fanFrame(0, v, 2, 0))
            .setOrigin(0.5, 1)
            .setScale(1.25 - row * 0.12)
            .setDepth(-row);
          this.fans.push({ img, v, phase: (x * 0.37 + row) % 6.28, baseY });
        }
      }
    }
    // Os cinco do time comemorando, na frente da torcida.
    ROLES.forEach((_, i) => {
      const key = playerTextureKey(i);
      if (!this.textures.exists(key)) return;
      const img = this.add
        .image(CELEBRATE_X[i]!, CELEBRATE_Y, key, frameName('celebrate', 'front', 0, 0))
        .setOrigin(ORIGIN_TALL.x, ORIGIN_TALL.y)
        .setScale(CELEBRATE_SCALE)
        .setDepth(6);
      this.players.push({ img, key, phase: i * 1.37 });
    });

    this.film = new FilmView(this, filmEffectsEnabled(this));
    readMenuInput();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.film.destroy());
    audio.play('torcida');
  }

  override update(time: number): void {
    const t = time / 1000;
    const real = performance.now() / 1000 - this.startedAt;
    this.rays.setRotation(t * 0.07);
    this.film.update(t, Math.min(0.25, this.game.loop.rawDelta / 1000));
    this.list.update(t);

    // Título elástico na entrada (mola amortecida), depois pulsando de leve.
    const k = Math.min(1, real / TITLE_IN);
    const spring = k < 1 ? 1 - Math.exp(-6 * k) * Math.cos(k * 12) : 1;
    this.title.setScale(Math.max(0.05, spring) * (1 + Math.sin(t * 3) * 0.02));

    const boil = Math.floor(t * BOIL_FPS);
    this.trophy.setFrame(trophyFrame(boil % BOIL_VARIANTS)).setY(TROPHY_Y + Math.sin(t * 1.6) * 3);
    this.crest.setScale(1.1 + Math.abs(Math.sin(t * 3)) * 0.05).setAngle(Math.sin(t * 2) * 4);

    // Brilhos: estrelinhas de quatro pontas acendendo e apagando.
    const g = this.sparkles;
    g.clear();
    for (const [dx, dy, size, phase] of SPARKLES) {
      const s = Math.max(0, Math.sin(t * 2.6 + phase));
      if (s < 0.05) continue;
      const r = size * s;
      const x = TROPHY_X + dx;
      const y = this.trophy.y + dy;
      const pts = [
        { x, y: y - r },
        { x: x + r * 0.22, y: y - r * 0.22 },
        { x: x + r, y },
        { x: x + r * 0.22, y: y + r * 0.22 },
        { x, y: y + r },
        { x: x - r * 0.22, y: y + r * 0.22 },
        { x: x - r, y },
        { x: x - r * 0.22, y: y - r * 0.22 },
      ];
      g.fillStyle(0xfff6d0, 0.95);
      g.fillPoints(pts, true);
      g.lineStyle(1.5, 0x1a1410, 0.8);
      g.strokePoints(pts, true);
    }

    for (const p of this.players) {
      const f = Math.floor(t * CELEBRATE_FPS + p.phase * 3) % CELEBRATE_FRAMES;
      p.img.setFrame(frameName('celebrate', 'front', f, 0)).setY(CELEBRATE_Y - Math.abs(Math.sin(t * 5 + p.phase)) * 16);
    }
    const fanBoil = boil % FAN_BOILS;
    for (const f of this.fans) {
      const s = Math.sin(t * 7 + f.phase);
      f.img.setFrame(fanFrame(0, f.v, s > 0 ? 3 : 2, fanBoil)).setY(f.baseY - Math.abs(s) * 8);
    }

    if (this.leaving) return;
    const chosen = this.list.handle(readMenuInput(), () => audio.play('menu-mover'));
    if (chosen === null) return;
    audio.play('menu-confirmar');
    this.leaving = true;
    const [scene, data] = chosen === 0 ? ['SoloSetupScene', { team: this.t.player }] : ['MainMenuScene', {}];
    this.cameras.main.fadeOut(220, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
