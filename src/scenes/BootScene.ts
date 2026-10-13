import Phaser from 'phaser';

/**
 * Inicialização. As fontes já estão prontas (main.ts espera document.fonts.ready).
 * Segue para a tela inicial.
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
    // Atalho de teste: ?t1=XXX&t2=YYY (ou ?weather=...) vai direto para a partida.
    const q = new URLSearchParams(window.location.search);
    if (q.has('t1') || q.has('t2') || q.has('weather')) {
      this.scene.start('MatchScene');
      return;
    }
    this.scene.start('TitleScene');
  }
}
