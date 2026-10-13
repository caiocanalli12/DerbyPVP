/**
 * Estádio na tela: fundo desenhado por código (céu, arquibancadas, paredes, gramado e
 * linhas), gols com traves fervendo e rede que balança, e a parede da frente baixa e
 * semitransparente (nunca esconde jogadores).
 */
import Phaser from 'phaser';
import { FIELD_LENGTH, FIELD_WIDTH, GAME_HEIGHT, GAME_WIDTH, WALL_FRONT_ALPHA, WALL_FRONT_HEIGHT } from '../config/constants';
import { DEPTH_BACKGROUND, DEPTH_FRONT_WALL } from '../core/projection';
import type { WeatherId } from '../data/weather';
import { generateStadiumTexture, STADIUM_KEY, stadiumPalette } from '../art/stadium-art';
import { INK } from '../art/style';
import type { GoalSide } from '../sim/field';
import { GoalView } from './GoalView';
import { fillWorldPoly, strokeWorldPoly } from './worldDraw';
import type { WorldPoint } from './worldDraw';

export class FieldView {
  private readonly bg: Phaser.GameObjects.Image;
  private readonly goals: [GoalView, GoalView];
  private readonly frontWall: Phaser.GameObjects.Graphics;

  constructor(scene: Phaser.Scene, weather: WeatherId, seed: number) {
    generateStadiumTexture(scene, weather, seed);
    this.bg = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, STADIUM_KEY).setDepth(DEPTH_BACKGROUND);
    this.goals = [new GoalView(scene, 0), new GoalView(scene, 1)];

    const pal = stadiumPalette(weather);
    const g = scene.add.graphics().setDepth(DEPTH_FRONT_WALL);
    const quad: WorldPoint[] = [
      { x: 0, y: FIELD_WIDTH, z: 0 },
      { x: FIELD_LENGTH, y: FIELD_WIDTH, z: 0 },
      { x: FIELD_LENGTH, y: FIELD_WIDTH, z: WALL_FRONT_HEIGHT },
      { x: 0, y: FIELD_WIDTH, z: WALL_FRONT_HEIGHT },
    ];
    g.fillStyle(pal.wood, WALL_FRONT_ALPHA);
    fillWorldPoly(g, quad);
    g.lineStyle(1, pal.woodDark, WALL_FRONT_ALPHA);
    for (let x = 2; x < FIELD_LENGTH; x += 2) {
      strokeWorldPoly(g, [
        { x, y: FIELD_WIDTH, z: 0 },
        { x, y: FIELD_WIDTH, z: WALL_FRONT_HEIGHT },
      ]);
    }
    g.lineStyle(2, INK, 0.55);
    strokeWorldPoly(g, quad, true);
    this.frontWall = g;
  }

  /** Rede balançando depois de gol no lado `side`. */
  goalScored(side: GoalSide, timeSec: number): void {
    this.goals[side].wave(timeSec);
  }

  update(timeSec: number): void {
    for (const goal of this.goals) goal.update(timeSec);
  }

  destroy(): void {
    this.bg.destroy();
    for (const goal of this.goals) goal.destroy();
    this.frontWall.destroy();
  }
}
