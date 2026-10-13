/**
 * Texturas de uma partida: só os dois times em campo, nos uniformes que vão ser usados.
 * A geração é feita aos poucos (um jogador por vez) para a tela de carregamento andar.
 */
import type Phaser from 'phaser';
import { Rng } from '../core/rng';
import type { TeamId } from '../data/teams';
import type { KitChoice } from '../sim/kits';
import { ROLE_NUMBER, ROLES } from '../sim/player';
import { generateBallTextures } from './ball-art';
import { generatePlayerTexture, HAIR_COLORS, HAIR_STYLES, SKIN_TONES } from './player-art';
import type { PlayerLook } from './player-art';
import { generateIndicatorTextures } from './ui-art';

export function playerTextureKey(playerId: number): string {
  return `player-${playerId}`;
}

/** Aparência dos 10 jogadores (ids 0–4 = J1, 5–9 = J2, na ordem de ROLES). */
export function buildLooks(teams: readonly [TeamId, TeamId], kits: KitChoice, seed: number): PlayerLook[] {
  const looks: PlayerLook[] = [];
  for (const team of [0, 1] as const) {
    const rng = new Rng(seed * 31 + team * 977 + teams[team].charCodeAt(0) * 13);
    // Tons de pele variados dentro do time (sem repetir enquanto houver opções).
    const skins = [...SKIN_TONES];
    for (let i = skins.length - 1; i > 0; i--) {
      const k = rng.int(0, i);
      [skins[i], skins[k]] = [skins[k]!, skins[i]!];
    }
    ROLES.forEach((role, i) => {
      const skin = skins[i % skins.length]!;
      const dark = SKIN_TONES.indexOf(skin) >= 4;
      const hairColor = dark ? rng.pick(HAIR_COLORS.slice(0, 2)) : rng.pick(HAIR_COLORS);
      looks.push({
        kit: kits.kits[team],
        isKeeper: role === 'GK',
        keeperColor: kits.keeperColors[team],
        skin,
        hair: rng.pick(HAIR_STYLES),
        hairColor,
        number: ROLE_NUMBER[role],
        seed: seed + team * 10 + i,
      });
    });
  }
  return looks;
}

/** Assinatura de uma partida (para não regerar as mesmas texturas). */
export function artSignature(teams: readonly [TeamId, TeamId], kits: KitChoice, seed: number): string {
  return `${teams[0]}:${kits.variants[0]}|${teams[1]}:${kits.variants[1]}|${seed}`;
}

/**
 * Gera as texturas da partida aos poucos. Cada `next()` faz uma parte e devolve o progresso
 * (0..1). Registra a assinatura no registry do jogo ao terminar.
 */
export function* generateMatchArt(
  scene: Phaser.Scene,
  looks: readonly PlayerLook[],
  indicatorColors: readonly [number, number],
  signature: string,
): Generator<number, void, void> {
  generateBallTextures(scene);
  for (const c of indicatorColors) generateIndicatorTextures(scene, c);
  yield 0.05;
  for (let i = 0; i < looks.length; i++) {
    generatePlayerTexture(scene, playerTextureKey(i), looks[i]!);
    yield 0.05 + (0.95 * (i + 1)) / looks.length;
  }
  scene.registry.set('matchArtSignature', signature);
}

export function matchArtReady(scene: Phaser.Scene, signature: string): boolean {
  return scene.registry.get('matchArtSignature') === signature;
}
