import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH, MAX_FRAME_DT, PLAYER_RADIUS, SIM_DT } from '../config/constants';
import { keyboard } from '../core/input';
import type { InputFrame } from '../core/input';
import { DEPTH_UI } from '../core/projection';
import { FieldView } from '../render/FieldView';
import { DebugOverlay } from '../render/DebugOverlay';
import { PlayersView } from '../render/PlayersView';
import { createWorld, stepWorld } from '../sim/world';
import type { World } from '../sim/world';
import { CREAM_CSS, FONT_TITLE, INK_CSS } from '../art/style';

/**
 * Partida. Fase 3: dois humanos movendo jogadores ao mesmo tempo, em passo fixo.
 */
export class MatchScene extends Phaser.Scene {
  private world!: World;
  private debug!: DebugOverlay;
  private playersView!: PlayersView;
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
    });
  }

  override update(_time: number, deltaMs: number): void {
    const frameDt = Math.min(deltaMs / 1000, MAX_FRAME_DT);

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

    const alpha = this.paused ? 1 : this.accumulator / SIM_DT;
    this.playersView.update(this.world, alpha);
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

  private drawDebug(): void {
    this.debug.beginFrame();
    if (this.debug.isVisible()) {
      for (const p of this.world.players) {
        const color = p.team === 0 ? 0xff8080 : 0x80b0ff;
        this.debug.circle(p.x, p.y, PLAYER_RADIUS, color);
        this.debug.label(p.x, p.y + 0.9, `${p.number} (${p.x.toFixed(1)}, ${p.y.toFixed(1)}) ${Math.hypot(p.vx, p.vy).toFixed(1)}m/s`);
      }
      this.debug.setInfo(`DEBUG · t=${this.world.time.toFixed(1)}s · mouse = coordenadas do mundo no chão`);
    }
    this.debug.endFrame();
  }
}
