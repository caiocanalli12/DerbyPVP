import Phaser from 'phaser';
import {
  BALL_RADIUS,
  GAME_HEIGHT,
  GAME_WIDTH,
  MAX_FRAME_DT,
  PLAYER_RADIUS,
  POSSESSION_RADIUS,
  SIM_DT,
  TACKLE_HITBOX_RADIUS,
} from '../config/constants';
import { isTackleActive, tackleFootTip } from '../sim/tackle';
import { keyboard } from '../core/input';
import type { InputFrame } from '../core/input';
import { DEPTH_UI, PPM, project } from '../core/projection';
import { audio } from '../audio/AudioManager';
import { BallView } from '../render/BallView';
import { DebugOverlay } from '../render/DebugOverlay';
import { FieldView } from '../render/FieldView';
import { PlayersView } from '../render/PlayersView';
import { PenaltyView } from '../render/PenaltyView';
import { artSignature, buildLooks, generateMatchArt, matchArtReady } from '../art/match-art';
import { chooseKits } from '../sim/kits';
import type { KitChoice } from '../sim/kits';
import { getTeam, isTeamId } from '../data/teams';
import type { TeamId } from '../data/teams';
import { IndicatorView } from '../render/IndicatorView';
import { createMatch, drainMatchEvents, formatClock, PERIOD_LABEL, stepMatch } from '../sim/match';
import type { Match } from '../sim/match';
import { drainEvents, getPlayer } from '../sim/world';
import { CREAM_CSS, FONT_TEXT, FONT_TITLE, INK_CSS } from '../art/style';

/**
 * Partida: laço de passo fixo, espelhamento da simulação e interface provisória.
 */
/** Configuração de uma partida (vem da seleção de times). */
export interface MatchConfig {
  teams: [TeamId, TeamId];
  seed: number;
}

export class MatchScene extends Phaser.Scene {
  private config!: MatchConfig;
  private kits!: KitChoice;
  private loading: Generator<number, void, void> | null = null;
  private loadingGfx: Phaser.GameObjects.Graphics | null = null;
  private loadingText: Phaser.GameObjects.Text | null = null;
  private ready = false;
  private match!: Match;
  private debug!: DebugOverlay;
  private playersView!: PlayersView;
  private ballView!: BallView;
  private indicators!: IndicatorView;
  private penaltyView!: PenaltyView;
  private chargeBar!: Phaser.GameObjects.Graphics;
  private scoreText!: Phaser.GameObjects.Text;
  private clockText!: Phaser.GameObjects.Text;
  private cardBg!: Phaser.GameObjects.Rectangle;
  private cardText!: Phaser.GameObjects.Text;
  private bannerText!: Phaser.GameObjects.Text;
  private pauseText!: Phaser.GameObjects.Text;
  private accumulator = 0;
  private paused = false;

  constructor() {
    super('MatchScene');
  }

  init(data: Partial<MatchConfig>): void {
    // Sem menus (ou para depurar): ?t1=PAL&t2=COR na URL.
    const q = new URLSearchParams(window.location.search);
    const pick = (v: string | null | undefined, fallback: TeamId): TeamId =>
      v && isTeamId(v.toUpperCase()) ? (v.toUpperCase() as TeamId) : fallback;
    this.config = {
      teams: data.teams ?? [pick(q.get('t1'), 'PAL'), pick(q.get('t2'), 'COR')],
      seed: data.seed ?? (Date.now() >>> 0),
    };
  }

  create(): void {
    this.ready = false;
    this.kits = chooseKits(this.config.teams[0], this.config.teams[1]);
    this.match = createMatch(this.config.seed);
    const signature = artSignature(this.config.teams, this.kits, this.config.seed);
    if (matchArtReady(this, signature)) {
      this.buildViews();
    } else {
      const looks = buildLooks(this.config.teams, this.kits, this.config.seed);
      this.loading = generateMatchArt(this, looks, [this.kits.kits[0].shirt, this.kits.kits[1].shirt], signature);
      this.showLoading();
    }
  }

  /** Tela de carregamento estilizada enquanto as texturas dos dois times são desenhadas. */
  private showLoading(): void {
    this.cameras.main.setBackgroundColor('#14100c');
    this.loadingGfx = this.add.graphics().setDepth(DEPTH_UI + 50);
    this.loadingText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 50, 'PREPARANDO OS TIMES…', {
        fontFamily: FONT_TITLE,
        fontSize: '44px',
        color: CREAM_CSS,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 51);
    this.drawLoading(0);
  }

  private drawLoading(progress: number): void {
    const g = this.loadingGfx;
    if (!g) return;
    g.clear();
    const w = 520;
    const x = GAME_WIDTH / 2 - w / 2;
    const y = GAME_HEIGHT / 2 + 10;
    g.lineStyle(3, 0xf3e6c4, 1);
    g.strokeRoundedRect(x - 8, y - 8, w + 16, 40, 10);
    g.fillStyle(0xf3e6c4, 1);
    g.fillRoundedRect(x, y, Math.max(8, w * progress), 24, 6);
    const [a, b] = this.config.teams;
    this.loadingText?.setText(`${getTeam(a).name.toUpperCase()} × ${getTeam(b).name.toUpperCase()}`);
  }

