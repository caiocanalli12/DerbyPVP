import Phaser from 'phaser';
import {
  BOIL_FPS,
  GAME_HEIGHT,
  GAME_WIDTH,
  PREVIEW_BREATH_AMOUNT,
  PREVIEW_BREATH_HZ,
  PREVIEW_SWAY_DEG,
  PREVIEW_SWAY_HZ,
} from '../config/constants';
import { audio } from '../audio/AudioManager';
import { Rng } from '../core/rng';
import { TEAMS } from '../data/teams';
import type { TeamId } from '../data/teams';
import { randomWeather } from '../data/weather';
import type { WeatherId } from '../data/weather';
import type { VersusData } from './VersusScene';
import { crestKey, generateCrestTextures } from '../art/crest-art';
import { generateKitPreview, previewKey } from '../art/preview-art';
import { CREAM, CREAM_CSS, FONT_TEXT, FONT_TITLE, INK, INK_CSS } from '../art/style';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
import { addSunburst, addTitle, ConfirmDialog, NoticeDialog, readMenuInput } from '../render/menu';
import { currentSession, setCurrentSession } from '../net/peer';
import type { NetSession, SessionEvent } from '../net/peer';
import { message } from '../net/protocol';
import type { NetMessage } from '../net/protocol';
import { chooseKits } from '../sim/kits';

const COLS = 4;
const PREVIEW_SCALE = 0.86;
/** Depois que os dois confirmam, o anfitrião espera isto (s) antes de começar. */
const BOTH_READY_DELAY = 0.7;
/** Time inicial de cada lado (anfitrião, visitante). */
const INITIAL: readonly [TeamId, TeamId] = ['PAL', 'COR'];

interface SideState {
  index: number;
  confirmed: boolean;
}

interface SideView {
  crest: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  preview: Phaser.GameObjects.Image;
  grid: Phaser.GameObjects.Image[];
  cursor: Phaser.GameObjects.Graphics;
  stamp: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
}

/**
 * Escolha dos times online: cada um escolhe o próprio time na própria tela (um cursor, os dois
 * conjuntos de teclas) e vê a escolha do outro em tempo real. O anfitrião é o J1 (esquerda) e o
 * visitante o J2 (direita); mesmo time pode (o visitante usa o reserva). Uniformes: só a regra
 * automática. Quando os dois confirmam, o anfitrião sorteia o clima e a semente e manda `start`.
 */
export class OnlineSelectScene extends Phaser.Scene {
  private session: NetSession | null = null;
  private off: (() => void) | null = null;
  /** Meu lado: 0 = anfitrião (esquerda), 1 = visitante (direita). */
  private me: 0 | 1 = 0;
  private states: [SideState, SideState] = [
    { index: 0, confirmed: false },
    { index: 1, confirmed: false },
  ];
  private views!: [SideView, SideView];
  private rays!: Phaser.GameObjects.Image;
  private film!: FilmView;
  private confirm: ConfirmDialog | null = null;
  private notice: NoticeDialog | null = null;
  private readySince: number | null = null;
  private started = false;
  private leaving = false;

  constructor() {
    super('OnlineSelectScene');
  }

