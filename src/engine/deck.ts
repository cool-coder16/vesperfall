import type { DeckSpec, Faction } from './types';
import { RULES } from './types';
import { getCard, CARD_BY_ID } from './cards';

export interface DeckProblem { message: string }

export function validateDeck(deck: DeckSpec): DeckProblem[] {
  const problems: DeckProblem[] = [];
  if (deck.cards.length !== RULES.deckSize) problems.push({ message: `A deck needs exactly ${RULES.deckSize} cards (has ${deck.cards.length}).` });
  const counts = new Map<string, number>();
  for (const c of deck.cards) {
    const def = CARD_BY_ID[c.cardId];
    if (!def) { problems.push({ message: `Unknown card ${c.cardId}.` }); continue; }
    if (def.token) problems.push({ message: `${def.name} is a token and can't be in a deck.` });
    if (def.faction !== 'neutral' && def.faction !== deck.faction) problems.push({ message: `${def.name} belongs to another faction.` });
    counts.set(c.cardId, (counts.get(c.cardId) ?? 0) + 1);
  }
  for (const [id, n] of counts) {
    const def = getCard(id);
    const max = def.rarity === 'legendary' ? RULES.maxLegendaryCopies : RULES.maxCopies;
    if (n > max) problems.push({ message: `Too many copies of ${def.name} (max ${max}).` });
  }
  if (!deck.name.trim()) problems.push({ message: 'Give your deck a name.' });
  return dedupe(problems);
}

function dedupe(p: DeckProblem[]): DeckProblem[] {
  const seen = new Set<string>();
  return p.filter((x) => (seen.has(x.message) ? false : (seen.add(x.message), true)));
}

export function deckFactionOf(cardIds: string[]): Faction {
  let dawn = 0, umbral = 0;
  for (const id of cardIds) { const f = CARD_BY_ID[id]?.faction; if (f === 'dawn') dawn++; else if (f === 'umbral') umbral++; }
  if (dawn === 0 && umbral === 0) return 'neutral';
  return dawn >= umbral ? 'dawn' : 'umbral';
}

export function costCurve(cardIds: string[]): number[] {
  const curve = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const id of cardIds) { const c = CARD_BY_ID[id]?.cost ?? 0; curve[Math.min(7, c)]++; }
  return curve;
}
