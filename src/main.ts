import '@fontsource/limelight/400.css';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/700.css';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config/constants';
import { FONT_TEXT, FONT_TITLE } from './art/style';
import { BootScene } from './scenes/BootScene';
import { MatchScene } from './scenes/MatchScene';
import { ArtPreviewScene } from './scenes/ArtPreviewScene';
import { TitleScene } from './scenes/TitleScene';
import { MainMenuScene } from './scenes/MainMenuScene';
import { TeamSelectScene } from './scenes/TeamSelectScene';
import { VersusScene } from './scenes/VersusScene';
import { PauseScene } from './scenes/PauseScene';
import { ResultScene } from './scenes/ResultScene';
import { SoloSetupScene } from './scenes/SoloSetupScene';
import { BracketScene } from './scenes/BracketScene';
import { ChampionScene } from './scenes/ChampionScene';
import { OverlayScene } from './scenes/OverlayScene';
import { keyboard } from './core/input';
import { audio } from './audio/AudioManager';
import { setBallFavicon } from './art/ball-art';

/** Força o download das fontes empacotadas e espera ficarem prontas. */
async function loadFonts(): Promise<void> {
  try {
    await Promise.all([
      document.fonts.load(`400 48px "${FONT_TITLE}"`),
      document.fonts.load(`400 32px "${FONT_TEXT}"`),
      document.fonts.load(`700 32px "${FONT_TEXT}"`),
    ]);
  } catch (err) {
    console.warn('Falha ao carregar fontes; seguindo com as de reserva.', err);
  }
  await document.fonts.ready;
}

async function start(): Promise<void> {
  setBallFavicon();
  await loadFonts();
  document.getElementById('loading')?.remove();

  // Teclado próprio (KeyboardEvent.code + ';' do ABNT2), ligado à janela.
  keyboard.attach(window);
  // Som: o primeiro clique ou tecla cria o AudioContext (autoplay); M liga/desliga.
  audio.attach(window);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    backgroundColor: '#000000',
    banner: false,
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      pixelArt: false,
      antialias: true,
    },
    // O teclado é tratado por core/input.ts (precisa de KeyboardEvent.code e do ';' do ABNT2).
    input: {
      keyboard: false,
    },
    scene: [
      BootScene,
      TitleScene,
      MainMenuScene,
      TeamSelectScene,
      SoloSetupScene,
      BracketScene,
      VersusScene,
      MatchScene,
      PauseScene,
      ResultScene,
      ChampionScene,
      ArtPreviewScene,
      // Por último: desenha por cima de todas as outras.
      OverlayScene,
    ],
  });

  // Ferramenta de inspeção: com ?debug na URL, o jogo e o áudio ficam acessíveis no console.
  if (new URLSearchParams(window.location.search).has('debug')) {
    Object.assign(window, { derby: game, derbyAudio: audio });
  }
}

void start();
