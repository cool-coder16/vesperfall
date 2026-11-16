// Procedural card illustrations. Every card's art is generated from its motif + seed as
// inline SVG, so the whole game ships without a single bitmap. Motifs are built from a
// small vocabulary of silhouettes, glows and particle fields, tinted by faction.

import type { CardDef } from '../engine/types';
import { FACTION_THEME } from './palette';

type R = () => number;
function mkRng(seed: number): R {
  let s = (seed * 2654435761) >>> 0 || 7;
  return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}
const f1 = (n: number) => Math.round(n * 10) / 10;

export const ART_W = 300, ART_H = 220;

interface Ctx { r: R; p: typeof FACTION_THEME.dawn; faction: CardDef['faction']; id: string; hue: number }

function stars(c: Ctx, n: number, color: string, maxR = 1.6): string {
  let s = '';
  for (let i = 0; i < n; i++) s += `<circle cx="${f1(c.r() * ART_W)}" cy="${f1(c.r() * ART_H * 0.7)}" r="${f1(0.4 + c.r() * maxR)}" fill="${color}" opacity="${f1(0.3 + c.r() * 0.7)}"/>`;
  return s;
}
function embers(c: Ctx, n: number, color: string): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const x = f1(c.r() * ART_W), y = f1(ART_H * 0.4 + c.r() * ART_H * 0.6), rr = f1(0.8 + c.r() * 2.2);
    s += `<circle cx="${x}" cy="${y}" r="${rr}" fill="${color}" opacity="${f1(0.25 + c.r() * 0.6)}" class="art-ember" style="animation-delay:${f1(c.r() * 4)}s"/>`;
  }
  return s;
}
function ground(c: Ctx, color: string, y = 170): string {
  const pts: string[] = [`0,${ART_H}`, `0,${y + 10}`];
  for (let x = 0; x <= ART_W; x += 30) pts.push(`${x},${f1(y + (c.r() - 0.5) * 14)}`);
  pts.push(`${ART_W},${ART_H}`);
  return `<polygon points="${pts.join(' ')}" fill="${color}"/>`;
}
function mountains(c: Ctx, color: string, base = 165, h = 60): string {
  const pts: string[] = [`0,${ART_H}`];
  for (let x = 0; x <= ART_W; x += 24) pts.push(`${x},${f1(base - c.r() * h)}`);
  pts.push(`${ART_W},${ART_H}`);
  return `<polygon points="${pts.join(' ')}" fill="${color}" opacity="0.9"/>`;
}
function moon(c: Ctx, x: number, y: number, r: number, color: string, glow: string): string {
  return `<circle cx="${x}" cy="${y}" r="${r * 2.2}" fill="url(#g-${c.id}-glow)" opacity="0.8"/><circle cx="${x}" cy="${y}" r="${r}" fill="${color}"/>`;
}
function rays(c: Ctx, x: number, y: number, n: number, len: number, color: string): string {
  let s = '';
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + c.r() * 0.2;
    const l = len * (0.6 + c.r() * 0.6);
    s += `<line x1="${x}" y1="${y}" x2="${f1(x + Math.cos(a) * l)}" y2="${f1(y + Math.sin(a) * l)}" stroke="${color}" stroke-width="${f1(1 + c.r() * 2)}" opacity="${f1(0.15 + c.r() * 0.35)}" stroke-linecap="round"/>`;
  }
  return s;
}
function fog(c: Ctx, color: string): string {
  let s = '';
  for (let i = 0; i < 4; i++) s += `<ellipse cx="${f1(c.r() * ART_W)}" cy="${f1(150 + c.r() * 50)}" rx="${f1(80 + c.r() * 120)}" ry="${f1(10 + c.r() * 18)}" fill="${color}" opacity="${f1(0.08 + c.r() * 0.18)}"/>`;
  return s;
}
function pillars(c: Ctx, color: string, n = 4): string {
  let s = '';
  for (let i = 0; i < n; i++) { const x = f1(20 + c.r() * 260), w = f1(8 + c.r() * 14), h = f1(60 + c.r() * 90); s += `<rect x="${x}" y="${170 - h}" width="${w}" height="${h}" fill="${color}" opacity="${f1(0.5 + c.r() * 0.5)}"/>`; }
  return s;
}

