import { describe, it, expect } from 'vitest';
import { createGame, viewFor, whoActs } from '../src/engine/engine';
import { botPlayTurn, paramsForLevel, botNextAction } from '../src/ai/bot';
import { starterDeck } from '../src/engine/decks';
import { BOTS } from '../src/ai/bots';
import type { GameState, PlayerId } from '../src/engine/types';

function seededRand(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

export function playMatch(levelA: number, levelB: number, seed: number, decks = [starterDeck('dawn'), starterDeck('umbral')] as const): { winner: PlayerId | 'draw'; turns: number } {
  let st = createGame({ players: [{ name: 'A', deck: decks[0] }, { name: 'B', deck: decks[1] }], seed, firstPlayer: (seed % 2) as PlayerId });
  const pa = { ...paramsForLevel(levelA), rand: seededRand(seed * 3 + 1) }, pb = { ...paramsForLevel(levelB), rand: seededRand(seed * 7 + 2) };
  let guard = 0;
  while (st.winner === null && guard++ < 400) {
    const p = whoActs(st);
    st = botPlayTurn(st, p, p === 0 ? pa : pb);
  }
  return { winner: st.winner ?? 'draw', turns: st.turn };
}

function series(levelA: number, levelB: number, games: number): number {
  let winsA = 0, winsB = 0;
  for (let g = 0; g < games; g++) {
    // alternate who plays which deck so faction balance doesn't decide the result
    const flip = g % 2 === 1;
    const r = flip ? playMatch(levelB, levelA, 1000 + g) : playMatch(levelA, levelB, 1000 + g);
    const aWon = flip ? r.winner === 1 : r.winner === 0;
    const bWon = flip ? r.winner === 0 : r.winner === 1;
    if (aWon) winsA++; else if (bWon) winsB++;
  }
  return winsA / Math.max(1, winsA + winsB);
}

describe('bots', () => {
  it('never read hidden information: decisions are identical from a masked view', () => {
    let st = createGame({ players: [{ name: 'A', deck: starterDeck('dawn') }, { name: 'B', deck: starterDeck('umbral') }], seed: 5 });
    const params = { ...paramsForLevel(10), rand: seededRand(1) };
    const a1 = botNextAction(st, 0, { ...params, rand: seededRand(1) });
    const masked = viewFor(st, 0);
    const a2 = botNextAction(masked, 0, { ...params, rand: seededRand(1) });
    expect(a1).toEqual(a2);
  });
  it('every bot finishes a full match against a mirror without errors', () => {
    for (const b of BOTS) {
      const r = playMatch(b.level, b.level, b.level, [b.deck, b.deck] as const);
      expect(['0', '1', 'draw']).toContain(String(r.winner));
      expect(r.turns).toBeGreaterThan(4);
    }
  });
  it('a master bot beats a novice bot almost always', () => {
    const rate = series(12, 1, 10);
    expect(rate).toBeGreaterThanOrEqual(0.85);
  });
  it('mid-tier bots beat low-tier bots and lose to high-tier bots', () => {
    expect(series(6, 2, 10)).toBeGreaterThanOrEqual(0.7);
    expect(series(10, 6, 10)).toBeGreaterThanOrEqual(0.6);
  });
});
