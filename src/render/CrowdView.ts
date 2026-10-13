/**
 * Torcida dividida ao meio (esquerda = J1, direita = J2) nas cores dos uniformes em campo.
 * Balança calma, agita quando o time ataca perto do gol adversário e pula no gol.
 */
import Phaser from 'phaser';
import {
  CROWD_EXCITED_HZ,
  CROWD_EXCITED_JUMP,
  CROWD_FLAG_FRACTION,
  CROWD_GOAL_JUMP,
  CROWD_ROWS,
  CROWD_SCALE_BACK,
  CROWD_SCALE_FRONT,
  CROWD_SIDE_COLUMNS,
  CROWD_SPACING,
  CROWD_SWAY_HZ,
  FIELD_WIDTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  SKY_HEIGHT,
  BOIL_FPS,
} from '../config/constants';
import { Rng } from '../core/rng';
import { CROWD_KEY, FAN_BOILS, FAN_VARIANTS, FLAG_FRAMES, fanFrame, flagFrame } from '../art/crowd-art';
import { BACK_WALL_TOP, sideStandEdge } from '../art/stadium-art';
import { unproject } from '../core/projection';

/** Ânimo de cada metade da torcida. */
export type CrowdMood = 'calm' | 'excited' | 'goal';

interface Fan {
  img: Phaser.GameObjects.Image;
  flag: Phaser.GameObjects.Image | null;
  team: 0 | 1;
  variant: number;
  phase: number;
  baseX: number;
  baseY: number;
  scale: number;
}

/** Faixa de profundidade da torcida (acima do fundo, abaixo das placas). */
const DEPTH_CROWD = 10;

export class CrowdView {
  private readonly fans: Fan[] = [];

  constructor(scene: Phaser.Scene, seed: number) {
    const rng = new Rng(seed ^ 0xc0ffee);
    const add = (x: number, y: number, scale: number, team: 0 | 1, depth: number): void => {
      const variant = rng.int(0, FAN_VARIANTS - 1);
      const img = scene.add
        .image(x, y, CROWD_KEY, fanFrame(team, variant, 0, 0))
        .setOrigin(0.5, 1)
        .setScale(scale)
        .setDepth(depth);
      let flag: Phaser.GameObjects.Image | null = null;
      if (rng.chance(CROWD_FLAG_FRACTION)) {
        flag = scene.add
          .image(x + 4 * scale, y - 18 * scale, CROWD_KEY, flagFrame(team, 0))
          .setOrigin(0.12, 1)
          .setScale(scale)
          .setDepth(depth + 0.01);
      }
      this.fans.push({ img, flag, team, variant, phase: rng.range(0, Math.PI * 2), baseX: x, baseY: y, scale });
    };

    // Arquibancada do fundo: fileiras de trás para a frente.
    const top = SKY_HEIGHT + 30;
    const bottom = BACK_WALL_TOP + 2;
    for (let r = 0; r < CROWD_ROWS; r++) {
      const t = r / (CROWD_ROWS - 1);
      const y = top + (bottom - top) * t;
      const scale = CROWD_SCALE_BACK + (CROWD_SCALE_FRONT - CROWD_SCALE_BACK) * t;
      const spacing = CROWD_SPACING * scale;
      const offset = (r % 2) * spacing * 0.5;
      for (let x = offset + rng.range(0, 4); x < GAME_WIDTH + spacing; x += spacing * rng.range(0.92, 1.1)) {
        // Corredores das escadas ficam vazios.
        if (Math.abs(((x - 160) % 320 + 320) % 320) < 9) continue;
        add(x, y + rng.range(-1.5, 1.5), scale, x < GAME_WIDTH / 2 ? 0 : 1, DEPTH_CROWD + r * 0.1);
      }
    }

    // Arquibancadas laterais (parciais), acompanhando a diagonal do campo.
    for (const side of [0, 1] as const) {
      for (let c = 0; c < CROWD_SIDE_COLUMNS; c++) {
        for (let y = BACK_WALL_TOP + 26; y < GAME_HEIGHT + 20; y += 25) {
          const wy = unproject(GAME_WIDTH / 2, y).y;
          const edge = sideStandEdge(side, Math.min(FIELD_WIDTH + 3, wy));
          const x = edge + (side === 0 ? -1 : 1) * (16 + c * 19) + rng.range(-2, 2);
          if (x < -6 || x > GAME_WIDTH + 6) continue;
          const scale = CROWD_SCALE_FRONT * (0.95 + 0.15 * ((y - BACK_WALL_TOP) / (GAME_HEIGHT - BACK_WALL_TOP)));
          add(x, y, scale, side, DEPTH_CROWD + 2 + y * 0.001);
        }
      }
    }
  }

  /** Atualiza poses: `moods[t]` é o ânimo da torcida do time t. */
  update(timeSec: number, moods: readonly [CrowdMood, CrowdMood]): void {
    const boil = Math.floor(timeSec * BOIL_FPS) % FAN_BOILS;
    for (const f of this.fans) {
      const mood = moods[f.team];
      let pose = 0;
      let dy = 0;
      if (mood === 'calm') {
        pose = Math.sin(timeSec * CROWD_SWAY_HZ * Math.PI * 2 + f.phase) > 0 ? 0 : 1;
      } else if (mood === 'excited') {
        const s = Math.sin(timeSec * CROWD_EXCITED_HZ * Math.PI * 2 + f.phase);
        pose = s > 0.4 ? 2 : s > -0.3 ? 1 : 0;
        dy = -Math.max(0, s) * CROWD_EXCITED_JUMP * f.scale;
      } else {
        const s = Math.sin(timeSec * CROWD_EXCITED_HZ * 1.4 * Math.PI * 2 + f.phase);
        pose = s > 0 ? 3 : 2;
        dy = -Math.abs(s) * CROWD_GOAL_JUMP * f.scale;
      }
      f.img.setFrame(fanFrame(f.team, f.variant, pose, (boil + Math.floor(f.phase * 3)) % FAN_BOILS)).setY(f.baseY + dy);
      if (f.flag) {
        const speed = mood === 'calm' ? 3 : 9;
        f.flag
          .setFrame(flagFrame(f.team, Math.floor(timeSec * speed + f.phase * 3) % FLAG_FRAMES))
          .setY(f.baseY - 18 * f.scale + dy - (mood === 'goal' ? 6 * f.scale : 0));
      }
    }
  }

  destroy(): void {
    for (const f of this.fans) {
      f.img.destroy();
      f.flag?.destroy();
    }
    this.fans.length = 0;
  }
}
