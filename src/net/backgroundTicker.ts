/**
 * Batida de 60 Hz para quando a aba fica oculta (partida online).
 *
 * O navegador congela o `requestAnimationFrame` (e o laço do Phaser) em abas ocultas e segura os
 * timers da página; os de um Web Worker dedicado continuam. Então, com a aba oculta, um worker
 * criado na hora (código embutido, sem arquivo à parte) avisa 60 vezes por segundo e a partida
 * avança por ele; com a aba visível, ele para e o laço normal volta.
 */
const WORKER_CODE = `let id = null;
onmessage = (e) => {
  if (e.data === 'start' && id === null) id = setInterval(() => postMessage(0), ${1000 / 60});
  if (e.data === 'stop' && id !== null) { clearInterval(id); id = null; }
};`;

export class BackgroundTicker {
  private worker: Worker | null = null;
  private url: string | null = null;
  private running = false;

  constructor(private readonly onTick: () => void) {}

  /** Começa a bater (se o navegador tiver Worker; senão, não faz nada). */
  start(): void {
    if (this.running) return;
    try {
      if (!this.worker) {
        if (typeof Worker === 'undefined' || typeof Blob === 'undefined') return;
        this.url = URL.createObjectURL(new Blob([WORKER_CODE], { type: 'text/javascript' }));
        this.worker = new Worker(this.url);
        this.worker.onmessage = () => {
          if (this.running) this.onTick();
        };
      }
      this.worker.postMessage('start');
      this.running = true;
    } catch (err) {
      console.warn('[online] sem batida em segundo plano:', err);
    }
  }

  stop(): void {
    if (!this.running) return;
    this.running = false;
    this.worker?.postMessage('stop');
  }

  get active(): boolean {
    return this.running;
  }

  destroy(): void {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    if (this.url) URL.revokeObjectURL(this.url);
    this.url = null;
  }
}
