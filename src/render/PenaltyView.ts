/**
 * Pênaltis na tela: janela de mira com o gol de frente (sobre a arquibancada, sem cobrir
 * o campo) e o placar da série em bolinhas (cheia = gol, X = perdido).
 * Fase 9: formas simples; o acabamento art déco vem nas fases 12 e 13.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, GOAL_HEIGHT, GOAL_WIDTH, PEN_OVER_START, PEN_SERIES, PEN_TIME_LIMIT } from '../config/constants';
import { DEPTH_UI } from '../core/projection';
import { CREAM, CREAM_CSS, FONT_TEXT, FONT_TITLE, INK, INK_CSS } from '../art/style';
import type { Match } from '../sim/match';
import { effectiveAim, penaltyHeight } from '../sim/penalties';
import type { PenaltyResult } from '../sim/penalties';

/** Escala da janela: pixels por metro. */
const PX = 88;
const PANEL_W = 470;
const PANEL_H = 250;
const PANEL_X = GAME_WIDTH / 2 - PANEL_W / 2;
const PANEL_Y = 104;
/** Base do gol (linha do chão) e centro na janela. */
const GOAL_CX = GAME_WIDTH / 2;
const GOAL_BASE = PANEL_Y + PANEL_H - 22;

const ROLE_NAME: Readonly<Record<string, string>> = {
  ATA: 'ATACANTE',
  ALA_E: 'ALA ESQUERDO',
  ALA_D: 'ALA DIREITO',
  FIXO: 'FIXO',
};

