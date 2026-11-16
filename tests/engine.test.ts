import { describe, it, expect } from 'vitest';
import { game, act, handCard, withEssence, endTurn } from './helpers';
import { applyAction, validateAction, legalActions, stateHash, viewFor, cloneState, findCreature, effAttack, effHealth } from '../src/engine/engine';
import { RULES } from '../src/engine/types';
import { scaleStat, scaleAmount, upgradeCost } from '../src/engine/levels';
import { getCard } from '../src/engine/cards';

describe('game setup and turn flow', () => {
  it('deals starting hands, with an extra card for the second player', () => {
    const st = game();
    expect(st.players[0].hand.length).toBe(RULES.startingHand);
    expect(st.players[1].hand.length).toBe(RULES.startingHand + 1);
    expect(st.turn).toBe(1);
    expect(st.active).toBe(0);
    expect(st.players[0].essence).toBe(1);
    expect(st.players[0].maxEssence).toBe(1);
  });
  it('first player does not draw on turn 1; second player draws on turn 2', () => {
    let st = game();
    expect(st.players[0].deck.length).toBe(30 - RULES.startingHand);
    st = endTurn(st);
    expect(st.active).toBe(1);
    expect(st.turn).toBe(2);
    expect(st.players[1].hand.length).toBe(RULES.startingHand + 2);
    expect(st.players[1].essence).toBe(1);
    st = endTurn(st);
    expect(st.players[0].essence).toBe(2);
  });
  it('essence caps at 10', () => {
    let st = game();
    for (let i = 0; i < 30; i++) st = endTurn(st);
    expect(st.players[0].maxEssence).toBe(RULES.maxEssence);
    expect(st.players[1].maxEssence).toBe(RULES.maxEssence);
  });
  it('rejects acting out of turn', () => {
    const st = game();
    expect(validateAction(st, { type: 'endTurn', player: 1 })).toBe('Not your turn');
    expect(() => applyAction(st, { type: 'endTurn', player: 1 })).toThrow();
  });
  it('is deterministic: same seed, same hash', () => {
    const a = game({ seed: 7 }), b = game({ seed: 7 }), c = game({ seed: 8 });
    expect(stateHash(a)).toBe(stateHash(b));
    expect(stateHash(a)).not.toBe(stateHash(c));
    expect(stateHash(endTurn(a))).toBe(stateHash(endTurn(b)));
  });
  it('fatigue damages the hero when the deck is empty', () => {
    let st = game();
    st.players[0].deck = [];
    st = endTurn(st); st = endTurn(st); // back to player 0 who draws from empty
    expect(st.players[0].fatigue).toBe(1);
    expect(st.players[0].health).toBe(29);
    st = endTurn(st); st = endTurn(st);
    expect(st.players[0].health).toBe(27);
  });
  it('burns draws past the hand limit', () => {
    let st = game();
    st = endTurn(st);
    st.players[0].hand = Array.from({ length: RULES.maxHand }, (_, i) => ({ inst: `x${i}`, cardId: 'd_acolyte', level: 1 }));
    const g = st.players[0].graveyard.length;
    st = endTurn(st);
    expect(st.players[0].hand.length).toBe(RULES.maxHand);
    expect(st.players[0].graveyard.length).toBe(g + 1);
  });
});