// ── figure primitives (all centred at x, standing on baseline y) ──
function hood(x: number, y: number, s: number, color: string): string {
  return `<path d="M${x - 22 * s},${y} L${x - 16 * s},${y - 60 * s} Q${x},${y - 92 * s} ${x + 16 * s},${y - 60 * s} L${x + 22 * s},${y} Z" fill="${color}"/>`;
}
function body(x: number, y: number, s: number, color: string): string {
  return `<path d="M${x - 18 * s},${y} L${x - 14 * s},${y - 56 * s} L${x},${y - 66 * s} L${x + 14 * s},${y - 56 * s} L${x + 18 * s},${y} Z" fill="${color}"/>`;
}
function head(x: number, y: number, s: number, color: string): string {
  return `<circle cx="${x}" cy="${f1(y - 76 * s)}" r="${f1(10 * s)}" fill="${color}"/>`;
}
function helm(x: number, y: number, s: number, color: string, plume?: string): string {
  return `<path d="M${x - 11 * s},${y - 72 * s} L${x - 11 * s},${y - 84 * s} Q${x},${y - 96 * s} ${x + 11 * s},${y - 84 * s} L${x + 11 * s},${y - 72 * s} Z" fill="${color}"/>` +
    `<rect x="${x - 9 * s}" y="${y - 80 * s}" width="${18 * s}" height="${3 * s}" fill="#000" opacity="0.6"/>` +
    (plume ? `<path d="M${x},${y - 96 * s} Q${x + 10 * s},${y - 116 * s} ${x + 26 * s},${y - 100 * s} Q${x + 12 * s},${y - 102 * s} ${x + 4 * s},${y - 92 * s} Z" fill="${plume}"/>` : '');
}
function sword(x: number, y: number, s: number, color: string, angle = -20): string {
  return `<g transform="rotate(${angle} ${x} ${y - 40 * s})"><rect x="${x - 2 * s}" y="${y - 110 * s}" width="${4 * s}" height="${70 * s}" fill="${color}"/><rect x="${x - 10 * s}" y="${y - 42 * s}" width="${20 * s}" height="${4 * s}" fill="${color}"/><rect x="${x - 2 * s}" y="${y - 38 * s}" width="${4 * s}" height="${12 * s}" fill="#3a2a1a"/></g>`;
}
function shieldShape(x: number, y: number, s: number, color: string, emblem: string): string {
  return `<path d="M${x - 20 * s},${y - 70 * s} L${x + 20 * s},${y - 70 * s} L${x + 20 * s},${y - 35 * s} Q${x},${y - 5 * s} ${x - 20 * s},${y - 35 * s} Z" fill="${color}" stroke="#000" stroke-opacity="0.4" stroke-width="2"/><circle cx="${x}" cy="${y - 45 * s}" r="${7 * s}" fill="${emblem}" opacity="0.9"/>`;
}
function wings(x: number, y: number, s: number, color: string, spread = 1): string {
  const w = 60 * s * spread;
  return `<path d="M${x - 10 * s},${y - 60 * s} Q${x - w},${y - 110 * s} ${x - w * 1.1},${y - 40 * s} Q${x - w * 0.6},${y - 60 * s} ${x - 10 * s},${y - 40 * s} Z" fill="${color}" opacity="0.9"/>` +
    `<path d="M${x + 10 * s},${y - 60 * s} Q${x + w},${y - 110 * s} ${x + w * 1.1},${y - 40 * s} Q${x + w * 0.6},${y - 60 * s} ${x + 10 * s},${y - 40 * s} Z" fill="${color}" opacity="0.9"/>`;
}
function batWings(x: number, y: number, s: number, color: string): string {
  const w = 70 * s;
  const one = (d: number) => `<path d="M${x + d * 8 * s},${y - 50 * s} L${x + d * w},${y - 85 * s} L${x + d * w * 0.8},${y - 55 * s} L${x + d * w * 1.05},${y - 40 * s} L${x + d * w * 0.55},${y - 35 * s} L${x + d * w * 0.6},${y - 15 * s} Z" fill="${color}"/>`;
  return one(-1) + one(1);
}
function flame(x: number, y: number, s: number, c1: string, c2: string): string {
  return `<path d="M${x},${y} Q${x - 14 * s},${y - 18 * s} ${x - 4 * s},${y - 34 * s} Q${x + 2 * s},${y - 20 * s} ${x + 8 * s},${y - 30 * s} Q${x + 16 * s},${y - 14 * s} ${x},${y} Z" fill="${c1}" class="art-flame"/><path d="M${x},${y - 2 * s} Q${x - 6 * s},${y - 12 * s} ${x - 1 * s},${y - 22 * s} Q${x + 4 * s},${y - 12 * s} ${x},${y - 2 * s} Z" fill="${c2}" class="art-flame"/>`;
}
function skullShape(x: number, y: number, s: number, color: string): string {
  return `<path d="M${x - 16 * s},${y - 12 * s} Q${x - 18 * s},${y - 40 * s} ${x},${y - 40 * s} Q${x + 18 * s},${y - 40 * s} ${x + 16 * s},${y - 12 * s} L${x + 10 * s},${y} L${x - 10 * s},${y} Z" fill="${color}"/><ellipse cx="${x - 6 * s}" cy="${y - 20 * s}" rx="${4 * s}" ry="${5 * s}" fill="#000" opacity="0.8"/><ellipse cx="${x + 6 * s}" cy="${y - 20 * s}" rx="${4 * s}" ry="${5 * s}" fill="#000" opacity="0.8"/><path d="M${x - 2 * s},${y - 12 * s} L${x},${y - 8 * s} L${x + 2 * s},${y - 12 * s} Z" fill="#000" opacity="0.6"/>`;
}
function horns(x: number, y: number, s: number, color: string): string {
  return `<path d="M${x - 8 * s},${y - 86 * s} Q${x - 26 * s},${y - 96 * s} ${x - 20 * s},${y - 116 * s} Q${x - 12 * s},${y - 100 * s} ${x - 4 * s},${y - 90 * s} Z" fill="${color}"/><path d="M${x + 8 * s},${y - 86 * s} Q${x + 26 * s},${y - 96 * s} ${x + 20 * s},${y - 116 * s} Q${x + 12 * s},${y - 100 * s} ${x + 4 * s},${y - 90 * s} Z" fill="${color}"/>`;
}
function eyes(x: number, y: number, s: number, color: string, dy = 76): string {
  return `<circle cx="${x - 4 * s}" cy="${y - dy * s}" r="${1.8 * s}" fill="${color}" class="art-eye"/><circle cx="${x + 4 * s}" cy="${y - dy * s}" r="${1.8 * s}" fill="${color}" class="art-eye"/>`;
}
function beast(x: number, y: number, s: number, color: string, hunched = 1): string {
  return `<path d="M${x - 40 * s},${y} L${x - 36 * s},${y - 28 * s} Q${x - 20 * s},${y - 50 * s * hunched} ${x + 10 * s},${y - 44 * s} L${x + 34 * s},${y - 54 * s} L${x + 44 * s},${y - 40 * s} L${x + 36 * s},${y - 34 * s} L${x + 30 * s},${y} L${x + 20 * s},${y} L${x + 18 * s},${y - 20 * s} L${x - 10 * s},${y - 22 * s} L${x - 20 * s},${y} Z" fill="${color}"/>`;
}
function quadruped(x: number, y: number, s: number, color: string): string {
  return `<path d="M${x - 44 * s},${y} L${x - 42 * s},${y - 36 * s} L${x - 30 * s},${y - 50 * s} L${x + 20 * s},${y - 52 * s} L${x + 40 * s},${y - 70 * s} L${x + 52 * s},${y - 62 * s} L${x + 46 * s},${y - 44 * s} L${x + 38 * s},${y - 40 * s} L${x + 36 * s},${y} L${x + 26 * s},${y} L${x + 24 * s},${y - 30 * s} L${x - 20 * s},${y - 30 * s} L${x - 24 * s},${y} L${x - 34 * s},${y} L${x - 34 * s},${y - 26 * s} Z" fill="${color}"/>`;
}
function bird(x: number, y: number, s: number, color: string): string {
  return `<path d="M${x - 70 * s},${y - 30 * s} Q${x - 30 * s},${y - 60 * s} ${x},${y - 30 * s} Q${x + 30 * s},${y - 60 * s} ${x + 70 * s},${y - 30 * s} Q${x + 30 * s},${y - 36 * s} ${x + 4 * s},${y - 10 * s} L${x},${y} L${x - 4 * s},${y - 10 * s} Q${x - 30 * s},${y - 36 * s} ${x - 70 * s},${y - 30 * s} Z" fill="${color}"/>`;
}
function tower(x: number, y: number, s: number, color: string, lit?: string): string {
  return `<rect x="${x - 16 * s}" y="${y - 120 * s}" width="${32 * s}" height="${120 * s}" fill="${color}"/><path d="M${x - 22 * s},${y - 120 * s} L${x - 22 * s},${y - 132 * s} L${x - 12 * s},${y - 132 * s} L${x - 12 * s},${y - 124 * s} L${x - 4 * s},${y - 124 * s} L${x - 4 * s},${y - 132 * s} L${x + 4 * s},${y - 132 * s} L${x + 4 * s},${y - 124 * s} L${x + 12 * s},${y - 124 * s} L${x + 12 * s},${y - 132 * s} L${x + 22 * s},${y - 132 * s} L${x + 22 * s},${y - 120 * s} Z" fill="${color}"/>` +
    (lit ? `<rect x="${x - 4 * s}" y="${y - 100 * s}" width="${8 * s}" height="${12 * s}" fill="${lit}" class="art-flame"/><rect x="${x - 4 * s}" y="${y - 60 * s}" width="${8 * s}" height="${12 * s}" fill="${lit}" opacity="0.7"/>` : '');
}
function tree(x: number, y: number, s: number, color: string): string {
  return `<path d="M${x - 4 * s},${y} L${x - 3 * s},${y - 50 * s} L${x - 24 * s},${y - 70 * s} L${x - 6 * s},${y - 62 * s} L${x - 2 * s},${y - 90 * s} L${x + 8 * s},${y - 70 * s} L${x + 26 * s},${y - 80 * s} L${x + 6 * s},${y - 56 * s} L${x + 4 * s},${y} Z" fill="${color}"/>`;
}
function dragonShape(x: number, y: number, s: number, color: string): string {
  return `<path d="M${x - 90 * s},${y - 40 * s} Q${x - 50 * s},${y - 100 * s} ${x - 10 * s},${y - 60 * s} L${x + 10 * s},${y - 64 * s} Q${x + 60 * s},${y - 110 * s} ${x + 90 * s},${y - 50 * s} Q${x + 50 * s},${y - 60 * s} ${x + 30 * s},${y - 44 * s} L${x + 60 * s},${y - 30 * s} L${x + 80 * s},${y - 34 * s} L${x + 56 * s},${y - 18 * s} L${x + 20 * s},${y - 30 * s} Q${x},${y - 20 * s} ${x - 30 * s},${y - 24 * s} Q${x - 60 * s},${y - 10 * s} ${x - 80 * s},${y + 10 * s} Q${x - 50 * s},${y - 30 * s} ${x - 24 * s},${y - 40 * s} Q${x - 50 * s},${y - 50 * s} ${x - 90 * s},${y - 40 * s} Z" fill="${color}"/>`;
}
function serpentShape(x: number, y: number, s: number, color: string): string {
  return `<path d="M${x - 100 * s},${y} Q${x - 70 * s},${y - 70 * s} ${x - 30 * s},${y - 30 * s} Q${x},${y + 10 * s} ${x + 30 * s},${y - 40 * s} Q${x + 50 * s},${y - 80 * s} ${x + 80 * s},${y - 60 * s} L${x + 96 * s},${y - 70 * s} L${x + 90 * s},${y - 50 * s} L${x + 80 * s},${y - 44 * s} Q${x + 50 * s},${y - 50 * s} ${x + 34 * s},${y - 10 * s} Q${x},${y + 30 * s} ${x - 34 * s},${y - 10 * s} Q${x - 60 * s},${y - 40 * s} ${x - 100 * s},${y + 6 * s} Z" fill="${color}"/>`;
}
function glowOrb(c: Ctx, x: number, y: number, r: number, color: string): string {
  return `<circle cx="${x}" cy="${y}" r="${r * 3}" fill="url(#g-${c.id}-glow)" opacity="0.9"/><circle cx="${x}" cy="${y}" r="${r}" fill="${color}" class="art-pulse"/>`;
}
function lanternShape(x: number, y: number, s: number, frame: string, light: string): string {
  return `<rect x="${x - 2 * s}" y="${y - 120 * s}" width="${4 * s}" height="${30 * s}" fill="${frame}"/><path d="M${x - 14 * s},${y - 90 * s} L${x + 14 * s},${y - 90 * s} L${x + 18 * s},${y - 50 * s} L${x - 18 * s},${y - 50 * s} Z" fill="${frame}"/><path d="M${x - 10 * s},${y - 86 * s} L${x + 10 * s},${y - 86 * s} L${x + 13 * s},${y - 54 * s} L${x - 13 * s},${y - 54 * s} Z" fill="${light}" class="art-flame"/>`;
}
function chainsShape(c: Ctx, color: string): string {
  let s = '';
  for (let i = 0; i < 3; i++) {
    const x0 = c.r() * ART_W, y0 = c.r() * 40;
    const x1 = c.r() * ART_W, y1 = 120 + c.r() * 80;
    s += `<line x1="${f1(x0)}" y1="${f1(y0)}" x2="${f1(x1)}" y2="${f1(y1)}" stroke="${color}" stroke-width="5" stroke-dasharray="10 6" stroke-linecap="round" opacity="0.8"/>`;
  }
  return s;
}

