// The Vesperfall rules engine: a pure, deterministic reducer over GameState.
// Both multiplayer clients run exactly this code, so a state hash after each committed
// action can be compared to detect divergence or tampering.

import type {
  Action, CardDef, CardInst, Creature, DeckSpec, Effect, EffectAction, Faction, GameConfig, GameEvent, GameState,
  Keyword, PlayerId, PlayerState, Relic, TargetSpec,
} from './types';
import { RULES } from './types';
import { getCard } from './cards';
import { rngInt, seededShuffle } from './rng';
import { scaleAmount, scaledCard } from './levels';

export const HERO = (p: PlayerId) => `hero:${p}`;
export const isHeroId = (id: string) => id.startsWith('hero:');
export const heroOf = (id: string): PlayerId => (id === 'hero:0' ? 0 : 1);
export const other = (p: PlayerId): PlayerId => (p === 0 ? 1 : 0);

export class IllegalAction extends Error {}

// ───────────────────────── creation ─────────────────────────

/** Instance ids are positional in the *shuffled* deck (p0d0 is the first card player 0 will draw),
 *  so two clients agree on ids even when one of them cannot see what the card is. */
export function buildDeckInstances(deck: DeckSpec, player: PlayerId, seed?: number): CardInst[] {
  const cards = seed === undefined ? deck.cards.slice() : seededShuffle(deck.cards, seed);
  return cards.map((c, k) => ({ inst: `p${player}d${k}`, cardId: c.cardId, level: c.level }));
}

/** A fully hidden deck of the given size (used for the opponent in online play). */
export function hiddenDeck(player: PlayerId, size: number): CardInst[] {
  return Array.from({ length: size }, (_, k) => ({ inst: `p${player}d${k}`, cardId: '?', level: 1 }));
}

export function createGame(cfg: GameConfig): GameState {
  const first = cfg.firstPlayer ?? 0;
  const mk = (id: PlayerId): PlayerState => {
    const p = cfg.players[id];
    const order = cfg.deckOrders?.[id] ?? buildDeckInstances(p.deck, id, (cfg.seed ^ (id * 0x5bd1e995)) >>> 0);
    return {
      id, name: p.name, faction: p.deck.faction,
      health: RULES.startHealth, maxHealth: RULES.startHealth, armor: 0,
      essence: 0, maxEssence: 0,
      deck: order.slice(), hand: [], board: [], graveyard: [], relics: [],
      fatigue: 0, oathUsed: false, spellsCastThisTurn: 0, drawCount: 0,
    };
  };
  const st: GameState = {
    seq: 0, turn: 0, active: first, phase: 'main1',
    players: [mk(0), mk(1)], pendingAttack: null, winner: null, winReason: null,
    rng: (cfg.seed >>> 0) || 1, nextInst: 1000, events: [], firstPlayer: first, tutorial: cfg.tutorial,
  };
  const hand = cfg.startingHand ?? RULES.startingHand;
  for (let i = 0; i < hand; i++) { drawCard(st, 0); drawCard(st, 1); }
  drawCard(st, other(first)); // the second player gets one extra card
  startTurn(st, first);
  st.events = [];
  return st;
}

// ───────────────────────── clone ─────────────────────────

export function cloneState(s: GameState): GameState {
  return {
    ...s,
    players: [clonePlayer(s.players[0]), clonePlayer(s.players[1])],
    pendingAttack: s.pendingAttack ? s.pendingAttack.slice() : null,
    events: [],
  };
}
function clonePlayer(p: PlayerState): PlayerState {
  return {
    ...p,
    deck: p.deck.map((c) => ({ ...c })),
    hand: p.hand.map((c) => ({ ...c })),
    board: p.board.map((c) => ({ ...c, keywords: c.keywords.slice(), firedOnce: c.firedOnce.slice() })),
    graveyard: p.graveyard.map((c) => ({ ...c })),
    relics: p.relics.map((r) => ({ ...r })),
  };
}

// ───────────────────────── lookups ─────────────────────────

export function findCreature(st: GameState, inst: string): { c: Creature; p: PlayerId } | null {
  for (const p of [0, 1] as PlayerId[]) {
    const c = st.players[p].board.find((x) => x.inst === inst);
    if (c) return { c, p };
  }
  return null;
}

export function auraFor(st: GameState, c: Creature): { attack: number; health: number } {
  let attack = 0, health = 0;
  const owner = st.players[c.controller];
  const def = safeDef(c.cardId);
  for (const r of owner.relics) {
    const rd = safeDef(r.cardId);
    for (const e of rd?.effects ?? []) {
      if (e.action.kind !== 'aura') continue;
      if (e.action.filter === 'tribe' && def?.tribe !== e.action.tribe) continue;
      attack += e.action.attack; health += e.action.health;
    }
  }
  return { attack, health };
}

export function effAttack(st: GameState, c: Creature): number {
  return Math.max(0, c.attack + c.tempAttack + auraFor(st, c).attack);
}
export function effHealth(st: GameState, c: Creature): number {
  return c.health + c.tempHealth + auraFor(st, c).health;
}
export function effMaxHealth(st: GameState, c: Creature): number {
  return c.maxHealth + c.tempHealth + auraFor(st, c).health;
}
export function hasKw(c: Creature, k: Keyword): boolean {
  return !c.silenced && c.keywords.includes(k);
}
function safeDef(id: string): CardDef | null {
  return id === '?' ? null : getCard(id);
}

// ───────────────────────── drawing ─────────────────────────

