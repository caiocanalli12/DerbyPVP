/**
 * Jogadores na tela: sprites desenhados por código que espelham a simulação
 * (posição interpolada, ordenação por Y, sombra no chão, animação a 12–15 qps).
 */
import Phaser from 'phaser';
import { CELEBRATION_HOP, PLAYER_RADIUS } from '../config/constants';
import { DEPTH_SHADOWS, depthFor, PPM, project } from '../core/projection';
import { displayScale, ORIGIN_TALL, ORIGIN_WIDE } from '../art/player-art';
import { playerTextureKey } from '../art/match-art';
import type { Match } from '../sim/match';
import type { SimEvent } from '../sim/events';
import { PlayerAnimator } from './PlayerAnimator';
import type { WeatherId } from '../data/weather';
import { shadowCount, shadowsAt } from './shadows';
import type { ShadowCast } from './shadows';

/**
 * Posiciona as elipses de sombra no chão: cada uma deslocada e alongada na direção da luz,
 * com rx/ry (m) do objeto.
 */
export function drawShadows(
  ellipses: Phaser.GameObjects.Ellipse[],
  casts: ShadowCast[],
  x: number,
  y: number,
  rx: number,
  ry: number,
  alphaScale = 1,
): void {
  ellipses.forEach((e, i) => {
    const c = casts[i];
    if (!c) {
      e.setVisible(false);
      return;
    }
    const len = Math.hypot(c.dx, c.dy);
    const cx = x + c.dx * (c.stretch * 0.5 + 0.5);
    const cy = y + c.dy * (c.stretch * 0.5 + 0.5);
    const p = project(cx, cy, 0);
    const tip = project(cx + (len > 0 ? c.dx / len : 1), cy + (len > 0 ? c.dy / len : 0), 0);
    const rot = len > 0 ? Math.atan2(tip.y - p.y, tip.x - p.x) : 0;
    e.setVisible(true)
      .setPosition(p.x, p.y)
      .setDisplaySize(rx * 2 * c.stretch * PPM * p.scale, ry * 2 * PPM * p.scale)
      .setRotation(rot)
      .setAlpha(c.alpha * alphaScale);
  });
}

interface PlayerGfx {
  shadows: Phaser.GameObjects.Ellipse[];
  sprite: Phaser.GameObjects.Image;
  anim: PlayerAnimator;
}

export class PlayersView {
  private readonly gfx: PlayerGfx[] = [];
  private readonly scale = displayScale(PPM);

  constructor(
    scene: Phaser.Scene,
    match: Match,
    private readonly weather: WeatherId,
  ) {
    for (const p of match.world.players) {
      const shadows = Array.from({ length: shadowCount(weather) }, () =>
        scene.add.ellipse(0, 0, 1, 1, 0x1a1410, 0.3).setDepth(DEPTH_SHADOWS),
      );
      const sprite = scene.add.image(0, 0, playerTextureKey(p.id));
      this.gfx.push({ shadows, sprite, anim: new PlayerAnimator() });
    }
  }

  /** Eventos da simulação que disparam animações de ação. */
  onEvent(e: SimEvent, match: Match): void {
    if (e.type === 'pass') {
      const p = match.world.players[e.player];
      this.gfx[e.player]?.anim.trigger(p?.role === 'GK' ? 'gkThrow' : 'pass');
    } else if (e.type === 'shot') {
      this.gfx[e.player]?.anim.trigger('kick');
    }
  }

  /** Pênalti batido: o batedor faz o golpe. */
  onPenaltyKick(playerId: number): void {
    this.gfx[playerId]?.anim.trigger('kick');
  }

  /** Atualiza a partir da simulação; `alpha` interpola entre o passo anterior e o atual. */
  update(match: Match, alpha: number, timeSec: number, dt: number): void {
    const world = match.world;
    const frozen =
      match.phase === 'SAIDA_DE_BOLA' ||
      match.phase === 'INTERVALO' ||
      match.phase === 'PRORROGACAO' ||
      match.phase === 'FIM' ||
      (match.phase === 'PENALTIS' && match.attempt?.phase !== 'flight');
    const lastGoal = match.goals[match.goals.length - 1];
    const scorer = match.phase === 'COMEMORACAO_GOL' && lastGoal && !lastGoal.ownGoal ? lastGoal.scorer : null;
    const attempt = match.attempt;

    world.players.forEach((p, i) => {
      const g = this.gfx[i];
      if (!g) return;
      const x = p.prevX + (p.x - p.prevX) * alpha;
      const y = p.prevY + (p.y - p.prevY) * alpha;
      const ground = project(x, y, 0);
      const s = ground.scale;

      drawShadows(g.shadows, shadowsAt(this.weather, x, y), x, y, PLAYER_RADIUS * 1.15, PLAYER_RADIUS * 0.52);

      const keeper = p.role === 'GK' ? world.keepers[p.team] : null;
      const charging =
        (world.humans[p.team].charging && world.controlled[p.team] === p.id) ||
        (attempt !== null && attempt.kicker === p.id && attempt.charging);
      const a = g.anim.update(
        p,
        {
          time: timeSec,
          charging,
          dribbling: world.ball.owner === p.id && !world.ballInHands,
          celebrating: scorer === p.id,
          keeperMode: keeper ? keeper.mode : null,
          diveY: keeper ? keeper.diveY : 0,
          frozen,
        },
        dt,
      );
      const origin = a.wide ? ORIGIN_WIDE : ORIGIN_TALL;
      // O autor do gol pula de alegria.
      const hop = scorer === p.id ? Math.abs(Math.sin(timeSec * 9)) * CELEBRATION_HOP * s : 0;
      g.sprite
        .setFrame(a.frame)
        .setOrigin(origin.x, origin.y)
        .setPosition(ground.x, ground.y - hop)
        .setScale(this.scale * s * a.sx, this.scale * s * a.sy)
        .setFlipX(a.flipX)
        .setRotation(a.rotation)
        .setDepth(depthFor(y));
    });
  }

  destroy(): void {
    for (const g of this.gfx) {
      for (const sh of g.shadows) sh.destroy();
      g.sprite.destroy();
    }
    this.gfx.length = 0;
  }
}
