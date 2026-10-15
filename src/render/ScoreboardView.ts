/**
 * Placar estilo transmissão de TV (art déco): escudo J1 · sigla J1 · placar · sigla J2 ·
 * escudo J2, com relógio e período numa aba abaixo e, nos pênaltis, as bolinhas da série.
 */
import Phaser from 'phaser';
import { GAME_WIDTH, PEN_SERIES } from '../config/constants';
import { DEPTH_UI } from '../core/projection';
import { getTeam } from '../data/teams';
import type { TeamId } from '../data/teams';
import { crestKey, CREST_SIZE, generateCrestTextures } from '../art/crest-art';
import { generateScoreboardTextures, SB_PLATE_H, SB_PLATE_KEY, SB_PLATE_W, SB_TAB_KEY } from '../art/ui-art';
import { pingColor } from '../net/sync';
import { CREAM, CREAM_CSS, FONT_TEXT, FONT_TITLE, INK, INK_CSS } from '../art/style';
import { formatClock, PERIOD_LABEL } from '../sim/match';
import type { Match } from '../sim/match';
import type { PenaltyResult } from '../sim/penalties';

const CX = GAME_WIDTH / 2;
const TOP = 6;
const MID = TOP + 4 + SB_PLATE_H / 2;
const PING_CSS = { green: '#7fd36b', yellow: '#ffd24a', red: '#ff7a63' } as const;

export class ScoreboardView {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly score: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  private readonly clock: Phaser.GameObjects.Text;
  private readonly kickoff: Phaser.GameObjects.Text;
  private readonly series: Phaser.GameObjects.Graphics;
  private lastScore = '';
  private ping: Phaser.GameObjects.Text | null = null;
  private readonly scene: Phaser.Scene;

  constructor(
    scene: Phaser.Scene,
    teams: readonly [TeamId, TeamId],
    private readonly colors: readonly [number, number],
  ) {
    this.scene = scene;
    generateScoreboardTextures(scene);
    generateCrestTextures(scene);
    const d = DEPTH_UI;
    const add = <T extends Phaser.GameObjects.GameObject>(o: T): T => {
      this.objects.push(o);
      return o;
    };
    add(scene.add.image(CX, TOP, SB_PLATE_KEY).setOrigin(0.5, 0).setDepth(d));
    // Faixas na cor do uniforme de cada time.
    const band = add(scene.add.graphics().setDepth(d + 0.5));
    for (const team of [0, 1] as const) {
      const x = team === 0 ? CX - 222 : CX + 120;
      band.fillStyle(colors[team], 1);
      band.fillRect(x, TOP + SB_PLATE_H - 6, 102, 5);
      band.lineStyle(1.5, INK, 1);
      band.strokeRect(x, TOP + SB_PLATE_H - 6, 102, 5);
    }
    for (const team of [0, 1] as const) {
      const s = team === 0 ? -1 : 1;
      add(scene.add.image(CX + s * 196, MID - 1, crestKey(teams[team])).setDisplaySize(CREST_SIZE * 0.42, CREST_SIZE * 0.42).setDepth(d + 1));
      add(
        scene.add
          .text(CX + s * 120, MID - 3, getTeam(teams[team]).short, {
            fontFamily: FONT_TITLE,
            fontSize: '30px',
            color: INK_CSS,
          })
          .setOrigin(0.5)
          .setDepth(d + 1),
      );
    }
    const scoreStyle = { fontFamily: FONT_TEXT, fontSize: '44px', fontStyle: '700', color: INK_CSS };
    this.score = [
      add(scene.add.text(CX - 30, MID - 2, '0', scoreStyle).setOrigin(0.5).setDepth(d + 1)),
      add(scene.add.text(CX + 30, MID - 2, '0', scoreStyle).setOrigin(0.5).setDepth(d + 1)),
    ];
    add(scene.add.text(CX, MID - 4, '–', { ...scoreStyle, fontSize: '30px' }).setOrigin(0.5).setDepth(d + 1));
    add(scene.add.image(CX, TOP + SB_PLATE_H + 2, SB_TAB_KEY).setOrigin(0.5, 0).setDepth(d - 0.5));
    this.clock = add(
      scene.add
        .text(CX, TOP + SB_PLATE_H + 16, '', { fontFamily: FONT_TEXT, fontSize: '20px', fontStyle: '700', color: CREAM_CSS })
        .setOrigin(0.5)
        .setDepth(d + 1),
    );
    this.kickoff = add(
      scene.add
        .text(CX, TOP + SB_PLATE_H + 46, '', {
          fontFamily: FONT_TITLE,
          fontSize: '20px',
          color: CREAM_CSS,
          stroke: INK_CSS,
          strokeThickness: 5,
        })
        .setOrigin(0.5)
        .setDepth(d + 1),
    );
    this.series = add(scene.add.graphics().setDepth(d + 1));
  }

