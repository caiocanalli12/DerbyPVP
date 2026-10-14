import Phaser from 'phaser';
import { GAME_WIDTH } from '../config/constants';
import { audio } from '../audio/AudioManager';
import { CREAM, CREAM_CSS, FONT_TEXT, FONT_TITLE, INK, INK_CSS } from '../art/style';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
import { addSunburst, addTitle, ButtonList, drawRadioWaves, readMenuInput } from '../render/menu';
import { currentSession, NET_ERROR_TEXT, NetSession, setCurrentSession } from '../net/peer';
import type { SessionEvent } from '../net/peer';
import { isRoomCodeChar, normalizeRoomCode, ROOM_CODE_LENGTH, roomCodeFromSearch, roomLink } from '../net/roomCode';

/** Criar uma sala, ou entrar numa (com o código já conhecido, do link, ou para digitar). */
export type OnlineLobbyData = { mode: 'host' } | { mode: 'join'; code?: string; badLink?: boolean };

type Phase = 'opening' | 'waiting' | 'entry' | 'connecting' | 'connected' | 'failed';

/** Ladrilhos do código (px). */
const TILE_W = 92;
const TILE_H = 112;
const TILE_GAP = 18;
/** Depois de conectar, espera (s) antes de ir para a escolha dos times. */
const CONNECTED_PAUSE = 0.9;
/** Aviso "LINK COPIADO!" (s). */
const COPIED_TIME = 2.2;

/**
 * Sala online. Anfitrião: o código bem grande, COPIAR LINK e "aguardando adversário" (com a antena
 * transmitindo). Visitante: o campo do código (aceita minúsculas e colar o link) e "conectando".
 * Conectou: segue para a escolha dos times. Não deu: o motivo e TENTAR DE NOVO / VOLTAR.
 */
export class OnlineLobbyScene extends Phaser.Scene {
  private data_!: OnlineLobbyData;
  private phase: Phase = 'entry';
  private session: NetSession | null = null;
  private off: (() => void) | null = null;
  private rays!: Phaser.GameObjects.Image;
  private film!: FilmView;
  private subtitle!: Phaser.GameObjects.Text;
  private tilesGfx!: Phaser.GameObjects.Graphics;
  private tileTexts: Phaser.GameObjects.Text[] = [];
  private info!: Phaser.GameObjects.Text;
  private status!: Phaser.GameObjects.Text;
  private errorText!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private radio!: Phaser.GameObjects.Graphics;
  private list: ButtonList | null = null;
  private typed = '';
  private phaseAt = 0;
  private copiedUntil = 0;
  private leaving = false;

  constructor() {
    super('OnlineLobbyScene');
  }

  init(data: OnlineLobbyData): void {
    this.data_ = data;
  }

  create(): void {
    this.leaving = false;
    this.list = null;
    this.tileTexts = [];
    this.typed = '';
    this.copiedUntil = 0;
    this.cameras.main.setBackgroundColor('#2a1a10');
    this.cameras.main.fadeIn(200, 20, 12, 8);
    this.rays = addSunburst(this, 0x6a3d8f, 0x58307a);
    addTitle(this, GAME_WIDTH / 2, 60, 'ONLINE', 64).setDepth(5);
    this.subtitle = addTitle(this, GAME_WIDTH / 2, 132, '', 30).setDepth(5);
    const g = this.add.graphics().setDepth(1);
    g.fillStyle(INK, 0.78);
    g.fillRoundedRect(100, 170, GAME_WIDTH - 200, 420, 18);
    g.lineStyle(4, CREAM, 1);
    g.strokeRoundedRect(110, 180, GAME_WIDTH - 220, 400, 12);
    g.lineStyle(1.5, CREAM, 1);
    g.strokeRoundedRect(120, 190, GAME_WIDTH - 240, 380, 8);
    this.tilesGfx = this.add.graphics().setDepth(5);
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      this.tileTexts.push(
        this.add
          .text(this.tileX(i), 280, '', { fontFamily: FONT_TITLE, fontSize: '76px', color: INK_CSS })
          .setOrigin(0.5)
          .setDepth(6),
      );
    }
    const text = (y: number, size: number, color = CREAM_CSS): Phaser.GameObjects.Text =>
      this.add
        .text(GAME_WIDTH / 2, y, '', {
          fontFamily: FONT_TEXT,
          fontSize: `${size}px`,
          fontStyle: '700',
          color,
          stroke: INK_CSS,
          strokeThickness: 4,
          align: 'center',
          wordWrap: { width: GAME_WIDTH - 300 },
        })
        .setOrigin(0.5)
        .setDepth(6);
    this.info = text(372, 20);
    this.status = text(532, 28);
    this.errorText = text(420, 22, '#ff9a86');
    this.hint = text(440, 20);
    this.radio = this.add.graphics().setDepth(5);
    this.film = new FilmView(this, filmEffectsEnabled(this));