function drawCard(st: GameState, p: PlayerId): void {
  const pl = st.players[p];
  pl.drawCount++;
  if (pl.deck.length === 0) {
    pl.fatigue++;
    st.events.push({ kind: 'draw', player: p, inst: '', cardId: '', fatigue: pl.fatigue });
    damageHero(st, p, pl.fatigue, 'fatigue');
    return;
  }
  const card = pl.deck.shift()!;
  if (pl.hand.length >= RULES.maxHand) {
    pl.graveyard.push(card);
    st.events.push({ kind: 'discard', player: p, inst: card.inst, cardId: card.cardId });
    return;
  }
  pl.hand.push(card);
  st.events.push({ kind: 'draw', player: p, inst: card.inst, cardId: card.cardId });
}

// ───────────────────────── damage & healing ─────────────────────────

function damageHero(st: GameState, p: PlayerId, amount: number, source?: string, radiantFor?: PlayerId): number {
  if (amount <= 0) return 0;
  const pl = st.players[p];
  let dealt = amount;
  if (pl.armor > 0) { const a = Math.min(pl.armor, dealt); pl.armor -= a; dealt -= a; }
  pl.health -= dealt;
  st.events.push({ kind: 'damage', target: HERO(p), amount, source });
  if (radiantFor !== undefined) healHero(st, radiantFor, amount);
  return amount;
}

function damageCreature(st: GameState, c: Creature, amount: number, source?: Creature | string, opts?: { venom?: boolean; radiantFor?: PlayerId }): number {
  if (amount <= 0) return 0;
  if (hasKw(c, 'ward') && !c.wardUsed) {
    c.wardUsed = true;
    st.events.push({ kind: 'damage', target: c.inst, amount: 0, prevented: true, source: typeof source === 'string' ? source : source?.inst });
    return 0;
  }
  c.health -= amount;
  if (opts?.venom) c.health = Math.min(c.health, -999);
  st.events.push({ kind: 'damage', target: c.inst, amount, source: typeof source === 'string' ? source : source?.inst });
  if (opts?.radiantFor !== undefined) healHero(st, opts.radiantFor, amount);
  if (effHealth(st, c) > 0) fireTriggers(st, 'onDamageTaken', c.controller, { source: c });
  return amount;
}

function healHero(st: GameState, p: PlayerId, amount: number): void {
  const pl = st.players[p];
  const real = Math.min(amount, pl.maxHealth - pl.health);
  if (real <= 0) return;
  pl.health += real;
  st.events.push({ kind: 'heal', target: HERO(p), amount: real });
  fireTriggers(st, 'onHeal', p);
}

function healCreature(st: GameState, c: Creature, amount: number): void {
  const real = Math.min(amount, c.maxHealth - c.health);
  if (real <= 0) return;
  c.health += real;
  st.events.push({ kind: 'heal', target: c.inst, amount: real });
}

// ───────────────────────── deaths ─────────────────────────

function checkDeaths(st: GameState): void {
  // loop because death triggers can cause further deaths
  for (let guard = 0; guard < 20; guard++) {
    const dying: Creature[] = [];
    for (const p of [0, 1] as PlayerId[]) {
      for (const c of st.players[p].board) if (effHealth(st, c) <= 0) dying.push(c);
    }
    if (dying.length === 0) break;
    for (const c of dying) {
      const pl = st.players[c.controller];
      const idx = pl.board.findIndex((x) => x.inst === c.inst);
      if (idx < 0) continue;
      pl.board.splice(idx, 1);
      st.players[c.owner].graveyard.push({ inst: c.inst, cardId: c.cardId, level: c.level });
      st.events.push({ kind: 'death', player: c.controller, inst: c.inst, cardId: c.cardId });
      runEffects(st, c.controller, c, 'onDeath', []);
      if (hasKw(c, 'hollow')) summon(st, c.controller, 't_husk', 1, c.level);
      fireTriggers(st, 'onAllyDeath', c.controller, { source: c });
    }
  }
  checkWinner(st);
}

function checkWinner(st: GameState): void {
  if (st.winner !== null) return;
  const d0 = st.players[0].health <= 0, d1 = st.players[1].health <= 0;
  if (d0 && d1) endGame(st, 'draw', 'Both heroes fell');
  else if (d0) endGame(st, 1, `${st.players[0].name} fell`);
  else if (d1) endGame(st, 0, `${st.players[1].name} fell`);
}

function endGame(st: GameState, winner: PlayerId | 'draw', reason: string): void {
  st.winner = winner; st.winReason = reason; st.phase = 'ended';
  st.events.push({ kind: 'gameOver', winner, reason });
}

// ───────────────────────── summoning ─────────────────────────

export function makeCreature(st: GameState, p: PlayerId, card: CardInst, def: CardDef): Creature {
  const s = scaledCard(def, card.level);
  return {
    inst: card.inst, cardId: card.cardId, level: card.level,
    attack: s.attack ?? 0, health: s.health ?? 1, maxHealth: s.health ?? 1,
    baseAttack: s.attack ?? 0, baseHealth: s.health ?? 1,
    keywords: (def.keywords ?? []).slice(), exhausted: false, enteredTurn: st.turn,
    wardUsed: false, shackled: false, silenced: false, tempAttack: 0, tempHealth: 0, wither: 0,
    owner: p, controller: p, relentlessBonus: 0, firedOnce: [],
  };
}

