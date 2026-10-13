/**
 * Clima: céu animado (sol/lua com rosto, nuvens), iluminação global (pôr do sol, noite com
 * cones dos refletores, chuva dessaturada) e chuva em traços com respingos.
 * Nunca mexe na física.
 */
import Phaser from 'phaser';
import {
  BOIL_FPS,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  RAIN_DROPS,
  RAIN_SLANT,
  RAIN_SPEED,
  RAIN_SPLASHES_PER_SEC,
  SKY_HEIGHT,
} from '../config/constants';
import { DEPTH_UI, project } from '../core/projection';
import { Rng } from '../core/rng';
import type { WeatherId } from '../data/weather';
import {
  cloudKey,
  generateWeatherTextures,
  LIGHT_CONE_KEY,
  moonKey,
  NIGHT_SHADE_KEY,
  SKY_FACE_VARIANTS,
  sunKey,
} from '../art/weather-art';
import { FLOODLIGHTS } from './shadows';

const DEPTH_SKY = 1;
export const DEPTH_RAIN = DEPTH_UI - 45;
export const DEPTH_GRADE = DEPTH_UI - 40;

interface Drop {
  x: number;
  y: number;
  len: number;
}

interface Splash {
  x: number;
  y: number;
  t: number;
}

export class WeatherView {
  private readonly skyObjects: Phaser.GameObjects.Image[] = [];
  private readonly clouds: { img: Phaser.GameObjects.Image; speed: number }[] = [];
  private readonly overlays: Phaser.GameObjects.GameObject[] = [];
  private readonly cones: Phaser.GameObjects.Image[] = [];
  private readonly rain: Phaser.GameObjects.Graphics | null = null;
  private readonly drops: Drop[] = [];
  private readonly splashes: Splash[] = [];
  private readonly skyMask: Phaser.GameObjects.Graphics;
  private readonly rng: Rng;
  private sun: Phaser.GameObjects.Image | null = null;
  private splashAcc = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly weather: WeatherId,
    seed: number,
  ) {
    this.rng = new Rng(seed ^ 0x77);
    generateWeatherTextures(scene);
    // Tudo do céu fica recortado na faixa de céu (atrás da cornija da arquibancada).
    this.skyMask = scene.make.graphics({}, false);
    this.skyMask.fillStyle(0xffffff, 1);
    this.skyMask.fillRect(0, 0, GAME_WIDTH, SKY_HEIGHT + 2);
    const mask = this.skyMask.createGeometryMask();

    if (weather === 'sunny') {
      this.sun = scene.add.image(1080, 34, sunKey(false, 0)).setScale(0.78).setDepth(DEPTH_SKY);
      this.addClouds('fluffy', 4, mask);
    } else if (weather === 'sunset') {
      this.sun = scene.add.image(210, SKY_HEIGHT - 4, sunKey(true, 0)).setScale(0.95).setDepth(DEPTH_SKY);
      this.addClouds('pink', 3, mask);
    } else if (weather === 'night') {
      this.sun = scene.add.image(1010, 34, moonKey(0)).setScale(0.62).setDepth(DEPTH_SKY);
    } else {
      this.addClouds('gray', 7, mask);
    }
    this.sun?.setMask(mask);
    if (this.sun) this.skyObjects.push(this.sun);

    this.buildGrading();
    if (weather === 'rain') {
      this.rain = scene.add.graphics().setDepth(DEPTH_RAIN);
      for (let i = 0; i < RAIN_DROPS; i++) {
        this.drops.push({ x: this.rng.range(-100, GAME_WIDTH), y: this.rng.range(0, GAME_HEIGHT), len: this.rng.range(10, 20) });
      }
    }
  }

  private addClouds(kind: 'fluffy' | 'gray' | 'pink', n: number, mask: Phaser.Display.Masks.GeometryMask): void {
    for (let i = 0; i < n; i++) {
      const img = this.scene.add
        .image(this.rng.range(0, GAME_WIDTH), this.rng.range(14, SKY_HEIGHT - 8), cloudKey(kind, i % SKY_FACE_VARIANTS))
        .setScale(this.rng.range(0.55, 0.95))
        .setAlpha(kind === 'gray' ? 0.95 : 0.92)
        .setDepth(DEPTH_SKY + 0.5)
        .setMask(mask);
      this.clouds.push({ img, speed: this.rng.range(4, 10) * (kind === 'gray' ? 1.6 : 1) });
    }
  }

  /** Iluminação global por cima do mundo (abaixo da interface). */
  private buildGrading(): void {
    const s = this.scene;
    const full = (color: number, alpha: number, mode: Phaser.BlendModes): Phaser.GameObjects.Rectangle =>
      s.add
        .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, color, alpha)
        .setBlendMode(mode)
        .setDepth(DEPTH_GRADE);
    const webgl = s.game.renderer.type === Phaser.WEBGL;
    switch (this.weather) {
      case 'sunset':
        this.overlays.push(full(0xffb07a, 0.5, Phaser.BlendModes.MULTIPLY));
        this.overlays.push(full(0xff7a8c, 0.07, Phaser.BlendModes.ADD));
        break;
      case 'night': {
        this.overlays.push(
          s.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, NIGHT_SHADE_KEY).setBlendMode(Phaser.BlendModes.MULTIPLY).setDepth(DEPTH_GRADE),
        );
        // Cones de luz dos 4 refletores, mirando o campo.
        const lamps = [
          { x: 46, y: 18 },
          { x: GAME_WIDTH - 46, y: 18 },
          { x: 28, y: 440 },
          { x: GAME_WIDTH - 28, y: 440 },
        ];
        lamps.forEach((lamp, i) => {
          const f = FLOODLIGHTS[i]!;
          const target = project(f.x < FIELD_LENGTH / 2 ? FIELD_LENGTH * 0.3 : FIELD_LENGTH * 0.7, f.y < 0 ? FIELD_WIDTH * 0.55 : FIELD_WIDTH * 0.35);
          const dx = target.x - lamp.x;
          const dy = target.y - lamp.y;
          const len = Math.hypot(dx, dy);
          const cone = s.add
            .image(lamp.x, lamp.y, LIGHT_CONE_KEY)
            .setOrigin(0.5, 0)
            .setRotation(Math.atan2(dy, dx) - Math.PI / 2)
            .setScale(1.6, (len * 1.25) / 512)
            .setBlendMode(Phaser.BlendModes.ADD)
            .setAlpha(0.33)
            .setDepth(DEPTH_GRADE + 1);
          this.cones.push(cone);
        });
        break;
      }
      case 'rain':
        if (webgl) {
          const fx = s.cameras.main.postFX.addColorMatrix();
          fx.saturate(-0.32);
        } else {
          this.overlays.push(full(0x9aa3ad, 0.18, Phaser.BlendModes.NORMAL));
        }
        this.overlays.push(full(0xc2ccd6, 0.6, Phaser.BlendModes.MULTIPLY));
        break;
      default:
        break;
    }
  }

  update(timeSec: number, dt: number): void {
    const boil = Math.floor(timeSec * BOIL_FPS) % SKY_FACE_VARIANTS;
    if (this.sun) {
      const key = this.weather === 'night' ? moonKey(boil) : sunKey(this.weather === 'sunset', boil);
      this.sun.setTexture(key);
      if (this.weather === 'sunny') this.sun.setRotation(Math.sin(timeSec * 0.6) * 0.06);
    }
    for (const c of this.clouds) {
      c.img.x += c.speed * dt;
      if (c.img.x - c.img.displayWidth / 2 > GAME_WIDTH) c.img.x = -c.img.displayWidth / 2;
      c.img.setTexture(c.img.texture.key.replace(/-\d$/, `-${boil}`));
    }
    for (let i = 0; i < this.cones.length; i++) this.cones[i]!.setAlpha(0.3 + Math.sin(timeSec * 7 + i * 1.7) * 0.015);
    if (this.rain) this.updateRain(timeSec, dt);
  }

  private updateRain(timeSec: number, dt: number): void {
    const g = this.rain!;
    g.clear();
    const boil = Math.floor(timeSec * BOIL_FPS);
    // Traços diagonais desenhados (com fervura: leve variação a 12 qps).
    g.lineStyle(1.9, 0xe4ecf5, 0.7);
    for (const d of this.drops) {
      d.y += RAIN_SPEED * dt;
      d.x += RAIN_SPEED * RAIN_SLANT * dt;
      if (d.y > GAME_HEIGHT + 20 || d.x > GAME_WIDTH + 30) {
        d.y = this.rng.range(-40, -5);
        d.x = this.rng.range(-200, GAME_WIDTH);
      }
      const wob = ((boil + Math.floor(d.len)) % 3) - 1;
      g.beginPath();
      g.moveTo(d.x + wob * 0.6, d.y);
      g.lineTo(d.x - d.len * RAIN_SLANT, d.y - d.len);
      g.strokePath();
    }
    // Respingos pequenos no gramado.
    this.splashAcc += RAIN_SPLASHES_PER_SEC * dt;
    while (this.splashAcc >= 1) {
      this.splashAcc -= 1;
      const p = project(this.rng.range(0, FIELD_LENGTH), this.rng.range(0, FIELD_WIDTH));
      this.splashes.push({ x: p.x, y: p.y, t: 0 });
    }
    g.lineStyle(1.2, 0xe8f0f8, 0.7);
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const s = this.splashes[i]!;
      s.t += dt;
      if (s.t > 0.3) {
        this.splashes.splice(i, 1);
        continue;
      }
      const r = 2 + s.t * 14;
      g.beginPath();
      g.arc(s.x, s.y, r, Math.PI * 1.1, Math.PI * 1.9);
      g.strokePath();
    }
  }

  destroy(): void {
    for (const o of this.skyObjects) o.destroy();
    for (const c of this.clouds) c.img.destroy();
    for (const o of this.overlays) o.destroy();
    for (const c of this.cones) c.destroy();
    this.rain?.destroy();
    this.skyMask.destroy();
    // Ao sair da cena o Phaser já destruiu a câmera (e o filtro junto): só limpa se ela ainda existir.
    const cam = this.scene.cameras.main as Phaser.Cameras.Scene2D.Camera | undefined;
    if (this.weather === 'rain' && this.scene.game.renderer.type === Phaser.WEBGL) cam?.postFX.clear();
  }
}