  private finishLoading(): void {
    this.loadingGfx?.destroy();
    this.loadingText?.destroy();
    this.loadingGfx = null;
    this.loadingText = null;
    this.loading = null;
    this.buildViews();
  }

  private buildViews(): void {
    this.accumulator = 0;
    this.paused = false;
    this.cameras.main.setBackgroundColor('#000000');
    const shirts: [number, number] = [this.kits.kits[0].shirt, this.kits.kits[1].shirt];

    new FieldView(this);
    this.playersView = new PlayersView(this, this.match);
    this.ballView = new BallView(this);
    this.indicators = new IndicatorView(this, shirts);
    this.penaltyView = new PenaltyView(this, shirts, this.kits.keeperColors);
    this.chargeBar = this.add.graphics().setDepth(DEPTH_UI - 10);
    this.debug = new DebugOverlay(this);

    // Placar simples (o placar de TV vem na fase 12).
    const style = { fontFamily: FONT_TEXT, color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 6 };
    this.scoreText = this.add
      .text(GAME_WIDTH / 2, 18, '', { ...style, fontSize: '40px', fontStyle: '700' })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_UI);
    this.clockText = this.add
      .text(GAME_WIDTH / 2, 68, '', { ...style, fontSize: '24px' })
      .setOrigin(0.5, 0)
      .setDepth(DEPTH_UI);