function summon(st: GameState, p: PlayerId, cardId: string, count: number, level = 1): Creature[] {
  const out: Creature[] = [];
  const pl = st.players[p];
  for (let i = 0; i < count; i++) {
    if (pl.board.length >= RULES.maxBoard) break;
    const inst = `t${st.nextInst++}`;
    const c = makeCreature(st, p, { inst, cardId, level }, getCard(cardId));
    pl.board.push(c);
    st.events.push({ kind: 'summon', player: p, inst, cardId });
    fireTriggers(st, 'onAllyEnter', p, { source: c });
    out.push(c);
  }
  return out;
}

// ───────────────────────── targeting ─────────────────────────

export function targetSlots(def: CardDef): TargetSpec[] {
  const slots: TargetSpec[] = [];
  for (const e of def.effects ?? []) {
    if (e.trigger !== 'onPlay') continue;
    if (e.action.kind === 'sacrifice') {
      if (e.then?.target && isChosen(e.then.target) && !slots.includes(e.then.target)) slots.push(e.then.target);
      continue;
    }
    if (e.target && isChosen(e.target) && !slots.includes(e.target)) slots.push(e.target);
  }
  return slots;
}
export function needsSacrifice(def: CardDef): boolean {
  return (def.effects ?? []).some((e) => e.trigger === 'onPlay' && e.action.kind === 'sacrifice');
}
export function isChosen(t: TargetSpec): boolean {
  return t === 'anyCreature' || t === 'enemyCreature' || t === 'allyCreature' || t === 'anyTarget' || t === 'graveyardCreature';
}

/** Legal candidate ids for a chosen target spec from player p's point of view. */
export function candidates(st: GameState, p: PlayerId, spec: TargetSpec, def?: CardDef, effect?: Effect): string[] {
  const me = st.players[p], en = st.players[other(p)];
  const enemies = en.board.filter((c) => !hasKw(c, 'shroud')).map((c) => c.inst);
  const allies = me.board.map((c) => c.inst);
  switch (spec) {
    case 'anyCreature': return [...allies, ...enemies];
    case 'enemyCreature': {
      if (effect && effect.action.kind === 'steal') { const mx = effect.action.maxAttack; return en.board.filter((c) => !hasKw(c, 'shroud') && effAttack(st, c) <= mx).map((c) => c.inst); }
      return enemies;
    }
    case 'allyCreature': return allies;
    case 'anyTarget': return [...allies, ...enemies, HERO(p), HERO(other(p))];
    case 'graveyardCreature': {
      const maxCost = effect?.action.kind === 'reanimate' ? effect.action.maxCost ?? 99 : 99;
      return me.graveyard.filter((g) => { const d = safeDef(g.cardId); return d && d.type === 'creature' && !d.token && d.cost <= maxCost; }).map((g) => g.inst);
    }
    default: return [];
  }
}

function resolveTargets(st: GameState, p: PlayerId, source: Creature | null, spec: TargetSpec | undefined, chosen: Record<string, string>, triggering?: Creature): string[] {
  const me = st.players[p], en = st.players[other(p)];
  switch (spec) {
    case undefined: case 'none': return [];
    case 'self': return source ? [source.inst] : [];
    case 'ownHero': return [HERO(p)];
    case 'enemyHero': return [HERO(other(p))];
    case 'allEnemies': return en.board.map((c) => c.inst);
    case 'allAllies': return me.board.filter((c) => !source || c.inst !== source.inst).map((c) => c.inst);
    case 'allCreatures': return [...me.board, ...en.board].map((c) => c.inst);
    case 'randomEnemy': {
      if (en.board.length === 0) return [];
      const r = rngInt(st.rng, en.board.length); st.rng = r.state;
      return [en.board[r.value].inst];
    }
    case 'randomAlly': {
      if (me.board.length === 0) return [];
      const r = rngInt(st.rng, me.board.length); st.rng = r.state;
      return [me.board[r.value].inst];
    }
    case 'weakestEnemy': { const s = en.board.slice().sort((a, b) => effAttack(st, a) - effAttack(st, b)); return s.length ? [s[0].inst] : []; }
    case 'strongestEnemy': { const s = en.board.slice().sort((a, b) => effAttack(st, b) - effAttack(st, a)); return s.length ? [s[0].inst] : []; }
    case 'triggering': return triggering ? [triggering.inst] : [];
    default: return chosen[spec] ? [chosen[spec]] : [];
  }
}

function checkCondition(st: GameState, p: PlayerId, e: Effect, targetId?: string): boolean {
  const me = st.players[p], en = st.players[other(p)];
  switch (e.condition) {
    case undefined: return true;
    case 'ownHeroBelowHalf': return me.health * 2 < me.maxHealth;
    case 'enemyHeroBelowHalf': return en.health * 2 < en.maxHealth;
    case 'controlsRelic': return me.relics.length > 0;
    case 'graveyardHasCreature': return me.graveyard.some((g) => safeDef(g.cardId)?.type === 'creature');
    case 'hasAllyTribe': return me.board.some((c) => safeDef(c.cardId)?.tribe === e.conditionTribe);
    case 'targetIsWithered': { const t = targetId ? findCreature(st, targetId) : null; return !!t && t.c.wither > 0; }
  }
}

// ───────────────────────── effect application ─────────────────────────

