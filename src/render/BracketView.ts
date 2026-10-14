/**
 * Cartaz da chave do campeonato (estilo 1930): moldura art déco, as quartas de final nas pontas,
 * as semifinais e a final no meio, com o troféu em cima. Cada jogo é uma placa com os dois times
 * (escudo, sigla e gols); o time do jogador fica em dourado, quem perdeu fica apagado, e as linhas
 * do caminho do jogador ficam douradas. Embaixo, uma faixa com até duas linhas de informação e,
 * opcionalmente, as estrelas do nível do próximo adversário.
 *
 * A cena diz o que está visível (`BracketState`, de `visibleState`); a vista só desenha.
 */
import Phaser from 'phaser';
import { BOIL_FPS, BOIL_JITTER, GAME_WIDTH } from '../config/constants';
import { getTeam } from '../data/teams';
import { crestKey, generateCrestTextures } from '../art/crest-art';
import { CREAM, CREAM_CSS, FONT_TEXT, FONT_TITLE, INK, INK_CSS } from '../art/style';
import { generateTrophyTextures, TROPHY_KEY, TROPHY_ORIGIN, trophyFrame } from '../art/trophy-art';
import { BOIL_VARIANTS } from '../art/ui-art';
import { matchesInRound, ROUND_COUNT, winnerOf } from '../sim/tournament';
import type { BracketState } from '../sim/tournament';
import { drawLevelStars } from './menu';

// ---------------------------------------------------------------------------
// Layout (px)
// ---------------------------------------------------------------------------

const POSTER = { x: 40, y: 124, w: 1200, h: 452 };
const BOX_W = 196;
const ROW_H = 38;
const BOX_H = ROW_H * 2 + 4;
const QF_X = [180, 1100];
const QF_Y = [210, 402];
const SF_X = [404, 876];
const MID_Y = 306;
const FINAL_X = GAME_WIDTH / 2;
/** Onde as linhas das quartas dobram para a semifinal. */
const ELBOW_X = [292, 988];
const TROPHY_SCALE = 0.3;
const INFO_Y = [496, 532];
const GOLD = 0xffd24a;
const DIM = 0.42;

function boxPos(round: number, k: number): { x: number; y: number } {
  if (round === 0) return { x: QF_X[k < 2 ? 0 : 1]!, y: QF_Y[k % 2]! };
  if (round === 1) return { x: SF_X[k]!, y: MID_Y };
  return { x: FINAL_X, y: MID_Y };
}

interface Row {
  crest: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  goals: Phaser.GameObjects.Text;
}

interface Box {
  round: number;
  k: number;
  x: number;
  y: number;
  rows: [Row, Row];
  pen: Phaser.GameObjects.Text;
}

export class BracketView {
  private readonly frame: Phaser.GameObjects.Graphics;
  private readonly lines: Phaser.GameObjects.Graphics;
  private readonly plates: Phaser.GameObjects.Graphics;
  private readonly boxes: Box[] = [];
  private readonly trophy: Phaser.GameObjects.Image;
  private readonly info: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private readonly levelGfx: Phaser.GameObjects.Graphics;
  private readonly levelText: Phaser.GameObjects.Text;
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private state: BracketState | null = null;
  private boil = -1;

  constructor(scene: Phaser.Scene, depth = 2) {
    generateCrestTextures(scene);
    generateTrophyTextures(scene);
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      return o;
    };
    this.frame = add(scene.add.graphics().setDepth(depth));
    this.drawFrame();
    this.lines = add(scene.add.graphics().setDepth(depth + 1));
    this.plates = add(scene.add.graphics().setDepth(depth + 2));
    this.trophy = add(
      scene.add
        .image(FINAL_X, MID_Y - BOX_H / 2 - 6, TROPHY_KEY, trophyFrame(0))
        .setOrigin(TROPHY_ORIGIN.x, TROPHY_ORIGIN.y)
        .setScale(TROPHY_SCALE)
        .setDepth(depth + 2),
    );
    const label = (x: number, y: number, text: string): void => {
      add(
        scene.add
          .text(x, y, text, { fontFamily: FONT_TITLE, fontSize: '18px', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 5 })
          .setOrigin(0.5)
          .setDepth(depth + 3),
      );
    };
    for (const x of QF_X) label(x, 154, 'QUARTAS DE FINAL');
    for (const x of SF_X) label(x, MID_Y + BOX_H / 2 + 34, 'SEMIFINAL');
    label(FINAL_X, MID_Y + BOX_H / 2 + 34, 'FINAL');

