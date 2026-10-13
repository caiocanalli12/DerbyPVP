/**
 * Ajudantes para desenhar formas do mundo (em metros) num Graphics do Phaser.
 * Tudo passa por core/projection.ts.
 */
import Phaser from 'phaser';
import { project } from '../core/projection';

export interface WorldPoint {
  x: number;
  y: number;
  z?: number;
}

export function toScreen(points: readonly WorldPoint[]): Phaser.Math.Vector2[] {
  return points.map((p) => {
    const s = project(p.x, p.y, p.z ?? 0);
    return new Phaser.Math.Vector2(s.x, s.y);
  });
}

export function fillWorldPoly(g: Phaser.GameObjects.Graphics, points: readonly WorldPoint[]): void {
  g.fillPoints(toScreen(points), true);
}

export function strokeWorldPoly(
  g: Phaser.GameObjects.Graphics,
  points: readonly WorldPoint[],
  closed = false,
): void {
  g.strokePoints(toScreen(points), closed, closed);
}

/** Pontos de um arco no chão (ângulos em radianos, no plano XY do mundo). */
export function arcPoints(
  cx: number,
  cy: number,
  r: number,
  a0: number,
  a1: number,
  segments = 48,
  z = 0,
): WorldPoint[] {
  const pts: WorldPoint[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = a0 + ((a1 - a0) * i) / segments;
    pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, z });
  }
  return pts;
}

/** Elipse de sombra/marca no chão, já projetada. */
export function fillGroundEllipse(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  rx: number,
  ry: number,
  segments = 24,
): void {
  const pts: WorldPoint[] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push({ x: x + Math.cos(a) * rx, y: y + Math.sin(a) * ry });
  }
  fillWorldPoly(g, pts);
}