function applyEffectAction(st: GameState, p: PlayerId, source: Creature | null, level: number, act: EffectAction, targets: string[], sourceName: string): void {
  const amt = (a: number, scale?: boolean) => (scale ? scaleAmount(a, level) : a);
  switch (act.kind) {
    case 'damage':
      for (const t of targets) {
        if (isHeroId(t)) damageHero(st, heroOf(t), amt(act.amount, act.scale), sourceName);
        else { const f = findCreature(st, t); if (f) damageCreature(st, f.c, amt(act.amount, act.scale), sourceName); }
      }
      break;
    case 'damageHeroes':
      damageHero(st, 0, amt(act.amount, act.scale), sourceName); damageHero(st, 1, amt(act.amount, act.scale), sourceName); break;
    case 'heal':
      for (const t of targets) {
        if (isHeroId(t)) healHero(st, heroOf(t), amt(act.amount, act.scale));
        else { const f = findCreature(st, t); if (f) healCreature(st, f.c, amt(act.amount, act.scale)); }
      }
      break;
    case 'draw': for (let i = 0; i < act.count; i++) drawCard(st, p); break;
    case 'buff':
      for (const t of targets) {
        const f = findCreature(st, t); if (!f) continue;
        const a = amt(act.attack, act.scale), h = amt(act.health, act.scale);
        if (act.untilEndOfTurn) { f.c.tempAttack += a; f.c.tempHealth += h; }
        else { f.c.attack += a; f.c.health += h; f.c.maxHealth += h; }
        st.events.push({ kind: 'buff', target: t, attack: a, health: h });
      }
      break;
    case 'wither':
      for (const t of targets) {
        const f = findCreature(st, t); if (!f) continue;
        const n = amt(act.amount, act.scale);
        f.c.attack = Math.max(0, f.c.attack - n); f.c.health -= n; f.c.maxHealth -= n; f.c.wither += n;
        st.events.push({ kind: 'wither', target: t, amount: n });
      }
      break;
    case 'summon': summon(st, p, act.cardId, act.count, level); break;
    case 'destroy':
      for (const t of targets) { const f = findCreature(st, t); if (f) { f.c.health = -999; st.events.push({ kind: 'damage', target: t, amount: 0, source: sourceName }); } }
      break;
    case 'bounce':
      for (const t of targets) {
        const f = findCreature(st, t); if (!f) continue;
        const pl = st.players[f.p];
        pl.board.splice(pl.board.findIndex((x) => x.inst === t), 1);
        const d = safeDef(f.c.cardId);
        const ownerPl = st.players[f.c.owner];
        if (d && !d.token && ownerPl.hand.length < RULES.maxHand) ownerPl.hand.push({ inst: f.c.inst, cardId: f.c.cardId, level: f.c.level });
        else if (d && !d.token) ownerPl.graveyard.push({ inst: f.c.inst, cardId: f.c.cardId, level: f.c.level });
        st.events.push({ kind: 'bounce', inst: t });
      }
      break;
    case 'gainEssence': { const pl = st.players[p]; pl.essence = Math.min(RULES.maxEssence, pl.essence + act.amount); st.events.push({ kind: 'essence', player: p, essence: pl.essence, max: pl.maxEssence }); break; }
    case 'gainMaxEssence': { const pl = st.players[p]; pl.maxEssence = Math.min(RULES.maxEssence, pl.maxEssence + act.amount); pl.essence = Math.min(RULES.maxEssence, pl.essence + act.amount); st.events.push({ kind: 'essence', player: p, essence: pl.essence, max: pl.maxEssence }); break; }
    case 'grant':
      for (const t of targets) { const f = findCreature(st, t); if (f && !f.c.keywords.includes(act.keyword)) { f.c.keywords.push(act.keyword); st.events.push({ kind: 'keyword', target: t, keyword: act.keyword }); } }
      break;
    case 'shackle': for (const t of targets) { const f = findCreature(st, t); if (f) { f.c.shackled = true; st.events.push({ kind: 'shackle', target: t }); } } break;
    case 'silence': for (const t of targets) { const f = findCreature(st, t); if (f) { f.c.silenced = true; st.events.push({ kind: 'silence', target: t }); } } break;
    case 'reanimate': {
      const pl = st.players[p];
      for (const t of targets) {
        const gi = pl.graveyard.findIndex((g) => g.inst === t); if (gi < 0 || pl.board.length >= RULES.maxBoard) continue;
        const card = pl.graveyard.splice(gi, 1)[0];
        const c = makeCreature(st, p, card, getCard(card.cardId));
        pl.board.push(c);
        st.events.push({ kind: 'reanimate', player: p, inst: c.inst, cardId: c.cardId });
        fireTriggers(st, 'onAllyEnter', p, { source: c });
      }
      break;
    }
    case 'steal':
      for (const t of targets) {
        const f = findCreature(st, t); if (!f || f.p === p || effAttack(st, f.c) > act.maxAttack) continue;
        const me = st.players[p]; if (me.board.length >= RULES.maxBoard) continue;
        const from = st.players[f.p];
        from.board.splice(from.board.findIndex((x) => x.inst === t), 1);
        f.c.controller = p; f.c.exhausted = true; f.c.enteredTurn = st.turn;
        me.board.push(f.c);
        st.events.push({ kind: 'steal', inst: t, to: p });
      }
      break;
    case 'sacrifice': break; // handled by caller
    case 'discardRandom': {
      const pl = st.players[p];
      for (let i = 0; i < act.count && pl.hand.length; i++) {
        const r = rngInt(st.rng, pl.hand.length); st.rng = r.state;
        const card = pl.hand.splice(r.value, 1)[0]; pl.graveyard.push(card);
        st.events.push({ kind: 'discard', player: p, inst: card.inst, cardId: card.cardId });
      }
      break;
    }
    case 'aura': break; // static, computed on read
    case 'armor': st.players[p].armor += act.amount; break;
    case 'restoreWard': for (const t of targets) { const f = findCreature(st, t); if (f) f.c.wardUsed = false; } break;
    case 'setHealth': for (const t of targets) { const f = findCreature(st, t); if (f) { f.c.health = act.amount; f.c.maxHealth = Math.max(f.c.maxHealth, act.amount); } } break;
    case 'transform':
      for (const t of targets) {
        const f = findCreature(st, t); if (!f) continue;
        const pl = st.players[f.p]; const idx = pl.board.findIndex((x) => x.inst === t);
        pl.board[idx] = makeCreature(st, f.p, { inst: f.c.inst, cardId: act.cardId, level: f.c.level }, getCard(act.cardId));
      }
      break;
  }
}

