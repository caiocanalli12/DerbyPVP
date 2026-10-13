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
    // Ferramenta de depuração da arte: ?sheet=TIME.
    if (new URLSearchParams(window.location.search).has('sheet')) {
      this.scene.start('ArtPreviewScene');
      return;
    }
    this.scene.start('MatchScene');
  }
}
