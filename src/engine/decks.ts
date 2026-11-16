import type { DeckSpec, Faction, DeckCard } from './types';

/** Build a deck from [cardId, copies] pairs at a uniform level. */
export function deckFrom(name: string, faction: Faction, list: [string, number][], level = 1): DeckSpec {
  const cards: DeckCard[] = [];
  for (const [id, n] of list) for (let i = 0; i < n; i++) cards.push({ cardId: id, level });
  return { name, faction, cards };
}

export const STARTER_DAWN: [string, number][] = [
  ['d_acolyte', 2], ['d_squire', 2], ['d_candle', 1], ['d_initiate', 1], ['d_footman', 2], ['d_novice', 1], ['d_lance', 2], ['d_hawk', 2],
  ['d_shield', 1], ['d_pilgrim', 2], ['d_torch', 1], ['d_knight', 2], ['d_sister', 1], ['d_arrow', 2], ['d_hymn', 1], ['d_guard', 1],
  ['d_captain', 1], ['d_herald', 1], ['d_chaplain', 1], ['d_cavalry', 1], ['d_colossus', 1], ['n_bear', 1],
];
export const STARTER_UMBRAL: [string, number][] = [
  ['u_rat', 2], ['u_courtier', 2], ['u_touch', 2], ['u_mote', 1], ['u_whisper', 1], ['u_tithe', 1], ['u_shambler', 2], ['u_leech', 1],
  ['u_assassin', 2], ['u_bat', 1], ['u_shackles', 1], ['u_priest', 1], ['u_shade', 2], ['u_siphon', 2], ['u_hound', 1], ['u_scholar', 1],
  ['u_unmaking', 1], ['u_wagon', 1], ['u_reaper', 2], ['u_gloamknight', 1], ['u_hulk', 1], ['n_bear', 1],
];

export function starterDeck(faction: 'dawn' | 'umbral', level = 1): DeckSpec {
  return faction === 'dawn' ? deckFrom('Emberhearth Vigil', 'dawn', STARTER_DAWN, level) : deckFrom('Court of Husks', 'umbral', STARTER_UMBRAL, level);
}

/** Starter collection: every starter card plus a few extras, so the deck builder has choices on day one. */
export function starterCollection(): Record<string, { count: number; level: number }> {
  const col: Record<string, { count: number; level: number }> = {};
  for (const [id, n] of [...STARTER_DAWN, ...STARTER_UMBRAL]) col[id] = { count: (col[id]?.count ?? 0) + n, level: 1 };
  for (const id of ['n_sellsword', 'n_moth', 'n_pikeman', 'n_bomb', 'n_gale', 'n_oracle', 'n_golem', 'n_shrine', 'n_crow', 'n_hunter']) col[id] = { count: 2, level: 1 };
  return col;
}
