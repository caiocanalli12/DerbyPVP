import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, VERSUS_DURATION } from '../config/constants';
import { Rng } from '../core/rng';
import { audio } from '../audio/AudioManager';
import { getTeam } from '../data/teams';
import type { TeamId } from '../data/teams';
import { getWeather, randomWeather } from '../data/weather';
import type { WeatherId } from '../data/weather';
import { artSignature, buildLooks, generateMatchArt, matchArtReady } from '../art/match-art';
import { crestKey, generateCrestTextures } from '../art/crest-art';
import { cloudKey, generateWeatherTextures, moonKey, sunKey } from '../art/weather-art';
import { CREAM, CREAM_CSS, FONT_TEXT, FONT_TITLE, INK, INK_CSS } from '../art/style';
import { chooseKits } from '../sim/kits';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
import { addSunburst, addTitle } from '../render/menu';
import type { MatchConfig } from './MatchScene';

export interface VersusData {
  teams: [TeamId, TeamId];
  /** Semente da arte (mantida na revanche para reaproveitar as texturas). */
  seed?: number;
}

/** Instante (s) do choque dos escudos e onde eles param (distância do centro). */
const CLASH_AT = 0.55;
const CREST_REST = 150;
const CREST_START = GAME_WIDTH / 2 + 160;
const CREST_Y = GAME_HEIGHT / 2 - 40;
/** Recuo depois do choque: distância (px) e duração de cada ida/volta (s). */
const RECOIL = 30;
const RECOIL_TIME = 0.22;
/** Cartaz do clima: posição inicial e quanto desce ao aparecer. */
const POSTER_Y = 120;
const POSTER_DROP = 8;

/**
 * Tela VS: escudos se chocando no centro, nomes dos times e o clima sorteado em estilo de
 * cartaz, por 2,5 s. Enquanto isso, desenha as texturas dos dois times da partida.
 *
 * A animação é calculada direto do relógio real (e não com tweens): a geração das texturas
 * deixa alguns quadros longos, e o delta suavizado do Phaser atrasaria os escudos em relação
 * ao choque.
 */
export class VersusScene extends Phaser.Scene {
  private config!: MatchConfig;
  private gen: Generator<number, void, void> | null = null;
  private rays!: Phaser.GameObjects.Image;
  private film!: FilmView;
  private crests!: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  private names: Phaser.GameObjects.Text[] = [];
  private vs!: Phaser.GameObjects.Text;
  private poster!: Phaser.GameObjects.Container;
  private impact!: Phaser.GameObjects.Graphics;
  private clashed = false;
  private started = 0;
  private leaving = false;

  constructor() {
    super('VersusScene');
  }

  init(data: VersusData): void {
    const seed = data.seed ?? (Date.now() >>> 0);
    const rng = new Rng((Date.now() ^ 0x5eed) >>> 0);
    const weather: WeatherId = randomWeather(() => rng.next());
    this.config = { teams: data.teams, seed, weather };
  }

