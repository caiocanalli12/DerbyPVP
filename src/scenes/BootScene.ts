import Phaser from 'phaser';
import { ROOM_URL_PARAM, roomCodeFromSearch } from '../net/roomCode';
import type { OnlineLobbyData } from './OnlineLobbyScene';

/**
 * Inicialização. As fontes já estão prontas (main.ts espera document.fonts.ready).
 * Segue para a tela inicial (ou, com o link de uma sala online, direto para a sala).
 */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('BootScene');
  }

  create(): void {
    // Camada de avisos (som ligado/desligado), por cima de todas as cenas.
    this.scene.launch('OverlayScene');
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
    // Link de sala online (?sala=CODIGO): entra direto na sala.
    if (q.has(ROOM_URL_PARAM)) {
      const code = roomCodeFromSearch(window.location.search);
      const data: OnlineLobbyData = code ? { mode: 'join', code } : { mode: 'join', badLink: true };
      this.scene.start('OnlineLobbyScene', data);
      return;
    }
    this.scene.start('TitleScene');
  }
}
