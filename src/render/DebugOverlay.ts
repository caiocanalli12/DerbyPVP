/**
 * Modo de depuração (tecla `): grade com coordenadas do mundo, hitboxes de traves e paredes,
 * coordenadas sob o mouse e formas que outros sistemas registram a cada quadro.
 */
import Phaser from 'phaser';
import { FIELD_LENGTH, FIELD_WIDTH, GAME_HEIGHT, GOAL_DEPTH, GOAL_HEIGHT, POST_RADIUS } from '../config/constants';
import { DEPTH_DEBUG, project, unproject } from '../core/projection';
import { GOAL_Y_MAX, GOAL_Y_MIN, goalLineX, inwardDir } from '../sim/field';
import { FONT_TEXT } from '../art/style';
import { arcPoints, strokeWorldPoly } from './worldDraw';

const GRID = 5;

export class DebugOverlay {
  private visible = false;
  private readonly staticLayer: Phaser.GameObjects.Graphics;
  private readonly dynamicLayer: Phaser.GameObjects.Graphics;
  private readonly staticLabels: Phaser.GameObjects.Text[] = [];
  private readonly labelPool: Phaser.GameObjects.Text[] = [];
  private labelsUsed = 0;
  private readonly mouseText: Phaser.GameObjects.Text;
  private readonly infoText: Phaser.GameObjects.Text;

  constructor(private readonly scene: Phaser.Scene) {
    this.staticLayer = scene.add.graphics().setDepth(DEPTH_DEBUG);
    this.dynamicLayer = scene.add.graphics().setDepth(DEPTH_DEBUG + 1);
    this.mouseText = this.makeText(12).setDepth(DEPTH_DEBUG + 3);
    this.infoText = this.makeText(14).setDepth(DEPTH_DEBUG + 3).setPosition(8, GAME_HEIGHT - 8).setOrigin(0, 1);
    this.drawStatic();
    this.apply();
  }

  isVisible(): boolean {
    return this.visible;
  }

  toggle(): void {
    this.visible = !this.visible;
    this.apply();
  }

  /** Começa um quadro: limpa as formas dinâmicas. */
  beginFrame(): void {
    this.dynamicLayer.clear();
    this.labelsUsed = 0;
  }

  /** Círculo no chão (hitbox) em coordenadas do mundo. */
  circle(x: number, y: number, r: number, color: number, z = 0): void {
    if (!this.visible) return;
    this.dynamicLayer.lineStyle(1.5, color, 1);
    strokeWorldPoly(this.dynamicLayer, arcPoints(x, y, r, 0, Math.PI * 2, 24, z), true);
  }

  /** Segmento vertical (altura) no mundo. */
  pillar(x: number, y: number, z0: number, z1: number, color: number): void {
    if (!this.visible) return;
    this.dynamicLayer.lineStyle(1.5, color, 1);
    strokeWorldPoly(this.dynamicLayer, [
      { x, y, z: z0 },
      { x, y, z: z1 },
    ]);
  }

  /** Texto preso a um ponto do mundo. */
  label(x: number, y: number, text: string, z = 0): void {
    if (!this.visible) return;
    let t = this.labelPool[this.labelsUsed];
    if (!t) {
      t = this.makeText(11).setDepth(DEPTH_DEBUG + 2);
      this.labelPool.push(t);
    }
    this.labelsUsed++;
    const p = project(x, y, z);
    t.setText(text).setPosition(p.x, p.y).setVisible(true);
  }

  setInfo(text: string): void {
    this.infoText.setText(text);
  }

  /** Fecha o quadro: esconde rótulos não usados e atualiza o mouse. */
  endFrame(): void {
    for (let i = this.labelsUsed; i < this.labelPool.length; i++) this.labelPool[i]?.setVisible(false);
    if (!this.visible) return;
    const pointer = this.scene.input.activePointer;
    const w = unproject(pointer.worldX, pointer.worldY);
    this.mouseText
      .setText(`(${w.x.toFixed(2)}, ${w.y.toFixed(2)})`)
      .setPosition(pointer.worldX + 14, pointer.worldY + 14)
      .setOrigin(0, 0);
  }

