/**
 * Gols: traves brancas com a linha "fervendo" e rede em perspectiva que balança depois do gol.
 * A parte de trás fica atrás dos jogadores; poste da frente e travessão, na frente.
 */
import Phaser from 'phaser';
import {
  BOIL_FPS,
  BOIL_JITTER,
  GOAL_DEPTH,
  GOAL_HEIGHT,
  NET_WAVE_AMPLITUDE,
  NET_WAVE_TIME,
} from '../config/constants';
import { depthFor, project } from '../core/projection';
import { Rng } from '../core/rng';
import { GOAL_Y_MAX, GOAL_Y_MIN, goalLineX, inwardDir } from '../sim/field';
import type { GoalSide } from '../sim/field';
import { INK } from '../art/style';

interface Pt {
  x: number;
  y: number;
  z: number;
}

const NET = 0xf1ede2;
const STEP = 0.25;

export class GoalView {
  private readonly back: Phaser.GameObjects.Graphics;
  private readonly front: Phaser.GameObjects.Graphics;
  private lastBoil = -1;
  private waveStart = -100;

  constructor(
    scene: Phaser.Scene,
    private readonly side: GoalSide,
  ) {
    this.back = scene.add.graphics().setDepth(depthFor(GOAL_Y_MIN) - 1);
    this.front = scene.add.graphics().setDepth(depthFor(GOAL_Y_MAX) + 1);
  }

  /** A rede balança (gol neste lado). */
  wave(timeSec: number): void {
    this.waveStart = timeSec;
  }

  update(timeSec: number): void {
    const boil = Math.floor(timeSec * BOIL_FPS) % 3;
    const waving = timeSec - this.waveStart < NET_WAVE_TIME;
    if (boil === this.lastBoil && !waving) return;
    this.lastBoil = boil;
    this.draw(boil, waving ? timeSec - this.waveStart : -1);
  }

  private draw(boil: number, waveT: number): void {
    const x0 = goalLineX(this.side);
    const out = -inwardDir(this.side);
    const rng = new Rng(1000 + boil * 7 + this.side * 3);
    const jit = (): number => rng.range(-BOIL_JITTER, BOIL_JITTER);
    // Deslocamento da rede para fora (balanço amortecido).
    const amp = waveT >= 0 ? NET_WAVE_AMPLITUDE * Math.exp(-waveT * 2.2) : 0;
    const bulge = (p: Pt): Pt => {
      if (amp === 0) return p;
      const depthT = ((p.x - x0) * out) / GOAL_DEPTH;
      const u = (p.y - GOAL_Y_MIN) / (GOAL_Y_MAX - GOAL_Y_MIN);
      const v = p.z / GOAL_HEIGHT;
      const s = Math.sin(waveT * 14 + u * 5 + v * 4) * amp * Math.max(0, depthT) * Math.sin(u * Math.PI) * Math.sin(v * Math.PI + 0.3);
      return { x: p.x + out * s, y: p.y, z: p.z };
    };
    const line = (g: Phaser.GameObjects.Graphics, pts: Pt[]): void => {
      const s = pts.map((p) => project(p.x, p.y, p.z));
      g.beginPath();
      g.moveTo(s[0]!.x, s[0]!.y);
      for (let i = 1; i < s.length; i++) g.lineTo(s[i]!.x, s[i]!.y);
      g.strokePath();
    };
    const sub = (a: Pt, b: Pt, n = 6): Pt[] =>
      Array.from({ length: n + 1 }, (_, i) => bulge({ x: a.x + ((b.x - a.x) * i) / n, y: a.y + ((b.y - a.y) * i) / n, z: a.z + ((b.z - a.z) * i) / n }));
    const x1 = x0 + out * GOAL_DEPTH;

    const back = this.back;
    back.clear();
    back.lineStyle(1, NET, 0.8);
    // Fundo e teto da rede (linhas em Y).
    for (let y = GOAL_Y_MIN; y <= GOAL_Y_MAX + 1e-6; y += STEP) {
      line(back, [...sub({ x: x1, y, z: 0 }, { x: x1, y, z: GOAL_HEIGHT }), ...sub({ x: x1, y, z: GOAL_HEIGHT }, { x: x0, y, z: GOAL_HEIGHT })]);
    }
    for (let z = 0; z <= GOAL_HEIGHT + 1e-6; z += STEP) {
      line(back, sub({ x: x1, y: GOAL_Y_MIN, z }, { x: x1, y: GOAL_Y_MAX, z }));
      line(back, sub({ x: x0, y: GOAL_Y_MIN, z }, { x: x1, y: GOAL_Y_MIN, z }));
    }
    for (let k = 0; k <= GOAL_DEPTH + 1e-6; k += STEP) {
      const x = x0 + out * k;
      line(back, [...sub({ x, y: GOAL_Y_MIN, z: 0 }, { x, y: GOAL_Y_MIN, z: GOAL_HEIGHT }), ...sub({ x, y: GOAL_Y_MIN, z: GOAL_HEIGHT }, { x, y: GOAL_Y_MAX, z: GOAL_HEIGHT })]);
    }
    // Poste de trás (fervendo).
    const backPost = [
      { x: x0, y: GOAL_Y_MIN, z: 0 },
      { x: x0, y: GOAL_Y_MIN, z: GOAL_HEIGHT },
    ];
    this.post(back, backPost, jit);

    const front = this.front;
    front.clear();
    front.lineStyle(1, NET, 0.8);
    for (let z = 0; z <= GOAL_HEIGHT + 1e-6; z += STEP) line(front, sub({ x: x0, y: GOAL_Y_MAX, z }, { x: x1, y: GOAL_Y_MAX, z }));
    for (let k = 0; k <= GOAL_DEPTH + 1e-6; k += STEP) {
      const x = x0 + out * k;
      line(front, sub({ x, y: GOAL_Y_MAX, z: 0 }, { x, y: GOAL_Y_MAX, z: GOAL_HEIGHT }));
    }
    this.post(
      front,
      [
        { x: x0, y: GOAL_Y_MIN, z: GOAL_HEIGHT },
        { x: x0, y: GOAL_Y_MAX, z: GOAL_HEIGHT },
        { x: x0, y: GOAL_Y_MAX, z: 0 },
      ],
      jit,
    );
  }

  /** Trave grossa branca com contorno escuro e pontos levemente deslocados (fervura). */
  private post(g: Phaser.GameObjects.Graphics, pts: Pt[], jit: () => number): void {
    const s = pts.map((p) => {
      const q = project(p.x, p.y, p.z);
      return { x: q.x + jit() * 0.6, y: q.y + jit() * 0.6 };
    });
    for (const [w, c] of [
      [7, INK],
      [4, 0xffffff],
    ] as const) {
      g.lineStyle(w, c, 1);
      g.beginPath();
      g.moveTo(s[0]!.x, s[0]!.y);
      for (let i = 1; i < s.length; i++) g.lineTo(s[i]!.x, s[i]!.y);
      g.strokePath();
    }
    // Brilho.
    g.lineStyle(1.2, 0xfff6d8, 0.9);
    g.beginPath();
    g.moveTo(s[0]!.x - 1, s[0]!.y);
    for (let i = 1; i < s.length; i++) g.lineTo(s[i]!.x - 1, s[i]!.y);
    g.strokePath();
  }

  destroy(): void {
    this.back.destroy();
    this.front.destroy();
  }
}
