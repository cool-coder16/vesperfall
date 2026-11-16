// Visual feedback for engine events: floating numbers, flashes, particle bursts and shake.
import type { GameEvent, GameState } from '../../engine/types';
import { sfx } from '../../audio/synth';
import { reducedMotion } from '../../state/store';

export function elFor(tid: string): HTMLElement | null {
  return document.querySelector(`[data-tid="${CSS.escape(tid)}"]`);
}
function center(el: HTMLElement) { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }

export function floatNumber(tid: string, text: string, cls = '') {
  const el = elFor(tid); if (!el) return;
  const { x, y } = center(el);
  const layer = document.getElementById('fx-layer'); if (!layer) return;
  const n = document.createElement('div'); n.className = `fx-num ${cls}`; n.textContent = text; n.style.left = `${x}px`; n.style.top = `${y}px`;
  layer.appendChild(n); setTimeout(() => n.remove(), 1200);
}
export function flash(tid: string, color: string) {
  const el = elFor(tid); if (!el || reducedMotion()) return;
  const { x, y } = center(el);
  const layer = document.getElementById('fx-layer'); if (!layer) return;
  const n = document.createElement('div'); n.className = 'fx-flash'; n.style.left = `${x}px`; n.style.top = `${y}px`; n.style.background = `radial-gradient(circle, ${color} 0%, transparent 70%)`;
  layer.appendChild(n); setTimeout(() => n.remove(), 700);
}
export function pulseClass(tid: string, cls: string, ms = 500) {
  const el = elFor(tid); if (!el) return;
  el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms);
}

// particle bursts on a canvas in the fx layer
let canvas: HTMLCanvasElement | null = null, ctx: CanvasRenderingContext2D | null = null, parts: { x: number; y: number; vx: number; vy: number; life: number; c: string; r: number }[] = [], raf = 0;
function ensureCanvas() {
  if (canvas) return;
  const layer = document.getElementById('fx-layer'); if (!layer) return;
  canvas = document.createElement('canvas'); canvas.className = 'fx-canvas'; layer.appendChild(canvas); ctx = canvas.getContext('2d');
  const resize = () => { if (canvas) { canvas.width = innerWidth; canvas.height = innerHeight; } }; resize(); addEventListener('resize', resize);
}
function loop() {
  if (!ctx || !canvas) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  parts = parts.filter((p) => p.life > 0);
  for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.08; p.life -= 0.025; ctx.globalAlpha = Math.max(0, p.life); ctx.fillStyle = p.c; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (parts.length) raf = requestAnimationFrame(loop); else raf = 0;
}
export function burst(tid: string, color: string, n = 24, speed = 4) {
  if (reducedMotion()) return;
  const el = elFor(tid); if (!el) return; ensureCanvas(); if (!ctx) return;
  const { x, y } = center(el);
  for (let i = 0; i < n; i++) { const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random()); parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 1, life: 1, c: color, r: 1.5 + Math.random() * 3 }); }
  if (!raf) raf = requestAnimationFrame(loop);
}
export function shake() {
  if (reducedMotion()) return;
  const m = document.querySelector('.match'); if (!m) return;
  m.classList.remove('shake'); void (m as HTMLElement).offsetWidth; m.classList.add('shake'); setTimeout(() => m.classList.remove('shake'), 400);
}

/** Plays visual + audio feedback for a batch of events. Returns the recommended delay before the next batch. */
export function playEvents(events: GameEvent[], st: GameState, myIdx: number): number {
  let delay = 0;
  const lookupName = (inst: string) => st.players[0].board.find((c) => c.inst === inst) ?? st.players[1].board.find((c) => c.inst === inst);
  for (const e of events) {
    switch (e.kind) {
      case 'draw': if (e.player === myIdx && e.inst) sfx('draw'); if (e.fatigue) { floatNumber(`hero:${e.player}`, `fatigue ${e.fatigue}`, 'wither'); } break;
      case 'play': sfx('play'); delay = Math.max(delay, 500); break;
      case 'summon': delay = Math.max(delay, 300); break;
      case 'damage': if (e.prevented) { floatNumber(e.target, 'WARDED', 'ward'); flash(e.target, 'rgba(122,240,192,0.8)'); } else if (e.amount > 0) { floatNumber(e.target, `-${e.amount}`); pulseClass(e.target, 'hit-anim'); burst(e.target, e.target.startsWith('hero') ? '#ff6b6b' : '#ffb347', 14, 3); if (e.target.startsWith('hero')) { sfx('hit'); if (e.amount >= 5) shake(); } } delay = Math.max(delay, 350); break;
      case 'heal': floatNumber(e.target, `+${e.amount}`, 'heal'); flash(e.target, 'rgba(122,240,192,0.6)'); sfx('heal'); delay = Math.max(delay, 300); break;
      case 'death': sfx('death'); pulseClass(e.inst, 'dying', 600); burst(e.inst, lookupName(e.inst) ? '#9b5cff' : '#c48cff', 26, 4); delay = Math.max(delay, 500); break;
      case 'attack': sfx('attack'); for (const a of e.attackers) pulseClass(a, st.active === myIdx ? 'lunge-up' : 'lunge-down', 450); delay = Math.max(delay, 500); break;
      case 'block': sfx('block'); for (const b of e.blockers) pulseClass(b, st.active === myIdx ? 'lunge-down' : 'lunge-up', 450); delay = Math.max(delay, 450); break;
      case 'heroHit': shake(); delay = Math.max(delay, 300); break;
      case 'buff': if (e.attack || e.health) { floatNumber(e.target, `+${e.attack}/+${e.health}`, 'buff'); flash(e.target, 'rgba(255,227,154,0.6)'); } break;
      case 'wither': floatNumber(e.target, `-${e.amount}/-${e.amount}`, 'wither'); sfx('wither'); burst(e.target, '#7af0c0', 12, 2); delay = Math.max(delay, 300); break;
      case 'keyword': floatNumber(e.target, e.keyword.toUpperCase(), 'buff'); break;
      case 'oath': sfx('spell'); flash(e.target, 'rgba(243,201,105,0.6)'); delay = Math.max(delay, 300); break;
      case 'steal': floatNumber(e.inst, 'STOLEN', 'wither'); sfx('spell'); delay = Math.max(delay, 400); break;
      case 'bounce': floatNumber(e.inst, 'RETURNED', 'buff'); break;
      case 'shackle': floatNumber(e.target, 'SHACKLED', 'wither'); break;
      case 'relic': sfx('spell'); break;
      case 'reanimate': sfx('spell'); delay = Math.max(delay, 400); break;
      case 'turnStart': if (e.player === myIdx) sfx('turn'); delay = Math.max(delay, 400); break;
      case 'gameOver': delay = Math.max(delay, 800); break;
      default: break;
    }
  }
  return delay;
}
