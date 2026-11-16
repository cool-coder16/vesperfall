// Bot decision making. A bot only ever sees `viewFor(state, p)`, so it cannot read the
// opponent's hand or either deck. Difficulty comes from search width, lookahead, and noise.

import type { Action, Creature, GameState, PlayerId } from '../engine/types';
import { applyAction, canAttack, canBlock, findCreature, hasKw, legalActions, other, potentialBlockers, viewFor, whoActs, effAttack, effHealth } from '../engine/engine';
import { evaluate } from './eval';
import { getCard } from '../engine/cards';

export interface BotParams {
  /** 0..1 chance to take a random legal action instead of the best. */
  mistakeRate: number;
  /** Gaussian-ish noise added to evaluations. */
  noise: number;
  /** Beam width for main-phase play sequences (1 = greedy). */
  beam: number;
  /** Max depth of play sequence considered per decision. */
  depth: number;
  /** Attack planning: 'all' (always all-in), 'greedy' (per-creature), 'subsets' (search), 'subsets+blocks' (search with opponent block prediction). */
  attack: 'all' | 'greedy' | 'subsets' | 'subsets+blocks';
  /** Block planning: 'none', 'greedy', 'search'. */
  block: 'none' | 'greedy' | 'search';
  /** Cheap randomness source for mistakes/noise (seeded for tests). */
  rand?: () => number;
}

export const PARAM_LEVELS: BotParams[] = [
  { mistakeRate: 0.55, noise: 4.0, beam: 1, depth: 1, attack: 'all', block: 'none' },        // 1
  { mistakeRate: 0.40, noise: 3.0, beam: 1, depth: 1, attack: 'all', block: 'none' },        // 2
  { mistakeRate: 0.28, noise: 2.0, beam: 1, depth: 1, attack: 'all', block: 'greedy' },      // 3
  { mistakeRate: 0.18, noise: 1.5, beam: 1, depth: 1, attack: 'greedy', block: 'greedy' },   // 4
  { mistakeRate: 0.10, noise: 1.0, beam: 1, depth: 2, attack: 'greedy', block: 'greedy' },   // 5
  { mistakeRate: 0.06, noise: 0.7, beam: 2, depth: 2, attack: 'subsets', block: 'greedy' },  // 6
  { mistakeRate: 0.03, noise: 0.5, beam: 2, depth: 2, attack: 'subsets', block: 'search' },  // 7
  { mistakeRate: 0.015, noise: 0.3, beam: 3, depth: 2, attack: 'subsets+blocks', block: 'search' }, // 8
  { mistakeRate: 0.0, noise: 0.2, beam: 3, depth: 3, attack: 'subsets+blocks', block: 'search' },  // 9
  { mistakeRate: 0.0, noise: 0.1, beam: 4, depth: 3, attack: 'subsets+blocks', block: 'search' },  // 10
  { mistakeRate: 0.0, noise: 0.0, beam: 5, depth: 3, attack: 'subsets+blocks', block: 'search' },  // 11
  { mistakeRate: 0.0, noise: 0.0, beam: 6, depth: 4, attack: 'subsets+blocks', block: 'search' },  // 12
];

export function paramsForLevel(level: number): BotParams {
  return { ...PARAM_LEVELS[Math.max(1, Math.min(12, level)) - 1] };
}

function rnd(p: BotParams): number { return p.rand ? p.rand() : Math.random(); }
function noisy(v: number, p: BotParams): number { return p.noise ? v + (rnd(p) - 0.5) * 2 * p.noise : v; }

function safeApply(st: GameState, a: Action): GameState | null {
  try { return applyAction(st, a); } catch { return null; }
}

/** The single next action the bot wants to take from this (full) state. Call repeatedly until the turn passes. */
export function botNextAction(full: GameState, p: PlayerId, params: BotParams): Action | null {
  if (full.winner !== null || whoActs(full) !== p) return null;
  const st = viewFor(full, p);
  if (st.phase === 'block') return chooseBlocks(st, p, params);

  const plays = legalActions(st, p).filter((a) => a.type === 'play' || a.type === 'oath');
  if (plays.length && params.mistakeRate > 0 && rnd(params) < params.mistakeRate) {
    const pick = plays[Math.floor(rnd(params) * plays.length)];
    return pick;
  }
  const best = bestPlay(st, p, params);
  if (best) return best;
  if (st.phase === 'main1') {
    const atk = chooseAttack(st, p, params);
    if (atk) return atk;
  }
  return { type: 'endTurn', player: p };
}