describe('playing cards', () => {
  it('plays a creature, pays essence, and it cannot attack the turn it arrives', () => {
    let st = game({ orders: [['d_acolyte', 'd_squire', 'd_footman', 'd_knight'], null] });
    const c = handCard(st, 0, 'd_acolyte');
    st = act(st, { type: 'play', player: 0, inst: c.inst });
    expect(st.players[0].essence).toBe(0);
    expect(st.players[0].board.length).toBe(1);
    expect(validateAction(st, { type: 'attack', player: 0, attackers: [c.inst] })).toMatch(/cannot attack/);
  });
  it('refuses to play a card you cannot afford', () => {
    const st = game({ orders: [['d_acolyte', 'd_squire', 'd_footman', 'd_knight'], null] });
    const c = handCard(st, 0, 'd_knight');
    expect(validateAction(st, { type: 'play', player: 0, inst: c.inst })).toBe('Not enough essence');
  });
  it('Kindle heals the hero on play and triggers onHeal allies', () => {
    let st = game({ orders: [['d_novice', 'd_acolyte', 'd_footman', 'd_knight'], null] });
    st = withEssence(st, 0, 5);
    st.players[0].health = 20;
    st = act(st, { type: 'play', player: 0, inst: handCard(st, 0, 'd_novice').inst });
    const novice = st.players[0].board[0];
    st = act(st, { type: 'play', player: 0, inst: handCard(st, 0, 'd_acolyte').inst });
    expect(st.players[0].health).toBe(22);
    expect(findCreature(st, novice.inst)!.c.attack).toBe(2); // +1/+1 from onHeal
    expect(findCreature(st, novice.inst)!.c.health).toBe(4);
  });
  it('targeted spells need a legal target and respect shroud', () => {
    let st = game();
    st = withEssence(st, 0, 5);
    st.players[0].hand = [{ inst: 'l', cardId: 'd_lance', level: 1 }];
    expect(validateAction(st, { type: 'play', player: 0, inst: 'l' })).toBe('No legal target');
    // nothing on the board -> spell is unplayable at all
    expect(legalActions(st, 0).some((a) => a.type === 'play' && a.inst === 'l')).toBe(false);
    st.players[1].board.push({ ...st.players[1].board[0] ?? {}, inst: 'dancer', cardId: 'n_dancer', level: 1, attack: 3, health: 2, maxHealth: 2, baseAttack: 3, baseHealth: 2, keywords: ['shroud', 'swift'], exhausted: false, enteredTurn: 1, wardUsed: false, shackled: false, silenced: false, tempAttack: 0, tempHealth: 0, wither: 0, owner: 1, controller: 1, relentlessBonus: 0, firedOnce: [] });
    expect(validateAction(st, { type: 'play', player: 0, inst: 'l', targets: ['dancer'] })).toBe('Invalid target');
    st.players[1].board.push({ ...st.players[1].board[0], inst: 'rat', cardId: 'u_rat', keywords: [], attack: 2, health: 1, maxHealth: 1 });
    expect(validateAction(st, { type: 'play', player: 0, inst: 'l', targets: ['rat'] })).toBeNull();
    st = act(st, { type: 'play', player: 0, inst: 'l', targets: ['rat'] });
    expect(st.players[1].board.map((c) => c.inst)).toEqual(['dancer']);
  });
  it('board limit is enforced', () => {
    let st = game();
    st = withEssence(st, 0, 10);
    st.players[0].hand = Array.from({ length: 7 }, (_, i) => ({ inst: `h${i}`, cardId: 'd_acolyte', level: 1 }));
    for (let i = 0; i < 6; i++) st = act(st, { type: 'play', player: 0, inst: `h${i}` });
    expect(validateAction(st, { type: 'play', player: 0, inst: 'h6' })).toBe('Your board is full');
  });
  it('relics with duration expire and auras apply to the right tribe', () => {
    let st = game();
    st = withEssence(st, 0, 10);
    st.players[0].hand = [{ inst: 'b', cardId: 'd_beacon', level: 1 }, { inst: 'k', cardId: 'd_knight', level: 1 }, { inst: 'a', cardId: 'd_acolyte', level: 1 }, { inst: 's', cardId: 'n_shrine', level: 1 }];
    st = act(st, { type: 'play', player: 0, inst: 'b' });
    st = act(st, { type: 'play', player: 0, inst: 'k' });
    st = act(st, { type: 'play', player: 0, inst: 'a' });
    st = act(st, { type: 'play', player: 0, inst: 's' });
    const k = findCreature(st, 'k')!.c, a = findCreature(st, 'a')!.c;
    expect(effAttack(st, k)).toBe(4); expect(effHealth(st, k)).toBe(4);
    expect(effAttack(st, a)).toBe(1);
    expect(st.players[0].relics.length).toBe(2);
    st = endTurn(st); st = endTurn(st); // shrine gives +1 essence at start of turn
    expect(st.players[0].essence).toBe(3);
    st = endTurn(st); st = endTurn(st);
    st = endTurn(st); st = endTurn(st);
    expect(st.players[0].relics.map((r) => r.cardId)).toEqual(['d_beacon']);
  });
  it('sacrifice spells require a sacrifice and cannot buff the sacrificed creature', () => {
    let st = game();
    st = withEssence(st, 0, 10);
    st.players[0].hand = [{ inst: 'd', cardId: 'u_devour', level: 1 }, { inst: 'a', cardId: 'd_acolyte', level: 1 }, { inst: 'k', cardId: 'd_knight', level: 1 }];
    st = act(st, { type: 'play', player: 0, inst: 'a' });
    st = act(st, { type: 'play', player: 0, inst: 'k' });
    expect(validateAction(st, { type: 'play', player: 0, inst: 'd', targets: ['k'] })).toBe('Choose a creature to sacrifice');
    expect(validateAction(st, { type: 'play', player: 0, inst: 'd', targets: ['k'], sacrifice: 'k' })).toBe('Cannot target the sacrificed creature');
    st = act(st, { type: 'play', player: 0, inst: 'd', targets: ['k'], sacrifice: 'a' });
    expect(st.players[0].board.map((c) => c.inst)).toEqual(['k']);
    expect(findCreature(st, 'k')!.c.attack).toBe(6);
    expect(st.players[0].graveyard.some((g) => g.inst === 'a')).toBe(true);
  });
  it('Gravecaller reanimates a cheap creature from the graveyard', () => {
    let st = game();
    st = withEssence(st, 0, 10);
    st.players[0].graveyard = [{ inst: 'g1', cardId: 'd_knight', level: 1 }, { inst: 'g2', cardId: 'd_colossus', level: 1 }];
    st.players[0].hand = [{ inst: 'gc', cardId: 'u_gravecaller', level: 1 }];
    const acts = legalActions(st, 0).filter((a) => a.type === 'play');
    expect(acts.map((a: any) => a.targets)).toEqual([['g1']]);
    st = act(st, acts[0]);
    expect(st.players[0].board.map((c) => c.cardId).sort()).toEqual(['d_knight', 'u_gravecaller']);
  });
  it('the oath costs 2 essence and can be used once per turn', () => {
    let st = game();
    st = withEssence(st, 0, 5);
    st.players[0].health = 20;
    st = act(st, { type: 'oath', player: 0, target: 'hero:0' });
    expect(st.players[0].health).toBe(22);
    expect(st.players[0].essence).toBe(3);
    expect(validateAction(st, { type: 'oath', player: 0, target: 'hero:0' })).toBe('Oath already used this turn');
  });
});