    for (let r = 0; r < ROUND_COUNT; r++) {
      for (let k = 0; k < matchesInRound(r); k++) {
        const { x, y } = boxPos(r, k);
        const row = (i: 0 | 1): Row => {
          const ry = y + (i === 0 ? -ROW_H / 2 - 1 : ROW_H / 2 + 1);
          const left = x - BOX_W / 2;
          return {
            crest: add(scene.add.image(left + 24, ry, crestKey('PAL')).setScale(0.25).setDepth(depth + 3)),
            name: add(
              scene.add
                .text(left + 46, ry + 1, '', { fontFamily: FONT_TITLE, fontSize: '22px', color: INK_CSS })
                .setOrigin(0, 0.5)
                .setDepth(depth + 3),
            ),
            goals: add(
              scene.add
                .text(x + BOX_W / 2 - 18, ry, '', { fontFamily: FONT_TEXT, fontSize: '24px', fontStyle: '700', color: INK_CSS })
                .setOrigin(1, 0.5)
                .setDepth(depth + 3),
            ),
          };
        };
        const pen = add(
          scene.add
            .text(x, y + BOX_H / 2 + 13, '', { fontFamily: FONT_TEXT, fontSize: '16px', fontStyle: '700', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 4 })
            .setOrigin(0.5)
            .setDepth(depth + 3),
        );
        this.boxes.push({ round: r, k, x, y, rows: [row(0), row(1)], pen });
      }
    }

