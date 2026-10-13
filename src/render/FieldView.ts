/**
 * Campo, gols e paredes. Fase 2: formas simples (a arte final entra na fase 11).
 * Todas as posições passam por core/projection.ts.
 */
import Phaser from 'phaser';
import {
  CENTER_CIRCLE_RADIUS,
  FIELD_LENGTH,
  FIELD_WIDTH,
  GAME_HEIGHT,
  GAME_WIDTH,
  GOAL_AREA_RADIUS,
  GOAL_DEPTH,
  GOAL_HEIGHT,
  WALL_BACK_HEIGHT,
  WALL_FRONT_ALPHA,
  WALL_FRONT_HEIGHT,
  WALL_GOAL_HEIGHT,
  WALL_SIDE_HEIGHT,
} from '../config/constants';
import {
  DEPTH_BACKGROUND,
  DEPTH_FIELD,
  DEPTH_FIELD_LINES,
  DEPTH_FRONT_WALL,
  depthFor,
  FIELD_TOP,
} from '../core/projection';
import { FIELD_CENTER_X, FIELD_CENTER_Y, GOAL_Y_MAX, GOAL_Y_MIN, goalLineX, inwardDir, penaltySpot } from '../sim/field';
import type { GoalSide } from '../sim/field';
import { INK } from '../art/style';
import { arcPoints, fillGroundEllipse, fillWorldPoly, strokeWorldPoly } from './worldDraw';
import type { WorldPoint } from './worldDraw';

const GRASS_A = 0x4fae3c;
const GRASS_B = 0x449e33;
const GRASS_GOAL = 0x3a8a2c;
const LINE = 0xf8f4e6;
const WOOD = 0x9a5b2a;
const WOOD_DARK = 0x6e3d1a;
const POST = 0xffffff;
const NET = 0xe8e4d8;
const STRIPES = 10;

export class FieldView {
  constructor(private readonly scene: Phaser.Scene) {
    this.drawBackground();
    this.drawBackWall();
    this.drawGrass();
    this.drawLines();
    this.drawSideWalls();
    this.drawGoal(0);
    this.drawGoal(1);
    this.drawFrontWall();
  }

  private drawBackground(): void {
    const g = this.scene.add.graphics().setDepth(DEPTH_BACKGROUND);
    // Céu e arquibancada provisórios (arte final na fase 11).
    g.fillStyle(0x7fc4e8, 1);
    g.fillRect(0, 0, GAME_WIDTH, 70);
    g.fillStyle(0x5a3d2b, 1);
    g.fillRect(0, 70, GAME_WIDTH, GAME_HEIGHT - 70);
    g.fillStyle(0x4a3021, 1);
    for (let row = 0; row < 8; row++) {
      const y = 80 + row * 30;
      if (y > FIELD_TOP - 40) break;
      g.fillRect(0, y, GAME_WIDTH, 6);
    }
  }

  private drawBackWall(): void {
    const g = this.scene.add.graphics().setDepth(DEPTH_FIELD - 2);
    const quad: WorldPoint[] = [
      { x: -GOAL_DEPTH, y: 0, z: 0 },
      { x: FIELD_LENGTH + GOAL_DEPTH, y: 0, z: 0 },
      { x: FIELD_LENGTH + GOAL_DEPTH, y: 0, z: WALL_BACK_HEIGHT },
      { x: -GOAL_DEPTH, y: 0, z: WALL_BACK_HEIGHT },
    ];
    g.fillStyle(WOOD, 1);
    fillWorldPoly(g, quad);
    g.lineStyle(3, INK, 1);
    strokeWorldPoly(g, quad, true);
    // Divisões das placas (provisório).
    g.lineStyle(2, WOOD_DARK, 1);
    for (let x = 0; x <= FIELD_LENGTH; x += 5) {
      strokeWorldPoly(g, [
        { x, y: 0, z: 0 },
        { x, y: 0, z: WALL_BACK_HEIGHT },
      ]);
    }
  }

