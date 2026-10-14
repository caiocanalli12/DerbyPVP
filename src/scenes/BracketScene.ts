import Phaser from 'phaser';
import {
  BRACKET_DRAW_SPIN,
  BRACKET_DRAW_SPIN_RATE,
  BRACKET_DRAW_STEP,
  BRACKET_REVEAL_DELAY,
  BRACKET_REVEAL_STEP,
  ELIMINATED_CARD_MIN,
  ELIMINATED_CARD_TIME,
  GAME_WIDTH,
} from '../config/constants';
import { audio } from '../audio/AudioManager';
import { getTeam } from '../data/teams';
import type { TeamId } from '../data/teams';
import { CREAM_CSS, FONT_TEXT, INK_CSS } from '../art/style';
import { BracketView } from '../render/BracketView';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
import { IntertitleView } from '../render/IntertitleView';
import { addSunburst, addTitle, ButtonList, ConfirmDialog, readMenuInput } from '../render/menu';
import type { MenuInput } from '../render/menu';
import { CPU_LEVEL_IDS } from '../sim/cpu';
import type { CpuLevel } from '../sim/cpu';
import {
  championOf,
  formatResult,
  matchesInRound,
  nextOpponent,
  opponentLevel,
  ROUND_COUNT,
  ROUND_NAMES,
  visibleState,
} from '../sim/tournament';
import type { BracketState, Tournament } from '../sim/tournament';
import type { VersusData } from './VersusScene';

/**
 * Como a chave aparece: logo depois do sorteio, depois de uma vitória (os outros jogos da fase
 * aparecem um a um) ou depois da derrota (cartão "ELIMINADO" e a chave final).
 */
export type BracketStage = 'draw' | 'advance' | 'eliminated';

export interface BracketData {
  tournament: Tournament;
  stage: BracketStage;
}

/** Nome de cada nível e quantas estrelas ele acende. */
export const LEVEL_LABEL: Readonly<Record<CpuLevel, string>> = { facil: 'FÁCIL', medio: 'MÉDIO', dificil: 'DIFÍCIL' };
export function levelStars(level: CpuLevel): number {
  return CPU_LEVEL_IDS.indexOf(level) + 1;
}

const DIFFICULTY_LABEL: Readonly<Record<Tournament['difficulty'], string>> = { facil: 'FÁCIL', dificil: 'DIFÍCIL' };
/** Botões embaixo do cartaz (px). */
const BUTTONS_Y = 612;
const BUTTONS_GAP = 56;

type Phase = 'drawing' | 'revealing' | 'card' | 'ready' | 'over';

/**
 * Chave do campeonato num cartaz estilo 1930. Antes de cada jogo mostra o próximo adversário com o
 * nível dele (estrelas) e as opções JOGAR e ABANDONAR CAMPEONATO (com confirmação).
 */
export class BracketScene extends Phaser.Scene {
  private t!: Tournament;
  private stage!: BracketStage;
  private phase: Phase = 'ready';
  private view!: BracketView;
  private film!: FilmView;
  private rays!: Phaser.GameObjects.Image;
  private card: IntertitleView | null = null;
  private list: ButtonList | null = null;
  private confirm: ConfirmDialog | null = null;
  /** Relógio real (s) em que a fase atual começou. */
  private phaseAt = 0;
  private revealed = 0;
  private leaving = false;

  constructor() {
    super('BracketScene');
  }

  init(data: BracketData): void {
    this.t = data.tournament;
    this.stage = data.stage;
  }

  create(): void {
    this.leaving = false;
    this.list = null;
    this.confirm = null;
    this.card = null;
    this.revealed = 0;
    this.cameras.main.setBackgroundColor('#2a1a10');
    this.cameras.main.fadeIn(220, 20, 12, 8);
    this.rays = addSunburst(this, 0x2f5d8a, 0x264c72);
    addTitle(this, GAME_WIDTH / 2, 50, 'CAMPEONATO', 56).setDepth(5);
    this.add
      .text(GAME_WIDTH / 2, 100, `DIFICULDADE ${DIFFICULTY_LABEL[this.t.difficulty]} · VOCÊ JOGA COM O ${getTeam(this.t.player).name.toUpperCase()}`, {
        fontFamily: FONT_TEXT,
        fontSize: '19px',
        fontStyle: '700',
        color: CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(5);
    this.view = new BracketView(this);
    this.film = new FilmView(this, filmEffectsEnabled(this));
    readMenuInput();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.film.destroy();
      this.card?.destroy();
    });
    const now = this.now();
    if (this.stage === 'draw') this.enter('drawing', now);
    else if (this.stage === 'advance') this.enter('revealing', now);
    else this.enter('card', now);
  }

