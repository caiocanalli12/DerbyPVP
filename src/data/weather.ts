/**
 * Climas sorteados a cada partida. Mudam só a iluminação, as sombras e o céu: nunca a física.
 */
export type WeatherId = 'sunny' | 'sunset' | 'night' | 'rain';

export interface Weather {
  id: WeatherId;
  /** Texto do cartaz da tela VS ("HOJE: ..."). */
  label: string;
}

export const WEATHERS: readonly Weather[] = [
  { id: 'sunny', label: 'DIA ENSOLARADO' },
  { id: 'sunset', label: 'PÔR DO SOL' },
  { id: 'night', label: 'NOITE DE REFLETORES' },
  { id: 'rain', label: 'DIA CHUVOSO' },
];

export function getWeather(id: WeatherId): Weather {
  return WEATHERS.find((w) => w.id === id) ?? WEATHERS[0]!;
}

export function isWeatherId(v: string): v is WeatherId {
  return WEATHERS.some((w) => w.id === v);
}

/** Sorteia um clima (uniforme entre os 4). */
export function randomWeather(random: () => number): WeatherId {
  return WEATHERS[Math.floor(random() * WEATHERS.length) % WEATHERS.length]!.id;
}