  private drawGrass(): void {
    const g = this.scene.add.graphics().setDepth(DEPTH_FIELD);
    const w = FIELD_LENGTH / STRIPES;
    for (let i = 0; i < STRIPES; i++) {
      g.fillStyle(i % 2 === 0 ? GRASS_A : GRASS_B, 1);
      fillWorldPoly(g, [
        { x: i * w, y: 0 },
        { x: (i + 1) * w, y: 0 },
        { x: (i + 1) * w, y: FIELD_WIDTH },
        { x: i * w, y: FIELD_WIDTH },
      ]);
    }
    // Piso dentro dos gols.
    g.fillStyle(GRASS_GOAL, 1);
    for (const side of [0, 1] as const) {
      const x0 = goalLineX(side);
      const x1 = x0 - inwardDir(side) * GOAL_DEPTH;
      fillWorldPoly(g, [
        { x: x0, y: GOAL_Y_MIN },
        { x: x1, y: GOAL_Y_MIN },
        { x: x1, y: GOAL_Y_MAX },
        { x: x0, y: GOAL_Y_MAX },
      ]);
    }
  }

  private drawLines(): void {
    const g = this.scene.add.graphics().setDepth(DEPTH_FIELD_LINES);
    g.lineStyle(3, LINE, 0.95);
    // Contorno.
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
    // Linha do meio.
    strokeWorldPoly(g, [
      { x: FIELD_CENTER_X, y: 0 },
      { x: FIELD_CENTER_X, y: FIELD_WIDTH },
    ]);
    // Círculo central.
    strokeWorldPoly(g, arcPoints(FIELD_CENTER_X, FIELD_CENTER_Y, CENTER_CIRCLE_RADIUS, 0, Math.PI * 2, 64), true);
    // Áreas (semicírculos de 6 m a partir do centro do gol).
    strokeWorldPoly(g, arcPoints(0, FIELD_CENTER_Y, GOAL_AREA_RADIUS, -Math.PI / 2, Math.PI / 2, 48));
    strokeWorldPoly(g, arcPoints(FIELD_LENGTH, FIELD_CENTER_Y, GOAL_AREA_RADIUS, Math.PI / 2, (Math.PI * 3) / 2, 48));
    // Marcas: centro e pênaltis.
    g.fillStyle(LINE, 1);
    fillGroundEllipse(g, FIELD_CENTER_X, FIELD_CENTER_Y, 0.18, 0.18);
    for (const side of [0, 1] as const) {
      const p = penaltySpot(side);
      fillGroundEllipse(g, p.x, p.y, 0.14, 0.14);
    }
  }

  private drawSideWalls(): void {
    const g = this.scene.add.graphics().setDepth(DEPTH_FIELD - 1);
    for (const side of [0, 1] as const) {
      const x = goalLineX(side);
      const panels: WorldPoint[][] = [
        // Antes do gol (fundo).
        [
          { x, y: 0, z: 0 },
          { x, y: GOAL_Y_MIN, z: 0 },
          { x, y: GOAL_Y_MIN, z: WALL_SIDE_HEIGHT },
          { x, y: 0, z: WALL_SIDE_HEIGHT },
        ],
        // Acima do gol.
        [
          { x, y: GOAL_Y_MIN, z: GOAL_HEIGHT },
          { x, y: GOAL_Y_MAX, z: GOAL_HEIGHT },
          { x, y: GOAL_Y_MAX, z: WALL_GOAL_HEIGHT },
          { x, y: GOAL_Y_MIN, z: WALL_GOAL_HEIGHT },
        ],
        // Depois do gol (frente).
        [
          { x, y: GOAL_Y_MAX, z: 0 },
          { x, y: FIELD_WIDTH, z: 0 },
          { x, y: FIELD_WIDTH, z: WALL_SIDE_HEIGHT },
          { x, y: GOAL_Y_MAX, z: WALL_SIDE_HEIGHT },
        ],
      ];
      for (const p of panels) {
        g.fillStyle(WOOD, 1);
        fillWorldPoly(g, p);
        g.lineStyle(2, INK, 1);
        strokeWorldPoly(g, p, true);
      }
    }
  }

