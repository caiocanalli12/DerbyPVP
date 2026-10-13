/**
 * Texturas de uma partida: só os dois times em campo, nos uniformes que vão ser usados.
 * A geração é feita aos poucos (alguns quadros de animação por vez) para a tela não engasgar.
 */
import type Phaser from 'phaser';
import { ART_STEP_BUDGET_MS, ART_STEP_FRAME_SHARE, ART_STEP_MAX_BUDGET_MS } from '../config/constants';
import { Rng } from '../core/rng';
import type { TeamId } from '../data/teams';
import type { KitChoice } from '../sim/kits';
import { ROLE_NUMBER, ROLES } from '../sim/player';
import { generateBallTextures } from './ball-art';
import { HAIR_COLORS, HAIR_STYLES, playerTextureStepCount, playerTextureSteps, SKIN_TONES } from './player-art';
import { UPLOAD_NEXT } from './canvas';
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

export interface ArtStep {
  /** Progresso da geração (0..1). */
  progress: number;
  /** O próximo passo envia uma textura grande para a GPU. */
  uploadNext: boolean;
}

/**
 * Gera as texturas da partida aos poucos (alguns quadros de animação de jogador por passo).
 * Registra a assinatura no registry do jogo ao terminar. Use `advanceArt` para avançar.
 */
export function* generateMatchArt(
  scene: Phaser.Scene,
  looks: readonly PlayerLook[],
  indicatorColors: readonly [number, number],
  signature: string,
): Generator<ArtStep, void, void> {
  // As texturas antigas vão sendo trocadas: até terminar, nenhuma partida as considera prontas.
  scene.registry.set('matchArtSignature', null);
  generateBallTextures(scene);
  for (const c of indicatorColors) generateIndicatorTextures(scene, c);
  const total = looks.reduce((n, look) => n + playerTextureStepCount(look), 0);
  let done = 0;
  const step = (uploadNext: boolean): ArtStep => ({ progress: 0.05 + 0.95 * Math.min(1, ++done / total), uploadNext });
  yield { progress: 0.05, uploadNext: false };
  // Primeiro desenha todos os jogadores, em fatias pequenas...
  const players = looks.map((look, i) => playerTextureSteps(scene, playerTextureKey(i), look));
  for (const gen of players) {
    for (let r = gen.next(); !r.done && r.value !== UPLOAD_NEXT; r = gen.next()) yield step(false);
  }
  // ...depois envia cada atlas para a GPU, um por passo (cada envio leva alguns ms).
  for (const gen of players) {
    yield step(true);
    gen.next();
  }
  scene.registry.set('matchArtSignature', signature);
}

/** Orçamento (ms) de geração para um quadro que durou `frameMs`. */
export function artBudgetMs(frameMs: number): number {
  return Math.min(ART_STEP_MAX_BUDGET_MS, Math.max(ART_STEP_BUDGET_MS, frameMs * ART_STEP_FRAME_SHARE));
}

/**
 * Avança a geração por até `budgetMs` neste quadro, para a animação da tela não engasgar. O envio
 * de uma textura para a GPU sempre começa num quadro novo. Devolve o último passo, ou null quando
 * terminou.
 */
export function advanceArt(gen: Generator<ArtStep, void, void>, budgetMs: number): ArtStep | null {
  const start = performance.now();
  for (;;) {
    const r = gen.next();
    if (r.done) return null;
    if (r.value.uploadNext || performance.now() - start >= budgetMs) return r.value;
  }
}

export function matchArtReady(scene: Phaser.Scene, signature: string): boolean {
  return scene.registry.get('matchArtSignature') === signature;
}