    // Cartão de intertítulo simples (o estilo cinema mudo vem na fase 12).
    this.cardBg = this.add
      .rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x14100c, 0.92)
      .setDepth(DEPTH_UI + 10)
      .setVisible(false);
    this.cardText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, '', {
        fontFamily: FONT_TITLE,
        fontSize: '64px',
        color: CREAM_CSS,
        align: 'center',
        wordWrap: { width: GAME_WIDTH - 160 },
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 11)
      .setVisible(false);

    // Faixa de avisos (gol, saída de bola).
    this.bannerText = this.add
      .text(GAME_WIDTH / 2, 200, '', { ...style, fontFamily: FONT_TITLE, fontSize: '96px', strokeThickness: 12 })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 5)
      .setVisible(false);

    this.pauseText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'PAUSADO', {
        fontFamily: FONT_TITLE,
        fontSize: '72px',
        color: CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI + 20)
      .setVisible(false);

    // Descarta teclas apertadas antes da partida começar.
    keyboard.snapshot();
    this.ready = true;

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      this.debug.destroy();
      this.playersView.destroy();
      this.ballView.destroy();
      this.indicators.destroy();
      this.penaltyView.destroy();
    });
  }

  override update(): void {
    if (this.loading) {
      const r = this.loading.next();
      if (r.done) this.finishLoading();
      else this.drawLoading(r.value);
      return;
    }
    if (!this.ready) return;
    // Tempo real do quadro: o `delta` do Phaser é suavizado e fica preso em ~16,7 ms
    // quando o FPS cai, o que deixaria o jogo em câmera lenta em máquinas lentas.
    const frameDt = Math.min(this.game.loop.rawDelta / 1000, MAX_FRAME_DT);

    if (this.paused) {
      this.handleGlobalKeys(keyboard.snapshot());
    } else {
      this.accumulator += frameDt;
      while (this.accumulator >= SIM_DT) {
        const frame = keyboard.snapshot();
        this.handleGlobalKeys(frame);
        if (this.paused) {
          this.accumulator = 0;
          break;
        }
        stepMatch(this.match, frame.players, SIM_DT);
        this.accumulator -= SIM_DT;
      }
    }

    this.consumeEvents();

    const world = this.match.world;
    const alpha = this.paused ? 1 : this.accumulator / SIM_DT;
    const now = this.time.now / 1000;
    const renderDt = this.paused ? 0 : frameDt;
    this.playersView.update(this.match, alpha, now, renderDt);
    this.ballView.update(world.ball, alpha, now, renderDt);
    const showIndicators = this.match.phase === 'JOGANDO' || this.match.phase === 'SAIDA_DE_BOLA';
    this.indicators.update(world, alpha, now, showIndicators);
    this.penaltyView.update(this.match, now);
    this.drawChargeBars();
    this.drawHud();
    this.drawDebug();
  }

  private handleGlobalKeys(frame: InputFrame): void {
    if (frame.debug.pressed) this.debug.toggle();
    if (frame.blurred) this.setPaused(true);
    else if (frame.pause.pressed) this.setPaused(!this.paused);
  }

  private setPaused(paused: boolean): void {
    this.paused = paused;
    this.pauseText.setVisible(paused);
  }

  /** Eventos da simulação -> áudio (vazio por enquanto) e efeitos. */
  private consumeEvents(): void {
    for (const e of drainEvents(this.match.world)) {
      this.playersView.onEvent(e, this.match);
      if (e.type === 'pass') audio.play('passe');
      else if (e.type === 'shot') audio.play('chute');
      else if (e.type === 'contact' && (e.kind === 'post' || e.kind === 'bar')) audio.play('trave');
      else if (e.type === 'tackleStart') audio.play('dividida');
      else if (e.type === 'save') audio.play('defesa');
    }
    for (const e of drainMatchEvents(this.match)) {
      if (e.type === 'whistle') audio.play('apito');
      else if (e.type === 'finalWhistle' || e.type === 'periodEnd') audio.play('apito-final');
      else if (e.type === 'goal') audio.play('gol');
      else if (e.type === 'penaltyKick') {
        audio.play('chute');
        if (this.match.attempt) this.playersView.onPenaltyKick(this.match.attempt.kicker);
      }
      else if (e.type === 'penaltyResult' && e.result === 'goal') audio.play('gol');
    }
  }

  private drawHud(): void {
    const m = this.match;
    this.scoreText.setText(`J1  ${m.score[0]}  x  ${m.score[1]}  J2`);
    this.clockText.setText(m.phase === 'PENALTIS' ? 'PÊN' : `${PERIOD_LABEL[m.period]} ${formatClock(m.clock)}`);

    const showCard = m.intertitle !== null;
    this.cardBg.setVisible(showCard);
    this.cardText.setVisible(showCard);
    if (showCard) {
      this.cardText.setText(m.intertitle ?? '');
    }

    if (m.phase === 'COMEMORACAO_GOL') {
      this.bannerText.setText('GOOOL!').setVisible(true);
    } else if (m.phase === 'SAIDA_DE_BOLA') {
      this.bannerText.setText(m.kickoffTeam === 0 ? 'SAÍDA: J1' : 'SAÍDA: J2').setVisible(true);
    } else {
      this.bannerText.setVisible(false);
    }
  }

  /** Barra de força provisória aos pés de quem carrega (o arco final vem na fase 12). */
  private drawChargeBars(): void {
    const g = this.chargeBar;
    g.clear();
    const world = this.match.world;
    for (const team of [0, 1] as const) {
      const h = world.humans[team];
      if (!h.charging) continue;
      const p = getPlayer(world, world.controlled[team]);
      const pos = project(p.x, p.y + 0.6, 0);
      const w = 1.4 * PPM * pos.scale;
      const x0 = pos.x - w / 2;
      g.fillStyle(0x1a1410, 1);
      g.fillRect(x0 - 2, pos.y - 2, w + 4, 10);
      g.fillStyle(h.charge >= 1 && Math.floor(this.time.now / 80) % 2 === 0 ? 0xffffff : 0xffcc33, 1);
      g.fillRect(x0, pos.y, w * h.charge, 6);
    }
  }

  private drawDebug(): void {
    this.debug.beginFrame();
    if (this.debug.isVisible()) {
      const world = this.match.world;
      for (const p of world.players) {
        const color = p.team === 0 ? 0xff8080 : 0x80b0ff;
        this.debug.circle(p.x, p.y, PLAYER_RADIUS, color);
        this.debug.label(
          p.x,
          p.y + 0.9,
          `${p.number} (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) ${Math.hypot(p.vx, p.vy).toFixed(1)}m/s`,
        );
      }
      for (const p of world.players) {
        if (p.state !== 'tackling') continue;
        const tip = tackleFootTip(p);
        this.debug.circle(tip.x, tip.y, TACKLE_HITBOX_RADIUS, isTackleActive(p) ? 0xff2020 : 0x808080);
      }
      const b = world.ball;
      this.debug.circle(b.x, b.y, BALL_RADIUS, 0xffffff);
      this.debug.circle(b.x, b.y, BALL_RADIUS, 0xffffff, b.z);
      this.debug.pillar(b.x, b.y, 0, b.z, 0xffffff);
      for (const team of [0, 1] as const) {
        const c = getPlayer(world, world.controlled[team]);
        this.debug.circle(c.x, c.y, POSSESSION_RADIUS, 0x40ff40);
      }
      this.debug.label(
        b.x,
        b.y - 0.8,
        `bola (${b.x.toFixed(2)}, ${b.y.toFixed(2)}, z ${b.z.toFixed(2)}) ${Math.hypot(b.vx, b.vy, b.vz).toFixed(1)}m/s`,
        b.z,
      );
      this.debug.setInfo(
        `DEBUG · ${this.match.phase} · t=${world.time.toFixed(1)}s · J1 defende ${world.defends[0] === 0 ? 'esq' : 'dir'}`,
      );
    }
    this.debug.endFrame();
  }
}
