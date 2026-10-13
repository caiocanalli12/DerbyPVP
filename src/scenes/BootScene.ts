import Phaser from 'phaser';

/**
 * Inicialização. As fontes já estão prontas (main.ts espera document.fonts.ready).
 * Nas próximas fases, gera as texturas comuns e segue para o menu.
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    this.scene.start('MatchScene');
  }
}