const MOTIF_SHAPES: Record<string, (c: Ctx) => string> = {};
function def(names: string[], fn: (c: Ctx) => string) { for (const n of names) MOTIF_SHAPES[n] = fn; }

const X = 150, Y = 176;
def(['knight', 'captain', 'cavalry', 'darkknight', 'sellsword', 'hunter', 'warden'], (c) => {
  const armor = c.faction === 'umbral' ? '#2a1a3a' : c.faction === 'dawn' ? '#c9b27a' : '#6a6a72';
  const plume = c.faction === 'umbral' ? c.p.primary : '#c23b3b';
  const dark = c.faction === 'dawn' ? '#7a5a2a' : '#111';
  const s = 1.1;
  return body(X, Y, s, armor) + helm(X, Y, s, armor, c.r() > 0.4 ? plume : undefined) + eyes(X, Y, s, c.faction === 'umbral' ? c.p.secondary : '#fff8e0', 78) +
    sword(X + 30, Y, s, c.faction === 'dawn' ? '#fff3c4' : '#b9c0cc') + shieldShape(X - 36, Y, s * 0.9, dark, c.p.primary) + (c.faction === 'umbral' ? horns(X, Y, s * 0.8, '#1a0f26') : '');
});
def(['cleric', 'saint', 'priest', 'chaplain', 'pilgrim', 'necromancer', 'scholar', 'oracle', 'witch', 'cartographer', 'noble', 'assassin', 'dancer', 'vampire', 'wraithmother'], (c) => {
  const robe = c.faction === 'dawn' ? '#f1e4c2' : c.faction === 'umbral' ? '#2b1340' : '#4a4652';
  const trim = c.p.primary;
  const s = 1.1;
  const holy = c.faction === 'dawn';
  return `<ellipse cx="${X}" cy="${Y - 70}" rx="46" ry="46" fill="url(#g-${c.id}-glow)" opacity="${holy ? 0.9 : 0.6}"/>` +
    hood(X, Y, s, robe) + `<path d="M${X - 10},${Y - 40} L${X + 10},${Y - 40} L${X + 6},${Y} L${X - 6},${Y} Z" fill="${trim}" opacity="0.7"/>` +
    (holy ? `<circle cx="${X}" cy="${Y - 86}" r="18" fill="none" stroke="${c.p.glow}" stroke-width="3" opacity="0.9" class="art-pulse"/>` : eyes(X, Y, s, c.p.secondary, 70)) +
    glowOrb(c, X + 34, Y - 50, 6, holy ? '#fff7d6' : c.p.secondary);
});
def(['seraph', 'archon', 'chorus', 'mote'], (c) => {
  const s = 1;
  return `<ellipse cx="${X}" cy="${Y - 70}" rx="90" ry="70" fill="url(#g-${c.id}-glow)" opacity="0.9"/>` + wings(X, Y, s, '#fff2c8', 1.1) +
    body(X, Y, s, '#f6e3a8') + `<circle cx="${X}" cy="${Y - 76}" r="10" fill="#fff8e6"/>` + rays(c, X, Y - 76, 12, 70, '#ffe9a8') +
    `<circle cx="${X}" cy="${Y - 76}" r="16" fill="none" stroke="#fff" stroke-width="2" opacity="0.8" class="art-pulse"/>`;
});
def(['wraith', 'choir', 'imp', 'void', 'reaper', 'swarm'], (c) => {
  const s = 1.1;
  const col = '#1a0c2a';
  return `<ellipse cx="${X}" cy="${Y - 60}" rx="80" ry="60" fill="url(#g-${c.id}-glow)" opacity="0.7"/>` +
    `<path d="M${X - 30},${Y + 10} Q${X - 40},${Y - 40} ${X - 18},${Y - 70} Q${X},${Y - 100} ${X + 18},${Y - 70} Q${X + 40},${Y - 40} ${X + 30},${Y + 10} Q${X + 18},${Y - 10} ${X + 8},${Y + 8} Q${X},${Y - 6} ${X - 8},${Y + 8} Q${X - 18},${Y - 10} ${X - 30},${Y + 10} Z" fill="${col}"/>` +
    eyes(X, Y, s, c.p.secondary, 66) + (c.id.includes('reaper') ? `<path d="M${X + 40},${Y} L${X + 44},${Y - 130} Q${X + 10},${Y - 150} ${X - 10},${Y - 120} Q${X + 20},${Y - 128} ${X + 44},${Y - 118}" fill="none" stroke="#9aa" stroke-width="4"/>` : '') +
    (c.id.includes('swarm') ? Array.from({ length: 18 }, () => `<circle cx="${f1(c.r() * ART_W)}" cy="${f1(40 + c.r() * 120)}" r="${f1(1.5 + c.r() * 3)}" fill="#7af0c0" opacity="0.7" class="art-ember"/>`).join('') : '');
});
def(['husk', 'hulk', 'tyrant', 'golem', 'colossus', 'troll'], (c) => {
  const s = c.id.includes('tyrant') || c.id.includes('colossus') || c.id.includes('hulk') ? 1.5 : 1.2;
  const col = c.faction === 'umbral' ? '#3a2a30' : c.faction === 'dawn' ? '#b89a6a' : '#5a5a60';
  return `<path d="M${X - 30 * s},${Y} L${X - 34 * s},${Y - 50 * s} L${X - 20 * s},${Y - 70 * s} L${X - 6 * s},${Y - 64 * s} L${X},${Y - 80 * s} L${X + 8 * s},${Y - 64 * s} L${X + 22 * s},${Y - 70 * s} L${X + 36 * s},${Y - 48 * s} L${X + 30 * s},${Y} Z" fill="${col}"/>` +
    `<rect x="${X - 44 * s}" y="${Y - 60 * s}" width="${14 * s}" height="${58 * s}" fill="${col}" transform="rotate(10 ${X - 37 * s} ${Y - 30 * s})"/><rect x="${X + 30 * s}" y="${Y - 60 * s}" width="${14 * s}" height="${58 * s}" fill="${col}" transform="rotate(-10 ${X + 37 * s} ${Y - 30 * s})"/>` +
    eyes(X, Y, s, c.faction === 'umbral' ? c.p.secondary : c.p.primary, 68) + (c.id.includes('tyrant') ? `<path d="M${X - 14},${Y - 122} L${X - 10},${Y - 140} L${X - 4},${Y - 124} L${X},${Y - 146} L${X + 4},${Y - 124} L${X + 10},${Y - 140} L${X + 14},${Y - 122} Z" fill="#c9a24a"/>` : '');
});
def(['rat', 'hound', 'leech', 'bear', 'wagon'], (c) => {
  const col = c.faction === 'umbral' ? '#2c1b2c' : '#3e3028';
  return quadruped(X, Y, c.id.includes('bear') ? 1.3 : 1, col) + eyes(X + 44, Y, 1, c.p.secondary, 62);
});
def(['bird', 'crow', 'bat', 'moth', 'steed', 'hawk'], (c) => {
  const col = c.faction === 'dawn' ? '#f0deb0' : '#1f1226';
  if (c.id.includes('bat')) return `<circle cx="${X}" cy="${Y - 70}" r="60" fill="url(#g-${c.id}-glow)" opacity="0.6"/>` + batWings(X, Y, 1, col) + `<ellipse cx="${X}" cy="${Y - 44}" rx="10" ry="18" fill="${col}"/>` + eyes(X, Y, 1, c.p.secondary, 50);
  if (c.id.includes('steed')) return quadruped(X, Y, 1.3, '#15101c') + wings(X - 10, Y + 10, 1.0, '#2a1a3a') + `<path d="M${X + 46},${Y - 92} L${X + 52},${Y - 110} L${X + 56},${Y - 90} Z" fill="${c.p.secondary}"/>` + eyes(X + 56, Y, 1.3, c.p.secondary, 64);
  return `<circle cx="${X}" cy="${Y - 80}" r="56" fill="url(#g-${c.id}-glow)" opacity="0.6"/>` + bird(X, Y - 40, 1.1, col);
});
def(['dragon', 'serpent'], (c) => {
  const col = c.id.includes('dragon') ? '#1b1422' : '#243027';
  return `<ellipse cx="${X}" cy="${Y - 60}" rx="120" ry="60" fill="url(#g-${c.id}-glow)" opacity="0.6"/>` + (c.id.includes('dragon') ? dragonShape(X, Y - 20, 1.2, col) : serpentShape(X, Y - 10, 1, col)) + eyes(X + (c.id.includes('dragon') ? 70 : 90), Y, 1, c.p.secondary, c.id.includes('dragon') ? 82 : 68);
});
def(['tower', 'shrine', 'altar', 'altar_dark', 'banner'], (c) => {
  const col = c.faction === 'umbral' ? '#1b1022' : '#3a3242';
  if (c.id.includes('banner')) return `<rect x="${X - 3}" y="${Y - 150}" width="6" height="150" fill="#5a4a3a"/><path d="M${X + 3},${Y - 148} L${X + 90},${Y - 136} L${X + 70},${Y - 100} L${X + 90},${Y - 64} L${X + 3},${Y - 52} Z" fill="${c.p.primary}" class="art-flag"/><circle cx="${X + 48}" cy="${Y - 100}" r="12" fill="#1a1a1f" opacity="0.6"/>`;
  if (c.id.includes('altar') || c.id.includes('shrine')) return `<rect x="${X - 50}" y="${Y - 30}" width="100" height="30" fill="${col}"/><rect x="${X - 36}" y="${Y - 70}" width="72" height="40" fill="${col}"/>` + flame(X, Y - 70, 1.6, c.p.primary, '#fff') + glowOrb(c, X, Y - 100, 8, c.p.glow);
  return tower(X, Y, 1, col, c.p.primary) + tower(X - 70, Y + 10, 0.7, '#0e0a12') + tower(X + 80, Y + 6, 0.6, '#0e0a12');
});
def(['candle', 'torch', 'lantern', 'sun', 'sunrise', 'spell_light'], (c) => {
  if (c.id.includes('lantern')) return `<ellipse cx="${X}" cy="${Y - 70}" rx="90" ry="70" fill="url(#g-${c.id}-glow)" opacity="0.9"/>` + lanternShape(X, Y, 1.2, '#1a1020', c.faction === 'umbral' ? c.p.primary : '#ffd27a');
  if (c.id.includes('candle') || c.id.includes('torch')) return `<ellipse cx="${X}" cy="${Y - 60}" rx="100" ry="80" fill="url(#g-${c.id}-glow)" opacity="0.9"/><rect x="${X - 10}" y="${Y - 70}" width="20" height="70" fill="#e9dcc0"/>` + flame(X, Y - 70, 2, '#ffb347', '#fff2c8');
  return `<ellipse cx="${X}" cy="${Y - 70}" rx="140" ry="100" fill="url(#g-${c.id}-glow)" opacity="1"/>` + rays(c, X, Y - 70, 24, 140, c.p.glow) + `<circle cx="${X}" cy="${Y - 70}" r="30" fill="#fff6d8"/>`;
});
def(['spear', 'shield', 'skull', 'hand', 'chalice', 'contract', 'chains', 'maw', 'bomb', 'potion', 'storm', 'ashfall', 'hymn', 'spell_dark'], (c) => {
  const glow = `<ellipse cx="${X}" cy="${Y - 70}" rx="100" ry="80" fill="url(#g-${c.id}-glow)" opacity="0.8"/>`;
  if (c.id.includes('shield')) return glow + shieldShape(X, Y + 10, 2.2, c.faction === 'dawn' ? '#c9b27a' : '#3a2a3a', c.p.primary);
  if (c.id.includes('spear')) return glow + `<g transform="rotate(-35 ${X} ${Y - 70})"><rect x="${X - 3}" y="${Y - 160}" width="6" height="170" fill="#8a6a3a"/><path d="M${X - 12},${Y - 150} L${X},${Y - 190} L${X + 12},${Y - 150} Z" fill="#fff3c4"/></g>`;
  if (c.id.includes('skull')) return glow + skullShape(X, Y - 30, 2.4, '#d8d0c0') + stars(c, 8, c.p.secondary);
  if (c.id.includes('hand')) return glow + `<path d="M${X - 30},${Y} L${X - 26},${Y - 70} L${X - 36},${Y - 120} L${X - 26},${Y - 122} L${X - 14},${Y - 80} L${X - 16},${Y - 130} L${X - 6},${Y - 132} L${X},${Y - 82} L${X + 4},${Y - 136} L${X + 14},${Y - 132} L${X + 14},${Y - 84} L${X + 24},${Y - 120} L${X + 32},${Y - 112} L${X + 26},${Y - 60} L${X + 30},${Y} Z" fill="#2a1535"/>` + eyes(X, Y, 1, c.p.secondary, 100);
  if (c.id.includes('chalice')) return glow + `<path d="M${X - 36},${Y - 120} L${X + 36},${Y - 120} Q${X + 30},${Y - 60} ${X},${Y - 54} Q${X - 30},${Y - 60} ${X - 36},${Y - 120} Z" fill="#c9a24a"/><rect x="${X - 4}" y="${Y - 54}" width="8" height="34" fill="#c9a24a"/><rect x="${X - 26}" y="${Y - 20}" width="52" height="8" fill="#c9a24a"/><ellipse cx="${X}" cy="${Y - 118}" rx="34" ry="8" fill="#7a0a2a"/>`;
  if (c.id.includes('contract')) return glow + `<rect x="${X - 50}" y="${Y - 140}" width="100" height="130" fill="#e9dcc0" transform="rotate(-6 ${X} ${Y - 70})"/>` + Array.from({ length: 7 }, (_, i) => `<rect x="${X - 38}" y="${Y - 126 + i * 15}" width="${f1(40 + c.r() * 36)}" height="3" fill="#3a2a2a" opacity="0.7" transform="rotate(-6 ${X} ${Y - 70})"/>`).join('') + `<circle cx="${X + 22}" cy="${Y - 30}" r="10" fill="#7a0a2a"/>`;
  if (c.id.includes('chains')) return glow + chainsShape(c, '#8a8aa0') + skullShape(X, Y - 40, 1.4, '#c0b8b0');
  if (c.id.includes('maw')) return glow + `<ellipse cx="${X}" cy="${Y - 60}" rx="80" ry="50" fill="#0b0410"/>` + Array.from({ length: 9 }, (_, i) => `<path d="M${X - 72 + i * 18},${Y - 92} L${X - 64 + i * 18},${Y - 60} L${X - 56 + i * 18},${Y - 92} Z" fill="#e8e0d8"/><path d="M${X - 72 + i * 18},${Y - 28} L${X - 64 + i * 18},${Y - 56} L${X - 56 + i * 18},${Y - 28} Z" fill="#e8e0d8"/>`).join('');
  if (c.id.includes('bomb')) return glow + `<circle cx="${X}" cy="${Y - 50}" r="40" fill="#1e1a22"/><rect x="${X - 6}" y="${Y - 100}" width="12" height="14" fill="#5a4a3a"/><path d="M${X},${Y - 100} Q${X + 20},${Y - 130} ${X + 40},${Y - 120}" fill="none" stroke="#8a6a3a" stroke-width="3"/>` + flame(X + 40, Y - 118, 0.9, '#ffb347', '#fff');
  if (c.id.includes('potion')) return glow + `<path d="M${X - 10},${Y - 130} L${X + 10},${Y - 130} L${X + 10},${Y - 100} Q${X + 40},${Y - 80} ${X + 36},${Y - 40} Q${X + 30},${Y - 10} ${X},${Y - 10} Q${X - 30},${Y - 10} ${X - 36},${Y - 40} Q${X - 40},${Y - 80} ${X - 10},${Y - 100} Z" fill="#2a3a4a" opacity="0.8"/><path d="M${X - 32},${Y - 50} Q${X},${Y - 70} ${X + 32},${Y - 50} Q${X + 30},${Y - 14} ${X},${Y - 12} Q${X - 30},${Y - 14} ${X - 32},${Y - 50} Z" fill="${c.p.secondary}" opacity="0.9" class="art-pulse"/>`;
  if (c.id.includes('storm') || c.id.includes('ashfall')) return glow + Array.from({ length: 30 }, () => `<line x1="${f1(c.r() * ART_W)}" y1="${f1(c.r() * 160)}" x2="${f1(c.r() * ART_W - 20)}" y2="${f1(c.r() * 160 + 30)}" stroke="${c.p.secondary}" stroke-width="${f1(1 + c.r() * 2)}" opacity="${f1(0.2 + c.r() * 0.5)}"/>`).join('') + tree(X - 80, Y, 0.9, '#0e0a12') + tree(X + 70, Y, 0.7, '#0e0a12');
  if (c.id.includes('hymn')) return glow + Array.from({ length: 8 }, (_, i) => `<text x="${f1(40 + i * 30 + c.r() * 10)}" y="${f1(60 + c.r() * 90)}" font-size="${f1(18 + c.r() * 20)}" fill="${c.p.glow}" opacity="${f1(0.3 + c.r() * 0.6)}" font-family="serif">♪</text>`).join('') + hood(X, Y, 1, '#f1e4c2');
  return glow + Array.from({ length: 6 }, (_, i) => `<circle cx="${X}" cy="${Y - 70}" r="${20 + i * 14}" fill="none" stroke="${c.p.secondary}" stroke-width="2" opacity="${f1(0.5 - i * 0.07)}" class="art-pulse" style="animation-delay:${i * 0.3}s"/>`).join('') + glowOrb(c, X, Y - 70, 12, c.p.secondary);
});

