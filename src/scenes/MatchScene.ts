import Phaser from 'phaser';
import { FieldView } from '../render/FieldView';
import { DebugOverlay } from '../render/DebugOverlay';

/**
 * Partida. Fase 2: só o campo e o modo de depuração (tecla `).
 */
export class MatchScene extends Phaser.Scene {
  private debug!: DebugOverlay;
  private readonly onKeyDown = (e: KeyboardEvent): void => {
    if (e.code === 'Backquote' && !e.repeat) this.debug.toggle();
  };

  constructor() {
    super('MatchScene');
  }

  create(): void {
    new FieldView(this);
    this.debug = new DebugOverlay(this);
    this.debug.setInfo('DEBUG · grade a cada 5 m · mouse = coordenadas do mundo no chão');
    window.addEventListener('keydown', this.onKeyDown);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', this.onKeyDown);
      this.debug.destroy();
    });
  }

  override update(): void {
    this.debug.beginFrame();
    this.debug.endFrame();
  }
}
