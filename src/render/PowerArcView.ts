/**
 * Barra de força do chute: pequeno arco aos pés do jogador controlado, na cor do time,
 * aparece só enquanto carrega e pisca ao chegar em 100%.
 */
import Phaser from 'phaser';
import { DEPTH_UI, project } from '../core/projection';
import { INK } from '../art/style';
import type { Match } from '../sim/match';

/** Raio do arco no chão (m) e ângulos (rad, no plano do chão; +y = para a câmera). */
const R = 0.78;
const A0 = Math.PI * 0.12;
const A1 = Math.PI * 0.88;
const SEG = 24;

export class PowerArcView {
  private readonly g: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly colors: readonly [number, number],
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH_UI - 12);
  }

  update(match: Match, alpha: number, timeSec: number): void {
    const g = this.g;
    g.clear();
    const world = match.world;
    const items: { id: number; team: 0 | 1; charge: number }[] = [];
    for (const team of [0, 1] as const) {
      const h = world.humans[team];
      if (h.charging) items.push({ id: world.controlled[team], team, charge: h.charge });
    }
    const a = match.attempt;
    if (a && a.charging) items.push({ id: a.kicker, team: a.team, charge: a.charge });

    for (const it of items) {
      const p = world.players[it.id];
      if (!p) continue;
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const y = p.prevY + (p.y - p.prevY) * alpha;
      // O arco começa à esquerda e enche no sentido horário (por baixo dos pés).
      const pts = (from: number, to: number): Phaser.Math.Vector2[] => {
        const out: Phaser.Math.Vector2[] = [];
        for (let i = 0; i <= SEG; i++) {
          const t = A1 - (A1 - A0) * (from + (to - from) * (i / SEG));
          const s = project(x + Math.cos(t) * R, y + Math.sin(t) * R * 0.75, 0);
          out.push(new Phaser.Math.Vector2(s.x, s.y));
        }
        return out;
      };
      const full = it.charge >= 1;
      const blink = full && Math.floor(timeSec * 10) % 2 === 0;
      g.lineStyle(9, INK, 0.9);
      g.strokePoints(pts(0, 1));
      g.lineStyle(5, 0x3a2f28, 1);
      g.strokePoints(pts(0, 1));
      if (it.charge > 0.001) {
        g.lineStyle(5, blink ? 0xffffff : this.colors[it.team], 1);
        g.strokePoints(pts(0, it.charge));
      }
      // Marca dos 85% (a partir dali o chute fica impreciso).
      const mark = pts(0.85, 0.85)[0]!;
      g.fillStyle(0xfff3c4, 1);
      g.fillCircle(mark.x, mark.y, 1.8);
    }
  }

  destroy(): void {
    this.g.destroy();
  }
}
