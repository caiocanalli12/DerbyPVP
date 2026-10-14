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
import type { GameMode } from '../core/modes';
import { KeyboardTickSampler, LocalKeyboardSource } from '../core/sources';
import type { CommandSource } from '../sim/command';
import { DEPTH_UI } from '../core/projection';
import { audio } from '../audio/AudioManager';
import { BallView } from '../render/BallView';
import { DebugOverlay } from '../render/DebugOverlay';
import { FieldView } from '../render/FieldView';
import { PlayersView } from '../render/PlayersView';
import { PenaltyView } from '../render/PenaltyView';
import { advanceArt, artBudgetMs, artSignature, buildLooks, generateMatchArt, matchArtReady } from '../art/match-art';
import type { ArtStep } from '../art/match-art';
import { chooseKits, kitChoiceFor } from '../sim/kits';
import type { KitChoice, KitVariant } from '../sim/kits';
import { getTeam, isTeamId } from '../data/teams';
import type { TeamId } from '../data/teams';
import { IndicatorView } from '../render/IndicatorView';
import { ScoreboardView } from '../render/ScoreboardView';
import { PowerArcView } from '../render/PowerArcView';
import { KickoffAimView } from '../render/KickoffAimView';
import { IntertitleView } from '../render/IntertitleView';
import { EffectsView } from '../render/EffectsView';
import { GoalTextView } from '../render/GoalTextView';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
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
import { createMatch, drainMatchEvents, drainSounds, matchWinner, PENALTY_GOAL, stepMatch } from '../sim/match';
import { goalsOf } from '../sim/penalties';
import { PAUSE_EVENTS } from './PauseScene';
import type { Match } from '../sim/match';
import { drainEvents, getPlayer } from '../sim/world';
import type { HumanInputs } from '../sim/world';
import { CREAM_CSS, FONT_TITLE } from '../art/style';

/** Configuração de uma partida (vem da seleção de times e da tela VS). */
export interface MatchConfig {
  teams: [TeamId, TeamId];
  seed: number;
  weather: WeatherId;
  /** Uniformes escolhidos na seleção (sem isso, a regra automática). */
  kits?: [KitVariant, KitVariant];
  /** Modo de jogo (sem isso, 'local'). */
  mode: GameMode;
}

/** Fontes de comando de cada time conforme o modo (a partida é a mesma nos três). */
function createSources(mode: GameMode, sampler: KeyboardTickSampler): [CommandSource, CommandSource] {
  switch (mode) {
    case 'local':
      return [new LocalKeyboardSource(sampler, 0), new LocalKeyboardSource(sampler, 1)];
    case 'solo':
    case 'online':
      throw new Error(`modo ainda não disponível: ${mode}`);
  }
}

/**
 * Partida: laço de passo fixo e espelhamento da simulação na tela.
 */

