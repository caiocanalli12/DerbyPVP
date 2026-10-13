/**
 * Efeitos de desenho animado: rastro de velocidade da bola em chutes fortes, partículas de
 * grama na corrida e no carrinho, e linhas de impacto (dividida certa e defesa).
 */
import Phaser from 'phaser';
import {
  BALL_VISUAL_RADIUS,
  BOIL_FPS,
  GRASS_PARTICLE_LIFE,
  GRASS_RUN_MIN_SPEED,
  GRASS_SLIDE_BURST,
  GRASS_STEP_DISTANCE,
  IMPACT_TIME,
  TRAIL_LENGTH_TIME,
  TRAIL_MIN_SPEED,
} from '../config/constants';
import { DEPTH_SHADOWS, DEPTH_UI, PPM, project } from '../core/projection';
import { Rng } from '../core/rng';
import { INK } from '../art/style';
import type { Ball } from '../sim/ball';
import type { SimEvent } from '../sim/events';
import type { Match } from '../sim/match';

interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: number;
  size: number;
}

interface Impact {
  x: number;
  y: number;
  z: number;
  t: number;
  big: boolean;
}

const GRASS_COLORS = [0x3f8f30, 0x5cbf4a, 0x2f6e25, 0x8a6a3c];

export class EffectsView {
  private readonly trail: Phaser.GameObjects.Graphics;
  private readonly ground: Phaser.GameObjects.Graphics;
  private readonly impacts: Phaser.GameObjects.Graphics;
  private readonly particles: Particle[] = [];
  private readonly hits: Impact[] = [];
  private readonly stepAcc: number[] = [];
  private readonly rng = new Rng(99);

  constructor(scene: Phaser.Scene) {
    this.trail = scene.add.graphics().setDepth(DEPTH_UI - 50);
    this.ground = scene.add.graphics().setDepth(DEPTH_SHADOWS + 5);
    this.impacts = scene.add.graphics().setDepth(DEPTH_UI - 49);
  }

  onEvent(e: SimEvent, match: Match): void {
    const w = match.world;
    if (e.type === 'tackleStart') {
      const p = w.players[e.player];
      if (p) this.burst(p.x, p.y, GRASS_SLIDE_BURST, 1.6, p.tackleDirX, p.tackleDirY);
    } else if (e.type === 'tackle') {
      this.hits.push({ x: w.ball.x, y: w.ball.y, z: 0.3, t: 0, big: e.result === 'steal' });
    } else if (e.type === 'save') {
      this.hits.push({ x: w.ball.x, y: w.ball.y, z: w.ball.z, t: 0, big: true });
    } else if (e.type === 'contact' && (e.kind === 'post' || e.kind === 'bar') && e.speed > 6) {
      this.hits.push({ x: w.ball.x, y: w.ball.y, z: w.ball.z, t: 0, big: false });
    }
  }

  /** Jato de grama na direção (dx, dy). */
  private burst(x: number, y: number, n: number, power: number, dx: number, dy: number): void {
    for (let i = 0; i < n; i++) {
      const a = Math.atan2(dy, dx) + Math.PI + this.rng.range(-0.9, 0.9);
      const sp = this.rng.range(1, 3.2) * power;
      this.particles.push({
        x,
        y,
        z: 0.05,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp,
        vz: this.rng.range(1.5, 4) * power,
        life: 0,
        max: GRASS_PARTICLE_LIFE * this.rng.range(0.7, 1.3),
        color: this.rng.pick(GRASS_COLORS),
        size: this.rng.range(1.4, 2.6),
      });
    }
  }

  update(match: Match, alpha: number, timeSec: number, dt: number): void {
    const world = match.world;
    // Grama a cada poucos passos de corrida.
    world.players.forEach((p, i) => {
      const speed = Math.hypot(p.vx, p.vy);
      if (speed < GRASS_RUN_MIN_SPEED || p.state !== 'normal') {
        this.stepAcc[i] = 0;
        return;
      }
      this.stepAcc[i] = (this.stepAcc[i] ?? 0) + speed * dt;
      if (this.stepAcc[i]! >= GRASS_STEP_DISTANCE) {
        this.stepAcc[i] = 0;
        this.burst(p.x, p.y, 3, 0.55, p.vx, p.vy);
      }
    });
    world.players.forEach((p) => {
      if (p.state === 'tackling' && this.rng.chance(dt * 25)) this.burst(p.x, p.y, 1, 1, p.tackleDirX, p.tackleDirY);
    });

    // Partículas (física simples, só visual).
    const g = this.ground;
    g.clear();
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const q = this.particles[i]!;
      q.life += dt;
      if (q.life >= q.max) {
        this.particles.splice(i, 1);
        continue;
      }
      q.vz -= 14 * dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z = Math.max(0, q.z + q.vz * dt);
      const s = project(q.x, q.y, q.z);
      const fade = 1 - q.life / q.max;
      g.fillStyle(q.color, fade);
      g.fillRect(s.x - q.size / 2, s.y - q.size, q.size, q.size * 1.6);
    }

