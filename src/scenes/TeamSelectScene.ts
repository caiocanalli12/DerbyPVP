import Phaser from 'phaser';
import {
  BOIL_FPS,
  GAME_HEIGHT,
  GAME_WIDTH,
  PREVIEW_BREATH_AMOUNT,
  PREVIEW_BREATH_HZ,
  PREVIEW_SWAY_DEG,
  PREVIEW_SWAY_HZ,
  KIT_REFUSED_FLASH,
} from '../config/constants';
import { audio } from '../audio/AudioManager';
import { TEAMS } from '../data/teams';
import type { TeamId } from '../data/teams';
import { crestKey, generateCrestTextures } from '../art/crest-art';
import { generateKitPreview, previewKey } from '../art/preview-art';
import { CREAM, CREAM_CSS, FONT_TEXT, FONT_TITLE, INK, INK_CSS } from '../art/style';
import { chooseKits, chooseKitsWith, kitOf } from '../sim/kits';
import type { KitChoice, KitVariant } from '../sim/kits';
import { FilmView, filmEffectsEnabled } from '../render/FilmView';
import { addSunburst, addTitle, readMenuInput } from '../render/menu';

const COLS = 4;
/** Escala da prévia do jogador com o uniforme. */
const PREVIEW_SCALE = 0.86;
/** Seletor de uniforme (px): tecla, as duas opções e a altura delas. */
const KIT_KEY_W = 26;
const KIT_PILL_W = 104;
const KIT_PILL_H = 26;
const KIT_GAP = 7;
/** Tecla que troca o uniforme de cada jogador. */
const KIT_KEY: readonly [string, string] = ['H', ','];
/** Tempo (s) depois que os dois confirmam até seguir para o VS. */
const BOTH_READY_DELAY = 0.7;

interface Side {
  index: number;
  confirmed: boolean;
  crest: Phaser.GameObjects.Image;
  name: Phaser.GameObjects.Text;
  /** Uniforme fixado pelo jogador (null = automático). */
  pref: KitVariant | null;
  /** Até quando (s) mostrar o aviso de troca recusada. */
  refusedUntil: number;
  kitGfx: Phaser.GameObjects.Graphics;
  kitTexts: [Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  kitKey: Phaser.GameObjects.Text;
  preview: Phaser.GameObjects.Image;
  cursor: Phaser.GameObjects.Graphics;
  stamp: Phaser.GameObjects.Text;
  status: Phaser.GameObjects.Text;
  grid: Phaser.GameObjects.Image[];
}

export interface TeamSelectData {
  teams?: [TeamId, TeamId];
  /** Uniformes da partida anterior ("Trocar times"): começam escolhidos. */
  kits?: [KitVariant, KitVariant];
}

/**
 * Seleção de times: J1 à esquerda, J2 à direita, cada um com a própria grade e controles.
 * Cada um escolhe o uniforme 1 (titular) ou 2 (reserva) com H / `,`; a combinação nunca fica com
 * cores parecidas (quem está no automático se ajusta; uma escolha que conflitaria é recusada).
 * A partida começa quando os dois confirmam; o botão de voltar desfaz a confirmação.
 */
export class TeamSelectScene extends Phaser.Scene {
  private sides!: [Side, Side];
  private rays!: Phaser.GameObjects.Image;
  private film!: FilmView;
  /** Instante (s) em que os dois confirmaram (ou null). */
  private readySince: number | null = null;
  private leaving = false;
  private initial: [TeamId, TeamId] = ['PAL', 'COR'];
  private initialKits: [KitVariant | null, KitVariant | null] = [null, null];
  /** Uniformes que vão ser usados, com as escolhas atuais. */
  private kits!: KitChoice;

  constructor() {
    super('TeamSelectScene');
  }

  init(data: TeamSelectData): void {
    this.initial = data.teams ?? ['PAL', 'COR'];
    this.initialKits = data.kits ? [data.kits[0], data.kits[1]] : [null, null];
  }

  create(): void {
    this.leaving = false;
    this.readySince = null;
    this.cameras.main.setBackgroundColor('#2a1a10');
    this.cameras.main.fadeIn(200, 20, 12, 8);
    this.rays = addSunburst(this, 0xb5482f, 0x9c3a26);
    generateCrestTextures(this);
    addTitle(this, GAME_WIDTH / 2, 48, 'ESCOLHA SEU TIME', 52).setDepth(5);

    // Divisória art déco no meio.
    const div = this.add.graphics().setDepth(4);
    div.fillStyle(INK, 1);
    div.fillRect(GAME_WIDTH / 2 - 3, 90, 6, GAME_HEIGHT - 120);
    div.fillStyle(CREAM, 1);
    div.fillRect(GAME_WIDTH / 2 - 1, 90, 2, GAME_HEIGHT - 120);
    for (const y of [140, GAME_HEIGHT / 2 + 40, GAME_HEIGHT - 60]) {
      div.fillStyle(CREAM, 1);
      div.fillTriangle(GAME_WIDTH / 2, y - 14, GAME_WIDTH / 2 + 9, y, GAME_WIDTH / 2, y + 14);
      div.fillTriangle(GAME_WIDTH / 2, y - 14, GAME_WIDTH / 2 - 9, y, GAME_WIDTH / 2, y + 14);
    }

    this.sides = [this.buildSide(0), this.buildSide(1)];
    this.film = new FilmView(this, filmEffectsEnabled(this));
    readMenuInput();
    this.refresh();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.film.destroy());
  }