describe('combat', () => {
  function setupBoard(a: string[], b: string[]) {
    let st = game();
    st = withEssence(st, 0, 10);
    st.players[0].hand = a.map((id, i) => ({ inst: `a${i}`, cardId: id, level: 1 }));
    a.forEach((_, i) => { st = act(st, { type: 'play', player: 0, inst: `a${i}` }); });
    st = endTurn(st);
    st = withEssence(st, 1, 10);
    st.players[1].hand = b.map((id, i) => ({ inst: `b${i}`, cardId: id, level: 1 }));
    b.forEach((_, i) => { st = act(st, { type: 'play', player: 1, inst: `b${i}` }); });
    st = endTurn(st);
    return st; // player 0's turn, all of a's creatures ready
  }
  it('unblocked attackers hit the hero and become exhausted', () => {
    let st = setupBoard(['d_knight'], []);
    st = act(st, { type: 'attack', player: 0, attackers: ['a0'] });
    expect(st.phase).toBe('main2'); // no blockers -> resolved immediately
    expect(st.players[1].health).toBe(27);
    expect(findCreature(st, 'a0')!.c.exhausted).toBe(false); // steadfast
    expect(validateAction(st, { type: 'attack', player: 0, attackers: ['a0'] })).toMatch(/already attacked/);
  });
  it('defender chooses blocks; blocked creatures trade; piercing leaks through', () => {
    let st = setupBoard(['d_cavalry'], ['u_rat']); // 5/3 piercing swift vs 2/1
    st = act(st, { type: 'attack', player: 0, attackers: ['a0'] });
    expect(st.phase).toBe('block');
    expect(validateAction(st, { type: 'endTurn', player: 0 })).toBe('Waiting for blocks');
    st = act(st, { type: 'block', player: 1, blocks: [{ attacker: 'a0', blocker: 'b0' }] });
    expect(st.players[1].board.length).toBe(0);
    expect(st.players[1].health).toBe(26); // 5 - 1 lethal to rat = 4 pierces
    expect(findCreature(st, 'a0')!.c.health).toBe(1);
    expect(findCreature(st, 'a0')!.c.exhausted).toBe(true);
    expect(st.phase).toBe('main2');
  });
  it('winged attackers can only be blocked by winged or farsight', () => {
    let st = setupBoard(['d_hawk'], ['u_rat', 'n_pikeman']);
    st = act(st, { type: 'attack', player: 0, attackers: ['a0'] });
    expect(validateAction(st, { type: 'block', player: 1, blocks: [{ attacker: 'a0', blocker: 'b0' }] })).toMatch(/cannot block/);
    expect(validateAction(st, { type: 'block', player: 1, blocks: [{ attacker: 'a0', blocker: 'b1' }] })).toBeNull();
  });
  it('dread needs two blockers', () => {
    let st = setupBoard(['u_shade'], ['u_rat', 'u_rat']);
    st = act(st, { type: 'attack', player: 0, attackers: ['a0'] });
    expect(validateAction(st, { type: 'block', player: 1, blocks: [{ attacker: 'a0', blocker: 'b0' }] })).toMatch(/two blockers/);
    st = act(st, { type: 'block', player: 1, blocks: [{ attacker: 'a0', blocker: 'b0' }, { attacker: 'a0', blocker: 'b1' }] });
    expect(st.players[0].board.length).toBe(0); // 3/2 shade dies to two rats (2+2)
    expect(st.players[1].board.length).toBe(0); // 3 damage: 1 lethal to the first rat, 2 to the second
  });
  it('ward prevents the first damage each turn', () => {
    let st = setupBoard(['d_footman'], ['u_assassin']); // 2/3 ward vs 3/1 quick
    st = act(st, { type: 'attack', player: 0, attackers: ['a0'] });
    st = act(st, { type: 'block', player: 1, blocks: [{ attacker: 'a0', blocker: 'b0' }] });
    const f = findCreature(st, 'a0')!.c;
    expect(f.health).toBe(3); expect(f.wardUsed).toBe(true);
    expect(st.players[1].board.length).toBe(0);
  });
  it('quick deals damage first and venom destroys', () => {
    let st = setupBoard(['u_assassin'], ['u_leech']); // 3/1 quick vs 1/3 venom blocker
    st = act(st, { type: 'attack', player: 0, attackers: ['a0'] });
    st = act(st, { type: 'block', player: 1, blocks: [{ attacker: 'a0', blocker: 'b0' }] });
    expect(st.players[1].board.length).toBe(0); // leech dies in the quick step before it can bite
    expect(st.players[0].board.length).toBe(1);
    let st2 = setupBoard(['u_leech'], ['n_bear']); // 1/3 venom attacks into a 4/4
    st2 = act(st2, { type: 'attack', player: 0, attackers: ['a0'] });
    st2 = act(st2, { type: 'block', player: 1, blocks: [{ attacker: 'a0', blocker: 'b0' }] });
    expect(st2.players[1].board.length).toBe(0);
    expect(st2.players[0].board.length).toBe(0);
  });
  it('radiant heals the hero for damage dealt', () => {
    let st = setupBoard(['d_sister'], []);
    st.players[0].health = 20;
    st = act(st, { type: 'attack', player: 0, attackers: ['a0'] });
    expect(st.players[1].health).toBe(28);
    expect(st.players[0].health).toBe(22);
  });
  it('hollow leaves a husk; death triggers fire; allies feed on deaths', () => {
    let st = setupBoard(['n_bear'], ['u_shambler', 'u_hound']);
    st = act(st, { type: 'attack', player: 0, attackers: ['a0'] });
    st = act(st, { type: 'block', player: 1, blocks: [{ attacker: 'a0', blocker: 'b0' }] });
    const b = st.players[1].board;
    expect(b.some((c) => c.cardId === 't_husk')).toBe(true);
    expect(b.find((c) => c.cardId === 'u_hound')!.attack).toBe(4);
  });
  it('exhausted creatures cannot block on the opponent\'s turn', () => {
    let st = setupBoard(['d_torch'], ['u_rat']);
    st = act(st, { type: 'attack', player: 0, attackers: ['a0'] });
    st = act(st, { type: 'block', player: 1, blocks: [] });
    st = endTurn(st);
    st = act(st, { type: 'attack', player: 1, attackers: ['b0'] });
    expect(st.phase).toBe('main2'); // the torchbearer is exhausted, so no block step
  });
  it('the game ends when a hero falls, and no further actions are accepted', () => {
    let st = setupBoard(['d_cavalry'], []);
    st.players[1].health = 3;
    st = act(st, { type: 'attack', player: 0, attackers: ['a0'] });
    expect(st.winner).toBe(0);
    expect(st.phase).toBe('ended');
    expect(validateAction(st, { type: 'endTurn', player: 0 })).toBe('The game is over');
  });
  it('concede ends the game for the other player', () => {
    const st = act(game(), { type: 'concede', player: 0 });
    expect(st.winner).toBe(1);
  });
});