/** Runs all effects with `trigger` on a card (creature or spell/relic def). */
function runEffects(st: GameState, p: PlayerId, source: Creature | null, trigger: Effect['trigger'], _unused: string[], opts?: { def?: CardDef; level?: number; chosen?: Record<string, string>; sacrifice?: string; triggering?: Creature }): void {
  const def = opts?.def ?? (source ? safeDef(source.cardId) : null);
  if (!def) return;
  const level = opts?.level ?? source?.level ?? 1;
  const chosen = opts?.chosen ?? {};
  for (const e of def.effects ?? []) {
    if (e.trigger !== trigger) continue;
    if (source && source.silenced && trigger !== 'onPlay') continue;
    if (e.oncePerGame && source) { if (source.firedOnce.includes(e.trigger)) continue; source.firedOnce.push(e.trigger); }
    const tgts = resolveTargets(st, p, source, e.target, chosen, opts?.triggering);
    if (e.target && isChosen(e.target) && tgts.length === 0 && e.action.kind !== 'sacrifice') continue;
    if (!checkCondition(st, p, e, tgts[0])) continue;
    if (e.action.kind === 'sacrifice') {
      const sac = opts?.sacrifice ? findCreature(st, opts.sacrifice) : null;
      if (!sac || sac.p !== p) continue;
      sac.c.health = -999;
      st.events.push({ kind: 'damage', target: sac.c.inst, amount: 0, source: def.name });
      checkDeaths(st);
      if (e.then) {
        const t2 = resolveTargets(st, p, source, e.then.target, chosen, opts?.triggering);
        applyEffectAction(st, p, source, level, e.then.action, t2, def.name);
      }
      continue;
    }
    applyEffectAction(st, p, source, level, e.action, tgts, def.name);
  }
  checkDeaths(st);
}

/** Fires a trigger for all creatures and relics controlled by p. */
function fireTriggers(st: GameState, trigger: Effect['trigger'], p: PlayerId, opts?: { source?: Creature }): void {
  const pl = st.players[p];
  for (const c of pl.board.slice()) {
    if (opts?.source && c.inst === opts.source.inst && (trigger === 'onAllyEnter' || trigger === 'onAllyDeath')) continue;
    if (trigger === 'onDamageTaken' && (!opts?.source || c.inst !== opts.source.inst)) continue;
    if (!pl.board.includes(c)) continue;
    runEffects(st, p, c, trigger, [], { triggering: opts?.source });
  }
  for (const r of pl.relics.slice()) {
    if (trigger === 'onDamageTaken') continue;
    runEffects(st, p, null, trigger, [], { def: getCard(r.cardId), level: r.level });
  }
}

// ───────────────────────── turn flow ─────────────────────────

function startTurn(st: GameState, p: PlayerId): void {
  st.turn++;
  st.active = p; st.phase = 'main1'; st.pendingAttack = null;
  const pl = st.players[p];
  pl.maxEssence = Math.min(RULES.maxEssence, pl.maxEssence + 1);
  pl.essence = pl.maxEssence;
  pl.oathUsed = false; pl.spellsCastThisTurn = 0;
  for (const c of pl.board) { c.exhausted = false; c.wardUsed = false; }
  for (const c of st.players[other(p)].board) c.wardUsed = false;
  st.events.push({ kind: 'turnStart', player: p, turn: st.turn });
  st.events.push({ kind: 'essence', player: p, essence: pl.essence, max: pl.maxEssence });
  if (!(st.turn === 1)) drawCard(st, p);
  fireTriggers(st, 'onTurnStart', p);
  checkDeaths(st);
  if (st.turn > 100 && st.winner === null) endGame(st, 'draw', 'The long dusk claims both');
}

function endTurn(st: GameState): void {
  const p = st.active; const pl = st.players[p];
  fireTriggers(st, 'onTurnEnd', p);
  checkDeaths(st);
  for (const r of pl.relics.slice()) {
    if (r.turnsLeft !== undefined) {
      r.turnsLeft--;
      if (r.turnsLeft <= 0) { pl.relics.splice(pl.relics.indexOf(r), 1); pl.graveyard.push({ inst: r.inst, cardId: r.cardId, level: r.level }); st.events.push({ kind: 'relic', player: p, inst: r.inst, cardId: r.cardId, expired: true }); }
    }
  }
  for (const c of [...st.players[0].board, ...st.players[1].board]) { c.tempAttack = 0; c.tempHealth = 0; }
  for (const c of pl.board) c.shackled = false;
  checkDeaths(st);
  if (st.winner !== null) return;
  startTurn(st, other(p));
}

// ───────────────────────── combat ─────────────────────────