/** Beam search over sequences of play/oath actions; returns the first action of the best sequence if it beats passing. */
function bestPlay(st: GameState, p: PlayerId, params: BotParams): Action | null {
  const base = evaluate(st, p);
  type Node = { st: GameState; first: Action | null; score: number };
  let frontier: Node[] = [{ st, first: null, score: base }];
  let best: Node = frontier[0];
  for (let d = 0; d < params.depth; d++) {
    const next: Node[] = [];
    for (const n of frontier) {
      const acts = legalActions(n.st, p).filter((a) => a.type === 'play' || a.type === 'oath');
      for (const a of acts) {
        const s2 = safeApply(n.st, a); if (!s2) continue;
        const score = noisy(evaluate(s2, p), params) + (a.type === 'play' ? 0.05 : 0); // tiny tempo bias toward using cards
        next.push({ st: s2, first: n.first ?? a, score });
      }
    }
    if (!next.length) break;
    next.sort((a, b) => b.score - a.score);
    frontier = next.slice(0, params.beam);
    if (frontier[0].score > best.score) best = frontier[0];
  }
  if (best.first && best.score > base + 0.01) return best.first;
  return null;
}

function attackCandidates(st: GameState, p: PlayerId): Creature[] {
  return st.players[p].board.filter((c) => canAttack(st, c));
}

function chooseAttack(st: GameState, p: PlayerId, params: BotParams): Action | null {
  const cands = attackCandidates(st, p);
  if (!cands.length) return null;
  const ids = cands.map((c) => c.inst);
  if (params.attack === 'all') return { type: 'attack', player: p, attackers: ids };

  const opp = other(p);
  const blockers = potentialBlockers(st, opp);
  const scoreSubset = (subset: string[]): number => {
    if (!subset.length) return evaluate(st, p);
    const s1 = safeApply(st, { type: 'attack', player: p, attackers: subset });
    if (!s1) return -Infinity;
    if (s1.phase !== 'block') return evaluate(s1, p);
    // predict the opponent's response
    let reply: Action;
    if (params.attack === 'subsets+blocks') reply = chooseBlocks(s1, opp, { ...params, noise: 0, mistakeRate: 0, block: 'search' });
    else reply = { type: 'block', player: opp, blocks: greedyBlocksForDefender(s1, opp, 'cautious') };
    const s2 = safeApply(s1, reply);
    return s2 ? evaluate(s2, p) : -Infinity;
  };

  if (params.attack === 'greedy') {
    // each creature attacks if it isn't obviously eaten by a single blocker
    const chosen: string[] = [];
    for (const c of cands) {
      const a = effAttack(st, c), h = effHealth(st, c);
      const eaten = blockers.some((b) => canBlock(st, b, c) && effAttack(st, b) >= h && effHealth(st, b) > a && !hasKw(c, 'venom'));
      if (!eaten || hasKw(c, 'ward')) chosen.push(c.inst);
    }
    if (!chosen.length) return null;
    return { type: 'attack', player: p, attackers: chosen };
  }

  // subset search (<= 2^6 = 64 subsets)
  let bestScore = noisy(scoreSubset([]), params), bestSet: string[] = [];
  const n = ids.length;
  for (let mask = 1; mask < 1 << n; mask++) {
    const subset = ids.filter((_, i) => mask & (1 << i));
    const sc = noisy(scoreSubset(subset), params);
    if (sc > bestScore) { bestScore = sc; bestSet = subset; }
  }
  return bestSet.length ? { type: 'attack', player: p, attackers: bestSet } : null;
}

/** Simple heuristic blocks: block when the trade is favourable or lethal looms. */
function greedyBlocksForDefender(st: GameState, p: PlayerId, mode: 'cautious' | 'normal'): { attacker: string; blocker: string }[] {
  const attackers = (st.pendingAttack ?? []).map((id) => findCreature(st, id)?.c).filter((c): c is Creature => !!c);
  const free = potentialBlockers(st, p).slice();
  const me = st.players[p];
  const incoming = attackers.reduce((s, a) => s + effAttack(st, a), 0);
  const lethal = incoming >= me.health + me.armor;
  const blocks: { attacker: string; blocker: string }[] = [];
  const sorted = attackers.slice().sort((a, b) => effAttack(st, b) - effAttack(st, a));
  for (const a of sorted) {
    if (hasKw(a, 'dread')) {
      const two = free.filter((b) => canBlock(st, b, a)).slice(0, 2);
      if (two.length === 2 && (lethal || two.reduce((s, b) => s + effAttack(st, b), 0) >= effHealth(st, a))) {
        for (const b of two) { blocks.push({ attacker: a.inst, blocker: b.inst }); free.splice(free.indexOf(b), 1); }
      }
      continue;
    }
    let bestB: Creature | null = null, bestV = -Infinity;
    for (const b of free) {
      if (!canBlock(st, b, a)) continue;
      const kills = effAttack(st, b) >= effHealth(st, a) || hasKw(b, 'venom');
      const dies = (effAttack(st, a) >= effHealth(st, b) || hasKw(a, 'venom')) && !(hasKw(b, 'ward') && !b.wardUsed);
      let v = 0;
      if (kills && !dies) v = 10 + effAttack(st, a);
      else if (kills && dies) v = effAttack(st, a) * 1.2 + effHealth(st, a) - effAttack(st, b) - effHealth(st, b) * 0.8 + 1;
      else if (!kills && !dies) v = 2 + effAttack(st, a) * 0.5;
      else v = lethal ? 1 : -5;
      if (lethal) v += effAttack(st, a) * 2;
      if (v > bestV) { bestV = v; bestB = b; }
    }
    if (bestB && (bestV > (mode === 'cautious' ? 0.5 : 0) || lethal)) { blocks.push({ attacker: a.inst, blocker: bestB.inst }); free.splice(free.indexOf(bestB), 1); }
  }
  return blocks;
}

