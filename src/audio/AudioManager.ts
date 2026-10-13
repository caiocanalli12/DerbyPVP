/**
 * Ponto único de áudio. Nesta versão não há som: os métodos são vazios,
 * mas já são chamados nos lugares certos para o áudio entrar depois sem refatorar.
 */
export type AudioEvent =
  | 'chute'
  | 'passe'
  | 'gol'
  | 'apito'
  | 'apito-final'
  | 'dividida'
  | 'defesa'
  | 'trave'
  | 'torcida'
  | 'menu-mover'
  | 'menu-confirmar'
  | 'menu-voltar';

export class AudioManager {
  play(_eventName: AudioEvent): void {
    // Sem som nesta versão.
  }

  stopAll(): void {
    // Sem som nesta versão.
  }
}

export const audio = new AudioManager();