  /** Gol: parte de trás (atrás dos jogadores) e parte da frente (poste e travessão da frente). */
  private drawGoal(side: GoalSide): void {
    const x0 = goalLineX(side);
    const x1 = x0 - inwardDir(side) * GOAL_DEPTH;
    const back = this.scene.add.graphics().setDepth(depthFor(GOAL_Y_MIN) - 1);
    const front = this.scene.add.graphics().setDepth(depthFor(GOAL_Y_MAX) + 1);

    // Rede: fundo, teto e lado de trás (y = GOAL_Y_MIN).
    back.lineStyle(1, NET, 0.75);
    const step = 0.25;
    for (let y = GOAL_Y_MIN; y <= GOAL_Y_MAX + 1e-6; y += step) {
      strokeWorldPoly(back, [
        { x: x1, y, z: 0 },
        { x: x1, y, z: GOAL_HEIGHT },
        { x: x0, y, z: GOAL_HEIGHT },
      ]);
    }
    for (let z = 0; z <= GOAL_HEIGHT + 1e-6; z += step) {
      strokeWorldPoly(back, [
        { x: x1, y: GOAL_Y_MIN, z },
        { x: x1, y: GOAL_Y_MAX, z },
      ]);
      strokeWorldPoly(back, [
        { x: x0, y: GOAL_Y_MIN, z },
        { x: x1, y: GOAL_Y_MIN, z },
      ]);
    }
    for (let k = 0; k <= GOAL_DEPTH + 1e-6; k += step) {
      const x = x0 - inwardDir(side) * k;
      strokeWorldPoly(back, [
        { x, y: GOAL_Y_MIN, z: 0 },
        { x, y: GOAL_Y_MIN, z: GOAL_HEIGHT },
        { x, y: GOAL_Y_MAX, z: GOAL_HEIGHT },
      ]);
    }
    // Poste de trás.
    back.lineStyle(5, INK, 1);
    strokeWorldPoly(back, [
      { x: x0, y: GOAL_Y_MIN, z: 0 },
      { x: x0, y: GOAL_Y_MIN, z: GOAL_HEIGHT },
    ]);
    back.lineStyle(3, POST, 1);
    strokeWorldPoly(back, [
      { x: x0, y: GOAL_Y_MIN, z: 0 },
      { x: x0, y: GOAL_Y_MIN, z: GOAL_HEIGHT },
    ]);

    // Rede do lado da frente (y = GOAL_Y_MAX).
    front.lineStyle(1, NET, 0.75);
    for (let z = 0; z <= GOAL_HEIGHT + 1e-6; z += step) {
      strokeWorldPoly(front, [
        { x: x0, y: GOAL_Y_MAX, z },
        { x: x1, y: GOAL_Y_MAX, z },
      ]);
    }
    for (let k = 0; k <= GOAL_DEPTH + 1e-6; k += step) {
      const x = x0 - inwardDir(side) * k;
      strokeWorldPoly(front, [
        { x, y: GOAL_Y_MAX, z: 0 },
        { x, y: GOAL_Y_MAX, z: GOAL_HEIGHT },
      ]);
    }
    // Poste da frente e travessão.
    const frame: WorldPoint[] = [
      { x: x0, y: GOAL_Y_MIN, z: GOAL_HEIGHT },
      { x: x0, y: GOAL_Y_MAX, z: GOAL_HEIGHT },
      { x: x0, y: GOAL_Y_MAX, z: 0 },
    ];
    front.lineStyle(5, INK, 1);
    strokeWorldPoly(front, frame);
    front.lineStyle(3, POST, 1);
    strokeWorldPoly(front, frame);
  }

  private drawFrontWall(): void {
    const g = this.scene.add.graphics().setDepth(DEPTH_FRONT_WALL);
    const quad: WorldPoint[] = [
      { x: 0, y: FIELD_WIDTH, z: 0 },
      { x: FIELD_LENGTH, y: FIELD_WIDTH, z: 0 },
      { x: FIELD_LENGTH, y: FIELD_WIDTH, z: WALL_FRONT_HEIGHT },
      { x: 0, y: FIELD_WIDTH, z: WALL_FRONT_HEIGHT },
    ];
    g.fillStyle(WOOD, WALL_FRONT_ALPHA);
    fillWorldPoly(g, quad);
    g.lineStyle(2, INK, 0.6);
    strokeWorldPoly(g, quad, true);
  }
}