export function canAttack(st: GameState, c: Creature): boolean {
  return !c.exhausted && !c.shackled && (c.enteredTurn < st.turn || hasKw(c, 'swift')) && effAttack(st, c) > 0;
}
export function canBlock(st: GameState, blocker: Creature, attacker: Creature): boolean {
  if (blocker.exhausted || blocker.shackled) return false;
  if (hasKw(attacker, 'winged') && !hasKw(blocker, 'winged') && !hasKw(blocker, 'farsight')) return false;
  return true;
}
export function potentialBlockers(st: GameState, p: PlayerId): Creature[] {
  return st.players[p].board.filter((c) => !c.exhausted && !c.shackled);
}

function resolveCombat(st: GameState, blocks: { attacker: string; blocker: string }[]): void {
  const atkP = st.active, defP = other(atkP);
  const attackers = (st.pendingAttack ?? []).map((id) => findCreature(st, id)?.c).filter((c): c is Creature => !!c && c.controller === atkP);
  for (const a of attackers) {
    const blockers = blocks.filter((b) => b.attacker === a.inst).map((b) => findCreature(st, b.blocker)?.c).filter((c): c is Creature => !!c && c.controller === defP);
    if (blockers.length === 0) {
      const dmg = effAttack(st, a);
      st.events.push({ kind: 'heroHit', player: defP, attacker: a.inst, amount: dmg });
      damageHero(st, defP, dmg, a.inst, hasKw(a, 'radiant') ? atkP : undefined);
      continue;
    }
    st.events.push({ kind: 'block', attacker: a.inst, blockers: blockers.map((b) => b.inst) });
    // two damage steps: quick creatures first, then everyone still alive. Damage within a
    // step is simultaneous: blockers alive at the start of the step still deal their damage.
    const step = (quickStep: boolean) => {
      if (effHealth(st, a) <= 0) return;
      const aQuick = hasKw(a, 'quick');
      const striking = blockers.filter((b) => effHealth(st, b) > 0 && hasKw(b, 'quick') === quickStep).map((b) => ({ b, dmg: effAttack(st, b) }));
      if (aQuick === quickStep) {
        let remaining = effAttack(st, a);
        for (const b of blockers) {
          if (remaining <= 0) break;
          if (effHealth(st, b) <= 0) continue;
          const need = hasKw(a, 'venom') ? 1 : effHealth(st, b);
          const d = Math.min(remaining, need);
          st.events.push({ kind: 'clash', attacker: a.inst, blocker: b.inst });
          damageCreature(st, b, d, a, { venom: hasKw(a, 'venom'), radiantFor: hasKw(a, 'radiant') ? atkP : undefined });
          remaining -= d;
          if (effHealth(st, b) <= 0) fireKill(st, a, b);
        }
        if (remaining > 0 && hasKw(a, 'piercing')) {
          st.events.push({ kind: 'heroHit', player: defP, attacker: a.inst, amount: remaining });
          damageHero(st, defP, remaining, a.inst, hasKw(a, 'radiant') ? atkP : undefined);
        }
      }
      for (const { b, dmg } of striking) {
        if (effHealth(st, a) <= 0) break;
        damageCreature(st, a, dmg, b, { venom: hasKw(b, 'venom'), radiantFor: hasKw(b, 'radiant') ? defP : undefined });
        if (effHealth(st, a) <= 0) fireKill(st, b, a);
      }
    };
    step(true); step(false);
  }
  for (const a of attackers) if (!hasKw(a, 'steadfast')) a.exhausted = true;
  st.pendingAttack = null;
  checkDeaths(st);
}

function fireKill(st: GameState, killer: Creature, victim: Creature): void {
  if (findCreature(st, killer.inst)) runEffects(st, killer.controller, killer, 'onKill', [], { triggering: victim });
}

// ───────────────────────── oath (hero ability) ─────────────────────────

export const OATHS: Record<Faction, { name: string; text: string; targets: 'anyTarget' | 'none' }> = {
  dawn: { name: 'Kindle', text: 'Restore 2 health to any target.', targets: 'anyTarget' },
  umbral: { name: 'Siphon', text: 'Deal 1 damage to any target.', targets: 'anyTarget' },
  neutral: { name: 'Forage', text: 'Draw a card.', targets: 'none' },
};

// ───────────────────────── validation ─────────────────────────