  /** Relógio real (s): o delta do Phaser é suavizado e atrasa em quadros longos. */
  private now(): number {
    return performance.now() / 1000;
  }

  private enter(phase: Phase, now: number): void {
    this.phase = phase;
    this.phaseAt = now;
    this.list?.destroy();
    this.list = null;
    switch (phase) {
      case 'drawing':
        this.view.setInfo('SORTEIO DA CHAVE', '');
        break;
      case 'revealing': {
        const r = this.t.round - 1;
        const mine = this.t.results[r]![0]!;
        this.view.setInfo(`${ROUND_NAMES[r]}: ${formatResult(mine, short)}`, 'VITÓRIA! OS OUTROS JOGOS DA FASE…');
        this.view.setState(this.revealState());
        break;
      }
      case 'card':
        this.view.setVisible(false);
        this.card = new IntertitleView(this, 30);
        break;
      case 'ready':
        this.view.setState(visibleState(this.t, () => true));
        this.showNextMatch();
        this.list = new ButtonList(this, GAME_WIDTH / 2, BUTTONS_Y, ['JOGAR', 'ABANDONAR CAMPEONATO'], BUTTONS_GAP, 10);
        break;
      case 'over':
        this.card?.destroy();
        this.card = null;
        this.view.setVisible(true);
        this.view.setState(visibleState(this.t, () => true));
        this.showFinalInfo();
        this.list = new ButtonList(this, GAME_WIDTH / 2, BUTTONS_Y, ['NOVO CAMPEONATO', 'MENU PRINCIPAL'], BUTTONS_GAP, 10);
        break;
    }
  }

  /** Depois de uma vitória: os jogos já mostrados da fase que acabou de ser jogada. */
  private revealState(): BracketState {
    const just = this.t.round - 1;
    return visibleState(this.t, (r, k) => r < just || (r === just && (k === 0 || k <= this.revealed)));
  }

  /** Durante o sorteio: as vagas que já pararam mostram o time; as que estão rodando, um time qualquer. */
  private drawState(now: number): BracketState {
    const elapsed = now - this.phaseAt;
    const pool = this.t.bracket.slice(1);
    const slotTeam = (slot: number): TeamId | null => {
      const land = 0.15 + slot * BRACKET_DRAW_STEP + (slot > 0 ? BRACKET_DRAW_SPIN : 0);
      if (elapsed >= land) return this.t.bracket[slot]!;
      if (slot === 0 || elapsed < land - BRACKET_DRAW_SPIN) return null;
      return pool[(Math.floor(elapsed * BRACKET_DRAW_SPIN_RATE) + slot * 3) % pool.length]!;
    };
    const s = visibleState(this.t, () => false);
    s.teams[0] = Array.from({ length: matchesInRound(0) }, (_, k) => [slotTeam(2 * k), slotTeam(2 * k + 1)] as const);
    return s;
  }

  /** Quando termina o sorteio (s desde o começo). */
  private drawDuration(): number {
    return 0.15 + 7 * BRACKET_DRAW_STEP + BRACKET_DRAW_SPIN + 0.35;
  }

  private showNextMatch(): void {
    const opp = nextOpponent(this.t);
    if (!opp) return;
    const level = opponentLevel(this.t);
    const r = this.t.round;
    let line1: string;
    if (r === 0) {
      line1 = `SORTEIO FEITO! ESTREIA NAS ${ROUND_NAMES[0]}`;
    } else {
      const others = this.t.results[r - 1]!.slice(1).map((x) => (x ? formatResult(x, short) : ''));
      line1 = `${ROUND_NAMES[r - 1]}: ${others.join('  ·  ')}`;
    }
    this.view.setInfo(line1, `${ROUND_NAMES[r]}: ${getTeam(this.t.player).short} × ${getTeam(opp).short} — ADVERSÁRIO`, {
      filled: levelStars(level),
      label: LEVEL_LABEL[level],
    });
  }

