/**
 * Peças comuns dos menus no estilo 1930: fundo de raios de sol girando, botões em placa
 * art déco com a linha fervendo e a leitura de teclado dos dois jogadores.
 */
import Phaser from 'phaser';
import { BOIL_FPS, BOIL_JITTER, GAME_HEIGHT, GAME_WIDTH, MENU_SUNBURST_RES } from '../config/constants';
import { keyboard } from '../core/input';
import type { InputFrame } from '../core/input';
import { Rng } from '../core/rng';
import { makeCanvasTexture } from '../art/canvas';
import { css } from '../art/brush';
import { CREAM, CREAM_CSS, FONT_TEXT, INK_CSS } from '../art/style';

// ---------------------------------------------------------------------------
// Entrada dos menus
// ---------------------------------------------------------------------------

export interface MenuNav {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  confirm: boolean;
  back: boolean;
  /** Troca de uniforme (seleção de times): H / `,`. */
  kit: boolean;
}

export interface MenuInput {
  players: [MenuNav, MenuNav];
  /** Enter (confirma para quem estiver ativo). */
  enter: boolean;
  pause: boolean;
  frame: InputFrame;
}

/**
 * J1: W/S/A/D + F confirma + G volta; J2: setas + ; confirma + . volta; Enter confirma.
 */
export function readMenuInput(): MenuInput {
  const f = keyboard.snapshot();
  const nav = (i: 0 | 1): MenuNav => {
    const p = f.players[i];
    return {
      up: p.up.pressed,
      down: p.down.pressed,
      left: p.left.pressed,
      right: p.right.pressed,
      confirm: p.pass.pressed,
      back: p.shoot.pressed,
      kit: f.kit[i].pressed,
    };
  };
  return { players: [nav(0), nav(1)], enter: f.enter.pressed, pause: f.pause.pressed, frame: f };
}

// ---------------------------------------------------------------------------
// Fundo de raios de sol
// ---------------------------------------------------------------------------

export const SUNBURST_KEY = 'menu-sunburst';

/**
 * Fundo de raios girando (cores alternadas) + escurecimento nas bordas.
 *
 * Girando, qualquer ponto até meia diagonal da tela aparece, então a textura cobre esse círculo.
 * Ela é desenhada em resolução menor e ampliada (raios grandes e lisos não perdem nada visível).
 */