  create(): void {
    this.leaving = false;
    this.clashed = false;
    // O relógio começa no primeiro quadro: se a criação demorar, a entrada não é pulada.
    this.started = -1;
    this.cameras.main.setBackgroundColor('#2a1a10');
    this.cameras.main.fadeIn(180, 20, 12, 8);
    this.rays = addSunburst(this, 0x2f4f8f, 0x27417a);
    generateCrestTextures(this);
    generateWeatherTextures(this);
    const [t1, t2] = this.config.teams;

    this.crests = [
      this.add.image(GAME_WIDTH / 2 - CREST_START, CREST_Y, crestKey(t1)).setScale(1.9).setDepth(5),
      this.add.image(GAME_WIDTH / 2 + CREST_START, CREST_Y, crestKey(t2)).setScale(1.9).setDepth(5),
    ];

    this.names = [];
    for (const [i, team] of [t1, t2].entries()) {
      const name = this.add
        .text(i === 0 ? GAME_WIDTH / 2 - 330 : GAME_WIDTH / 2 + 330, GAME_HEIGHT / 2 + 120, getTeam(team).name.toUpperCase(), {
          fontFamily: FONT_TITLE,
          fontSize: '40px',
          color: CREAM_CSS,
          stroke: INK_CSS,
          strokeThickness: 8,
        })
        .setOrigin(0.5)
        .setDepth(6)
        .setAlpha(0);
      this.names.push(name);
      this.add
        .text(name.x, name.y + 40, i === 0 ? 'JOGADOR 1' : 'JOGADOR 2', { fontFamily: FONT_TEXT, fontSize: '20px', color: CREAM_CSS })
        .setOrigin(0.5)
        .setDepth(6);
    }

    this.vs = addTitle(this, GAME_WIDTH / 2, CREST_Y, 'VS', 110, 0xffd24a).setDepth(7).setScale(0);
    this.impact = this.add.graphics().setDepth(6);
    this.poster = this.buildPoster();
    this.film = new FilmView(this, filmEffectsEnabled(this));

    // Texturas da partida (só os dois times, nos uniformes que vão ser usados).
    const kits = chooseKits(t1, t2);
    const signature = artSignature(this.config.teams, kits, this.config.seed);
    if (!matchArtReady(this, signature)) {
      const looks = buildLooks(this.config.teams, kits, this.config.seed);
      this.gen = generateMatchArt(this, looks, [kits.kits[0].shirt, kits.kits[1].shirt], signature);
    }
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.film.destroy());
  }

  /** Cartaz do clima ("HOJE: NOITE DE REFLETORES"). */
  private buildPoster(): Phaser.GameObjects.Container {
    const w = getWeather(this.config.weather);
    const c = this.add.container(GAME_WIDTH / 2, POSTER_Y).setDepth(8).setAlpha(0);
    const g = this.add.graphics();
    g.fillStyle(INK, 1);
    g.fillRoundedRect(-300, -46, 600, 92, 12);
    g.fillStyle(CREAM, 1);
    g.fillRoundedRect(-292, -38, 584, 76, 8);
    g.lineStyle(2, INK, 1);
    g.strokeRoundedRect(-284, -30, 568, 60, 6);
    const iconKey =
      w.id === 'sunny' ? sunKey(false, 0) : w.id === 'sunset' ? sunKey(true, 0) : w.id === 'night' ? moonKey(0) : cloudKey('gray', 0);
    const icon = this.add.image(-245, 0, iconKey).setScale(w.id === 'rain' ? 0.6 : 0.55);
    const text = this.add
      .text(25, 0, `HOJE: ${w.label}`, { fontFamily: FONT_TITLE, fontSize: '34px', color: INK_CSS })
      .setOrigin(0.5);
    c.add([g, icon, text]);
    return c;
  }

  override update(time: number): void {
    const now = time / 1000;
    if (this.started < 0) this.started = now;
    const t = now - this.started;
    this.rays.setRotation(t * 0.1);
    this.film.update(now, Math.min(0.25, this.game.loop.rawDelta / 1000));
    // Uma parte das texturas por quadro (a barra de progresso é a própria tela VS).
    if (this.gen && this.gen.next().done) this.gen = null;

    this.animate(t);
    if (!this.clashed && t >= CLASH_AT) {
      this.clashed = true;
      audio.play('apito');
      this.cameras.main.shake(260, 0.012);
      this.cameras.main.flash(120, 255, 245, 220);
    }
    // Linhas de impacto do choque.
    this.impact.clear();
    const k = t - CLASH_AT;
    if (k > 0 && k < 0.4) {
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2;
        const r0 = 60 + k * 200;
        const r1 = r0 + 50 * (1 - k * 2);
        const x0 = GAME_WIDTH / 2 + Math.cos(a) * r0;
        const y0 = CREST_Y + Math.sin(a) * r0;
        const x1 = GAME_WIDTH / 2 + Math.cos(a) * r1;
        const y1 = CREST_Y + Math.sin(a) * r1;
        this.impact.lineStyle(6, INK, 1 - k * 2.5);
        this.impact.lineBetween(x0, y0, x1, y1);
        this.impact.lineStyle(3, 0xffd24a, 1 - k * 2.5);
        this.impact.lineBetween(x0, y0, x1, y1);
      }
    }

    if (!this.leaving && t >= VERSUS_DURATION && !this.gen) {
      this.leaving = true;
      this.cameras.main.fadeOut(200, 20, 12, 8);
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('MatchScene', this.config));
    }
  }

  /** Escudos, nomes, "VS" e cartaz em função do tempo (s) desde o início da tela. */
  private animate(t: number): void {
    const ease = Phaser.Math.Easing;
    const clamp01 = (v: number): number => Phaser.Math.Clamp(v, 0, 1);
    const k = t - CLASH_AT;
    // Entrada acelerando até o choque; depois um recuo curto e a volta.
    let dist: number;
    if (k < 0) {
      dist = CREST_START + (CREST_REST - CREST_START) * ease.Back.In(clamp01(t / CLASH_AT));
    } else {
      const back = k < RECOIL_TIME ? ease.Quadratic.Out(k / RECOIL_TIME) : ease.Quadratic.Out(clamp01(2 - k / RECOIL_TIME));
      dist = CREST_REST + RECOIL * back;
    }
    this.crests[0].x = GAME_WIDTH / 2 - dist;
    this.crests[1].x = GAME_WIDTH / 2 + dist;
    for (const n of this.names) n.setAlpha(clamp01(k / 0.25));
    this.vs.setScale(k < 0 ? 0 : ease.Elastic.Out(clamp01(k / 0.6), 1.1, 0.4));
    this.vs.setAngle(k < 0 ? 0 : Math.sin(t * 5) * 3);
    const p = clamp01((k - 0.25) / 0.3);
    this.poster.setAlpha(p).setY(POSTER_Y + POSTER_DROP * p);
  }
}
