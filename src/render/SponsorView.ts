/**
 * Placas de patrocínio na parede do fundo, alternando a cada 8 s com a virada de placa
 * giratória de três faces (lâminas verticais que giram em onda).
 */
import Phaser from 'phaser';
import {
  FIELD_LENGTH,
  SPONSOR_BOARDS,
  SPONSOR_FLIP_TIME,
  SPONSOR_SLATS,
  SPONSOR_SWITCH_TIME,
  WALL_BACK_HEIGHT,
} from '../config/constants';
import { project } from '../core/projection';
import { SPONSORS } from '../data/sponsors';
import { generateSponsorTextures, slatFrame, sponsorKey } from '../art/sponsor-art';

const DEPTH_SPONSORS = 60;
/** Atraso entre lâminas vizinhas na virada (s). */
const SLAT_DELAY = 0.035;
/** Atraso entre placas vizinhas (s). */
const BOARD_DELAY = 0.12;

interface Board {
  slats: Phaser.GameObjects.Image[];
}

export class SponsorView {
  private readonly boards: Board[] = [];
  private readonly backings: Phaser.GameObjects.Rectangle[] = [];
  private readonly slatW: number;

  constructor(scene: Phaser.Scene) {
    const gap = 0.35;
    const span = (FIELD_LENGTH - gap * (SPONSOR_BOARDS + 1)) / SPONSOR_BOARDS;
    const top = project(0, 0, WALL_BACK_HEIGHT * 0.92).y;
    const bottom = project(0, 0, WALL_BACK_HEIGHT * 0.08).y;
    const x0 = project(gap, 0).x;
    const x1 = project(gap + span, 0).x;
    const boardW = x1 - x0;
    const boardH = bottom - top;
    generateSponsorTextures(scene, boardW, boardH);
    this.slatW = boardW / SPONSOR_SLATS;
    for (let b = 0; b < SPONSOR_BOARDS; b++) {
      const left = project(gap + b * (span + gap), 0).x;
      // Fundo escuro do mecanismo (aparece entre as lâminas durante a virada).
      this.backings.push(
        scene.add
          .rectangle(left + boardW / 2, (top + bottom) / 2, boardW + 4, boardH + 4, 0x1a1410)
          .setStrokeStyle(2, 0x0d0a08)
          .setDepth(DEPTH_SPONSORS - 0.5),
      );
      const slats: Phaser.GameObjects.Image[] = [];
      for (let k = 0; k < SPONSOR_SLATS; k++) {
        slats.push(
          scene.add
            .image(left + (k + 0.5) * this.slatW, (top + bottom) / 2, sponsorKey(SPONSORS[b % SPONSORS.length]!.id), slatFrame(k))
            .setDisplaySize(this.slatW + 0.6, boardH)
            .setDepth(DEPTH_SPONSORS),
        );
      }
      this.boards.push({ slats });
    }
  }

  update(timeSec: number): void {
    const n = SPONSORS.length;
    this.boards.forEach((board, b) => {
      const t = timeSec - b * BOARD_DELAY;
      const cycle = Math.max(0, Math.floor(t / SPONSOR_SWITCH_TIME));
      const into = t - cycle * SPONSOR_SWITCH_TIME;
      const current = SPONSORS[(b + cycle) % n]!;
      const previous = SPONSORS[(b + cycle - 1 + n) % n]!;
      board.slats.forEach((img, k) => {
        const p = cycle === 0 ? 1 : (into - k * SLAT_DELAY) / SPONSOR_FLIP_TIME;
        let key: string;
        let sx: number;
        if (p >= 1) {
          key = sponsorKey(current.id);
          sx = 1;
        } else if (p < 0.5) {
          // Face antiga girando para dentro.
          key = sponsorKey(previous.id);
          sx = Math.cos(Math.max(0, p) * Math.PI);
        } else {
          key = sponsorKey(current.id);
          sx = -Math.cos(p * Math.PI);
        }
        const shade = 0.55 + 0.45 * Math.abs(sx);
        const c = Math.round(255 * shade);
        img
          .setTexture(key, slatFrame(k))
          .setDisplaySize(Math.max(0.5, (this.slatW + 0.6) * Math.abs(sx)), img.displayHeight)
          .setTint((c << 16) | (c << 8) | c);
      });
    });
  }

  destroy(): void {
    for (const b of this.boards) for (const s of b.slats) s.destroy();
    for (const r of this.backings) r.destroy();
    this.boards.length = 0;
  }
}