export function validateAction(st: GameState, a: Action): string | null {
  if (st.winner !== null) return 'The game is over';
  const pl = st.players[a.player];
  if (a.type === 'concede') return null;
  if (st.phase === 'block') {
    if (a.type !== 'block') return 'Waiting for blocks';
    if (a.player !== other(st.active)) return 'Only the defender may block';
    const used = new Set<string>();
    const perAttacker = new Map<string, number>();
    for (const b of a.blocks) {
      const atk = findCreature(st, b.attacker), blk = findCreature(st, b.blocker);
      if (!atk || atk.p !== st.active || !st.pendingAttack?.includes(b.attacker)) return 'Invalid attacker';
      if (!blk || blk.p !== a.player) return 'Invalid blocker';
      if (used.has(b.blocker)) return 'A creature can block only one attacker';
      if (!canBlock(st, blk.c, atk.c)) return `${getCard(blk.c.cardId).name} cannot block that`;
      used.add(b.blocker);
      perAttacker.set(b.attacker, (perAttacker.get(b.attacker) ?? 0) + 1);
    }
    for (const [atkId, n] of perAttacker) { const atk = findCreature(st, atkId)!; if (hasKw(atk.c, 'dread') && n < 2) return 'Dread creatures need two blockers'; }
    return null;
  }
  if (a.player !== st.active) return 'Not your turn';
  switch (a.type) {
    case 'endTurn': return null;
    case 'block': return 'Not in the block step';
    case 'attack': {
      if (st.phase !== 'main1') return 'You already attacked this turn';
      if (a.attackers.length === 0) return 'Choose at least one attacker';
      const seen = new Set<string>();
      for (const id of a.attackers) {
        const f = findCreature(st, id);
        if (!f || f.p !== a.player) return 'Invalid attacker';
        if (seen.has(id)) return 'Duplicate attacker';
        if (!canAttack(st, f.c)) return `${getCard(f.c.cardId).name} cannot attack`;
        seen.add(id);
      }
      return null;
    }
    case 'oath': {
      if (pl.oathUsed) return 'Oath already used this turn';
      if (pl.essence < RULES.oathCost) return 'Not enough essence';
      const o = OATHS[pl.faction];
      if (o.targets === 'anyTarget' && !candidates(st, a.player, 'anyTarget').includes(a.target)) return 'Invalid target';
      return null;
    }
    case 'play': {
      const hi = pl.hand.findIndex((c) => c.inst === a.inst);
      if (hi < 0) return 'Card not in hand';
      const card = pl.hand[hi];
      const cardId = card.cardId === '?' ? a.reveal?.cardId : card.cardId;
      if (!cardId) return 'Hidden card requires a reveal';
      if (card.cardId !== '?' && a.reveal && (a.reveal.cardId !== card.cardId || a.reveal.level !== card.level)) return 'Reveal does not match the card';
      const def = getCard(cardId);
      if (def.cost > pl.essence) return 'Not enough essence';
      if (def.type === 'creature' && pl.board.length >= RULES.maxBoard) return 'Your board is full';
      const slots = targetSlots(def);
      const targets = a.targets ?? [];
      for (let i = 0; i < slots.length; i++) {
        const eff = (def.effects ?? []).find((e) => e.trigger === 'onPlay' && (e.target === slots[i] || e.then?.target === slots[i]));
        const cands = candidates(st, a.player, slots[i], def, eff);
        const t = targets[i];
        if (!t) { if (def.type === 'spell') return cands.length > 0 ? 'This spell needs a target' : 'No legal target'; continue; }
        if (!cands.includes(t)) return 'Invalid target';
        if (a.sacrifice && t === a.sacrifice) return 'Cannot target the sacrificed creature';
      }
      if (needsSacrifice(def)) {
        if (!a.sacrifice) return 'Choose a creature to sacrifice';
        const s = findCreature(st, a.sacrifice);
        if (!s || s.p !== a.player) return 'Invalid sacrifice';
      }
      return null;
    }
  }
  return 'Unknown action';
}

// ───────────────────────── apply ─────────────────────────

export function applyAction(prev: GameState, a: Action): GameState {
  const err = validateAction(prev, a);
  if (err) throw new IllegalAction(err);
  const st = cloneState(prev);
  st.seq++;
  const pl = st.players[a.player];
  switch (a.type) {
    case 'concede': endGame(st, other(a.player), `${pl.name} conceded`); break;
    case 'endTurn': endTurn(st); break;
    case 'attack': {
      st.pendingAttack = a.attackers.slice();
      st.events.push({ kind: 'attack', attackers: a.attackers.slice() });
      for (const id of a.attackers) {
        const c = findCreature(st, id)?.c; if (!c) continue;
        if (hasKw(c, 'relentless')) { c.attack += 1; c.relentlessBonus++; st.events.push({ kind: 'buff', target: id, attack: 1, health: 0 }); }
        runEffects(st, a.player, c, 'onAttack', []);
      }
      checkDeaths(st);
      if (st.winner !== null) break;
      const defenders = potentialBlockers(st, other(a.player)).filter((b) => (st.pendingAttack ?? []).some((id) => { const atk = findCreature(st, id); return atk && canBlock(st, b, atk.c); }));
      if (defenders.length === 0) { resolveCombat(st, []); if (st.winner === null) st.phase = 'main2'; }
      else { st.phase = 'block'; }
      if (st.winner === null) st.events.push({ kind: 'phase', phase: st.phase, active: st.active });
      break;
    }
    case 'block': {
      resolveCombat(st, a.blocks);
      if (st.winner === null) { st.phase = 'main2'; st.events.push({ kind: 'phase', phase: 'main2', active: st.active }); }
      break;
    }
    case 'oath': {
      pl.essence -= RULES.oathCost; pl.oathUsed = true;
      st.events.push({ kind: 'oath', player: a.player, target: a.target });
      const o = OATHS[pl.faction];
      if (pl.faction === 'dawn') applyEffectAction(st, a.player, null, 1, { kind: 'heal', amount: 2 }, [a.target], o.name);
      else if (pl.faction === 'umbral') applyEffectAction(st, a.player, null, 1, { kind: 'damage', amount: 1 }, [a.target], o.name);
      else drawCard(st, a.player);
      st.events.push({ kind: 'essence', player: a.player, essence: pl.essence, max: pl.maxEssence });
      checkDeaths(st);
      break;
    }
    case 'play': {
      const hi = pl.hand.findIndex((c) => c.inst === a.inst);
      const card = pl.hand.splice(hi, 1)[0];
      if (card.cardId === '?' && a.reveal) { card.cardId = a.reveal.cardId; card.level = a.reveal.level; }
      const def = getCard(card.cardId);
      pl.essence -= def.cost;
      st.events.push({ kind: 'play', player: a.player, inst: card.inst, cardId: card.cardId, targets: a.targets });
      st.events.push({ kind: 'essence', player: a.player, essence: pl.essence, max: pl.maxEssence });
      const slots = targetSlots(def);
      const chosen: Record<string, string> = {};
      slots.forEach((s, i) => { if (a.targets?.[i]) chosen[s] = a.targets[i]; });
      if (def.type === 'creature') {
        const c = makeCreature(st, a.player, card, def);
        const pos = a.position === undefined ? pl.board.length : Math.max(0, Math.min(pl.board.length, a.position));
        pl.board.splice(pos, 0, c);
        fireTriggers(st, 'onAllyEnter', a.player, { source: c });
        runEffects(st, a.player, c, 'onPlay', [], { chosen, sacrifice: a.sacrifice });
      } else if (def.type === 'spell') {
        pl.spellsCastThisTurn++;
        runEffects(st, a.player, null, 'onPlay', [], { def, level: card.level, chosen, sacrifice: a.sacrifice });
        pl.graveyard.push(card);
        fireTriggers(st, 'onSpellCast', a.player);
      } else {
        const relic: Relic = { ...card, controller: a.player, turnsLeft: def.duration };
        pl.relics.push(relic);
        st.events.push({ kind: 'relic', player: a.player, inst: card.inst, cardId: card.cardId });
        runEffects(st, a.player, null, 'onPlay', [], { def, level: card.level, chosen, sacrifice: a.sacrifice });
      }
      checkDeaths(st);
      break;
    }
  }
  return st;
}

