import Phaser from 'phaser';
import { GAME_HEIGHT, GAME_WIDTH } from '../config/constants';
import { getTeam, isTeamId } from '../data/teams';
import type { TeamId } from '../data/teams';
import { frameName, framesFor, generatePlayerTexture, HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from '../art/player-art';
import type { PlayerLook } from '../art/player-art';
import { chooseKits } from '../sim/kits';
import { FONT_TEXT } from '../art/style';

/**
 * Ferramenta de depuração (?sheet=PAL[&vs=COR][&gk=1][&zoom=2]): mostra os quadros gerados
 * de um jogador para inspecionar a arte. Não faz parte do fluxo do jogo.
 */
export class ArtPreviewScene extends Phaser.Scene {
  constructor() {
    super('ArtPreviewScene');
  }

  create(): void {
    const q = new URLSearchParams(window.location.search);
    const id = (q.get('sheet') ?? 'PAL').toUpperCase();
    const vs = (q.get('vs') ?? 'COR').toUpperCase();
    const team: TeamId = isTeamId(id) ? id : 'PAL';
    const other: TeamId = isTeamId(vs) ? vs : 'COR';
    const keeper = q.get('gk') === '1';
    const zoom = Number(q.get('zoom') ?? '1');
    const page = Number(q.get('page') ?? '0');
    const kits = chooseKits(team, other);
    const look: PlayerLook = {
      kit: kits.kits[0],
      isKeeper: keeper,
      keeperColor: kits.keeperColors[0],
      skin: SKIN_TONES[Number(q.get('skin') ?? '1') % SKIN_TONES.length]!,
      hair: HAIR_STYLES[Number(q.get('hair') ?? '0') % HAIR_STYLES.length]!,
      hairColor: HAIR_COLORS[Number(q.get('hairc') ?? '1') % HAIR_COLORS.length]!,
      number: keeper ? 1 : 9,
      seed: 3,
    };
    this.cameras.main.setBackgroundColor('#4fae3c');
    generatePlayerTexture(this, 'preview', look);
    const frames = framesFor(keeper);
    const cellW = 100 * zoom;
    const cellH = 132 * zoom;
    const cols = Math.floor(GAME_WIDTH / cellW);
    const rows = Math.floor((GAME_HEIGHT - 20) / cellH);
    const per = cols * rows;
    frames.slice(page * per, page * per + per).forEach((fr, i) => {
      const x = (i % cols) * cellW + cellW / 2;
      const y = Math.floor(i / cols) * cellH + 8;
      this.add.image(x, y, 'preview', frameName(fr.anim, fr.view, fr.frame, fr.variant)).setOrigin(0.5, 0).setScale(zoom);
      this.add
        .text(x, y + cellH - 18, `${fr.anim} ${fr.view} ${fr.frame}.${fr.variant}`, {
          fontFamily: FONT_TEXT,
          fontSize: '11px',
          color: '#ffffff',
        })
        .setOrigin(0.5, 0);
    });
    this.add.text(4, GAME_HEIGHT - 18, `${getTeam(team).name} (${kits.variants[0]}) ${frames.length} quadros`, {
      fontFamily: FONT_TEXT,
      fontSize: '14px',
      color: '#ffffff',
    });
  }
}