export class MatchScene extends Phaser.Scene {
  private config!: MatchConfig;
  private kits!: KitChoice;
  private loading: Generator<ArtStep, void, void> | null = null;
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
  private kickoffAim!: KickoffAimView;
  private intertitle!: IntertitleView;
  private effects!: EffectsView;
  private goalText!: GoalTextView;
  private film!: FilmView;
  private accumulator = 0;
  /** Passo fixo atual (as fontes de comando respondem por tick). */
  private tick = 0;
  private sampler!: KeyboardTickSampler;
  private sources!: [CommandSource, CommandSource];
  private skipDelta = false;
  private finished = false;

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
      kits: data.kits,
      mode: data.mode ?? 'local',
    };
  }

  create(): void {
    this.ready = false;
    this.loading = null;
    this.tick = 0;
    this.sampler = new KeyboardTickSampler();
    this.sources = createSources(this.config.mode, this.sampler);
    const [t1, t2] = this.config.teams;
    this.kits = this.config.kits ? kitChoiceFor(t1, t2, this.config.kits) : chooseKits(t1, t2);
    // A semente da arte fica fixa (revanche reaproveita as texturas); a da partida varia.
    this.match = createMatch((this.config.seed ^ Date.now()) >>> 0);
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
    this.skipDelta = false;
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
    this.kickoffAim = new KickoffAimView(this, shirts);
    this.debug = new DebugOverlay(this);
    this.scoreboard = new ScoreboardView(this, this.config.teams, shirts);
    this.intertitle = new IntertitleView(this);
    this.effects = new EffectsView(this);
    this.goalText = new GoalTextView(this, shirts);
    this.film = new FilmView(this, filmEffectsEnabled(this));

    // Descarta teclas apertadas antes da partida começar.
    keyboard.snapshot();
    this.sampler.reset();
    this.ready = true;
    this.finished = false;
    this.game.events.on(PAUSE_EVENTS.resume, this.onResume, this);
    this.game.events.on(PAUSE_EVENTS.filmToggle, this.onFilmToggle, this);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.ready = false;
      // Reiniciar ou sair pela pausa: o resto de um som (o sino do gol) não passa para a próxima tela.
      audio.stopAll();
      this.game.events.off(PAUSE_EVENTS.resume, this.onResume, this);
      this.game.events.off(PAUSE_EVENTS.filmToggle, this.onFilmToggle, this);
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
      this.kickoffAim.destroy();
      this.intertitle.destroy();
      this.effects.destroy();
      this.goalText.destroy();
      this.film.destroy();
    });
  }

  override update(): void {
    if (this.loading) {
      const step = advanceArt(this.loading, artBudgetMs(this.game.loop.rawDelta));
      if (step === null) this.finishLoading();
      else this.drawLoading(step.progress);
      return;
    }
    if (!this.ready) return;
    // Tempo real do quadro: o `delta` do Phaser é suavizado e fica preso em ~16,7 ms
    // quando o FPS cai, o que deixaria o jogo em câmera lenta em máquinas lentas.
    // Logo depois de voltar da pausa, o quadro é ignorado (não "recupera" o tempo parado).
    const frameDt = this.skipDelta ? 0 : Math.min(this.game.loop.rawDelta / 1000, MAX_FRAME_DT);
    this.skipDelta = false;

    this.accumulator += frameDt;
    while (this.accumulator >= SIM_DT) {
      const frame = this.sampler.frame(this.tick);
      if (frame.debug.pressed) this.debug.toggle();
      if ((frame.blurred || frame.pause.pressed) && !this.finished) {
        this.openPause();
        return;
      }
      const commands: HumanInputs = [this.sources[0].getCommand(this.tick), this.sources[1].getCommand(this.tick)];
      stepMatch(this.match, commands, SIM_DT);
      this.tick++;
      this.accumulator -= SIM_DT;
    }

    this.consumeEvents();
    if (this.match.over) this.goToResult();

    const world = this.match.world;
    const alpha = this.accumulator / SIM_DT;
    const now = this.time.now / 1000;
    const renderDt = frameDt;
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
    this.kickoffAim.update(this.match, now);
    this.scoreboard.update(this.match, now);
    this.intertitle.update(this.match.intertitle, now);
    this.effects.update(this.match, alpha, now, renderDt);
    if (this.match.phase !== 'COMEMORACAO_GOL') this.goalText.hide();
    this.goalText.update(now);
    this.film.update(now, renderDt);
    this.drawDebug();
  }

  /** Pausa a partida e abre o menu de pausa por cima. */
  private openPause(): void {
    this.accumulator = 0;
    this.scene.launch('PauseScene', { config: this.config });
    this.scene.pause();
  }

  private onResume(): void {
    // Teclas apertadas durante a pausa não valem na partida. O quadro do tick em que a pausa
    // abriu (com a pausa apertada) é esquecido, senão a reabriria.
    keyboard.snapshot();
    this.sampler.reset();
    this.accumulator = 0;
    this.skipDelta = true;
  }

  private onFilmToggle(on: boolean): void {
    this.film.setEnabled(on);
  }

  /** Fim de jogo: vai para a tela de resultado. */
  private goToResult(): void {
    if (this.finished) return;
    this.finished = true;
    const m = this.match;
    const winner = matchWinner(m) ?? 0;
    const pens = m.shootout ? ([goalsOf(m.shootout, 0), goalsOf(m.shootout, 1)] as [number, number]) : null;
    this.cameras.main.fadeOut(300, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.start('ResultScene', {
        teams: this.config.teams,
        seed: this.config.seed,
        score: [m.score[0], m.score[1]],
        penalties: pens,
        winner,
        colors: [this.kits.kits[0].shirt, this.kits.kits[1].shirt],
        kits: this.kits.variants,
      }),
    );
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

  /** Eventos da simulação -> sons (os que a simulação emitiu) e efeitos. */
  private consumeEvents(): void {
    for (const s of drainSounds(this.match)) audio.playSound(s);
    for (const e of drainEvents(this.match.world)) {
      this.effects.onEvent(e, this.match);
      if (e.type === 'goal') this.fieldView.goalScored(e.side, this.time.now / 1000);
      this.playersView.onEvent(e, this.match);
    }
    for (const e of drainMatchEvents(this.match)) {
      if (e.type === 'goal') {
        // Comemoração: "GOOOL!" elástico, tremor e flash (a torcida e o autor já reagem); o som
        // do gol sai no mesmo passo, junto com a entrada do texto.
        this.goalText.show(e.goal.team, this.time.now / 1000);
        this.cameras.main.shake(GOAL_SHAKE_MS, GOAL_SHAKE_INTENSITY);
        this.cameras.main.flash(GOAL_FLASH_MS, 255, 250, 235);
      }
      else if (e.type === 'penaltyKick') {
        if (this.match.attempt) this.playersView.onPenaltyKick(this.match.attempt.kicker);
      }
      else if (e.type === 'penaltyResult' && e.result === 'goal') {
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