  private buildSide(i: 0 | 1): Side {
    const cx = i === 0 ? GAME_WIDTH / 4 : (GAME_WIDTH * 3) / 4;
    const panel = this.add.graphics().setDepth(1);
    panel.fillStyle(0x1a1410, 0.55);
    panel.fillRoundedRect(cx - 290, 92, 580, GAME_HEIGHT - 120, 18);
    panel.lineStyle(3, CREAM, 0.9);
    panel.strokeRoundedRect(cx - 282, 100, 564, GAME_HEIGHT - 136, 14);

    this.add
      .text(cx, 128, i === 0 ? 'JOGADOR 1' : 'JOGADOR 2', {
        fontFamily: FONT_TITLE,
        fontSize: '32px',
        color: CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 6,
      })
      .setOrigin(0.5)
      .setDepth(5);
    this.add
      .text(cx, 160, i === 0 ? 'W A S D · F confirma · G volta · H uniforme' : 'Setas · ; confirma · . volta · , uniforme', {
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
    const kitGfx = this.add.graphics().setDepth(5);
    const pillText = (): Phaser.GameObjects.Text =>
      this.add.text(0, 404, '', { fontFamily: FONT_TEXT, fontSize: '15px', fontStyle: '700', color: INK_CSS }).setOrigin(0.5).setDepth(6);
    const kitTexts: [Phaser.GameObjects.Text, Phaser.GameObjects.Text] = [pillText(), pillText()];
    const kitKey = this.add
      .text(0, 404, KIT_KEY[i], { fontFamily: FONT_TEXT, fontSize: '16px', fontStyle: '700', color: INK_CSS })
      .setOrigin(0.5)
      .setDepth(6);
    const preview = this.add.image(cx + 130, 410, crestKey('PAL')).setOrigin(0.5, 1).setScale(PREVIEW_SCALE).setDepth(5);
    this.add.ellipse(cx + 130, 404, 110, 22, 0x1a1410, 0.4).setDepth(4);

    const grid: Phaser.GameObjects.Image[] = [];
    TEAMS.forEach((t, k) => {
      const gx = cx - 195 + (k % COLS) * 130;
      const gy = 480 + Math.floor(k / COLS) * 100;
      grid.push(this.add.image(gx, gy, crestKey(t.id)).setScale(0.6).setDepth(5));
    });
    const cursor = this.add.graphics().setDepth(6);
    const stamp = this.add
      .text(cx + 130, 300, 'PRONTO!', {
        fontFamily: FONT_TITLE,
        fontSize: '54px',
        color: '#c8102e',
        stroke: '#fff3d6',
        strokeThickness: 8,
      })
      .setOrigin(0.5)
      .setAngle(-14)
      .setDepth(8)
      .setVisible(false);
    const status = this.add
      .text(cx, GAME_HEIGHT - 52, '', { fontFamily: FONT_TEXT, fontSize: '20px', fontStyle: '700', color: CREAM_CSS, stroke: INK_CSS, strokeThickness: 4 })
      .setOrigin(0.5)
      .setDepth(5);
    const index = Math.max(0, TEAMS.findIndex((t) => t.id === this.initial[i]));
    const pref = this.initialKits[i];
    return { index, confirmed: false, crest, name, pref, refusedUntil: 0, kitGfx, kitTexts, kitKey, preview, cursor, stamp, status, grid };
  }

  private teamOf(side: Side): TeamId {
    return TEAMS[side.index]!.id;
  }

  /** Escolhas que valem agora: quem confirmou fica com o uniforme que tinha. */
  private prefs(): [KitVariant | null, KitVariant | null] {
    const pick = (i: 0 | 1): KitVariant | null => {
      const s = this.sides[i];
      return s.confirmed && this.kits ? this.kits.variants[i] : s.pref;
    };
    return [pick(0), pick(1)];
  }

  /** Uniformes com as escolhas atuais. */
  private resolveKits(): KitChoice {
    const t1 = this.teamOf(this.sides[0]);
    const t2 = this.teamOf(this.sides[1]);
    const kits = chooseKitsWith(t1, t2, this.prefs());
    if (kits) return kits;
    // Uma escolha deixou de valer (o outro mudou de time): quem não confirmou volta ao automático.
    for (const s of this.sides) if (!s.confirmed) s.pref = null;
    return chooseKitsWith(t1, t2, this.prefs()) ?? chooseKits(t1, t2);
  }

  /** H / `,`: troca entre o uniforme 1 e o 2, se a combinação não ficar com cores parecidas. */
  private toggleKit(i: 0 | 1, now: number): void {
    const s = this.sides[i];
    if (s.confirmed) return;
    const want: KitVariant = this.kits.variants[i] === 'home' ? 'away' : 'home';
    const prefs = this.prefs();
    prefs[i] = want;
    if (!chooseKitsWith(this.teamOf(this.sides[0]), this.teamOf(this.sides[1]), prefs)) {
      s.refusedUntil = now + KIT_REFUSED_FLASH;
      audio.play('menu-voltar');
      return;
    }
    s.pref = want;
    audio.play('menu-mover');
  }

  /** Atualiza escudo, nome, seletor de uniforme e prévia com o uniforme que vai ser usado de fato. */
  private refresh(now = 0): void {
    this.kits = this.resolveKits();
    const kits = this.kits;
    this.sides.forEach((s, i) => {
      const team = TEAMS[s.index]!;
      const variant = kits.variants[i]!;
      const kitId = `${team.id}-${variant}`;
      generateKitPreview(this, kitId, kits.kits[i]!, 9);
      s.preview.setTexture(previewKey(kitId));
      s.crest.setTexture(crestKey(team.id));
      s.name.setText(team.name.toUpperCase());
      this.drawKitSelector(s, i as 0 | 1, team.id, variant);
      s.stamp.setVisible(s.confirmed);
      this.updateStatus(s, i as 0 | 1, now);
    });
  }

  private updateStatus(s: Side, i: 0 | 1, now: number): void {
    if (now < s.refusedUntil) {
      s.status.setText('CORES PARECIDAS COM O ADVERSÁRIO').setColor('#ff9a86');
      return;
    }
    s.status
      .setText(s.confirmed ? (i === 0 ? 'G desfaz' : '. desfaz') : i === 0 ? 'F para confirmar' : '; para confirmar')
      .setColor(CREAM_CSS);
  }

  /** "[H] 1 TITULAR | 2 RESERVA": a opção em uso em dourado, com a cor de cada camisa. */
  private drawKitSelector(s: Side, i: 0 | 1, team: TeamId, variant: KitVariant): void {
    const cx = (i === 0 ? GAME_WIDTH / 4 : (GAME_WIDTH * 3) / 4) - 120;
    const y = 404;
    const total = KIT_KEY_W + KIT_GAP + KIT_PILL_W * 2 + KIT_GAP;
    const left = cx - total / 2;
    const g = s.kitGfx;
    g.clear();
    // Tecla.
    g.fillStyle(CREAM, s.confirmed ? 0.45 : 1);
    g.fillRoundedRect(left, y - 12, KIT_KEY_W, 24, 5);
    g.lineStyle(2, INK, 1);
    g.strokeRoundedRect(left, y - 12, KIT_KEY_W, 24, 5);
    s.kitKey.setPosition(left + KIT_KEY_W / 2, y).setAlpha(s.confirmed ? 0.6 : 1);
    (['home', 'away'] as const).forEach((v, k) => {
      const x = left + KIT_KEY_W + KIT_GAP + k * (KIT_PILL_W + KIT_GAP);
      const on = v === variant;
      g.fillStyle(on ? 0xffd24a : 0x1a1410, on ? 1 : 0.75);
      g.fillRoundedRect(x, y - KIT_PILL_H / 2, KIT_PILL_W, KIT_PILL_H, 8);
      g.lineStyle(on ? 3 : 1.5, on ? INK : CREAM, on ? 1 : 0.6);
      g.strokeRoundedRect(x, y - KIT_PILL_H / 2, KIT_PILL_W, KIT_PILL_H, 8);
      // Amostra da camisa (com as listras, se houver).
      const kit = kitOf(team, v);
      const sx = x + 9;
      const sy = y - 7;
      if (kit.pattern.kind === 'stripes') {
        for (let n = 0; n < 4; n++) {
          g.fillStyle(kit.pattern.colors[n % 2]!, 1);
          g.fillRect(sx + n * 3.5, sy, 3.5, 14);
        }
      } else {
        g.fillStyle(kit.shirt, 1);
        g.fillRect(sx, sy, 14, 14);
      }
      g.lineStyle(1.5, INK, 1);
      g.strokeRect(sx, sy, 14, 14);
      s.kitTexts[k]!
        .setText(k === 0 ? '1 TITULAR' : '2 RESERVA')
        .setPosition(x + KIT_PILL_W / 2 + 9, y)
        .setColor(on ? INK_CSS : CREAM_CSS)
        .setAlpha(on ? 1 : 0.75);
    });
  }

  override update(time: number): void {
    const t = time / 1000;
    this.rays.setRotation(-t * 0.06);
    this.film.update(t, Math.min(0.25, this.game.loop.rawDelta / 1000));
    const boil = Math.floor(t * BOIL_FPS) % 3;

    this.sides.forEach((s, i) => {
      // Prévia viva, mas calma: respira e balança devagar, presa pelos pés.
      const breath = Math.sin((t * PREVIEW_BREATH_HZ + i * 0.31) * Math.PI * 2);
      const sway = Math.sin((t * PREVIEW_SWAY_HZ + i * 0.17) * Math.PI * 2);
      s.preview
        .setScale(PREVIEW_SCALE * (1 - breath * PREVIEW_BREATH_AMOUNT * 0.4), PREVIEW_SCALE * (1 + breath * PREVIEW_BREATH_AMOUNT))
        .setAngle(sway * PREVIEW_SWAY_DEG);
      // Cursor: moldura dourada fervendo em volta do escudo escolhido.
      const img = s.grid[s.index]!;
      const g = s.cursor;
      g.clear();
      const j = ((boil - 1) * 1.5) as number;
      const size = 92 + Math.sin(t * 6) * 3;
      g.lineStyle(7, INK, 1);
      g.strokeRoundedRect(img.x - size / 2 + j, img.y - size / 2 - j, size, size, 10);
      g.lineStyle(4, s.confirmed ? 0x58b947 : 0xffd24a, 1);
      g.strokeRoundedRect(img.x - size / 2 + j, img.y - size / 2 - j, size, size, 10);
      s.grid.forEach((c, k) => c.setAlpha(k === s.index || !s.confirmed ? 1 : 0.45));
      s.crest.setScale(1.05 + Math.sin(t * 3 + i) * 0.02);
    });

    if (this.leaving) return;
    const input = readMenuInput();
    let changed = false;
    this.sides.forEach((s, i) => {
      // O aviso de troca recusada some sozinho.
      if (s.refusedUntil > 0 && t >= s.refusedUntil) {
        s.refusedUntil = 0;
        this.updateStatus(s, i as 0 | 1, t);
      }
    });
    input.players.forEach((p, i) => {
      const s = this.sides[i]!;
      if (p.kit && !s.confirmed) {
        this.toggleKit(i as 0 | 1, t);
        changed = true;
      }
      if (p.back) {
        if (s.confirmed) {
          s.confirmed = false;
          changed = true;
          audio.play('menu-voltar');
        } else if (!this.sides[0].confirmed && !this.sides[1].confirmed) {
          this.leave('TitleScene', {});
        }
        return;
      }
      if (s.confirmed) return;
      const col = s.index % COLS;
      const row = Math.floor(s.index / COLS);
      const rows = Math.ceil(TEAMS.length / COLS);
      let nc = col;
      let nr = row;
      if (p.left) nc = (col + COLS - 1) % COLS;
      if (p.right) nc = (col + 1) % COLS;
      if (p.up) nr = (row + rows - 1) % rows;
      if (p.down) nr = (row + 1) % rows;
      if (nc !== col || nr !== row) {
        s.index = Math.min(TEAMS.length - 1, nr * COLS + nc);
        // Time novo começa no uniforme automático.
        s.pref = null;
        changed = true;
        audio.play('menu-mover');
      }
      if (p.confirm) {
        s.confirmed = true;
        changed = true;
        audio.play('menu-confirmar');
      }
    });
    // Enter confirma quem ainda não confirmou (primeiro o J1).
    if (input.enter) {
      const s = this.sides.find((x) => !x.confirmed);
      if (s) {
        s.confirmed = true;
        changed = true;
        audio.play('menu-confirmar');
      }
    }
    if (changed) this.refresh(t);

    // Relógio real (o delta do Phaser é suavizado e atrasa em máquinas lentas).
    if (this.sides[0].confirmed && this.sides[1].confirmed) {
      this.readySince ??= t;
      if (t - this.readySince >= BOTH_READY_DELAY) {
        this.leave('VersusScene', { teams: [this.teamOf(this.sides[0]), this.teamOf(this.sides[1])], kits: this.kits.variants });
      }
    } else {
      this.readySince = null;
    }
  }

  private leave(scene: string, data: object): void {
    if (this.leaving) return;
    this.leaving = true;
    this.cameras.main.fadeOut(220, 20, 12, 8);
    this.cameras.main.once(Phaser.Cameras.Scene2D.Events.FADE_OUT_COMPLETE, () => this.scene.start(scene, data));
  }
}