/** Returns an inline SVG string for the card's illustration. */
export function cardArtSVG(card: Pick<CardDef, 'id' | 'faction' | 'art' | 'type'>, opts: { animated?: boolean } = {}): string {
  const p = FACTION_THEME[card.faction];
  const c: Ctx = { r: mkRng(card.art.seed), p, faction: card.faction, id: card.art.motif + '-' + card.id, hue: card.art.hue ?? 0 };
  const sky1 = p.skyTop, sky2 = p.skyBottom;
  const shape = MOTIF_SHAPES[card.art.motif] ?? MOTIF_SHAPES['wraith'];
  const bg = `<defs><linearGradient id="g-${c.id}-sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky1}"/><stop offset="1" stop-color="${sky2}"/></linearGradient><radialGradient id="g-${c.id}-glow"><stop offset="0" stop-color="${p.glow}" stop-opacity="0.9"/><stop offset="1" stop-color="${p.glow}" stop-opacity="0"/></radialGradient></defs>`;
  const scene = `<rect width="${ART_W}" height="${ART_H}" fill="url(#g-${c.id}-sky)"/>` + stars(c, card.faction === 'umbral' ? 40 : 25, card.faction === 'dawn' ? '#ffe9b0' : '#cbd5ff') +
    (c.r() > 0.5 ? moon(c, f1(60 + c.r() * 180), f1(30 + c.r() * 40), f1(10 + c.r() * 14), card.faction === 'dawn' ? '#ffd9a0' : '#d8d0ff', p.glow) : '') +
    mountains(c, card.faction === 'dawn' ? '#2a1a28' : '#07040c', 150, 60) + (c.r() > 0.5 ? pillars(c, '#0a0710', 3) : '') + ground(c, card.faction === 'dawn' ? '#1c1212' : '#06040a') + fog(c, p.glow);
  const fg = shape(c) + embers(c, 14, card.faction === 'dawn' ? '#ffcf70' : p.secondary) + `<rect width="${ART_W}" height="${ART_H}" fill="url(#g-${c.id}-vig)" opacity="0"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${ART_W} ${ART_H}" preserveAspectRatio="xMidYMid slice" class="card-art-svg${opts.animated ? ' animated' : ''}" aria-hidden="true">${bg}${scene}${fg}</svg>`;
}