  /** Ping do online, num canto discreto do placar: verde até 80 ms, amarelo até 150, vermelho acima. */
  setPing(ms: number | null): void {
    if (!this.ping) {
      this.ping = this.scene.add
        .text(CX + SB_PLATE_W / 2 + 12, TOP + 14, '', { fontFamily: FONT_TEXT, fontSize: '16px', fontStyle: '700', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 4 })
        .setOrigin(0, 0.5)
        .setDepth(DEPTH_UI + 1);
      this.objects.push(this.ping);
    }
    const color = ms === null ? CREAM_CSS : PING_CSS[pingColor(ms)];
    this.ping.setText(ms === null ? '● … ms' : `● ${ms} ms`).setColor(color);
  }

  update(match: Match, timeSec: number): void {
    const key = `${match.score[0]}-${match.score[1]}`;
    if (key !== this.lastScore) {
      this.lastScore = key;
      this.score[0].setText(String(match.score[0]));
      this.score[1].setText(String(match.score[1]));
    }
    this.clock.setText(match.shootout || match.phase === 'PENALTIS' ? 'PÊN' : `${PERIOD_LABEL[match.period]} ${formatClock(match.clock)}`);
    // Aviso discreto da saída de bola; depois do apito, lembra que ela sai com um passe para trás.
    if (match.phase === 'SAIDA_DE_BOLA') {
      const blink = Math.floor(timeSec * 4) % 2 === 0;
      const who = match.kickoffTeam === 0 ? 'J1' : 'J2';
      this.kickoff
        .setText(match.kickoffLive ? `${who}: MIRE E PASSE PARA TRÁS` : `SAÍDA DE BOLA · ${who}`)
        .setVisible(match.kickoffLive || blink || match.phaseTimer < 0.3);
    } else {
      this.kickoff.setVisible(false);
    }
    this.drawSeries(match);
  }

  /** Bolinhas da série de pênaltis: cheia = gol, X = perdido. */
  private drawSeries(match: Match): void {
    const g = this.series;
    g.clear();
    const s = match.shootout;
    if (!s) return;
    const n = Math.max(PEN_SERIES, s.kicks[0].length, s.kicks[1].length);
    const y = TOP + SB_PLATE_H + 17;
    const r = 7;
    const gap = 19;
    for (const team of [0, 1] as const) {
      const dir = team === 0 ? -1 : 1;
      for (let i = 0; i < n; i++) {
        const x = CX + dir * (92 + i * gap);
        const res: PenaltyResult | undefined = s.kicks[team][i];
        g.fillStyle(CREAM, 1);
        g.fillCircle(x, y, r);
        g.lineStyle(2.5, INK, 1);
        g.strokeCircle(x, y, r);
        if (res === 'goal') {
          g.fillStyle(this.colors[team], 1);
          g.fillCircle(x, y, r - 2.5);
          g.lineStyle(1.2, INK, 1);
          g.strokeCircle(x, y, r - 2.5);
        } else if (res) {
          g.lineStyle(3, 0xc0392b, 1);
          g.lineBetween(x - 4, y - 4, x + 4, y + 4);
          g.lineBetween(x - 4, y + 4, x + 4, y - 4);
        }
      }
    }
  }

  destroy(): void {
    for (const o of this.objects) o.destroy();
    this.objects.length = 0;
  }
}
