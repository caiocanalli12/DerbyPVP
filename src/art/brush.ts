/**
 * Ferramentas de "pincel" para o desenho estilo 1930 em Canvas 2D:
 * contornos marrom-quase-preto mais grossos embaixo, membros de mangueira em Bézier,
 * olhos pie-cut e cores com sombra fria.
 */
import type { Ctx } from './canvas';
import { INK_CSS } from './style';

export interface P {
  x: number;
  y: number;
}

/** Deslocamento extra do contorno para baixo (deixa a linha mais grossa embaixo). */
const DROP = 0.9;

export function css(color: number, alpha = 1): string {
  const r = (color >> 16) & 0xff;
  const g = (color >> 8) & 0xff;
  const b = color & 0xff;
  return alpha >= 1 ? `rgb(${r},${g},${b})` : `rgba(${r},${g},${b},${alpha})`;
}

/** Mistura duas cores (0..1). */
export function mix(a: number, b: number, t: number): number {
  const ch = (c: number, s: number): number => (c >> s) & 0xff;
  const m = (s: number): number => Math.round(ch(a, s) + (ch(b, s) - ch(a, s)) * t);
  return (m(16) << 16) | (m(8) << 8) | m(0);
}

/** Sombra em tom frio (não preto): mistura com um azul-ardósia. */
export function shade(color: number, amount = 0.28): number {
  return mix(color, 0x2b3550, amount);
}

/** Luz quente. */
export function light(color: number, amount = 0.25): number {
  return mix(color, 0xfff4dc, amount);
}

/**
 * Preenche um caminho com contorno de pincel: a tinta é aplicada também um pouco abaixo,
 * o que deixa o traço mais grosso na parte de baixo.
 */
export function inkFill(ctx: Ctx, path: () => void, fill: string | CanvasGradient, line: number): void {
  ctx.save();
  ctx.translate(0, DROP);
  ctx.beginPath();
  path();
  ctx.lineWidth = line;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  path();
  ctx.lineWidth = line;
  ctx.strokeStyle = INK_CSS;
  ctx.stroke();
  ctx.fillStyle = fill;
  ctx.fill();
}

/** Ponto de uma curva quadrática. */
export function quadAt(a: P, c: P, b: P, t: number): P {
  const u = 1 - t;
  return { x: u * u * a.x + 2 * u * t * c.x + t * t * b.x, y: u * u * a.y + 2 * u * t * c.y + t * t * b.y };
}

/** Sub-curva [t0, t1] de uma quadrática (de Casteljau). */
export function quadSub(a: P, c: P, b: P, t0: number, t1: number): [P, P, P] {
  const p0 = quadAt(a, c, b, t0);
  const p2 = quadAt(a, c, b, t1);
  // Controle da sub-curva: interseção das tangentes (fórmula fechada para quadráticas).
  const lerp = (p: P, q: P, t: number): P => ({ x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t });
  const c1 = lerp(lerp(a, c, t0), lerp(c, b, t0), t1);
  return [p0, c1, p2];
}

/** Tangente (normalizada) no fim de uma quadrática. */
export function quadEndDir(c: P, b: P): P {
  const dx = b.x - c.x;
  const dy = b.y - c.y;
  const l = Math.hypot(dx, dy) || 1;
  return { x: dx / l, y: dy / l };
}

export interface HoseSegment {
  /** Fim do trecho (0..1 ao longo do membro). */
  to: number;
  color: number;
}

/**
 * Membro de mangueira: curva quadrática grossa com contorno, colorida por trechos
 * (ex.: coxa em pele, canela na cor da meia).
 */
export function hose(ctx: Ctx, a: P, c: P, b: P, width: number, segments: readonly HoseSegment[], line: number): void {
  // Contorno (com o mesmo truque do pincel mais grosso embaixo).
  for (const drop of [DROP, 0]) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y + drop);
    ctx.quadraticCurveTo(c.x, c.y + drop, b.x, b.y + drop);
    ctx.lineWidth = width + line * 2;
    ctx.strokeStyle = INK_CSS;
    ctx.lineCap = 'round';
    ctx.stroke();
  }
  let t0 = 0;
  segments.forEach((seg, i) => {
    const [p0, c1, p2] = quadSub(a, c, b, t0, seg.to);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.quadraticCurveTo(c1.x, c1.y, p2.x, p2.y);
    ctx.lineWidth = width;
    ctx.strokeStyle = css(seg.color);
    ctx.lineCap = i === 0 || i === segments.length - 1 ? 'round' : 'butt';
    ctx.stroke();
    t0 = seg.to;
  });
  ctx.lineCap = 'round';
}

/** Elipse rotacionada como caminho. */
export function ellipsePath(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, rot = 0): void {
  ctx.ellipse(cx, cy, Math.max(0.1, rx), Math.max(0.1, ry), rot, 0, Math.PI * 2);
}

/**
 * Olho pie-cut (marca registrada de 1930): oval preto com uma fatia recortada,
 * sobre um branco de olho maior. `look` = direção da fatia (rad).
 */
export function pieEye(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, look: number, line: number, shut = false): void {
  if (shut) {
    // Olho fechado de alegria: arco para cima.
    ctx.beginPath();
    ctx.moveTo(cx - rx * 1.2, cy + ry * 0.25);
    ctx.quadraticCurveTo(cx, cy - ry * 0.9, cx + rx * 1.2, cy + ry * 0.25);
    ctx.lineWidth = line * 1.2;
    ctx.strokeStyle = INK_CSS;
    ctx.stroke();
    return;
  }
  inkFill(ctx, () => ellipsePath(ctx, cx, cy, rx * 1.35, ry * 1.25), '#ffffff', line * 0.8);
  const px = cx + Math.cos(look) * rx * 0.25;
  const py = cy + ry * 0.15;
  ctx.beginPath();
  ellipsePath(ctx, px, py, rx * 0.8, ry * 0.95);
  ctx.fillStyle = INK_CSS;
  ctx.fill();
  // A fatia recortada.
  ctx.beginPath();
  ctx.moveTo(px, py);
  ctx.arc(px, py, Math.max(rx, ry) * 1.1, look - Math.PI * 0.5 - 0.35, look - Math.PI * 0.5 + 0.35);
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();
}
