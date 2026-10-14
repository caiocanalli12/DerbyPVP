/**
 * Sons da partida como eventos da simulação (lógica pura).
 *
 * A cada passo, a partida transforma o que aconteceu naquele passo (chute, passe, apito, gol,
 * defesa) numa lista de `SoundEvent`, cada um com um id crescente. O áudio só toca o que recebe:
 * nada é disparado pela renderização. No online, o visitante recebe estes mesmos eventos do
 * anfitrião, e o id garante que nenhum toque duas vezes.
 */
import type { SimEvent } from './events';
import type { MatchEvent } from './match';

/** Padrões do apito: 1 curto (saída de bola), 2 curtos (fim de um tempo), 3 com o último longo (fim de jogo). */
export type WhistlePattern = 'short' | 'double' | 'final';

/** O que tocar. `x` é a posição X da bola no campo (m), para o pan estéreo. */
export type SoundCue =
  | { type: 'kick'; x: number; /** Força do chute (0..1). */ power: number }
  | { type: 'pass'; x: number }
  | { type: 'whistle'; x: number; pattern: WhistlePattern }
  | { type: 'goal'; x: number }
  | { type: 'save'; x: number };

export type SoundType = SoundCue['type'];

export type SoundEvent = SoundCue & { /** Único e crescente dentro da partida. */ id: number };

/**
 * Sons de um passo, a partir dos eventos do mundo e da partida emitidos nele.
 *
 * - chute (`shot`) e cobrança de pênalti: `kick` com a força;
 * - passe (inclusive o da saída de bola e o lançamento do goleiro): `pass`;
 * - defesa do goleiro (segura ou espalma): `save`;
 * - gol (inclusive gol de pênalti): `goal`;
 * - apito: 1 curto na saída de bola (e antes de cada pênalti), 2 curtos no fim de um tempo e 3 no
 *   fim de jogo (o fim do 2º tempo com vencedor dá só os 3).
 */
export function soundCues(
  simEvents: readonly SimEvent[],
  matchEvents: readonly MatchEvent[],
  ballX: number,
): SoundCue[] {
  const cues: SoundCue[] = [];
  for (const e of simEvents) {
    if (e.type === 'shot') cues.push({ type: 'kick', x: ballX, power: clamp01(e.charge) });
    else if (e.type === 'pass') cues.push({ type: 'pass', x: ballX });
    else if (e.type === 'save') cues.push({ type: 'save', x: ballX });
  }
  let periodEnd = false;
  let final = false;
  for (const e of matchEvents) {
    switch (e.type) {
      case 'whistle':
        cues.push({ type: 'whistle', x: ballX, pattern: 'short' });
        break;
      case 'periodEnd':
        periodEnd = true;
        break;
      case 'finalWhistle':
        final = true;
        break;
      case 'goal':
        cues.push({ type: 'goal', x: ballX });
        break;
      case 'penaltyKick':
        cues.push({ type: 'kick', x: ballX, power: clamp01(e.power) });
        break;
      case 'penaltyResult':
        if (e.result === 'goal') cues.push({ type: 'goal', x: ballX });
        break;
    }
  }
  if (final) cues.push({ type: 'whistle', x: ballX, pattern: 'final' });
  else if (periodEnd) cues.push({ type: 'whistle', x: ballX, pattern: 'double' });
  return cues;
}

function clamp01(v: number): number {
  return Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0;
}
