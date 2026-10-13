import Phaser from 'phaser';
import {
  BALL_RADIUS,
  GAME_HEIGHT,
  GAME_WIDTH,
  MAX_FRAME_DT,
  PLAYER_RADIUS,
  POSSESSION_RADIUS,
  SIM_DT,
} from '../config/constants';
import { keyboard } from '../core/input';
import type { InputFrame } from '../core/input';
import { DEPTH_UI, PPM, project } from '../core/projection';
import { BallView } from '../render/BallView';
import { audio } from '../audio/AudioManager';
import { FieldView } from '../render/FieldView';
import { DebugOverlay } from '../render/DebugOverlay';
import { PlayersView } from '../render/PlayersView';
import { createWorld, drainEvents, getPlayer, stepWorld } from '../sim/world';
import type { World } from '../sim/world';
import { CREAM_CSS, FONT_TITLE, INK_CSS } from '../art/style';

/**
 * Partida. Fase 3: dois humanos movendo jogadores ao mesmo tempo, em passo fixo.
 */
export class MatchScene extends Phaser.Scene {
  private world!: World;
  private debug!: DebugOverlay;
  private playersView!: PlayersView;
  private ballView!: BallView;
  private chargeBar!: Phaser.GameObjects.Graphics;
  private pauseText!: Phaser.GameObjects.Text;
  private accumulator = 0;
  private paused = false;

  constructor() {
    super('MatchScene');
  }

  create(): void {
    this.world = createWorld();
    this.accumulator = 0;
    this.paused = false;

    new FieldView(this);
    this.playersView = new PlayersView(this, this.world);
    this.ballView = new BallView(this);
    this.chargeBar = this.add.graphics().setDepth(DEPTH_UI - 10);
    this.debug = new DebugOverlay(this);

    this.pauseText = this.add
      .text(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'PAUSADO', {
        fontFamily: FONT_TITLE,
        fontSize: '72px',
        color: CREAM_CSS,
        stroke: INK_CSS,
        strokeThickness: 10,
      })
      .setOrigin(0.5)
      .setDepth(DEPTH_UI)
      .setVisible(false);

    // Descarta teclas apertadas antes da cena começar.
    keyboard.snapshot();

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.debug.destroy();
      this.playersView.destroy();
      this.ballView.destroy();
    });
  }

  override update(): void {
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
        stepWorld(this.world, frame.players, SIM_DT);
        this.accumulator -= SIM_DT;
      }
    }

    this.consumeEvents();

    const alpha = this.paused ? 1 : this.accumulator / SIM_DT;
    this.playersView.update(this.world, alpha);
    this.ballView.update(this.world.ball, alpha);
    this.drawChargeBars();
    this.drawDebug();
  }

  /** Eventos da simulação -> áudio (vazio por enquanto) e efeitos. */
  private consumeEvents(): void {
    for (const e of drainEvents(this.world)) {
      if (e.type === 'pass') audio.play('passe');
      else if (e.type === 'shot') audio.play('chute');
      else if (e.type === 'contact' && (e.kind === 'post' || e.kind === 'bar')) audio.play('trave');
    }
  }

  /** Barra de força provisória aos pés de quem carrega (o arco final vem na fase 12). */
  private drawChargeBars(): void {
    const g = this.chargeBar;
    g.clear();
    for (const team of [0, 1] as const) {
      const h = this.world.humans[team];
      if (!h.charging) continue;
      const p = getPlayer(this.world, this.world.controlled[team]);
      const pos = project(p.x, p.y + 0.6, 0);
      const w = 1.4 * PPM * pos.scale;
      const x0 = pos.x - w / 2;
      g.fillStyle(0x1a1410, 1);
      g.fillRect(x0 - 2, pos.y - 2, w + 4, 10);
      g.fillStyle(h.charge >= 1 && Math.floor(this.time.now / 80) % 2 === 0 ? 0xffffff : 0xffcc33, 1);
      g.fillRect(x0, pos.y, w * h.charge, 6);
    }
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

  private drawDebug(): void {
    this.debug.beginFrame();
    if (this.debug.isVisible()) {
      for (const p of this.world.players) {
        const color = p.team === 0 ? 0xff8080 : 0x80b0ff;
        this.debug.circle(p.x, p.y, PLAYER_RADIUS, color);
        this.debug.label(p.x, p.y + 0.9, `${p.number} (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) ${Math.hypot(p.vx, p.vy).toFixed(1)}m/s`);
      }
      const b = this.world.ball;
      this.debug.circle(b.x, b.y, BALL_RADIUS, 0xffffff);
      this.debug.circle(b.x, b.y, BALL_RADIUS, 0xffffff, b.z);
      this.debug.pillar(b.x, b.y, 0, b.z, 0xffffff);
      for (const team of [0, 1] as const) {
        const c = getPlayer(this.world, this.world.controlled[team]);
        this.debug.circle(c.x, c.y, POSSESSION_RADIUS, 0x40ff40);
      }
      this.debug.label(
        b.x,
        b.y - 0.8,
        `bola (${b.x.toFixed(2)}, ${b.y.toFixed(2)}, z ${b.z.toFixed(2)}) ${Math.hypot(b.vx, b.vy, b.vz).toFixed(1)}m/s`,
        b.z,
      );
      this.debug.setInfo(`DEBUG · t=${this.world.time.toFixed(1)}s · mouse = coordenadas do mundo no chão`);
    }
    this.debug.endFrame();
  }
}
