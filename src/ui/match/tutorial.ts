import type { GameState } from '../../engine/types';
import { deckFrom } from '../../engine/decks';
import type { DeckSpec } from '../../engine/types';

export interface TutorialStep { title: string; text: string; done: (st: GameState, ctx: { phaseUi: string }) => boolean; when?: (st: GameState) => boolean }

/** Fixed deck orders so the guided match always teaches the same things. */
export const TUTORIAL_PLAYER_DECK: DeckSpec = deckFrom('Lantern Primer', 'dawn', [['d_acolyte', 2], ['d_footman', 2], ['d_lance', 2], ['d_hawk', 2], ['d_knight', 2], ['d_torch', 2], ['d_candle', 2], ['d_sister', 2], ['d_guard', 2], ['d_captain', 2], ['d_chaplain', 2], ['d_cavalry', 2], ['d_arrow', 2], ['d_hymn', 2], ['n_bear', 2]]);
export const TUTORIAL_PLAYER_ORDER = ['d_acolyte', 'd_footman', 'd_lance', 'd_hawk', 'd_knight', 'd_torch', 'd_candle', 'd_sister', 'd_guard', 'd_arrow', 'd_captain', 'd_hymn', 'd_chaplain', 'd_cavalry'];
export const TUTORIAL_BOT_DECK: DeckSpec = deckFrom('Pip\'s Practice Deck', 'umbral', [['u_rat', 2], ['u_courtier', 2], ['u_shambler', 2], ['u_leech', 2], ['u_bat', 2], ['u_shade', 2], ['u_hound', 2], ['u_touch', 2], ['u_siphon', 2], ['u_wagon', 2], ['u_reaper', 2], ['u_scholar', 2], ['u_assassin', 2], ['u_gloamknight', 2], ['n_bear', 2]]);
export const TUTORIAL_BOT_ORDER = ['u_rat', 'u_courtier', 'u_shambler', 'u_leech', 'u_bat', 'u_hound', 'u_shade', 'u_touch', 'u_scholar', 'u_siphon', 'u_wagon', 'u_reaper'];

export const TUTORIAL_STEPS: TutorialStep[] = [
  { title: 'Welcome to Aurenne', text: 'This is your hand. Every card has a cost in the top-left gem, paid with essence (the crystals by your hero). You have 1 essence. Click Hearth Acolyte to play it.', done: (st) => st.players[0].board.length >= 1 },
  { title: 'Creatures', text: 'Hearth Acolyte restored 2 health as it arrived. Creatures cannot attack on the turn they enter (unless they are Swift). Press End Turn (or E).', done: (st) => st.turn >= 2 },
  { title: 'The enemy moves', text: 'Your opponent plays on their turn. Watch what they do, then it is your turn again with 2 essence.', done: (st) => st.turn >= 3 && st.active === 0 },
  { title: 'More essence', text: 'You gain one essence crystal each turn. Play Oathbound Footman (2) — it has Ward, which blocks the first damage it would take each turn.', done: (st) => st.players[0].board.some((c) => c.cardId === 'd_footman') },
  { title: 'Attacking', text: 'Hearth Acolyte is ready now. Click it to select it as an attacker, then press Attack. Your opponent may block with their creatures.', done: (st) => st.turn >= 3 && (st.phase === 'main2' || st.phase === 'block' || st.turn > 3), when: (st) => st.active === 0 && st.turn >= 3 },
  { title: 'Combat', text: 'Unblocked attackers hit the enemy hero. Blocked ones fight the blocker: both deal damage at once. After combat you can still play cards, then end your turn.', done: (st) => st.turn >= 4 },
  { title: 'Blocking', text: 'When the enemy attacks you will see their attackers glow red. Click one of your creatures, then click an attacker to block it. Or press "No block" to take the damage.', done: (st) => st.turn >= 5, when: (st) => st.turn === 4 },
  { title: 'Spells', text: 'Dawn\'s Lance deals 3 damage to an enemy creature. Click it, then click the target. Spells with targets light up what they can hit.', done: (st) => st.players[0].graveyard.some((g) => g.cardId === 'd_lance'), when: (st) => st.active === 0 && st.turn >= 5 },
  { title: 'Your Oath', text: 'Your Oath (bottom bar) costs 2 essence, once per turn. Dawn\'s oath, Kindle, restores 2 health to any target. Use it when you have essence to spare.', done: (st) => st.players[0].oathUsed || st.turn >= 9, when: (st) => st.active === 0 && st.turn >= 6 },
  { title: 'Reduce them to ash', text: 'That is everything. Trade well, keep Ward in front, and bring the enemy hero to 0. Good luck, Lanternbearer.', done: () => false, when: (st) => st.turn >= 7 },
];
