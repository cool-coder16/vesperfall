import { createGame, applyAction } from '../src/engine/engine';
import type { Action, GameState, PlayerId, DeckSpec, CardInst } from '../src/engine/types';
import { starterDeck } from '../src/engine/decks';
import { buildDeckInstances } from '../src/engine/engine';

export function game(opts: { seed?: number; first?: PlayerId; decks?: [DeckSpec, DeckSpec]; orders?: [string[] | null, string[] | null]; levels?: [number, number] } = {}): GameState {
  const decks = opts.decks ?? [starterDeck('dawn', opts.levels?.[0] ?? 1), starterDeck('umbral', opts.levels?.[1] ?? 1)];
  const deckOrders = opts.orders ? (opts.orders.map((o, i) => (o ? orderDeck(buildDeckInstances(decks[i], i as PlayerId), o, i as PlayerId) : null)) as [CardInst[] | null, CardInst[] | null]) : undefined;
  return createGame({ players: [{ name: 'A', deck: decks[0] }, { name: 'B', deck: decks[1] }], seed: opts.seed ?? 42, firstPlayer: opts.first ?? 0, deckOrders });
}

/** Put the named cards (by cardId) on top of the deck in order; the rest follow. */
function orderDeck(insts: CardInst[], top: string[], p: PlayerId): CardInst[] {
  const pool = insts.slice();
  const out: CardInst[] = [];
  for (const id of top) {
    const i = pool.findIndex((c) => c.cardId === id);
    if (i < 0) throw new Error(`card ${id} not in deck`);
    out.push(pool.splice(i, 1)[0]);
  }
  return [...out, ...pool].map((c, k) => ({ ...c, inst: `p${p}d${k}` }));
}

export function act(st: GameState, a: Action): GameState { return applyAction(st, a); }
export function handCard(st: GameState, p: PlayerId, cardId: string) {
  const c = st.players[p].hand.find((x) => x.cardId === cardId);
  if (!c) throw new Error(`${cardId} not in hand of ${p}: ${st.players[p].hand.map((x) => x.cardId).join(',')}`);
  return c;
}
/** Give a player essence directly (test convenience). */
export function withEssence(st: GameState, p: PlayerId, n: number): GameState {
  const s = structuredClone(st); s.players[p].essence = n; return s;
}
export function endTurn(st: GameState): GameState { return applyAction(st, { type: 'endTurn', player: st.active }); }
