/**
 * Códigos de sala do modo online (lógica pura).
 *
 * 5 caracteres de um alfabeto sem os ambíguos (sem 0/O e 1/I/L), fáceis de ditar e digitar. A
 * entrada aceita minúsculas, espaços e hífens. O código vira o id do anfitrião no servidor público
 * da PeerJS, com um prefixo para não colidir com ids de outros sites.
 */

/** Letras e números sem 0, O, 1, I e L. */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 5;
/** Prefixo do id do anfitrião no servidor de sinalização. */
export const ROOM_PEER_PREFIX = 'derby-pvp-sala-';
/** Parâmetro da URL do link da sala (`?sala=CODIGO`). */
export const ROOM_URL_PARAM = 'sala';

/** Código novo. `random` em [0, 1) (padrão: Math.random). */
export function generateRoomCode(random: () => number = Math.random): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const k = Math.min(ROOM_CODE_ALPHABET.length - 1, Math.floor(random() * ROOM_CODE_ALPHABET.length));
    code += ROOM_CODE_ALPHABET[k];
  }
  return code;
}

/**
 * Código digitado ou colado → código válido (maiúsculas, sem espaços e hífens), ou null se não
 * tiver 5 caracteres do alfabeto.
 */
export function normalizeRoomCode(raw: string): string | null {
  const code = raw.toUpperCase().replace(/[\s-]+/g, '');
  if (code.length !== ROOM_CODE_LENGTH) return null;
  for (const ch of code) if (!ROOM_CODE_ALPHABET.includes(ch)) return null;
  return code;
}

/** Um caractere digitado vale no código? (para o campo de digitação). */
export function isRoomCodeChar(ch: string): boolean {
  return ch.length === 1 && ROOM_CODE_ALPHABET.includes(ch.toUpperCase());
}

/** Id do anfitrião da sala no servidor de sinalização. */
export function roomPeerId(code: string): string {
  return `${ROOM_PEER_PREFIX}${code}`;
}

/** Link da sala: a página atual com `?sala=CODIGO` (sem os outros parâmetros). */
export function roomLink(code: string, location: { origin: string; pathname: string }): string {
  return `${location.origin}${location.pathname}?${ROOM_URL_PARAM}=${code}`;
}

/** Código do link (`?sala=`), se houver e for válido. */
export function roomCodeFromSearch(search: string): string | null {
  const raw = new URLSearchParams(search).get(ROOM_URL_PARAM);
  return raw === null ? null : normalizeRoomCode(raw);
}