export class PenaltyView {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly timer: Phaser.GameObjects.Text;
  private readonly result: Phaser.GameObjects.Text;
  private readonly series: Phaser.GameObjects.Graphics;
  private readonly mask: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    private readonly teamColors: readonly [number, number],
    private readonly keeperColors: readonly [number, number],
  ) {
    this.g = scene.add.graphics().setDepth(DEPTH_UI + 2);
    // Tudo o que é desenhado na janela fica recortado pela moldura.
    const maskShape = scene.make.graphics({}, false);
    maskShape.fillStyle(0xffffff, 1);
    maskShape.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 14);
    this.mask = maskShape;
    this.g.setMask(maskShape.createGeometryMask());
    this.series = scene.add.graphics().setDepth(DEPTH_UI + 2);
    const style = { fontFamily: FONT_TEXT, color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 5 };
    this.title = scene.add
      .text(GAME_WIDTH / 2, PANEL_Y + 8, '', { ...style, fontSize: '22px', fontStyle: '700' })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_UI + 3);
    this.timer = scene.add
      .text(PANEL_X + PANEL_W - 14, PANEL_Y + 8, '', { ...style, fontSize: '22px', fontStyle: '700' })
      .setOrigin(1, 0)
      .setDepth(DEPTH_UI + 3);
    this.result = scene.add
      .text(GAME_WIDTH / 2, PANEL_Y + PANEL_H / 2 - 10, '', {
        ...style,
        fontFamily: FONT_TITLE,
        fontSize: '54px',
        strokeThickness: 9,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 4);
    this.setVisible(false);
  }

  private setVisible(v: boolean): void {
    this.g.setVisible(v);
    this.title.setVisible(v);
    this.timer.setVisible(v);
    this.result.setVisible(v);
    this.series.setVisible(v);
  }

  update(match: Match, timeSec: number): void {
    const s = match.shootout;
    const a = match.attempt;
    if (!s) {
      this.setVisible(false);
      return;
    }
    this.setVisible(true);
    this.drawSeries(match);
    const g = this.g;
    g.clear();
    if (!a) {
      this.title.setVisible(false);
      this.timer.setVisible(false);
      this.result.setVisible(false);
      return;
    }

    // Moldura.
    g.fillStyle(INK, 0.92);
    g.fillRoundedRect(PANEL_X, PANEL_Y, PANEL_W, PANEL_H, 14);
    g.lineStyle(3, CREAM, 1);
    g.strokeRoundedRect(PANEL_X + 5, PANEL_Y + 5, PANEL_W - 10, PANEL_H - 10, 10);

    // Gol de frente, com as zonas (terços) e a faixa externa de 15%.
    const half = (GOAL_WIDTH / 2) * PX;
    const top = GOAL_BASE - GOAL_HEIGHT * PX;
    g.fillStyle(0x2c5e2a, 1);
    g.fillRect(GOAL_CX - half - 30, GOAL_BASE, half * 2 + 60, 8);
    g.fillStyle(0xffffff, 0.06);
    g.fillRect(GOAL_CX - half, top, half * 2, GOAL_HEIGHT * PX);
    g.fillStyle(0xffffff, 0.08);
    const outer = GOAL_WIDTH * 0.15 * PX;
    g.fillRect(GOAL_CX - half, top, outer, GOAL_HEIGHT * PX);
    g.fillRect(GOAL_CX + half - outer, top, outer, GOAL_HEIGHT * PX);
    g.lineStyle(1, 0xffffff, 0.15);
    for (const k of [-1, 1]) g.lineBetween(GOAL_CX + (k * half) / 3, top, GOAL_CX + (k * half) / 3, GOAL_BASE);
    // Rede.
    g.lineStyle(1, 0xffffff, 0.12);
    for (let x = -half; x <= half; x += 20) g.lineBetween(GOAL_CX + x, top, GOAL_CX + x, GOAL_BASE);
    for (let y = top; y <= GOAL_BASE; y += 20) g.lineBetween(GOAL_CX - half, y, GOAL_CX + half, y);
    // Traves.
    g.lineStyle(9, INK, 1);
    g.strokeLineShape(new Phaser.Geom.Line(GOAL_CX - half, GOAL_BASE, GOAL_CX - half, top));
    g.strokeLineShape(new Phaser.Geom.Line(GOAL_CX - half, top, GOAL_CX + half, top));
    g.strokeLineShape(new Phaser.Geom.Line(GOAL_CX + half, top, GOAL_CX + half, GOAL_BASE));
    g.lineStyle(5, 0xffffff, 1);
    g.strokeLineShape(new Phaser.Geom.Line(GOAL_CX - half, GOAL_BASE, GOAL_CX - half, top));
    g.strokeLineShape(new Phaser.Geom.Line(GOAL_CX - half, top, GOAL_CX + half, top));
    g.strokeLineShape(new Phaser.Geom.Line(GOAL_CX + half, top, GOAL_CX + half, GOAL_BASE));

    // Goleiro (na zona escolhida depois do chute).
    const gkColor = this.keeperColors[a.team === 0 ? 1 : 0];
    let gkX = GOAL_CX;
    let gkLean = 0;
    if (a.plan && (a.phase === 'flight' || a.phase === 'result')) {
      const dir = a.plan.keeperZone === 'L' ? -1 : a.plan.keeperZone === 'R' ? 1 : 0;
      const k = a.phase === 'result' ? 1 : Math.min(1, a.timer / 0.35);
      gkX = GOAL_CX + dir * PX * 0.75 * k;
      gkLean = dir * k * 0.85;
    }
    this.drawKeeper(gkX, gkLean, gkColor);

    const kicker = match.world.players[a.kicker];
    const who = a.team === 0 ? 'J1' : 'J2';
    this.title.setText(`${who} COBRA · ${ROLE_NAME[kicker?.role ?? 'ATA'] ?? ''}`).setVisible(true);

    if (a.phase === 'aiming' || a.phase === 'setup') {
      // Cursor: posição lateral (com balanço) e altura conforme a força.
      const aim = a.phase === 'aiming' ? effectiveAim(a) : a.cursor;
      const h = penaltyHeight(a.charge);
      const cx = GOAL_CX + aim * PX;
      const cy = GOAL_BASE - h * PX;
      const danger = a.charge > PEN_OVER_START;
      const color = danger ? 0xff3b30 : this.teamColors[a.team];
      g.lineStyle(5, INK, 1);
      g.strokeCircle(cx, cy, 15);
      g.lineStyle(3, color, 1);
      g.strokeCircle(cx, cy, 15);
      g.lineBetween(cx - 24, cy, cx - 8, cy);
      g.lineBetween(cx + 8, cy, cx + 24, cy);
      g.lineBetween(cx, cy - 24, cx, cy - 8);
      g.lineBetween(cx, cy + 8, cx, cy + 24);
      // Barra de força (vertical, à direita).
      const bx = PANEL_X + PANEL_W - 36;
      const by = PANEL_Y + 44;
      const bh = PANEL_H - 74;
      g.fillStyle(0x000000, 0.6);
      g.fillRect(bx, by, 16, bh);
      const blink = a.charge >= 1 && Math.floor(timeSec * 12) % 2 === 0;
      g.fillStyle(blink ? 0xffffff : danger ? 0xff3b30 : 0xffcc33, 1);
      g.fillRect(bx, by + bh * (1 - a.charge), 16, bh * a.charge);
      g.lineStyle(2, CREAM, 1);
      g.strokeRect(bx, by, 16, bh);
      g.lineStyle(2, 0xff3b30, 1);
      g.lineBetween(bx - 4, by + bh * (1 - PEN_OVER_START), bx + 20, by + bh * (1 - PEN_OVER_START));
      const left = a.phase === 'aiming' ? Math.max(0, PEN_TIME_LIMIT - a.aimTime) : PEN_TIME_LIMIT;
      this.timer.setText(left.toFixed(1)).setVisible(true);
      this.result.setVisible(false);
    } else if (a.plan) {
      this.timer.setVisible(false);
      // Bola indo para o ponto final.
      const k = a.phase === 'result' ? 1 : Math.min(1, a.timer / 0.3);
      const bx = GOAL_CX + a.plan.offset * PX * k;
      // Bola isolada aparece logo acima do travessão (dentro da janela).
      const shownHeight = Math.min(a.plan.height * PX, GOAL_HEIGHT * PX + 14);
      const by = GOAL_BASE - 10 - (shownHeight - 10) * k;
      g.fillStyle(0xf6ecd0, 1);
      g.fillCircle(bx, by, 9);
      g.lineStyle(3, INK, 1);
      g.strokeCircle(bx, by, 9);
      if (a.phase === 'result') {
        const text =
          a.plan.result === 'goal'
            ? 'GOL!'
            : a.plan.reason === 'over'
              ? 'ISOLOU!'
              : a.plan.reason === 'wide'
                ? 'PRA FORA!'
                : 'DEFENDEU!';
        this.result.setText(text).setVisible(true);
      } else {
        this.result.setVisible(false);
      }
    }
  }

  private drawKeeper(x: number, lean: number, color: number): void {
    const g = this.g;
    const base = GOAL_BASE;
    const angle = lean * 1.1;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    // Corpo como uma cápsula inclinada na direção do mergulho.
    const len = 95;
    const tx = x + sin * len;
    const ty = base - cos * len - Math.abs(lean) * 10;
    g.lineStyle(34, INK, 1);
    g.lineBetween(x, base - 12, tx, ty);
    g.lineStyle(28, color, 1);
    g.lineBetween(x, base - 12, tx, ty);
    // Cabeça e luvas.
    g.fillStyle(INK, 1);
    g.fillCircle(tx + sin * 22, ty - cos * 22, 17);
    g.fillStyle(0xe0b48a, 1);
    g.fillCircle(tx + sin * 22, ty - cos * 22, 14);
    g.fillStyle(0xffffff, 1);
    g.fillCircle(tx - cos * 34 + sin * 6, ty - sin * 34, 11);
    g.fillCircle(tx + cos * 34 + sin * 6, ty + sin * 34, 11);
  }

  /** Placar da série: uma linha de bolinhas por time no topo. */
  private drawSeries(match: Match): void {
    const s = match.shootout;
    const g = this.series;
    g.clear();
    if (!s) return;
    const n = Math.max(PEN_SERIES, s.kicks[0].length, s.kicks[1].length);
    const r = 8;
    const gap = 22;
    for (const team of [0, 1] as const) {
      const y = 80;
      const dir = team === 0 ? -1 : 1;
      const startX = GAME_WIDTH / 2 + dir * 150;
      for (let i = 0; i < n; i++) {
        const x = startX + dir * i * gap;
        const res: PenaltyResult | undefined = s.kicks[team][i];
        g.lineStyle(3, INK, 1);
        g.fillStyle(CREAM, 1);
        g.fillCircle(x, y, r);
        g.strokeCircle(x, y, r);
        if (res === 'goal') {
          g.fillStyle(this.teamColors[team], 1);
          g.fillCircle(x, y, r - 2.5);
        } else if (res) {
          g.lineStyle(3, 0xc0392b, 1);
          g.lineBetween(x - 5, y - 5, x + 5, y + 5);
          g.lineBetween(x - 5, y + 5, x + 5, y - 5);
        }
      }
    }
  }

  destroy(): void {
    this.g.clearMask(true);
    this.mask.destroy();
    this.g.destroy();
    this.series.destroy();
    this.title.destroy();
    this.timer.destroy();
    this.result.destroy();
  }
}
