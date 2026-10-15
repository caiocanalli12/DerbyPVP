import Phaser from 'phaser';
import {
  BALL_RADIUS,
  GAME_HEIGHT,
  GAME_WIDTH,
  MAX_FRAME_DT,
  NET_IDLE_SNAPSHOT_TIME,
  NET_STALL_TIME,
  NET_WO_TIMEOUT,
  PLAYER_RADIUS,
  POSSESSION_RADIUS,
  SIM_DT,
  TACKLE_HITBOX_RADIUS,
} from '../config/constants';
import { isTackleActive, tackleFootTip } from '../sim/tackle';
import { keyboard } from '../core/input';
import type { GameMode } from '../core/modes';
import { CombinedKeyboardSource, KeyboardTickSampler, LocalKeyboardSource } from '../core/sources';
import { emptyCommand } from '../sim/command';
import type { CommandSource, TeamCommand } from '../sim/command';
import { BackgroundTicker } from '../net/backgroundTicker';
import { GuestLink } from '../net/guest';
import { HostLink } from '../net/host';
import { currentSession, setCurrentSession } from '../net/peer';
import type { NetSession } from '../net/peer';
import type { NetEvent } from '../net/snapshot';
import { OnlineHud } from '../render/OnlineHud';
import { readMenuInput } from '../render/menu';
import type { SimEvent } from '../sim/events';
import type { MatchEvent } from '../sim/match';
import { CpuSource, isCpuLevel } from '../sim/cpu';
import type { CpuLevel } from '../sim/cpu';
import { recordPlayerMatch } from '../sim/tournament';
import type { Tournament } from '../sim/tournament';
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
  /** Nível do CPU adversário (modo solo; sem isso, Médio). */
  cpuLevel?: CpuLevel;
  /** Campeonato em andamento (modo solo): no fim, a partida volta para a chave. */
  tournament?: Tournament;
}

/** Nível do CPU quando o modo solo não diz qual. */
const DEFAULT_CPU_LEVEL: CpuLevel = 'medio';
/** Mistura da semente da partida para a do CPU (os dois não sorteiam a mesma sequência). */
const CPU_SEED_SALT = 0x9e3779b9;

/**
 * Fontes de comando de cada time conforme o modo (a partida é a mesma nos três).
 * Solo: o jogador é o time da esquerda no 1º tempo, com os dois conjuntos de teclas; o CPU é o outro.
 */
function createSources(config: MatchConfig, sampler: KeyboardTickSampler, match: Match): [CommandSource, CommandSource] {
  switch (config.mode) {
    case 'local':
      return [new LocalKeyboardSource(sampler, 0), new LocalKeyboardSource(sampler, 1)];
    case 'solo': {
      const seed = (match.world.rng.getState() ^ CPU_SEED_SALT) >>> 0;
      return [new CombinedKeyboardSource(sampler), new CpuSource(match, 1, config.cpuLevel ?? DEFAULT_CPU_LEVEL, seed)];
    }
    case 'online':
      // Montadas em `setupOnline` (o anfitrião usa o comando do visitante que chega pela rede).
      return [IDLE_SOURCE, IDLE_SOURCE];
  }
}