    this.drawTrail(world.ball, alpha, timeSec);
    this.drawImpacts(dt, timeSec);
  }

  /** Traços de "velocidade" de desenho animado atrás da bola. */
  private drawTrail(ball: Ball, alpha: number, timeSec: number): void {
    const t = this.trail;
    t.clear();
    const speed = Math.hypot(ball.vx, ball.vy, ball.vz);
    if (ball.owner !== null || speed < TRAIL_MIN_SPEED) return;
    const x = ball.prevX + (ball.x - ball.prevX) * alpha;
    const y = ball.prevY + (ball.y - ball.prevY) * alpha;
    const z = ball.prevZ + (ball.z - ball.prevZ) * alpha;
    const head = project(x, y, z + BALL_VISUAL_RADIUS);
    const back = project(x - ball.vx * TRAIL_LENGTH_TIME, y - ball.vy * TRAIL_LENGTH_TIME, Math.max(0, z - ball.vz * TRAIL_LENGTH_TIME) + BALL_VISUAL_RADIUS);
    const dx = back.x - head.x;
    const dy = back.y - head.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const r = BALL_VISUAL_RADIUS * PPM * head.scale;
    const boil = Math.floor(timeSec * BOIL_FPS) % 3;
    const k = Math.min(1, (speed - TRAIL_MIN_SPEED) / 8 + 0.4);
    for (const [off, scale] of [
      [-0.75, 0.75],
      [0, 1],
      [0.75, 0.7],
    ] as const) {
      const ox = nx * r * off;
      const oy = ny * r * off;
      const sx = head.x + ox + (dx / len) * r * 1.4;
      const sy = head.y + oy + (dy / len) * r * 1.4;
      const ex = head.x + ox + dx * scale * k + ((boil - 1) * nx) / 2;
      const ey = head.y + oy + dy * scale * k + ((boil - 1) * ny) / 2;
      t.lineStyle(3.2, INK, 0.55);
      t.lineBetween(sx, sy, ex, ey);
      t.lineStyle(1.6, 0xfff6dc, 0.9);
      t.lineBetween(sx, sy, ex, ey);
    }
  }

  /** Linhas de impacto: raios curtos e uma estrela. */
  private drawImpacts(dt: number, timeSec: number): void {
    const g = this.impacts;
    g.clear();
    for (let i = this.hits.length - 1; i >= 0; i--) {
      const h = this.hits[i]!;
      h.t += dt;
      if (h.t >= IMPACT_TIME) {
        this.hits.splice(i, 1);
        continue;
      }
      const p = project(h.x, h.y, h.z + BALL_VISUAL_RADIUS);
      const k = h.t / IMPACT_TIME;
      const n = h.big ? 9 : 6;
      const r0 = (h.big ? 9 : 6) + k * 10;
      const r1 = r0 + (h.big ? 14 : 9) * (1 - k * 0.6);
      const rot = Math.floor(timeSec * BOIL_FPS) * 0.07;
      for (let j = 0; j < n; j++) {
        const a = (j / n) * Math.PI * 2 + rot;
        const x0 = p.x + Math.cos(a) * r0;
        const y0 = p.y + Math.sin(a) * r0 * 0.8;
        const x1 = p.x + Math.cos(a) * r1;
        const y1 = p.y + Math.sin(a) * r1 * 0.8;
        g.lineStyle(4, INK, 1 - k);
        g.lineBetween(x0, y0, x1, y1);
        g.lineStyle(2, 0xfff3b0, 1 - k);
        g.lineBetween(x0, y0, x1, y1);
      }
    }
  }

  destroy(): void {
    this.trail.destroy();
    this.ground.destroy();
    this.impacts.destroy();
  }
}