    window.addEventListener('keydown', this.onKey);
    window.addEventListener('paste', this.onPaste);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.onKey);
      window.removeEventListener('paste', this.onPaste);
      audio.hotkeyEnabled = true;
      this.off?.();
      this.off = null;
      this.film.destroy();
    });
    readMenuInput();

    const d = this.data_;
    if (d.mode === 'host') this.startHost();
    else if (d.code) this.startJoin(d.code);
    else {
      this.enter('entry');
      if (d.badLink) this.errorText.setText('O código do link não é válido. Digite o código da sala.');
    }
  }

  private now(): number {
    return performance.now() / 1000;
  }

  private tileX(i: number): number {
    const total = ROOM_CODE_LENGTH * TILE_W + (ROOM_CODE_LENGTH - 1) * TILE_GAP;
    return GAME_WIDTH / 2 - total / 2 + TILE_W / 2 + i * (TILE_W + TILE_GAP);
  }

  // -------------------------------------------------------------------------
  // Sessão
  // -------------------------------------------------------------------------

  private startHost(): void {
    this.attach(NetSession.host());
    this.enter('opening');
  }

  private startJoin(code: string): void {
    this.typed = code;
    this.attach(NetSession.join(code));
    this.enter('connecting');
  }

  private attach(s: NetSession): void {
    this.off?.();
    setCurrentSession(s);
    this.session = s;
    this.off = s.listen((e) => this.onSession(e));
  }

  private onSession(e: SessionEvent): void {
    if (e.kind !== 'state' || this.leaving) return;
    switch (e.state) {
      case 'waiting':
        this.enter('waiting');
        break;
      case 'connecting':
        // Anfitrião: alguém chegando (o visitante já estava "conectando").
        if (this.phase === 'waiting') this.status.setText('ADVERSÁRIO CHEGANDO…');
        break;
      case 'connected':
        this.enter('connected');
        break;
      case 'failed':
        this.enter('failed');
        break;
      default:
        break;
    }
  }

  // -------------------------------------------------------------------------
  // Fases (o que aparece na tela)
  // -------------------------------------------------------------------------

  private enter(phase: Phase): void {
    this.phase = phase;
    this.phaseAt = this.now();
    this.list?.destroy();
    this.list = null;
    this.info.setText('');
    this.status.setText('');
    this.errorText.setText('');
    this.hint.setText('');
    this.radio.clear();
    audio.hotkeyEnabled = phase !== 'entry';
    // Teclas apertadas na fase anterior não valem na nova.
    readMenuInput();
    const s = this.session;
    switch (phase) {
      case 'opening':
        this.subtitle.setText('CRIAR SALA');
        this.status.setText('ABRINDO A SALA…');
        break;
      case 'waiting':
        this.subtitle.setText('CÓDIGO DA SALA');
        this.info.setText(s ? roomLink(s.code, window.location) : '');
        this.status.setText('AGUARDANDO ADVERSÁRIO');
        this.hint.setText('Mande o código ou o link para o seu adversário: ele abre o link ou entra em ONLINE → ENTRAR COM CÓDIGO.');
        this.list = new ButtonList(this, GAME_WIDTH / 2, 626, ['COPIAR LINK', 'VOLTAR'], 58, 10);
        break;
      case 'entry':
        this.subtitle.setText('ENTRAR COM CÓDIGO');
        this.info.setText('Letras e números (sem 0, O, 1, I e L) · Enter entra · Backspace apaga · Esc volta · Ctrl+V cola o código ou o link');
        break;
      case 'connecting':
        this.subtitle.setText(this.data_.mode === 'host' ? 'CRIAR SALA' : 'ENTRAR COM CÓDIGO');
        this.status.setText(`CONECTANDO À SALA ${this.typed}…`);
        break;
      case 'connected':
        this.status.setText('CONECTADO! PREPARANDO A ESCOLHA DOS TIMES…');
        audio.play('menu-confirmar');
        break;
      case 'failed':
        this.subtitle.setText('NÃO DEU CERTO');
        this.errorText.setText(s?.error ? NET_ERROR_TEXT[s.error] : NET_ERROR_TEXT.unreachable);
        this.list = new ButtonList(this, GAME_WIDTH / 2, 626, ['TENTAR DE NOVO', 'VOLTAR'], 58, 10);
        break;
    }
    this.drawTiles();
  }

  /** Ladrilhos do código: o da sala (anfitrião), o digitado (visitante) ou nenhum. */
  private drawTiles(now = this.now()): void {
    const g = this.tilesGfx;
    g.clear();
    const s = this.session;
    const showCode = this.phase === 'waiting' && s ? s.code : this.phase === 'entry' || this.phase === 'connecting' ? this.typed : '';
    const visible = this.phase === 'waiting' || this.phase === 'entry' || this.phase === 'connecting';
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
      const t = this.tileTexts[i]!;
      t.setVisible(visible).setText(showCode[i] ?? '');
      if (!visible) continue;
      const x = this.tileX(i) - TILE_W / 2;
      const y = 280 - TILE_H / 2;
      const cursor = this.phase === 'entry' && i === this.typed.length && Math.floor(now * 2.5) % 2 === 0;
      g.fillStyle(0x1a1410, 1);
      g.fillRoundedRect(x - 4, y - 4, TILE_W + 8, TILE_H + 8, 12);
      g.fillStyle(cursor ? 0xffd24a : CREAM, 1);
      g.fillRoundedRect(x, y, TILE_W, TILE_H, 9);
      g.lineStyle(1.5, INK, 1);
      g.strokeRoundedRect(x + 6, y + 6, TILE_W - 12, TILE_H - 12, 6);
    }
  }

  // -------------------------------------------------------------------------
  // Digitação do código
  // -------------------------------------------------------------------------

  private readonly onKey = (e: KeyboardEvent): void => {
    if (this.phase !== 'entry' || this.leaving) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === 'Backspace') {
      e.preventDefault();
      this.typed = this.typed.slice(0, -1);
      this.errorText.setText('');
    } else if (e.key === 'Enter') {
      this.submit();
      return;
    } else if (e.key === 'Escape') {
      this.leave('OnlineMenuScene', {});
      return;
    } else if (e.key.length === 1 && isRoomCodeChar(e.key)) {
      if (this.typed.length < ROOM_CODE_LENGTH) this.typed += e.key.toUpperCase();
      this.errorText.setText('');
    } else if (e.key.length === 1 && /[0oO1iIlL]/.test(e.key)) {
      this.errorText.setText('Os códigos não usam 0, O, 1, I nem L.');
    }
    this.drawTiles();
  };

  private readonly onPaste = (e: ClipboardEvent): void => {
    if (this.phase !== 'entry' || this.leaving) return;
    const text = e.clipboardData?.getData('text') ?? '';
    const q = text.indexOf('?');
    const code = (q >= 0 ? roomCodeFromSearch(text.slice(q)) : null) ?? normalizeRoomCode(text);
    if (code) {
      this.typed = code;
      this.errorText.setText('');
    } else {
      this.errorText.setText('O que foi colado não é um código de sala.');
    }
    this.drawTiles();
  };

  private submit(): void {
    const code = normalizeRoomCode(this.typed);
    if (!code) {
      this.errorText.setText(`O código tem ${ROOM_CODE_LENGTH} letras ou números.`);
      return;
    }
    audio.play('menu-confirmar');
    this.startJoin(code);
  }

  // -------------------------------------------------------------------------

  override update(time: number): void {
    const t = time / 1000;
    const now = this.now();
    this.rays.setRotation(t * 0.06);
    this.film.update(t, Math.min(0.25, this.game.loop.rawDelta / 1000));
    this.list?.update(t);
    if (this.phase === 'entry') this.drawTiles(now);
    if (this.phase === 'waiting' || this.phase === 'opening' || this.phase === 'connecting') {
      this.radio.clear();
      // Abrindo: no meio; com o código na tela, do lado esquerdo.
      if (this.phase === 'opening') drawRadioWaves(this.radio, GAME_WIDTH / 2, 280, t);
      else drawRadioWaves(this.radio, 240, 300, t);
      if (this.phase === 'waiting' && this.status.text.startsWith('AGUARDANDO')) {
        this.status.setText(`AGUARDANDO ADVERSÁRIO${'.'.repeat(1 + (Math.floor(t * 2) % 3))}`);
      }
      if (this.phase === 'waiting' && this.copiedUntil > 0 && now >= this.copiedUntil) {
        this.copiedUntil = 0;
        this.info.setText(this.session ? roomLink(this.session.code, window.location) : '');
      }
    }
    if (this.leaving) return;
    if (this.phase === 'connected') {
      if (now - this.phaseAt >= CONNECTED_PAUSE) this.leave('OnlineSelectScene', {});
      return;
    }
    // Digitando: as letras não navegam nos menus (só se descartam as teclas guardadas).
    const input = readMenuInput();
    if (this.phase === 'entry') return;
    const back = input.players.some((p) => p.back);
    if (this.phase === 'opening' || this.phase === 'connecting') {
      if (back) this.cancel();
      return;
    }
    if (back) {
      this.cancel();
      return;
    }
    const chosen = this.list?.handle(input, () => audio.play('menu-mover')) ?? null;
    if (chosen === null) return;
    audio.play('menu-confirmar');
    if (this.phase === 'waiting') {
      if (chosen === 0) this.copyLink();
      else this.cancel();
    } else if (this.phase === 'failed') {
      if (chosen === 1) {
        this.cancel();
      } else if (this.data_.mode === 'host') {
        this.startHost();
      } else {
        // Visitante: volta para o campo, com o código que já estava.
        setCurrentSession(null);
        this.session = null;
        this.enter('entry');
      }
    }
  }

  private copyLink(): void {
    const s = this.session;
    if (!s) return;
    const link = roomLink(s.code, window.location);
    const done = (ok: boolean): void => {
      this.info.setText(ok ? 'LINK COPIADO! MANDE PARA O SEU ADVERSÁRIO.' : `Copie o link: ${link}`);
      this.copiedUntil = this.now() + (ok ? COPIED_TIME : COPIED_TIME * 3);
    };
    try {
      void navigator.clipboard.writeText(link).then(
        () => done(true),
        () => done(false),
      );
    } catch {
      done(false);
    }
  }

  /** Voltar: fecha a sala (ou a tentativa) e volta ao menu online (do campo, volta ao campo). */
  private cancel(): void {
    audio.play('menu-voltar');
    if (this.data_.mode === 'join' && !this.data_.code && this.phase === 'connecting') {
      setCurrentSession(null);
      this.session = null;
      this.enter('entry');
      return;
    }
    this.leave('OnlineMenuScene', {});
  }

  private leave(scene: string, data: object): void {
    if (this.leaving) return;
    this.leaving = true;
    this.off?.();
    this.off = null;
    if (scene !== 'OnlineSelectScene' && currentSession() === this.session) setCurrentSession(null);
    this.cameras.main.fadeOut(220, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}