export function addSunburst(scene: Phaser.Scene, a = 0xe8b04b, b = 0xd3913a): Phaser.GameObjects.Image {
  const key = `${SUNBURST_KEY}-${a.toString(16)}-${b.toString(16)}`;
  const k = MENU_SUNBURST_RES;
  if (!scene.textures.exists(key)) {
    const S = Math.ceil(Math.hypot(GAME_WIDTH, GAME_HEIGHT) * k) + 4;
    makeCanvasTexture(scene, key, S, S, (ctx) => {
      const c = S / 2;
      const n = 28;
      // Fundo inteiro numa cor e só os raios da outra por cima: raios lado a lado deixariam uma
      // fresta semitransparente (do antisserrilhado) entre eles, que aparecia como linha escura.
      ctx.fillStyle = css(b);
      ctx.fillRect(0, 0, S, S);
      ctx.fillStyle = css(a);
      for (let i = 0; i < n; i += 2) {
        const a0 = (i / n) * Math.PI * 2;
        const a1 = ((i + 1) / n) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(c, c);
        ctx.arc(c, c, S, a0, a1);
        ctx.closePath();
        ctx.fill();
      }
      // Raios do brilho e do escurecimento medidos na tela (60 e 850 px), não na textura.
      const g = ctx.createRadialGradient(c, c, 60 * k, c, c, 850 * k);
      g.addColorStop(0, 'rgba(255,240,200,0.45)');
      g.addColorStop(0.5, 'rgba(0,0,0,0)');
      g.addColorStop(1, 'rgba(40,20,10,0.55)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, S, S);
    });
  }
  return scene.add
    .image(GAME_WIDTH / 2, GAME_HEIGHT / 2, key)
    .setScale(1 / k)
    .setDepth(-10);
}

// ---------------------------------------------------------------------------
// Botão em placa art déco
// ---------------------------------------------------------------------------

const BTN_W = 360;
const BTN_H = 54;
/** Fonte do rótulo e largura máxima dele (as setas da placa selecionada ocupam as pontas). */
const LABEL_SIZE = 26;
const LABEL_MAX_W = BTN_W - 76;

function plateKey(selected: boolean, v: number): string {
  return `menu-plate-${selected ? 'on' : 'off'}-${v}`;
}

function generatePlates(scene: Phaser.Scene): void {
  if (scene.textures.exists(plateKey(false, 0))) return;
  for (const selected of [false, true]) {
    for (let v = 0; v < 3; v++) {
      const rng = new Rng(600 + v * 13 + (selected ? 5 : 0));
      const j = (): number => rng.range(-BOIL_JITTER, BOIL_JITTER);
      makeCanvasTexture(scene, plateKey(selected, v), BTN_W + 16, BTN_H + 16, (ctx) => {
        const x = 8;
        const y = 8;
        const w = BTN_W;
        const h = BTN_H;
        const st = 7;
        const path = (): void => {
          ctx.beginPath();
          ctx.moveTo(x + st + j(), y + j());
          ctx.lineTo(x + w - st + j(), y + j());
          ctx.lineTo(x + w + j(), y + st + j());
          ctx.lineTo(x + w + j(), y + h - st + j());
          ctx.lineTo(x + w - st + j(), y + h + j());
          ctx.lineTo(x + st + j(), y + h + j());
          ctx.lineTo(x + j(), y + h - st + j());
          ctx.lineTo(x + j(), y + st + j());
          ctx.closePath();
        };
        ctx.fillStyle = 'rgba(26,20,16,0.45)';
        ctx.save();
        ctx.translate(4, 5);
        path();
        ctx.fill();
        ctx.restore();
        path();
        ctx.fillStyle = selected ? '#ffd24a' : CREAM_CSS;
        ctx.fill();
        ctx.lineWidth = selected ? 4 : 3;
        ctx.strokeStyle = INK_CSS;
        ctx.stroke();
        ctx.lineWidth = 1.2;
        ctx.strokeRect(x + 9, y + 8, w - 18, h - 16);
        if (selected) {
          // Setas art déco nas pontas.
          for (const s of [-1, 1]) {
            const cx = s < 0 ? x + 22 : x + w - 22;
            ctx.beginPath();
            ctx.moveTo(cx - s * 7, y + h / 2 - 8);
            ctx.lineTo(cx + s * 3, y + h / 2);
            ctx.lineTo(cx - s * 7, y + h / 2 + 8);
            ctx.closePath();
            ctx.fillStyle = INK_CSS;
            ctx.fill();
          }
        }
      });
    }
  }
}

export class DecoButton {
  readonly plate: Phaser.GameObjects.Image;
  readonly text: Phaser.GameObjects.Text;
  private selected = false;

  constructor(scene: Phaser.Scene, x: number, y: number, label: string, depth = 10) {
    generatePlates(scene);
    this.plate = scene.add.image(x, y, plateKey(false, 0)).setDepth(depth);
    this.text = scene.add
      .text(x, y, label, { fontFamily: FONT_TEXT, fontSize: `${LABEL_SIZE}px`, fontStyle: '700', color: INK_CSS })
      .setOrigin(0.5)
      .setDepth(depth + 1);
    this.fit();
  }

  setLabel(label: string): void {
    this.text.setText(label);
    this.fit();
  }

  /** Diminui a fonte de rótulos longos para caberem na placa. */
  private fit(): void {
    this.text.setFontSize(LABEL_SIZE);
    if (this.text.width > LABEL_MAX_W) this.text.setFontSize(Math.floor((LABEL_SIZE * LABEL_MAX_W) / this.text.width));
  }

  setSelected(on: boolean): void {
    this.selected = on;
  }

  update(timeSec: number): void {
    const v = Math.floor(timeSec * BOIL_FPS) % 3;
    this.plate.setTexture(plateKey(this.selected, v));
    const s = this.selected ? 1 + Math.sin(timeSec * 6) * 0.025 : 1;
    this.plate.setScale(s);
    this.text.setScale(s);
  }

  setVisible(v: boolean): void {
    this.plate.setVisible(v);
    this.text.setVisible(v);
  }

  /** Transparência da placa e do rótulo (opções indisponíveis ficam esmaecidas). */
  setAlpha(alpha: number): void {
    this.plate.setAlpha(alpha);
    this.text.setAlpha(alpha);
  }

  destroy(): void {
    this.plate.destroy();
    this.text.destroy();
  }
}

/** Título grande com contorno grosso e brilho (Limelight). */
export function addTitle(
  scene: Phaser.Scene,
  x: number,
  y: number,
  text: string,
  size: number,
  color = CREAM,
): Phaser.GameObjects.Text {
  return scene.add
    .text(x, y, text, {
      fontFamily: 'Limelight',
      fontSize: `${size}px`,
      color: css(color),
      stroke: INK_CSS,
      strokeThickness: Math.max(6, Math.round(size * 0.12)),
      align: 'center',
    })
    .setOrigin(0.5)
    .setShadow(5, 7, 'rgba(26,20,16,0.6)', 0, true, true);
}

/** Lista vertical de botões com seleção compartilhada pelos dois jogadores. */
export class ButtonList {
  readonly buttons: DecoButton[] = [];
  index = 0;

  constructor(scene: Phaser.Scene, x: number, y0: number, labels: readonly string[], gap = 70, depth = 10) {
    labels.forEach((l, i) => this.buttons.push(new DecoButton(scene, x, y0 + i * gap, l, depth)));
    this.refresh();
  }

  /** Aplica a navegação dos dois jogadores. Devolve o índice confirmado (ou null). */
  handle(input: MenuInput, onMove?: () => void): number | null {
    for (const p of input.players) {
      if (p.up) this.move(-1, onMove);
      if (p.down) this.move(1, onMove);
    }
    if (input.enter || input.players.some((p) => p.confirm)) return this.index;
    return null;
  }

  private move(d: number, onMove?: () => void): void {
    this.index = (this.index + d + this.buttons.length) % this.buttons.length;
    this.refresh();
    onMove?.();
  }

  refresh(): void {
    this.buttons.forEach((b, i) => b.setSelected(i === this.index));
  }

  update(timeSec: number): void {
    for (const b of this.buttons) b.update(timeSec);
  }

  destroy(): void {
    for (const b of this.buttons) b.destroy();
  }
}