function chooseBlocks(st: GameState, p: PlayerId, params: BotParams): Action {
  if (params.block === 'none') {
    // beginners block only when facing lethal, and clumsily
    const me = st.players[p];
    const attackers = (st.pendingAttack ?? []).map((id) => findCreature(st, id)?.c).filter((c): c is Creature => !!c);
    const incoming = attackers.reduce((s, a) => s + effAttack(st, a), 0);
    if (incoming < me.health) return { type: 'block', player: p, blocks: [] };
    return { type: 'block', player: p, blocks: greedyBlocksForDefender(st, p, 'normal') };
  }
  if (params.block === 'greedy') return { type: 'block', player: p, blocks: greedyBlocksForDefender(st, p, 'normal') };

  // search: enumerate assignments when small, otherwise greedy + local improvements
  const attackers = (st.pendingAttack ?? []).map((id) => findCreature(st, id)?.c).filter((c): c is Creature => !!c);
  const blockers = potentialBlockers(st, p);
  const options: (string | null)[][] = blockers.map((b) => [null, ...attackers.filter((a) => canBlock(st, b, a)).map((a) => a.inst)]);
  const total = options.reduce((s, o) => s * o.length, 1);
  const evalBlocks = (blocks: { attacker: string; blocker: string }[]): number => {
    const s2 = safeApply(st, { type: 'block', player: p, blocks });
    return s2 ? evaluate(s2, p) : -Infinity;
  };
  let best = greedyBlocksForDefender(st, p, 'normal');
  let bestScore = evalBlocks(best);
  const none = evalBlocks([]);
  if (none > bestScore) { best = []; bestScore = none; }
  if (total <= 3000) {
    const idx = new Array(blockers.length).fill(0);
    for (let k = 0; k < total; k++) {
      const blocks: { attacker: string; blocker: string }[] = [];
      for (let i = 0; i < blockers.length; i++) { const a = options[i][idx[i]]; if (a) blocks.push({ attacker: a, blocker: blockers[i].inst }); }
      const sc = noisy(evalBlocks(blocks), params);
      if (sc > bestScore) { bestScore = sc; best = blocks; }
      for (let i = 0; i < idx.length; i++) { idx[i]++; if (idx[i] < options[i].length) break; idx[i] = 0; }
    }
  } else {
    // local search: try toggling each blocker's assignment once
    for (let i = 0; i < blockers.length; i++) {
      for (const a of options[i]) {
        const blocks = best.filter((b) => b.blocker !== blockers[i].inst);
        if (a) blocks.push({ attacker: a, blocker: blockers[i].inst });
        const sc = evalBlocks(blocks);
        if (sc > bestScore) { bestScore = sc; best = blocks; }
      }
    }
  }
  return { type: 'block', player: p, blocks: best };
}

/** Plays a bot's whole turn (or block step) synchronously. Used by tests and the ladder script. */
export function botPlayTurn(full: GameState, p: PlayerId, params: BotParams, maxSteps = 60): GameState {
  let st = full;
  for (let i = 0; i < maxSteps; i++) {
    if (st.winner !== null || whoActs(st) !== p) break;
    const a = botNextAction(st, p, params);
    if (!a) break;
    const next = safeApply(st, a);
    if (!next) { st = applyAction(st, st.phase === 'block' ? { type: 'block', player: p, blocks: [] } : { type: 'endTurn', player: p }); continue; }
    st = next;
    if (a.type === 'endTurn' || a.type === 'block') break;
  }
  return st;
}

export function describeAction(st: GameState, a: Action): string {
  switch (a.type) {
    case 'play': { const c = st.players[a.player].hand.find((x) => x.inst === a.inst); return c && c.cardId !== '?' ? `plays ${getCard(c.cardId).name}` : 'plays a card'; }
    case 'attack': return `attacks with ${a.attackers.length} creature${a.attackers.length > 1 ? 's' : ''}`;
    case 'block': return a.blocks.length ? `blocks with ${a.blocks.length}` : 'does not block';
    case 'oath': return 'invokes their oath';
    case 'endTurn': return 'ends the turn';
    case 'concede': return 'concedes';
  }
}