// ───────────────────────── legal action enumeration ─────────────────────────

export function legalActions(st: GameState, p: PlayerId): Action[] {
  const out: Action[] = [];
  if (st.winner !== null) return out;
  if (st.phase === 'block') {
    if (p !== other(st.active)) return out;
    out.push({ type: 'block', player: p, blocks: [] });
    return out; // block combinations are enumerated by the AI separately
  }
  if (p !== st.active) return out;
  const pl = st.players[p];
  for (const card of pl.hand) {
    if (card.cardId === '?') continue;
    const def = getCard(card.cardId);
    if (def.cost > pl.essence) continue;
    if (def.type === 'creature' && pl.board.length >= RULES.maxBoard) continue;
    const slots = targetSlots(def);
    const sacs = needsSacrifice(def) ? pl.board.map((c) => c.inst) : [undefined];
    for (const sac of sacs) {
      const slotCands = slots.map((s) => {
        const eff = (def.effects ?? []).find((e) => e.trigger === 'onPlay' && (e.target === s || e.then?.target === s));
        return candidates(st, p, s, def, eff).filter((t) => t !== sac);
      });
      if (def.type === 'spell' && slotCands.some((c) => c.length === 0) && slots.length > 0) {
        continue;
      }
      // cartesian product over slots (slots are usually 0-1 deep)
      const combos: string[][] = [[]];
      for (const cands of slotCands) {
        const next: string[][] = [];
        for (const combo of combos) for (const c of (cands.length ? cands : [''])) next.push([...combo, c]);
        combos.splice(0, combos.length, ...next);
      }
      for (const targets of combos) {
        const act: Action = { type: 'play', player: p, inst: card.inst, targets: targets.filter((t) => t !== ''), sacrifice: sac };
        if (validateAction(st, act) === null) out.push(act);
      }
    }
  }
  if (!pl.oathUsed && pl.essence >= RULES.oathCost) {
    const o = OATHS[pl.faction];
    if (o.targets === 'none') out.push({ type: 'oath', player: p, target: '' });
    else for (const t of candidates(st, p, 'anyTarget')) out.push({ type: 'oath', player: p, target: t });
  }
  if (st.phase === 'main1') {
    const atk = pl.board.filter((c) => canAttack(st, c));
    if (atk.length) out.push({ type: 'attack', player: p, attackers: atk.map((c) => c.inst) });
  }
  out.push({ type: 'endTurn', player: p });
  return out;
}

// ───────────────────────── views ─────────────────────────

/** State as seen by `viewer`: the opponent's hand and deck contents are hidden. Bots only see this. */
export function viewFor(st: GameState, viewer: PlayerId): GameState {
  const v = cloneState(st);
  const opp = v.players[other(viewer)];
  opp.hand = opp.hand.map((c) => ({ ...c, cardId: '?' }));
  opp.deck = opp.deck.map((c) => ({ ...c, cardId: '?' }));
  v.players[viewer].deck = v.players[viewer].deck.map((c) => ({ ...c, cardId: '?' }));
  return v;
}

/** Stable hash of the public game state for cross-client verification. */
export function stateHash(st: GameState): string {
  const pub = (p: PlayerState) => ({
    h: p.health, a: p.armor, e: p.essence, m: p.maxEssence, f: p.fatigue, hand: p.hand.length, deck: p.deck.length,
    board: p.board.map((c) => [c.inst, c.cardId, c.attack, c.health, c.maxHealth, c.exhausted ? 1 : 0, c.keywords.join(',')]),
    relics: p.relics.map((r) => [r.inst, r.cardId, r.turnsLeft ?? -1]),
    grave: p.graveyard.map((g) => g.inst),
  });
  const s = JSON.stringify({ seq: st.seq, turn: st.turn, active: st.active, phase: st.phase, rng: st.rng, w: st.winner, p: [pub(st.players[0]), pub(st.players[1])] });
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16).padStart(8, '0');
}

export function whoActs(st: GameState): PlayerId {
  return st.phase === 'block' ? other(st.active) : st.active;
}
