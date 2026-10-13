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
import { DEPTH_UI } from '../core/projection';
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
import { ScoreboardView } from '../render/ScoreboardView';
import { PowerArcView } from '../render/PowerArcView';
import { IntertitleView } from '../render/IntertitleView';
import { EffectsView } from '../render/EffectsView';
import { GoalTextView } from '../render/GoalTextView';
import { FilmView } from '../render/FilmView';
import { CrowdView } from '../render/CrowdView';
import type { CrowdMood } from '../render/CrowdView';
import { SponsorView } from '../render/SponsorView';
import { WeatherView } from '../render/WeatherView';
import { generateCrowdTexture } from '../art/crowd-art';
import { isWeatherId, randomWeather } from '../data/weather';
import type { WeatherId } from '../data/weather';
import { CROWD_ATTACK_DISTANCE, GOAL_FLASH_MS, GOAL_SHAKE_INTENSITY, GOAL_SHAKE_MS } from '../config/constants';
import { goalCenter } from '../sim/field';
import { attackedGoal } from '../sim/world';
import { Rng } from '../core/rng';
import { createMatch, drainMatchEvents, PENALTY_GOAL, stepMatch } from '../sim/match';
import type { Match } from '../sim/match';
import { drainEvents, getPlayer } from '../sim/world';
import { CREAM_CSS, FONT_TITLE, INK_CSS } from '../art/style';

/** Preferência dos efeitos de filme (menu de pausa); ?film=0 desliga para testar. */
export function filmEffectsEnabled(scene: Phaser.Scene): boolean {
  const stored = scene.registry.get('filmFx');
  if (typeof stored === 'boolean') return stored;
  return new URLSearchParams(window.location.search).get('film') !== '0';
}

/** Configuração de uma partida (vem da seleção de times e da tela VS). */
export interface MatchConfig {
  teams: [TeamId, TeamId];
  seed: number;
  weather: WeatherId;
}

/**
 * Partida: laço de passo fixo e espelhamento da simulação na tela.
 */

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
  private fieldView!: FieldView;
  private crowdView!: CrowdView;
  private sponsorView!: SponsorView;
  private weatherView!: WeatherView;
  private scoreboard!: ScoreboardView;
  private powerArc!: PowerArcView;
  private intertitle!: IntertitleView;
  private effects!: EffectsView;
  private goalText!: GoalTextView;
  private film!: FilmView;
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
    const seed = data.seed ?? (Date.now() >>> 0);
    const w = q.get('weather');
    const rng = new Rng(seed ^ 0xbeef);
    this.config = {
      teams: data.teams ?? [pick(q.get('t1'), 'PAL'), pick(q.get('t2'), 'COR')],
      seed,
      weather: data.weather ?? (w && isWeatherId(w) ? w : randomWeather(() => rng.next())),
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

    const weather = this.config.weather;
    this.fieldView = new FieldView(this, weather, this.config.seed);
    generateCrowdTexture(this, this.kits.kits);
    this.crowdView = new CrowdView(this, this.config.seed);
    this.sponsorView = new SponsorView(this);
    this.weatherView = new WeatherView(this, weather, this.config.seed);
    this.playersView = new PlayersView(this, this.match, weather);
    this.ballView = new BallView(this, weather);
    this.indicators = new IndicatorView(this, shirts);
    this.penaltyView = new PenaltyView(this, shirts, this.kits.keeperColors);
    this.powerArc = new PowerArcView(this, shirts);
    this.debug = new DebugOverlay(this);
    this.scoreboard = new ScoreboardView(this, this.config.teams, shirts);
    this.intertitle = new IntertitleView(this);
    this.effects = new EffectsView(this);
    this.goalText = new GoalTextView(this, shirts);
    this.film = new FilmView(this, filmEffectsEnabled(this));

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
      this.fieldView.destroy();
      this.crowdView.destroy();
      this.sponsorView.destroy();
      this.weatherView.destroy();
      this.scoreboard.destroy();
      this.powerArc.destroy();
      this.intertitle.destroy();
      this.effects.destroy();
      this.goalText.destroy();
      this.film.destroy();
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
    this.fieldView.update(now);
    this.crowdView.update(now, this.crowdMoods());
    this.sponsorView.update(now);
    this.weatherView.update(now, renderDt);
    const showIndicators = this.match.phase === 'JOGANDO' || this.match.phase === 'SAIDA_DE_BOLA';
    this.indicators.update(world, alpha, now, showIndicators);
    this.penaltyView.update(this.match, now);
    this.powerArc.update(this.match, alpha, now);
    this.scoreboard.update(this.match, now);
    this.intertitle.update(this.match.intertitle, now);
    this.effects.update(this.match, alpha, now, renderDt);
    if (this.match.phase !== 'COMEMORACAO_GOL') this.goalText.hide();
    this.goalText.update(now);
    this.film.update(now, renderDt);
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

  /** Ânimo de cada metade da torcida (esquerda = J1, direita = J2). */
  private crowdMoods(): [CrowdMood, CrowdMood] {
    const m = this.match;
    const moods: [CrowdMood, CrowdMood] = ['calm', 'calm'];
    const last = m.goals[m.goals.length - 1];
    if (m.phase === 'COMEMORACAO_GOL' && last) moods[last.team] = 'goal';
    const a = m.attempt;
    if (a && a.phase === 'result' && a.plan?.result === 'goal') moods[a.team] = 'goal';
    if (m.phase === 'FIM' && m.phaseTimer < 0.1) return moods;
    if (m.phase === 'JOGANDO') {
      const b = m.world.ball;
      for (const team of [0, 1] as const) {
        if (moods[team] === 'goal') continue;
        const g = goalCenter(attackedGoal(m.world, team));
        const owner = b.owner !== null ? m.world.players[b.owner] : null;
        const ours = !owner || owner.team === team;
        if (ours && Math.hypot(b.x - g.x, b.y - g.y) < CROWD_ATTACK_DISTANCE) moods[team] = 'excited';
      }
    }
    return moods;
  }

  /** Eventos da simulação -> áudio (vazio por enquanto) e efeitos. */
  private consumeEvents(): void {
    for (const e of drainEvents(this.match.world)) {
      this.effects.onEvent(e, this.match);
      if (e.type === 'goal') this.fieldView.goalScored(e.side, this.time.now / 1000);
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
      else if (e.type === 'goal') {
        audio.play('gol');
        // Comemoração: "GOOOL!" elástico, tremor e flash (a torcida e o autor já reagem).
        this.goalText.show(e.goal.team, this.time.now / 1000);
        this.cameras.main.shake(GOAL_SHAKE_MS, GOAL_SHAKE_INTENSITY);
        this.cameras.main.flash(GOAL_FLASH_MS, 255, 250, 235);
      }
      else if (e.type === 'penaltyKick') {
        audio.play('chute');
        if (this.match.attempt) this.playersView.onPenaltyKick(this.match.attempt.kicker);
      }
      else if (e.type === 'penaltyResult' && e.result === 'goal') {
        audio.play('gol');
        this.fieldView.goalScored(PENALTY_GOAL, this.time.now / 1000);
        this.cameras.main.shake(GOAL_SHAKE_MS * 0.6, GOAL_SHAKE_INTENSITY * 0.6);
      }
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