describe('card levels', () => {
  it('stats scale about 10% per level with a bonus at Ascendant', () => {
    expect(scaleStat(3, 1)).toBe(3);
    expect(scaleStat(3, 4)).toBe(4);
    expect(scaleStat(5, 7)).toBe(9);
    expect(scaleStat(1, 3)).toBe(1);
    expect(scaleStat(0, 7)).toBe(0);
    expect(scaleAmount(3, 1)).toBe(3); expect(scaleAmount(3, 4)).toBe(4); expect(scaleAmount(3, 7)).toBe(5);
    for (let l = 1; l < 7; l++) expect(scaleStat(4, l + 1)).toBeGreaterThanOrEqual(scaleStat(4, l));
  });
  it('higher-level cards enter with bigger stats', () => {
    let st = game({ levels: [7, 1] });
    st = withEssence(st, 0, 10);
    st.players[0].hand = [{ inst: 'k', cardId: 'd_knight', level: 7 }];
    st = act(st, { type: 'play', player: 0, inst: 'k' });
    expect(st.players[0].board[0].attack).toBe(scaleStat(3, 7));
  });
  it('upgrade costs rise with level and stop at max', () => {
    expect(upgradeCost('common', 1)).toEqual({ cards: 2, cinders: 20 });
    expect(upgradeCost('legendary', 6)!.cinders).toBeGreaterThan(upgradeCost('legendary', 5)!.cinders);
    expect(upgradeCost('common', 7)).toBeNull();
  });
});

describe('views and hidden information', () => {
  it('a player view hides the opponent hand and both decks', () => {
    const st = game();
    const v = viewFor(st, 0);
    expect(v.players[1].hand.every((c) => c.cardId === '?')).toBe(true);
    expect(v.players[0].hand.every((c) => c.cardId !== '?')).toBe(true);
    expect(v.players[0].deck.every((c) => c.cardId === '?')).toBe(true);
  });
  it('a hidden card can be played with a reveal', () => {
    let st = game();
    const v = viewFor(st, 1); // player 1's view of player 0's turn
    const hidden = v.players[0].hand[0];
    const real = st.players[0].hand[0];
    const r = applyAction(v, { type: 'play', player: 0, inst: hidden.inst, reveal: { cardId: getCard(real.cardId).cost <= 1 ? real.cardId : 'd_acolyte', level: 1 } });
    expect(r.players[0].hand.length).toBe(3);
  });
  it('cloneState produces an independent copy', () => {
    const st = game(); const c = cloneState(st);
    c.players[0].health = 1;
    expect(st.players[0].health).toBe(30);
  });
});
