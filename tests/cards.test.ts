import { describe, it, expect } from 'vitest';
import { CARDS, COLLECTIBLE_CARDS, getCard } from '../src/engine/cards';
import { validateDeck } from '../src/engine/deck';
import { BOTS } from '../src/ai/bots';
import { starterDeck } from '../src/engine/decks';
import { targetSlots } from '../src/engine/engine';

describe('card roster', () => {
  it('has unique ids and names', () => {
    const ids = new Set(CARDS.map((c) => c.id)), names = new Set(CARDS.map((c) => c.name));
    expect(ids.size).toBe(CARDS.length); expect(names.size).toBe(CARDS.length);
  });
  it('is large and spread across factions and rarities', () => {
    expect(COLLECTIBLE_CARDS.length).toBeGreaterThanOrEqual(80);
    const by = (k: string) => COLLECTIBLE_CARDS.filter((c: any) => c.faction === k || c.rarity === k).length;
    expect(by('dawn')).toBeGreaterThanOrEqual(30); expect(by('umbral')).toBeGreaterThanOrEqual(30); expect(by('neutral')).toBeGreaterThanOrEqual(18);
    for (const r of ['common', 'rare', 'epic', 'legendary']) expect(by(r)).toBeGreaterThan(0);
  });
  it('creatures have stats; spells and relics do not; effects reference real cards', () => {
    for (const c of CARDS) {
      if (c.type === 'creature') { expect(c.attack).toBeTypeOf('number'); expect(c.health).toBeGreaterThan(0); }
      else { expect(c.attack).toBeUndefined(); }
      for (const e of c.effects ?? []) {
        const a: any = e.action; if (a.kind === 'summon' || a.kind === 'transform') expect(() => getCard(a.cardId)).not.toThrow();
      }
      expect(c.art.motif.length).toBeGreaterThan(0);
      expect(c.flavor.length).toBeGreaterThan(0);
      expect(targetSlots(c).length).toBeLessThanOrEqual(2);
    }
  });
});

describe('decks', () => {
  it('starter decks are legal', () => {
    expect(validateDeck(starterDeck('dawn'))).toEqual([]);
    expect(validateDeck(starterDeck('umbral'))).toEqual([]);
  });
  it('every bot deck is legal', () => {
    for (const b of BOTS) expect({ bot: b.id, problems: validateDeck(b.deck) }).toEqual({ bot: b.id, problems: [] });
  });
  it('bots are ordered by level 1..12 with unique names', () => {
    expect(BOTS.map((b) => b.level)).toEqual(Array.from({ length: 12 }, (_, i) => i + 1));
    expect(new Set(BOTS.map((b) => b.name)).size).toBe(12);
  });
  it('rejects bad decks with helpful messages', () => {
    const d = starterDeck('dawn');
    d.cards.push({ cardId: 'u_rat', level: 1 });
    const p = validateDeck(d).map((x) => x.message).join(' ');
    expect(p).toMatch(/exactly 30/); expect(p).toMatch(/another faction/);
    const e = starterDeck('umbral');
    e.cards[0] = { cardId: 'u_tyrant', level: 1 }; e.cards[1] = { cardId: 'u_tyrant', level: 1 };
    expect(validateDeck(e).map((x) => x.message).join(' ')).toMatch(/Too many copies of Grave Tyrant/);
  });
});
