/**
 * Preferência de som (volume master e mudo), guardada no `localStorage`.
 *
 * O armazenamento pode não existir ou lançar exceção (janela anônima, dados bloqueados): toda
 * leitura e escrita fica em try/catch e, sem ele, valem os padrões.
 */
import { AUDIO_DEFAULT_VOLUME, AUDIO_VOLUME_STEP } from '../config/constants';

export const AUDIO_STORAGE_KEY = 'derby-pvp-som';

export interface AudioSettings {
  /** Volume master (0..1, em passos de AUDIO_VOLUME_STEP). */
  volume: number;
  muted: boolean;
}

/** O mínimo do `Storage` que usamos (facilita os testes). */
export type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

export function defaultAudioSettings(): AudioSettings {
  return { volume: AUDIO_DEFAULT_VOLUME, muted: false };
}

/** Volume limitado a 0..1 e arredondado ao passo (sem 0,30000000000000004). */
export function normalizeVolume(v: number): number {
  if (!Number.isFinite(v)) return AUDIO_DEFAULT_VOLUME;
  const steps = Math.round(Math.max(0, Math.min(1, v)) / AUDIO_VOLUME_STEP);
  return Math.round(steps * AUDIO_VOLUME_STEP * 1000) / 1000;
}

/** Lê a preferência guardada; qualquer problema (ausente, inválida, erro) dá o padrão. */
export function loadAudioSettings(storage: SettingsStorage | null): AudioSettings {
  const out = defaultAudioSettings();
  if (!storage) return out;
  try {
    const raw = storage.getItem(AUDIO_STORAGE_KEY);
    if (!raw) return out;
    const data: unknown = JSON.parse(raw);
    if (typeof data !== 'object' || data === null) return out;
    const o = data as Record<string, unknown>;
    if (typeof o.volume === 'number' && Number.isFinite(o.volume)) out.volume = normalizeVolume(o.volume);
    if (typeof o.muted === 'boolean') out.muted = o.muted;
  } catch {
    // Sem acesso ao armazenamento: fica o padrão.
  }
  return out;
}

/** Guarda a preferência (falhas são ignoradas: o som continua funcionando). */
export function saveAudioSettings(storage: SettingsStorage | null, s: AudioSettings): void {
  if (!storage) return;
  try {
    storage.setItem(AUDIO_STORAGE_KEY, JSON.stringify({ volume: normalizeVolume(s.volume), muted: s.muted }));
  } catch {
    // Armazenamento cheio ou bloqueado: a preferência só não é lembrada.
  }
}

/** O `localStorage` do navegador, se puder ser acessado. */
export function browserStorage(): SettingsStorage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
