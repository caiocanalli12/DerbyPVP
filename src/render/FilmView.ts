/**
 * Efeito de filme antigo em camadas (sem shader complexo): grão (4 texturas alternando),
 * riscos verticais e poeira de vez em quando, flicker sutil de ±3%, vinheta leve e papel
 * envelhecido sobre o campo e o estádio. Nunca pode atrapalhar a leitura do jogo.
 */
import Phaser from 'phaser';
import {
  FILM_DUST_RATE,
  FILM_DUST_TIME,
  FILM_FLICKER,
  FILM_GRAIN_ALPHA,
  FILM_GRAIN_FPS,
  FILM_PAPER_ALPHA,
  FILM_SCRATCH_RATE,
  FILM_SCRATCH_TIME,
  FILM_VIGNETTE_ALPHA,
  GAME_HEIGHT,
  GAME_WIDTH,
} from '../config/constants';
import { DEPTH_UI } from '../core/projection';
import { Rng } from '../core/rng';
import { DUST_KEY, generateFilmTextures, GRAIN_VARIANTS, grainKey, PAPER_KEY, SCRATCH_KEY, VIGNETTE_KEY } from '../art/film-fx';

/** Preferência dos efeitos de filme (menu de pausa); ?film=0 desliga para testar. */
export function filmEffectsEnabled(scene: Phaser.Scene): boolean {
  const stored = scene.registry.get('filmFx');
  if (typeof stored === 'boolean') return stored;
  return new URLSearchParams(window.location.search).get('film') !== '0';
}

export function setFilmEffectsEnabled(scene: Phaser.Scene, on: boolean): void {
  scene.registry.set('filmFx', on);
}

/** Por cima de tudo (até da interface), mas bem leve. */
const DEPTH_FILM = DEPTH_UI + 100;
/** O papel envelhecido fica sobre o campo e o estádio, abaixo da interface. */
const DEPTH_PAPER = DEPTH_UI - 38;

interface Transient {
  img: Phaser.GameObjects.Image;
  until: number;
}

export class FilmView {
  private readonly grain: Phaser.GameObjects.TileSprite;
  private readonly vignette: Phaser.GameObjects.Image;
  private readonly paper: Phaser.GameObjects.Image;
  private readonly flicker: Phaser.GameObjects.Rectangle;
  private readonly scratches: Transient[] = [];
  private readonly dust: Transient[] = [];
  private readonly rng = new Rng(4242);
  private enabled = true;

  constructor(scene: Phaser.Scene, enabled: boolean) {
    generateFilmTextures(scene);
    this.paper = scene.add
      .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, PAPER_KEY)
      .setAlpha(FILM_PAPER_ALPHA)
      .setBlendMode(Phaser.BlendModes.MULTIPLY)
      .setDepth(DEPTH_PAPER);
    this.vignette = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, VIGNETTE_KEY).setAlpha(FILM_VIGNETTE_ALPHA).setDepth(DEPTH_FILM);
    this.grain = scene.add
      .tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, grainKey(0))
      .setAlpha(FILM_GRAIN_ALPHA)
      .setDepth(DEPTH_FILM + 1);
    this.flicker = scene.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x000000, 0)
      .setDepth(DEPTH_FILM + 2);
    for (let i = 0; i < 3; i++) {
      this.scratches.push({
        img: scene.add.image(0, GAME_HEIGHT / 2, SCRATCH_KEY).setDisplaySize(6, GAME_HEIGHT * 1.1).setDepth(DEPTH_FILM + 1).setVisible(false),
        until: 0,
      });
    }
    for (let i = 0; i < 4; i++) {
      this.dust.push({ img: scene.add.image(0, 0, DUST_KEY).setDepth(DEPTH_FILM + 1).setVisible(false), until: 0 });
    }
    this.setEnabled(enabled);
  }

  setEnabled(on: boolean): void {
    this.enabled = on;
    for (const o of [this.grain, this.vignette, this.paper, this.flicker]) o.setVisible(on);
    if (!on) for (const t of [...this.scratches, ...this.dust]) t.img.setVisible(false);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  update(timeSec: number, dt: number): void {
    if (!this.enabled) return;
    this.grain
      .setTexture(grainKey(Math.floor(timeSec * FILM_GRAIN_FPS) % GRAIN_VARIANTS))
      .setTilePosition(this.rng.int(0, 255), this.rng.int(0, 255));
    // Flicker: variação de brilho global quase imperceptível (±3%).
    const f = (Math.sin(timeSec * 41) + Math.sin(timeSec * 23.3) + this.rng.range(-1, 1)) / 3;
    if (f >= 0) this.flicker.setFillStyle(0xfff8e6, f * FILM_FLICKER);
    else this.flicker.setFillStyle(0x000000, -f * FILM_FLICKER);

    for (const s of this.scratches) {
      if (s.img.visible && timeSec > s.until) s.img.setVisible(false);
      else if (!s.img.visible && this.rng.chance(FILM_SCRATCH_RATE * dt / this.scratches.length)) {
        s.until = timeSec + FILM_SCRATCH_TIME * this.rng.range(0.4, 1.4);
        s.img.setVisible(true).setX(this.rng.range(30, GAME_WIDTH - 30)).setAlpha(this.rng.range(0.25, 0.55));
      } else if (s.img.visible) {
        s.img.setX(s.img.x + this.rng.range(-1.5, 1.5));
      }
    }
    for (const d of this.dust) {
      if (d.img.visible && timeSec > d.until) d.img.setVisible(false);
      else if (!d.img.visible && this.rng.chance(FILM_DUST_RATE * dt / this.dust.length)) {
        d.until = timeSec + FILM_DUST_TIME * this.rng.range(0.6, 1.6);
        d.img
          .setVisible(true)
          .setPosition(this.rng.range(0, GAME_WIDTH), this.rng.range(0, GAME_HEIGHT))
          .setRotation(this.rng.range(0, Math.PI * 2))
          .setScale(this.rng.range(0.5, 1.2))
          .setAlpha(this.rng.range(0.35, 0.7));
      }
    }
  }

  destroy(): void {
    for (const o of [this.grain, this.vignette, this.paper, this.flicker]) o.destroy();
    for (const t of [...this.scratches, ...this.dust]) t.img.destroy();
  }
}