/** Fonte parada. */
const IDLE_SOURCE: CommandSource = { getCommand: () => emptyCommand() };

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

  // --- online ---------------------------------------------------------------
  private session: NetSession | null = null;
  private hostLink: HostLink | null = null;
  private guestLink: GuestLink | null = null;
  /** Visitante: o próprio teclado (os dois conjuntos), mandado pela rede. */
  private localSource: CommandSource = IDLE_SOURCE;
  private onlineHud: OnlineHud | null = null;
  private ticker: BackgroundTicker | null = null;
  private sessionOff: (() => void) | null = null;
  /** Ticks da simulação do anfitrião (só avançam com a partida rodando). */
  private simTick = 0;
  /** Relógio real (ms) do último avanço: o quadro e a batida da aba oculta dividem o mesmo. */
  private lastAdvanceMs = 0;
  private idleSnapshotAt = 0;
  /** Desde quando (s) o outro sumiu (null = conectado). */
  private disconnectedSince: number | null = null;
  private walkover = false;
  /** Online sem conexão aberta: volta para o menu online. */
  private noSession = false;

  constructor() {
    super('MatchScene');
  }

  init(data: Partial<MatchConfig>): void {
    // Sem menus (ou para depurar): ?t1=PAL&t2=COR na URL; com ?cpu=facil|medio|dificil, partida
    // avulsa contra o CPU (modo solo).
    const q = new URLSearchParams(window.location.search);
    const pick = (v: string | null | undefined, fallback: TeamId): TeamId =>
      v && isTeamId(v.toUpperCase()) ? (v.toUpperCase() as TeamId) : fallback;
    const seed = data.seed ?? (Date.now() >>> 0);
    const w = q.get('weather');
    const cpu = q.get('cpu');
    const rng = new Rng(seed ^ 0xbeef);
    this.config = {
      teams: data.teams ?? [pick(q.get('t1'), 'PAL'), pick(q.get('t2'), 'COR')],
      seed,
      weather: data.weather ?? (w && isWeatherId(w) ? w : randomWeather(() => rng.next())),
      kits: data.kits,
      mode: data.mode ?? (isCpuLevel(cpu) ? 'solo' : 'local'),
      cpuLevel: data.cpuLevel ?? (isCpuLevel(cpu) ? cpu : undefined),
      tournament: data.tournament,
    };
  }

  create(): void {
    this.ready = false;
    this.loading = null;
    this.tick = 0;
    this.simTick = 0;
    this.sampler = new KeyboardTickSampler();
    const [t1, t2] = this.config.teams;
    this.kits = this.config.kits ? kitChoiceFor(t1, t2, this.config.kits) : chooseKits(t1, t2);
    // A semente da arte fica fixa (revanche reaproveita as texturas); a da partida varia.
    this.match = createMatch((this.config.seed ^ Date.now()) >>> 0);
    this.sources = createSources(this.config, this.sampler, this.match);
    if (this.config.mode === 'online') this.setupOnline();
    const signature = artSignature(this.config.teams, this.kits, this.config.seed);
    if (matchArtReady(this, signature)) {
      this.buildViews();
    } else {
      const looks = buildLooks(this.config.teams, this.kits, this.config.seed);
      this.loading = generateMatchArt(this, looks, [this.kits.kits[0].shirt, this.kits.kits[1].shirt], signature);
      this.showLoading();
    }
  }

  /**
   * Online: o anfitrião simula (o time 1 vem do comando do visitante pela rede) e manda snapshots;
   * o visitante não simula: manda o próprio comando e desenha o espelho da partida.
   */
  private setupOnline(): void {
    this.hostLink = null;
    this.guestLink = null;
    this.localSource = IDLE_SOURCE;
    this.disconnectedSince = null;
    this.walkover = false;
    this.noSession = false;
    const s = currentSession();
    this.session = s && (s.state === 'connected' || s.state === 'reconnecting') ? s : null;
    if (!this.session) {
      this.noSession = true;
      return;
    }
    if (this.session.role === 'host') {
      this.hostLink = new HostLink(this.session);
      this.sources = [new CombinedKeyboardSource(this.sampler), this.hostLink.remote];
    } else {
      this.guestLink = new GuestLink(this.session);
      this.localSource = new CombinedKeyboardSource(this.sampler);
    }
    // O outro saiu de propósito: vitória por W.O. na hora.
    this.sessionOff = this.session.listen((e) => {
      if (e.kind === 'remote-left' && e.reason !== 'dropped') this.endByWalkover();
    });
    this.ticker = new BackgroundTicker(this.backgroundStep);
    document.addEventListener('visibilitychange', this.onVisibility);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      document.removeEventListener('visibilitychange', this.onVisibility);
      this.ticker?.destroy();
      this.ticker = null;
      this.sessionOff?.();
      this.sessionOff = null;
      this.hostLink?.dispose();
      this.guestLink?.dispose();
      this.hostLink = null;
      this.guestLink = null;
      this.onlineHud?.destroy();
      this.onlineHud = null;
      this.session = null;
    });
  }

  /** Aba oculta: uma batida de 60 Hz num worker mantém a partida andando (o laço do Phaser para). */
  private readonly onVisibility = (): void => {
    if (!this.ticker) return;
    if (document.hidden) this.ticker.start();
    else this.ticker.stop();
  };

  private readonly backgroundStep = (): void => {
    if (!this.ready || !this.session) return;
    this.advanceOnline();
    if (this.hostLink) {
      this.consumeEvents();
      if (this.match.over) this.goToResult();
    } else if (this.guestLink) {
      // Escondido, só avança o espelho (os efeitos dos eventos não precisam aparecer).
      this.guestLink.frame(this.match, 0);
    }
  };

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
    if (this.session) {
      this.onlineHud = new OnlineHud(this);
      this.lastAdvanceMs = performance.now();
      this.idleSnapshotAt = 0;
    }

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
    if (this.noSession) {
      this.noSession = false;
      this.scene.start('OnlineMenuScene');
      return;
    }
    if (this.loading) {
      const step = advanceArt(this.loading, artBudgetMs(this.game.loop.rawDelta));
      if (step === null) this.finishLoading();
      else this.drawLoading(step.progress);
      return;
    }
    if (!this.ready) return;
    if (this.session) {
      this.updateOnline();
      return;
    }
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
    this.render(this.accumulator / SIM_DT, frameDt);
  }

  /** Espelha a partida (a simulada ou, no visitante online, o espelho) na tela. */
  private render(alpha: number, renderDt: number): void {
    const world = this.match.world;
    const now = this.time.now / 1000;
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

  // -------------------------------------------------------------------------
  // Online
  // -------------------------------------------------------------------------

  private updateOnline(): void {
    const t = this.time.now / 1000;
    const frameDt = this.ticker?.active ? 0 : this.advanceOnline();
    const hud = this.onlineHud;
    if (hud?.menuOpen && !this.walkover) {
      const answer = hud.handleMenu(readMenuInput());
      if (answer === 'close') {
        hud.closeMenu();
        // As teclas do menu não valem na partida.
        keyboard.snapshot();
        this.sampler.reset();
      } else if (answer === 'quit') {
        this.leaveOnline();
        return;
      }
    }
    let alpha = this.accumulator / SIM_DT;
    if (this.hostLink) {
      this.consumeEvents();
      if (this.match.over) this.goToResult();
    } else if (this.guestLink) {
      const f = this.guestLink.frame(this.match, this.accumulator / SIM_DT);
      if (f) {
        alpha = f.alpha;
        for (const e of f.events) this.fireNetEvent(e);
        if (this.match.over && this.guestLink.started) this.goToResult();
      }
    }
    hud?.setBanner(this.onlineBanner());
    this.scoreboard.setPing(this.session?.pingMs ?? null);
    this.render(alpha, frameDt);
    hud?.update(t);
  }

  /** Aviso no meio da tela: esperando o outro ou desconectado (com a contagem). */
  private onlineBanner(): string | null {
    if (this.walkover || this.finished) return null;
    if (this.disconnectedSince !== null) {
      const left = Math.max(0, Math.ceil(NET_WO_TIMEOUT - (performance.now() / 1000 - this.disconnectedSince)));
      return `ADVERSÁRIO DESCONECTADO — AGUARDANDO (${left})`;
    }
    if (this.hostLink && !this.hostLink.guestReady) return 'AGUARDANDO O ADVERSÁRIO…';
    if (this.guestLink && !this.guestLink.started) return 'AGUARDANDO O ANFITRIÃO…';
    return null;
  }

  /**
   * Avança o online pelo relógio real (o quadro ou a batida da aba oculta): lê o teclado, o
   * anfitrião simula e manda snapshots, o visitante manda o comando. Sem notícias do outro, congela
   * e conta até o W.O. Devolve o tempo do quadro (s).
   */
  private advanceOnline(): number {
    const nowMs = performance.now();
    const dt = Math.min(Math.max(0, (nowMs - this.lastAdvanceMs) / 1000), MAX_FRAME_DT);
    this.lastAdvanceMs = nowMs;
    const s = this.session;
    if (!s || this.walkover || this.finished) return dt;
    const silent = s.state === 'connected' && Date.now() - s.lastReceivedAt > NET_STALL_TIME * 1000;
    if (s.state !== 'connected' || silent) {
      this.disconnectedSince ??= nowMs / 1000;
      this.accumulator = 0;
      if (nowMs / 1000 - this.disconnectedSince >= NET_WO_TIMEOUT) this.endByWalkover();
      return dt;
    }
    this.disconnectedSince = null;
    const host = this.hostLink;
    const guest = this.guestLink;
    const running = host ? host.guestReady : true;
    this.accumulator += dt;
    while (this.accumulator >= SIM_DT) {
      let local: TeamCommand = emptyCommand();
      if (!this.onlineHud?.menuOpen) {
        const frame = this.sampler.frame(this.tick);
        if (frame.debug.pressed) this.debug.toggle();
        // Sem pausa no online: Esc/P abre o menu e o jogo continua (e perder o foco não para nada).
        if (frame.pause.pressed) this.onlineHud?.openMenu();
        else local = (host ? this.sources[0] : this.localSource).getCommand(this.tick);
      }
      if (host && running) {
        stepMatch(this.match, [local, host.remote.getCommand(this.simTick)], SIM_DT);
        this.simTick++;
      } else if (guest) {
        guest.sendInput(this.tick, local, guest.carrying());
      }
      this.tick++;
      this.accumulator -= SIM_DT;
    }
    if (host) {
      if (running) {
        host.maybeSend(this.match, this.simTick);
      } else if (nowMs / 1000 >= this.idleSnapshotAt) {
        // Antes de começar: de vez em quando, para o visitante já ver o campo.
        host.maybeSend(this.match, this.simTick, true);
        this.idleSnapshotAt = nowMs / 1000 + NET_IDLE_SNAPSHOT_TIME;
      }
    } else if (guest) {
      guest.announceReady();
    }
    return dt;
  }

  /** Visitante: um evento do anfitrião chegou na vez dele (efeitos, animações e som). */
  private fireNetEvent(e: NetEvent): void {
    if (e.k === 's') {
      if (!document.hidden) audio.playSound(e.e);
    } else if (e.k === 'w') {
      this.handleWorldEvent(e.e);
    } else {
      this.handleMatchEvent(e.e);
    }
  }

  /** O outro saiu ou não voltou a tempo: vitória por W.O. (ou, sem internet aqui, conexão perdida). */
  private endByWalkover(): void {
    if (this.walkover || this.finished) return;
    this.walkover = true;
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    this.onlineHud?.showCard(offline ? 'CONEXÃO PERDIDA' : 'VITÓRIA POR W.O.');
    setCurrentSession(null);
    this.time.delayedCall(3200, () => this.scene.start('OnlineMenuScene'));
  }

  /** Sair da partida pelo menu: avisa o outro (que ganha por W.O.) e volta ao menu online. */
  private leaveOnline(): void {
    this.finished = true;
    setCurrentSession(null);
    this.cameras.main.fadeOut(220, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('OnlineMenuScene'));
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
    // Online: o anfitrião manda a última foto (com o fim) antes de sair.
    this.hostLink?.maybeSend(m, this.simTick, true);
    this.cameras.main.fadeOut(300, 20, 12, 8);
    const t = this.config.tournament;
    if (t) {
      // Campeonato: o resultado entra na chave (o jogador é sempre o J1); campeão vai para a festa.
      const next = recordPlayerMatch(t, { score: [m.score[0], m.score[1]], penalties: pens, winner });
      this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => {
        if (next.status === 'champion') this.scene.start('ChampionScene', { tournament: next });
        else this.scene.start('BracketScene', { tournament: next, stage: next.status === 'eliminated' ? 'eliminated' : 'advance' });
      });
      return;
    }
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () =>
      this.scene.start('ResultScene', {
        teams: this.config.teams,
        seed: this.config.seed,
        score: [m.score[0], m.score[1]],
        penalties: pens,
        winner,
        colors: [this.kits.kits[0].shirt, this.kits.kits[1].shirt],
        kits: this.kits.variants,
        mode: this.config.mode,
        cpuLevel: this.config.cpuLevel,
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

  /**
   * Eventos da simulação -> sons (os que a simulação emitiu) e efeitos. No online, o anfitrião
   * também os põe na caixa de saída do próximo snapshot.
   */
  private consumeEvents(): void {
    const sounds = drainSounds(this.match);
    const world = drainEvents(this.match.world);
    const matchEvents = drainMatchEvents(this.match);
    // Aba oculta (online): sem som.
    if (!document.hidden) for (const s of sounds) audio.playSound(s);
    for (const e of world) this.handleWorldEvent(e);
    for (const e of matchEvents) this.handleMatchEvent(e);
    this.hostLink?.push(this.simTick, world, matchEvents, sounds);
  }

  private handleWorldEvent(e: SimEvent): void {
    this.effects.onEvent(e, this.match);
    if (e.type === 'goal') this.fieldView.goalScored(e.side, this.time.now / 1000);
    this.playersView.onEvent(e, this.match);
  }

  private handleMatchEvent(e: MatchEvent): void {
    if (e.type === 'goal') {
      // Comemoração: "GOOOL!" elástico, tremor e flash (a torcida e o autor já reagem); o som
      // do gol sai no mesmo passo, junto com a entrada do texto.
      this.goalText.show(e.goal.team, this.time.now / 1000);
      this.cameras.main.shake(GOAL_SHAKE_MS, GOAL_SHAKE_INTENSITY);
      this.cameras.main.flash(GOAL_FLASH_MS, 255, 250, 235);
    } else if (e.type === 'penaltyKick') {
      if (this.match.attempt) this.playersView.onPenaltyKick(this.match.attempt.kicker);
    } else if (e.type === 'penaltyResult' && e.result === 'goal') {
      this.fieldView.goalScored(PENALTY_GOAL, this.time.now / 1000);
      this.cameras.main.shake(GOAL_SHAKE_MS * 0.6, GOAL_SHAKE_INTENSITY * 0.6);
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
      const cpu = this.sources[1] instanceof CpuSource ? ` · CPU ${this.sources[1].level}: ${this.sources[1].intentKind}` : '';
      this.debug.setInfo(
        `DEBUG · ${this.match.phase} · t=${world.time.toFixed(1)}s · J1 defende ${world.defends[0] === 0 ? 'esq' : 'dir'}${cpu}`,
      );
    }
    this.debug.endFrame();
  }
}