  private showFinalInfo(): void {
    const lostAt = this.t.results.findIndex((round) => {
      const mine = round[0];
      return mine !== null && mine !== undefined && !mine.simulated && mine.winner !== 0;
    });
    const champ = championOf(this.t);
    const line1 = lostAt === ROUND_COUNT - 1 ? 'VICE-CAMPEÃO: PERDEU A FINAL' : `ELIMINADO NA${lostAt === 0 ? 'S' : ''} ${ROUND_NAMES[Math.max(0, lostAt)]}`;
    this.view.setInfo(line1, champ ? `CAMPEÃO: ${getTeam(champ).name.toUpperCase()}` : '');
  }

  override update(time: number): void {
    const t = time / 1000;
    const now = this.now();
    this.rays.setRotation(t * 0.05);
    this.film.update(t, Math.min(0.25, this.game.loop.rawDelta / 1000));
    this.view.update(t);
    this.list?.update(t);
    this.confirm?.update(t);
    if (this.leaving) return;
    const input = readMenuInput();
    const any = input.enter || input.players.some((p) => p.confirm || p.back);

    switch (this.phase) {
      case 'drawing':
        if (any || now - this.phaseAt >= this.drawDuration()) this.enter('ready', now);
        else this.view.setState(this.drawState(now));
        return;
      case 'revealing': {
        const others = matchesInRound(this.t.round - 1) - 1;
        const want = Math.min(others, Math.floor((now - this.phaseAt - BRACKET_REVEAL_DELAY) / BRACKET_REVEAL_STEP) + 1);
        if (any || this.revealed >= others) {
          if (any || now - this.phaseAt >= BRACKET_REVEAL_DELAY + others * BRACKET_REVEAL_STEP + 0.4) this.enter('ready', now);
          return;
        }
        if (want > this.revealed) {
          this.revealed = want;
          this.view.setState(this.revealState());
        }
        return;
      }
      case 'card': {
        const shown = now - this.phaseAt;
        this.card?.update('ELIMINADO', t);
        if (shown >= ELIMINATED_CARD_TIME || (any && shown >= ELIMINATED_CARD_MIN)) this.enter('over', now);
        return;
      }
      case 'ready':
        this.handleReady(input);
        return;
      case 'over':
        this.handleOver(input);
        return;
    }
  }

  private handleReady(input: MenuInput): void {
    if (this.confirm) {
      const answer = this.confirm.handle(input);
      if (answer === null) return;
      this.confirm.destroy();
      this.confirm = null;
      if (answer === 'ok') this.leave('MainMenuScene', {});
      return;
    }
    if (input.players.some((p) => p.back)) {
      this.askAbandon();
      return;
    }
    const chosen = this.list?.handle(input, () => audio.play('menu-mover')) ?? null;
    if (chosen === null) return;
    audio.play('menu-confirmar');
    if (chosen === 1) {
      this.askAbandon();
      return;
    }
    const opp = nextOpponent(this.t);
    if (!opp) return;
    const data: VersusData = { teams: [this.t.player, opp], mode: 'solo', cpuLevel: opponentLevel(this.t), tournament: this.t };
    this.leave('VersusScene', data);
  }

  private askAbandon(): void {
    this.confirm = new ConfirmDialog(this, 'ABANDONAR?', 'O campeonato será perdido.', ['CONTINUAR NO CAMPEONATO', 'ABANDONAR']);
  }

  private handleOver(input: MenuInput): void {
    const chosen = this.list?.handle(input, () => audio.play('menu-mover')) ?? null;
    if (chosen === null) return;
    audio.play('menu-confirmar');
    if (chosen === 0) this.leave('SoloSetupScene', { team: this.t.player });
    else this.leave('MainMenuScene', {});
  }

  private leave(scene: string, data: object): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(220, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}

function short(id: TeamId): string {
  return getTeam(id).short;
}