  create(): void {
    this.leaving = false;
    this.started = false;
    this.readySince = null;
    this.confirm = null;
    this.notice = null;
    const s = currentSession();
    this.session = s && s.state === 'connected' ? s : null;
    this.me = this.session?.role === 'guest' ? 1 : 0;
    this.states = [
      { index: TEAMS.findIndex((t) => t.id === INITIAL[0]), confirmed: false },
      { index: TEAMS.findIndex((t) => t.id === INITIAL[1]), confirmed: false },
    ];
    this.cameras.main.setBackgroundColor('#2a1a10');
    this.cameras.main.fadeIn(200, 20, 12, 8);
    this.rays = addSunburst(this, 0x6a3d8f, 0x58307a);
    generateCrestTextures(this);
    addTitle(this, GAME_WIDTH / 2, 48, 'ESCOLHA SEU TIME', 52).setDepth(5);
    const div = this.add.graphics().setDepth(4);
    div.fillStyle(INK, 1);
    div.fillRect(GAME_WIDTH / 2 - 3, 90, 6, GAME_HEIGHT - 120);
    div.fillStyle(CREAM, 1);
    div.fillRect(GAME_WIDTH / 2 - 1, 90, 2, GAME_HEIGHT - 120);
    this.views = [this.buildSide(0), this.buildSide(1)];
    this.film = new FilmView(this, filmEffectsEnabled(this));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.off?.();
      this.off = null;
      this.film.destroy();
    });
    readMenuInput();
    this.refresh();
    if (!this.session) {
      this.notice = new NoticeDialog(this, 'SEM CONEXÃO', 'A conexão com o adversário não está aberta.', 'VOLTAR');
      return;
    }
    this.off = this.session.listen((e) => this.onSession(e));
    // O outro precisa saber onde está o meu cursor desde o começo.
    this.sendSelect();
  }

  private buildSide(i: 0 | 1): SideView {
    const cx = i === 0 ? GAME_WIDTH / 4 : (GAME_WIDTH * 3) / 4;
    const mine = i === this.me;
    const panel = this.add.graphics().setDepth(1);
    panel.fillStyle(0x1a1410, mine ? 0.62 : 0.45);
    panel.fillRoundedRect(cx - 290, 92, 580, GAME_HEIGHT - 120, 18);
    panel.lineStyle(3, mine ? 0xffd24a : CREAM, 0.9);
    panel.strokeRoundedRect(cx - 282, 100, 564, GAME_HEIGHT - 136, 14);
    this.add
      .text(cx, 128, `JOGADOR ${i + 1} · ${mine ? 'VOCÊ' : 'ADVERSÁRIO'}`, {
        fontFamily: FONT_TITLE,
        fontSize: '30px',
        color: mine ? '#ffd24a' : CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(5);
    this.add
      .text(cx, 160, mine ? 'WASD ou setas · F, ; ou Enter confirma · G ou . desfaz' : i === 0 ? 'Anfitrião da sala' : 'Visitante', {
        fontFamily: FONT_TEXT,
        fontSize: '18px',
        color: CREAM_CSS,
      })
      .setOrigin(0.5)
      .setDepth(5);
    const crest = this.add.image(cx - 120, 270, crestKey('PAL')).setScale(1.05).setDepth(5);
    const name = this.add
      .text(cx - 120, 368, '', { fontFamily: FONT_TITLE, fontSize: '30px', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 6 })
      .setOrigin(0.5)
      .setDepth(5);
    this.add.ellipse(cx + 130, 404, 110, 22, 0x1a1410, 0.4).setDepth(4);
    const preview = this.add.image(cx + 130, 410, crestKey('PAL')).setOrigin(0.5, 1).setScale(PREVIEW_SCALE).setDepth(5);
    const grid: Phaser.GameObjects.Image[] = [];
    TEAMS.forEach((t, k) => {
      grid.push(this.add.image(cx - 195 + (k % COLS) * 130, 480 + Math.floor(k / COLS) * 100, crestKey(t.id)).setScale(0.6).setDepth(5));
    });
    const cursor = this.add.graphics().setDepth(6);
    const stamp = this.add
      .text(cx + 130, 300, 'PRONTO!', { fontFamily: FONT_TITLE, fontSize: '54px', color: '#c8102e', stroke: '#fff3d6', strokeThickness: 8 })
      .setOrigin(0.5)
      .setAngle(-14)
      .setDepth(8)
      .setVisible(false);
    const status = this.add
      .text(cx, GAME_HEIGHT - 52, '', { fontFamily: FONT_TEXT, fontSize: '20px', fontStyle: '700', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(5);
    return { crest, name, preview, grid, cursor, stamp, status };
  }

  private teamOf(i: 0 | 1): TeamId {
    return TEAMS[this.states[i].index]!.id;
  }

  /** Escudo, nome, prévia (com o uniforme da regra automática) e situação de cada lado. */
  private refresh(): void {
    const kits = chooseKits(this.teamOf(0), this.teamOf(1));
    ([0, 1] as const).forEach((i) => {
      const v = this.views[i];
      const st = this.states[i];
      const team = TEAMS[st.index]!;
      const kitId = `${team.id}-${kits.variants[i]}`;
      generateKitPreview(this, kitId, kits.kits[i], 9);
      v.preview.setTexture(previewKey(kitId));
      v.crest.setTexture(crestKey(team.id));
      v.name.setText(team.name.toUpperCase());
      v.stamp.setVisible(st.confirmed);
      const mine = i === this.me;
      v.status.setText(
        mine
          ? st.confirmed
            ? this.states[1 - i]!.confirmed
              ? 'OS DOIS PRONTOS!'
              : 'ESPERANDO O ADVERSÁRIO CONFIRMAR…'
            : 'F, ; ou Enter para confirmar'
          : st.confirmed
            ? 'CONFIRMOU'
            : 'ESCOLHENDO…',
      );
    });
  }

  private sendSelect(): void {
    const st = this.states[this.me];
    this.session?.send(message({ type: 'select', team: this.teamOf(this.me), confirmed: st.confirmed }));
  }

  private onSession(e: SessionEvent): void {
    if (this.leaving) return;
    if (e.kind === 'remote-left') {
      this.showLeft();
      return;
    }
    if (e.kind === 'message') this.onMessage(e.msg);
  }

  private onMessage(msg: NetMessage): void {
    const other = (1 - this.me) as 0 | 1;
    if (msg.type === 'select') {
      const index = TEAMS.findIndex((t) => t.id === msg.team);
      if (index < 0) return;
      this.states[other] = { index, confirmed: msg.confirmed };
      this.refresh();
    } else if (msg.type === 'start' && this.me === 1 && !this.started) {
      this.begin(msg.teams, msg.seed, msg.weather);
    }
  }

  private showLeft(): void {
    this.confirm?.destroy();
    this.confirm = null;
    if (this.notice) return;
    this.notice = new NoticeDialog(this, 'O ADVERSÁRIO SAIU', 'A conexão com a sala acabou.', 'VOLTAR');
  }

  /** Os dois confirmaram: segue para a tela VS e a partida (com o clima e a semente do anfitrião). */
  private begin(teams: [TeamId, TeamId], seed: number, weather: WeatherId): void {
    this.started = true;
    this.leaving = true;
    this.off?.();
    this.off = null;
    const data: VersusData = { teams, seed, weather, mode: 'online' };
    this.cameras.main.fadeOut(220, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('VersusScene', data));
  }

  override update(time: number): void {
    const t = time / 1000;
    const now = performance.now() / 1000;
    this.rays.setRotation(-t * 0.06);
    this.film.update(t, Math.min(0.25, this.game.loop.rawDelta / 1000));
    this.confirm?.update(t);
    this.notice?.update(t);
    this.animate(t);
    if (this.leaving) return;
    const input = readMenuInput();

    if (this.notice) {
      if (this.notice.handle(input)) this.leave();
      return;
    }
    if (this.confirm) {
      const answer = this.confirm.handle(input);
      if (answer === null) return;
      this.confirm.destroy();
      this.confirm = null;
      if (answer === 'ok') this.leave();
      return;
    }

    const st = this.states[this.me];
    let changed = false;
    const back = input.players.some((p) => p.back);
    if (back) {
      if (st.confirmed) {
        st.confirmed = false;
        changed = true;
        audio.play('menu-voltar');
      } else {
        this.confirm = new ConfirmDialog(this, 'SAIR DA SALA?', 'O adversário vai ficar sozinho na sala.', ['CONTINUAR', 'SAIR']);
        return;
      }
    } else if (!st.confirmed) {
      let col = st.index % COLS;
      let row = Math.floor(st.index / COLS);
      const rows = Math.ceil(TEAMS.length / COLS);
      for (const p of input.players) {
        if (p.left) col = (col + COLS - 1) % COLS;
        if (p.right) col = (col + 1) % COLS;
        if (p.up) row = (row + rows - 1) % rows;
        if (p.down) row = (row + 1) % rows;
      }
      const next = Math.min(TEAMS.length - 1, row * COLS + col);
      if (next !== st.index) {
        st.index = next;
        changed = true;
        audio.play('menu-mover');
      }
      if (input.enter || input.players.some((p) => p.confirm)) {
        st.confirmed = true;
        changed = true;
        audio.play('menu-confirmar');
      }
    }
    if (changed) {
      this.refresh();
      this.sendSelect();
    }

    // Anfitrião: os dois prontos por um instante → sorteia clima e semente e manda começar.
    if (this.me === 0 && this.states[0].confirmed && this.states[1].confirmed) {
      this.readySince ??= now;
      if (now - this.readySince >= BOTH_READY_DELAY && !this.started) {
        const seed = (Date.now() ^ 0x0a11ce) >>> 0;
        const rng = new Rng(seed);
        const weather = randomWeather(() => rng.next());
        const teams: [TeamId, TeamId] = [this.teamOf(0), this.teamOf(1)];
        this.session?.send(message({ type: 'start', teams, weather, seed }));
        this.begin(teams, seed, weather);
      }
    } else {
      this.readySince = null;
    }
  }

  /** Prévias respirando e os cursores fervendo (o do adversário mais fino). */
  private animate(t: number): void {
    const boil = Math.floor(t * BOIL_FPS) % 3;
    ([0, 1] as const).forEach((i) => {
      const v = this.views[i];
      const st = this.states[i];
      const breath = Math.sin((t * PREVIEW_BREATH_HZ + i * 0.31) * Math.PI * 2);
      const sway = Math.sin((t * PREVIEW_SWAY_HZ + i * 0.17) * Math.PI * 2);
      v.preview
        .setScale(PREVIEW_SCALE * (1 - breath * PREVIEW_BREATH_AMOUNT * 0.4), PREVIEW_SCALE * (1 + breath * PREVIEW_BREATH_AMOUNT))
        .setAngle(sway * PREVIEW_SWAY_DEG);
      const img = v.grid[st.index]!;
      const g = v.cursor;
      g.clear();
      const j = (boil - 1) * 1.5;
      const size = 92 + Math.sin(t * 6) * 3;
      const mine = i === this.me;
      g.lineStyle(mine ? 7 : 5, INK, 1);
      g.strokeRoundedRect(img.x - size / 2 + j, img.y - size / 2 - j, size, size, 10);
      g.lineStyle(mine ? 4 : 2.5, st.confirmed ? 0x58b947 : 0xffd24a, 1);
      g.strokeRoundedRect(img.x - size / 2 + j, img.y - size / 2 - j, size, size, 10);
      v.grid.forEach((c, k) => c.setAlpha(k === st.index || !st.confirmed ? (mine ? 1 : 0.8) : 0.45));
    });
  }

  /** Sai da sala (avisa o outro) e volta ao menu online. */
  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.off?.();
    this.off = null;
    setCurrentSession(null);
    this.cameras.main.fadeOut(220, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start('OnlineMenuScene'));
  }
}
