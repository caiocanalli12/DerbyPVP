/**
 * Comandos do visitante pela rede (lógica pura).
 *
 * O visitante manda, a cada tick, a direção atual e se o chute está preso, mais contadores
 * acumulados de "apertou o passe", "apertou o chute" e "soltou o chute". Como os contadores só
 * crescem, um pacote perdido ou atrasado não perde nenhum toque: o próximo pacote traz a conta
 * certa e o anfitrião gera as bordas que faltaram (`RemoteSource`).
 */
import { emptyCommand } from '../sim/command';
import type { AimDir, CommandSource, TeamCommand } from '../sim/command';
import { PROTOCOL_VERSION } from './protocol';
import type { InputMessage } from './protocol';

/** Casas decimais da direção nos pacotes (3: a diagonal 0,707 fica com tamanho < 1). */
const MOVE_DECIMALS = 1000;

/** Lado do visitante: transforma o comando de cada tick na mensagem `input`. */
export class GuestInputTracker {
  private seq = 0;
  private pass = 0;
  private shootPress = 0;
  private shootRelease = 0;

  /** Mensagem do tick `tick` (o número de sequência cresce a cada chamada). */
  next(tick: number, c: TeamCommand): InputMessage {
    if (c.passPressed) this.pass++;
    if (c.shootPressed) this.shootPress++;
    if (c.shootReleased) this.shootRelease++;
    return {
      type: 'input',
      v: PROTOCOL_VERSION,
      seq: ++this.seq,
      tick,
      mx: Math.round(c.moveX * MOVE_DECIMALS) / MOVE_DECIMALS,
      my: Math.round(c.moveY * MOVE_DECIMALS) / MOVE_DECIMALS,
      held: c.shootHeld,
      aim: c.aimDir ?? 0,
      pass: this.pass,
      sp: this.shootPress,
      sr: this.shootRelease,
    };
  }

  /** Último número de sequência mandado. */
  get lastSeq(): number {
    return this.seq;
  }
}

/**
 * Lado do anfitrião: o comando do visitante, a partir da mensagem mais recente.
 *
 * - Direção, mira do pênalti e chute preso: os da mensagem mais recente.
 * - Passe: um "apertou" por tick enquanto o contador recebido estiver à frente do aplicado.
 * - Chute: um botão lógico. Preso e há um "soltou" pendente: solta. Solto e há um "apertou"
 *   pendente: aperta (e, se o "soltou" também já veio, solta no mesmo tick: um toque).
 */
export class RemoteSource implements CommandSource {
  private latest: InputMessage | null = null;
  private passSeen = 0;
  private pressSeen = 0;
  private releaseSeen = 0;
  private held = false;
  private lastTick: number | null = null;
  private last: TeamCommand = emptyCommand();
  /** Número de sequência da mensagem usada no último comando (vai no snapshot). */
  ack = 0;

  /** Guarda a mensagem se for mais nova que a atual (atrasadas e repetidas são ignoradas). */
  receive(msg: InputMessage): void {
    if (this.latest && msg.seq <= this.latest.seq) return;
    // Contadores nunca voltam: uma mensagem que voltaria atrás é descartada.
    if (this.latest && (msg.pass < this.latest.pass || msg.sp < this.latest.sp || msg.sr < this.latest.sr)) return;
    this.latest = msg;
  }

  getCommand(tick: number): TeamCommand {
    if (tick === this.lastTick) return this.last;
    this.lastTick = tick;
    const m = this.latest;
    if (!m) {
      this.last = emptyCommand();
      return this.last;
    }
    this.ack = m.seq;
    let pass = false;
    if (m.pass > this.passSeen) {
      pass = true;
      this.passSeen++;
    }
    let pressed = false;
    let released = false;
    if (this.held) {
      if (m.sr > this.releaseSeen) {
        released = true;
        this.held = false;
        this.releaseSeen++;
      }
    } else if (m.sp > this.pressSeen) {
      pressed = true;
      this.held = true;
      this.pressSeen++;
      if (m.sr > this.releaseSeen) {
        released = true;
        this.held = false;
        this.releaseSeen++;
      }
    }
    // Sem bordas pendentes, o botão segue o estado mandado (corrige qualquer desencontro).
    if (!pressed && !released && m.sp === this.pressSeen && m.sr === this.releaseSeen) this.held = m.held;
    const l = Math.hypot(m.mx, m.my);
    const k = l > 1 ? 1 / l : 1;
    this.last = {
      moveX: m.mx * k,
      moveY: m.my * k,
      passPressed: pass,
      shootHeld: this.held,
      shootReleased: released,
      shootPressed: pressed,
      aimDir: m.aim as AimDir,
    };
    return this.last;
  }
}