  destroy(): void {
    this.staticLayer.destroy();
    this.dynamicLayer.destroy();
    this.mouseText.destroy();
    this.infoText.destroy();
    for (const t of this.staticLabels) t.destroy();
    for (const t of this.labelPool) t.destroy();
  }

  private apply(): void {
    this.staticLayer.setVisible(this.visible);
    this.dynamicLayer.setVisible(this.visible);
    this.mouseText.setVisible(this.visible);
    this.infoText.setVisible(this.visible);
    for (const t of this.staticLabels) t.setVisible(this.visible);
    if (!this.visible) for (const t of this.labelPool) t.setVisible(false);
  }

  private makeText(size: number): Phaser.GameObjects.Text {
    return this.scene.add
      .text(0, 0, '', {
        fontFamily: FONT_TEXT,
        fontSize: `${size}px`,
        color: '#ffff66',
        backgroundColor: 'rgba(0,0,0,0.55)',
        padding: { x: 3, y: 1 },
      })
      .setOrigin(0.5, 0.5);
  }

  private drawStatic(): void {
    const g = this.staticLayer;
    // Grade do mundo a cada 5 m, com coordenadas.
    g.lineStyle(1, 0xffff66, 0.45);
    for (let x = 0; x <= FIELD_LENGTH; x += GRID) {
      strokeWorldPoly(g, [
        { x, y: 0 },
        { x, y: FIELD_WIDTH },
      ]);
    }
    for (let y = 0; y <= FIELD_WIDTH; y += GRID) {
      strokeWorldPoly(g, [
        { x: 0, y },
        { x: FIELD_LENGTH, y },
      ]);
    }
    for (let x = 0; x <= FIELD_LENGTH; x += GRID * 2) {
      for (let y = 0; y <= FIELD_WIDTH; y += GRID) {
        const p = project(x, y);
        const t = this.makeText(10).setDepth(DEPTH_DEBUG + 2).setText(`${x},${y}`).setPosition(p.x, p.y);
        this.staticLabels.push(t);
      }
    }
    // Paredes (limite de colisão).
    g.lineStyle(2, 0xff4040, 0.9);
    strokeWorldPoly(
      g,
      [
        { x: 0, y: 0 },
        { x: FIELD_LENGTH, y: 0 },
        { x: FIELD_LENGTH, y: FIELD_WIDTH },
        { x: 0, y: FIELD_WIDTH },
      ],
      true,
    );
    // Gols: boca (verde), caixa interna (ciano), postes e travessão (magenta).
    for (const side of [0, 1] as const) {
      const x0 = goalLineX(side);
      const x1 = x0 - inwardDir(side) * GOAL_DEPTH;
      g.lineStyle(2, 0x40ff80, 1);
      strokeWorldPoly(
        g,
        [
          { x: x0, y: GOAL_Y_MIN, z: 0 },
          { x: x0, y: GOAL_Y_MAX, z: 0 },
          { x: x0, y: GOAL_Y_MAX, z: GOAL_HEIGHT },
          { x: x0, y: GOAL_Y_MIN, z: GOAL_HEIGHT },
        ],
        true,
      );
      g.lineStyle(1, 0x40e0ff, 1);
      strokeWorldPoly(
        g,
        [
          { x: x0, y: GOAL_Y_MIN },
          { x: x1, y: GOAL_Y_MIN },
          { x: x1, y: GOAL_Y_MAX },
          { x: x0, y: GOAL_Y_MAX },
        ],
        false,
      );
      g.lineStyle(1.5, 0xff40ff, 1);
      for (const py of [GOAL_Y_MIN, GOAL_Y_MAX]) {
        strokeWorldPoly(g, arcPoints(x0, py, POST_RADIUS * 3, 0, Math.PI * 2, 12), true);
        strokeWorldPoly(g, arcPoints(x0, py, POST_RADIUS * 3, 0, Math.PI * 2, 12, GOAL_HEIGHT), true);
      }
    }
  }
}
