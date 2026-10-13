import '@fontsource/limelight/400.css';
import '@fontsource/oswald/400.css';
import '@fontsource/oswald/700.css';
import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from './config/constants';
import { FONT_TEXT, FONT_TITLE } from './art/style';
import { BootScene } from './scenes/BootScene';
import { MatchScene } from './scenes/MatchScene';

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
  await loadFonts();
  document.getElementById('loading')?.remove();

  new Phaser.Game({
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
    scene: [BootScene, MatchScene],
  });
}

void start();
