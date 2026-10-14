import Phaser from 'phaser';
import { BOIL_FPS, GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { audio } from '../audio/AudioManager';
import { getTeam } from '../data/teams';
import type { TeamId } from '../data/teams';
import type { KitVariant } from '../sim/kits';
import { sideLabel } from '../core/modes';
import type { GameMode } from '../core/modes';
import type { CpuLevel } from '../sim/cpu';
import { crestKey, generateCrestTextures } from '../art/crest-art';
import { CROWD_KEY, FAN_BOILS, FAN_VARIANTS, fanFrame } from '../art/crowd-art';
import { CREAM, CREAM_CSS, FONT_TEXT, FONT_TITLE, INK, INK_CSS } from '../art/style';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
import { addSunburst, addTitle, ButtonList, readMenuInput } from '../render/menu';

/** Largura máxima do nome do vencedor e o espaço entre ele e o escudo (px). */
const WINNER_NAME_MAX_W = 520;
const WINNER_GAP = 36;

export interface ResultData {
  teams: [TeamId, TeamId];
  seed: number;
  score: [number, number];
  /** Gols nos pênaltis (se houve disputa). */
  penalties: [number, number] | null;
  /** Vencedor (0 = J1, 1 = J2). */
  winner: 0 | 1;
  /** Cores das camisas usadas (para os detalhes). */
  colors: [number, number];
  /** Uniformes usados (a revanche e a nova seleção partem deles). */
  kits: [KitVariant, KitVariant];
  /** Modo e nível do CPU da partida (a revanche repete). */
  mode: GameMode;
  cpuLevel?: CpuLevel;
}

/**
 * Resultado: placar final (com pênaltis, se houver), vencedor em destaque com a torcida dele
 * comemorando, e as opções Revanche, Trocar times e Menu principal.
 */
export class ResultScene extends Phaser.Scene {
  private data_!: ResultData;
  private list!: ButtonList;
  private rays!: Phaser.GameObjects.Image;
  private film!: FilmView;
  private fans: { img: Phaser.GameObjects.Image; v: number; phase: number; baseY: number }[] = [];
  private winnerCrest!: Phaser.GameObjects.Image;
  private leaving = false;

  constructor() {
    super('ResultScene');
  }

  init(data: ResultData): void {
    this.data_ = data;
  }

  create(): void {
    const d = this.data_;
    this.leaving = false;
    this.fans = [];
    this.cameras.main.setBackgroundColor('#2a1a10');
    this.cameras.main.fadeIn(250, 20, 12, 8);
    const wc = d.colors[d.winner];
    this.rays = addSunburst(this, 0xe8b04b, 0xc9902f);
    generateCrestTextures(this);
    addTitle(this, GAME_WIDTH / 2, 56, 'FIM DE JOGO', 60);

    // Placa do placar final (mais alta quando houve pênaltis, para a linha extra).
    const plateH = d.penalties ? 150 : 132;
    const scoreY = d.penalties ? 160 : 166;
    const g = this.add.graphics();
    g.fillStyle(INK, 1);
    g.fillRoundedRect(GAME_WIDTH / 2 - 330, 104, 660, plateH, 16);
    g.fillStyle(CREAM, 1);
    g.fillRoundedRect(GAME_WIDTH / 2 - 320, 114, 640, plateH - 20, 10);
    g.lineStyle(2, INK, 1);
    g.strokeRoundedRect(GAME_WIDTH / 2 - 310, 124, 620, plateH - 40, 6);
    for (const team of [0, 1] as const) {
      const s = team === 0 ? -1 : 1;
      this.add.image(GAME_WIDTH / 2 + s * 250, scoreY + 4, crestKey(d.teams[team])).setScale(0.62);
      this.add
        .text(GAME_WIDTH / 2 + s * 150, scoreY + 4, getTeam(d.teams[team]).short, { fontFamily: FONT_TITLE, fontSize: '40px', color: INK_CSS })
        .setOrigin(0.5);
    }
    this.add
      .text(GAME_WIDTH / 2, scoreY, `${d.score[0]} – ${d.score[1]}`, { fontFamily: FONT_TEXT, fontSize: '62px', fontStyle: '700', color: INK_CSS })
      .setOrigin(0.5);
    if (d.penalties) {
      this.add
        .text(GAME_WIDTH / 2, 218, `PÊNALTIS ${d.penalties[0]} – ${d.penalties[1]}`, { fontFamily: FONT_TEXT, fontSize: '22px', fontStyle: '700', color: INK_CSS })
        .setOrigin(0.5);
    }

    // Vencedor em destaque: escudo + nome centralizados juntos (nomes longos diminuem).
    const winner = getTeam(d.teams[d.winner]);
    const name = addTitle(this, 0, 350, winner.name.toUpperCase(), 56, wc);
    if (name.width > WINNER_NAME_MAX_W) name.setFontSize(Math.floor((56 * WINNER_NAME_MAX_W) / name.width));
    this.winnerCrest = this.add.image(0, 330, crestKey(winner.id)).setScale(1.05);
    const crestW = this.winnerCrest.displayWidth;
    const left = GAME_WIDTH / 2 - (crestW + WINNER_GAP + name.width) / 2;
    this.winnerCrest.setX(left + crestW / 2);
    const textX = left + crestW + WINNER_GAP + name.width / 2;
    name.setX(textX);
    this.add
      .text(textX, 300, 'VENCEDOR', { fontFamily: FONT_TEXT, fontSize: '28px', fontStyle: '700', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 5 })
      .setOrigin(0.5);
    this.add
      .text(textX, 396, sideLabel(d.mode, d.winner), { fontFamily: FONT_TEXT, fontSize: '20px', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 4 })
      .setOrigin(0.5);

    // A torcida do vencedor comemorando (mesmas texturas da partida).
    if (this.textures.exists(CROWD_KEY)) {
      for (let row = 0; row < 3; row++) {
        for (let x = 10 + row * 9; x < GAME_WIDTH; x += 30) {
          const v = (x * 7 + row * 3) % FAN_VARIANTS;
          const baseY = GAME_HEIGHT - 6 - row * 26;
          const img = this.add
            .image(x, baseY, CROWD_KEY, fanFrame(d.winner, v, 2, 0))
            .setOrigin(0.5, 1)
            .setScale(1.25 - row * 0.12)
            .setDepth(-row);
          this.fans.push({ img, v, phase: (x * 0.37 + row) % 6.28, baseY });
        }
      }
    }

    this.list = new ButtonList(this, GAME_WIDTH / 2, 470, ['REVANCHE', 'TROCAR TIMES', 'MENU PRINCIPAL'], 62, 10);
    this.film = new FilmView(this, filmEffectsEnabled(this));
    readMenuInput();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.film.destroy());
    audio.play('torcida');
  }

  override update(time: number): void {
    const t = time / 1000;
    this.rays.setRotation(t * 0.07);
    this.film.update(t, Math.min(0.25, this.game.loop.rawDelta / 1000));
    this.list.update(t);
    this.winnerCrest.setScale(1.05 + Math.abs(Math.sin(t * 3)) * 0.06).setAngle(Math.sin(t * 2) * 4);
    const boil = Math.floor(t * BOIL_FPS) % FAN_BOILS;
    for (const f of this.fans) {
      const s = Math.sin(t * 7 + f.phase);
      f.img.setFrame(fanFrame(this.data_.winner, f.v, s > 0 ? 3 : 2, boil)).setY(f.baseY - Math.abs(s) * 8);
    }
    if (this.leaving) return;
    const chosen = this.list.handle(readMenuInput(), () => audio.play('menu-mover'));
    if (chosen === null) return;
    audio.play('menu-confirmar');
    const d = this.data_;
    const go = (scene: string, data: object): void => {
      this.leaving = true;
      this.cameras.main.fadeOut(220, 20, 12, 8);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
    };
    if (chosen === 0) go('VersusScene', { teams: d.teams, seed: d.seed, kits: d.kits, mode: d.mode, cpuLevel: d.cpuLevel });
    else if (chosen === 1) go('TeamSelectScene', { teams: d.teams, kits: d.kits });
    else go('MainMenuScene', {});
  }
}
