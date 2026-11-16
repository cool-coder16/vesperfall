import type { Creature, GameState, PlayerId } from '../engine/types';
import { effAttack, effHealth, other } from '../engine/engine';
import { getCard } from '../engine/cards';

const KW_VALUE: Record<string, number> = {
  swift: 0.6, ward: 1.4, piercing: 0.8, winged: 1.0, farsight: 0.3, venom: 1.5, radiant: 1.0, quick: 0.8, dread: 0.9, steadfast: 0.7, hollow: 0.6, shroud: 0.8, relentless: 0.8,
};

export function creatureValue(st: GameState, c: Creature): number {
  const a = effAttack(st, c), h = effHealth(st, c);
  let v = a * 1.0 + h * 0.75 + 0.5;
  if (!c.silenced) for (const k of c.keywords) v += KW_VALUE[k] ?? 0;
  const def = getCard(c.cardId);
  if ((def.effects?.length ?? 0) > 0 && !c.silenced) v += 0.6;
  if (c.shackled) v *= 0.6;
  return v;
}

/** Score of `st` from p's point of view. Higher is better for p. */
export function evaluate(st: GameState, p: PlayerId): number {
  if (st.winner !== null) {
    if (st.winner === 'draw') return 0;
    return st.winner === p ? 10000 - st.turn : -10000 + st.turn;
  }
  const me = st.players[p], en = st.players[other(p)];
  let s = 0;
  s += heroScore(me.health + me.armor) - heroScore(en.health + en.armor);
  for (const c of me.board) s += creatureValue(st, c);
  for (const c of en.board) s -= creatureValue(st, c);
  s += me.hand.length * 0.55 - en.hand.length * 0.55;
  s += me.relics.length * 1.5 - en.relics.length * 1.5;
  s += (me.maxEssence - en.maxEssence) * 0.8;
  s -= me.fatigue * 1.5;
  return s;
}

function heroScore(h: number): number {
  // Health matters more when it's low: 30 -> ~30, 10 -> ~15, 3 -> ~6
  if (h <= 0) return -200;
  return h <= 10 ? h * 1.5 : 15 + (h - 10) * 0.75;
}