    const infoText = (y: number, size: number): Phaser.GameObjects.Text =>
      add(
        scene.add
          .text(GAME_WIDTH / 2, y, '', { fontFamily: FONT_TEXT, fontSize: `${size}px`, fontStyle: '700', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 4 })
          .setOrigin(0.5)
          .setDepth(depth + 3),
      );
    this.info = [infoText(INFO_Y[0]!, 20), infoText(INFO_Y[1]!, 24)];
    this.levelGfx = add(scene.add.graphics().setDepth(depth + 3));
    this.levelText = add(
      scene.add
        .text(0, INFO_Y[1]!, '', { fontFamily: FONT_TITLE, fontSize: '22px', color: '#ffd24a', stroke: INK_CSS, strokeThickness: 5 })
        .setOrigin(0, 0.5)
        .setDepth(depth + 3),
    );
  }

  /** Moldura do cartaz: fundo escuro, borda dupla creme e leques nos cantos. */
  private drawFrame(): void {
    const g = this.frame;
    const { x, y, w, h } = POSTER;
    g.fillStyle(INK, 0.86);
    g.fillRoundedRect(x, y, w, h, 18);
    g.lineStyle(4, CREAM, 1);
    g.strokeRoundedRect(x + 10, y + 10, w - 20, h - 20, 12);
    g.lineStyle(1.5, CREAM, 1);
    g.strokeRoundedRect(x + 20, y + 20, w - 40, h - 40, 8);
    for (const [cx, cy, a] of [
      [x + 20, y + 20, 0],
      [x + w - 20, y + 20, Math.PI / 2],
      [x + 20, y + h - 20, -Math.PI / 2],
      [x + w - 20, y + h - 20, Math.PI],
    ] as const) {
      for (let i = 0; i <= 4; i++) {
        const ang = a + (i / 4) * (Math.PI / 2);
        g.lineBetween(cx, cy, cx + Math.cos(ang) * 30, cy + Math.sin(ang) * 30);
      }
    }
    // Filete separando a faixa de informação.
    g.lineStyle(1.5, CREAM, 0.6);
    g.lineBetween(x + 120, INFO_Y[0]! - 22, x + w - 120, INFO_Y[0]! - 22);
  }

  /** Mostra o estado (só redesenha o que muda). */
  setState(s: BracketState): void {
    this.state = s;
    for (const b of this.boxes) {
      const teams = s.teams[b.round]![b.k]!;
      const result = s.results[b.round]![b.k] ?? null;
      b.rows.forEach((row, i) => {
        const team = teams[i] ?? null;
        row.crest.setVisible(team !== null);
        if (team) row.crest.setTexture(crestKey(team));
        row.name.setText(team ? getTeam(team).short : '—').setColor(team ? INK_CSS : '#7a6a58');
        row.goals.setText(result ? String(result.score[i]) : '');
        const lost = result !== null && result.winner !== i;
        const alpha = lost ? DIM : 1;
        row.crest.setAlpha(alpha);
        row.name.setAlpha(alpha);
        row.goals.setAlpha(alpha);
      });
      b.pen.setText(result?.penalties ? `pên. ${result.penalties[0]} × ${result.penalties[1]}` : '');
    }
    this.boil = -1;
  }

  /** Informação embaixo do cartaz: duas linhas e, opcionalmente, o nível (estrelas) no fim da segunda. */
  setInfo(line1: string, line2: string, level: { filled: number; label: string } | null = null): void {
    this.info[0].setText(line1);
    this.info[1].setText(line2);
    this.levelGfx.clear();
    this.levelText.setText(level ? level.label : '');
    if (!level) {
      this.info[1].setX(GAME_WIDTH / 2);
      return;
    }
    const starsW = 3 * 11 * 2.4 - 11 * 2.4 + 22;
    const gap = 14;
    const total = this.info[1].width + gap + starsW + gap + this.levelText.width;
    const left = GAME_WIDTH / 2 - total / 2;
    this.info[1].setX(left + this.info[1].width / 2);
    drawLevelStars(this.levelGfx, left + this.info[1].width + gap + 11, INFO_Y[1]!, level.filled);
    this.levelText.setX(left + this.info[1].width + gap + starsW + gap);
  }

  update(timeSec: number): void {
    const v = Math.floor(timeSec * BOIL_FPS) % BOIL_VARIANTS;
    this.trophy.setFrame(trophyFrame(v));
    if (v === this.boil || !this.state) return;
    this.boil = v;
    this.drawLinesAndPlates(v);
  }

  /** Linhas entre os jogos e as placas, com a linha fervendo (variação `v`). */
  private drawLinesAndPlates(v: number): void {
    const s = this.state!;
    const j = (i: number): number => Math.sin(v * 2.1 + i * 1.7) * BOIL_JITTER;
    const lines = this.lines;
    lines.clear();
    // Linhas: dourada no caminho do jogador (o vencedor visível do jogo é ele).
    for (const b of this.boxes) {
      if (b.round === ROUND_COUNT - 1) continue;
      const result = s.results[b.round]![b.k];
      const gold = result !== null && result !== undefined && winnerOf(result) === s.player;
      const next = boxPos(b.round + 1, Math.floor(b.k / 2));
      const fromLeft = b.x < FINAL_X;
      const sx = b.x + (fromLeft ? BOX_W / 2 : -BOX_W / 2);
      const ex = next.x + (fromLeft ? -BOX_W / 2 : BOX_W / 2);
      const elbow = b.round === 0 ? ELBOW_X[fromLeft ? 0 : 1]! : (sx + ex) / 2;
      const pts = [
        { x: sx, y: b.y + j(b.k) },
        { x: elbow + j(b.k + 3), y: b.y },
        { x: elbow - j(b.k + 5), y: next.y },
        { x: ex, y: next.y + j(b.k + 7) },
      ];
      lines.lineStyle(7, INK, 1);
      lines.strokePoints(pts, false);
      lines.lineStyle(3, gold ? GOLD : CREAM, gold ? 1 : 0.75);
      lines.strokePoints(pts, false);
    }

    const g = this.plates;
    g.clear();
    for (const b of this.boxes) {
      const teams = s.teams[b.round]![b.k]!;
      const empty = teams[0] === null && teams[1] === null;
      const left = b.x - BOX_W / 2 + j(b.k + b.round * 4);
      const top = b.y - BOX_H / 2 - j(b.k + 9);
      const champion = b.round === ROUND_COUNT - 1 && s.champion !== null;
      if (champion) {
        g.fillStyle(GOLD, 0.35);
        g.fillRoundedRect(left - 9, top - 9, BOX_W + 18, BOX_H + 18, 14);
      }
      g.fillStyle(INK, 1);
      g.fillRoundedRect(left - 3, top - 3, BOX_W + 6, BOX_H + 6, 10);
      g.fillStyle(empty ? 0x9c8e74 : CREAM, 1);
      g.fillRoundedRect(left, top, BOX_W, BOX_H, 8);
      // A linha do time do jogador em dourado.
      teams.forEach((team, i) => {
        if (team !== s.player) return;
        g.fillStyle(GOLD, 1);
        if (i === 0) g.fillRoundedRect(left, top, BOX_W, BOX_H / 2, { tl: 8, tr: 8, bl: 0, br: 0 });
        else g.fillRoundedRect(left, top + BOX_H / 2, BOX_W, BOX_H / 2, { tl: 0, tr: 0, bl: 8, br: 8 });
      });
      g.lineStyle(1.5, INK, 1);
      g.lineBetween(left + 6, top + BOX_H / 2, left + BOX_W - 6, top + BOX_H / 2);
      g.strokeRoundedRect(left + 4, top + 4, BOX_W - 8, BOX_H - 8, 6);
    }
  }

  setVisible(v: boolean): void {
    for (const o of this.objects) (o as unknown as Phaser.GameObjects.Components.Visible).setVisible(v);
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
  }
}