/** Portrait art for bots and avatars: same system, square crop. */
export function portraitSVG(motif: string, seed: number, faction: CardDef['faction']): string {
  return cardArtSVG({ id: `portrait-${seed}`, faction, art: { motif, seed }, type: 'creature' });
}

export const AVATARS: { id: string; motif: string; seed: number; faction: CardDef['faction']; name: string }[] = [
  { id: 'av_knight', motif: 'knight', seed: 1, faction: 'dawn', name: 'Vigil Knight' },
  { id: 'av_cleric', motif: 'cleric', seed: 2, faction: 'dawn', name: 'Choir Sister' },
  { id: 'av_seraph', motif: 'seraph', seed: 3, faction: 'dawn', name: 'Lumen' },
  { id: 'av_hawk', motif: 'bird', seed: 4, faction: 'dawn', name: 'Gloaming Hawk' },
  { id: 'av_noble', motif: 'noble', seed: 5, faction: 'umbral', name: 'Courtier' },
  { id: 'av_wraith', motif: 'wraith', seed: 6, faction: 'umbral', name: 'Wraith' },
  { id: 'av_bat', motif: 'bat', seed: 7, faction: 'umbral', name: 'Belfry Bat' },
  { id: 'av_tyrant', motif: 'tyrant', seed: 8, faction: 'umbral', name: 'Grave Tyrant' },
  { id: 'av_sellsword', motif: 'sellsword', seed: 9, faction: 'neutral', name: 'Sellsword' },
  { id: 'av_witch', motif: 'witch', seed: 10, faction: 'neutral', name: 'Fen Witch' },
  { id: 'av_dragon', motif: 'dragon', seed: 11, faction: 'neutral', name: 'Gloaming Dragon' },
  { id: 'av_golem', motif: 'golem', seed: 12, faction: 'neutral', name: 'Stone Golem' },
];
