// Player profile, collection, decks, economy and progression, all in one Firestore document
// (users/{uid}) so that loading a player costs a single read. Match history lives in a small
// subcollection. The security rules bound what a client can grant itself; see README.

import {
  doc, getDoc, setDoc, updateDoc, deleteDoc, serverTimestamp, writeBatch, collection, getDocs, query, orderBy, limit, Timestamp,
} from 'firebase/firestore';
import { fbDb } from './app';
import type { Rarity } from '../engine/types';
import { COLLECTIBLE_CARDS, getCard } from '../engine/cards';
import { starterCollection, starterDeck } from '../engine/decks';
import { upgradeCost } from '../engine/levels';
import { hashString, rngNext } from '../engine/rng';

export type Alignment = 'dawn' | 'umbral' | 'unsworn';
export interface Deck { id: string; name: string; faction: 'dawn' | 'umbral' | 'neutral'; cards: string[] }
export interface Settings { sfx: number; music: number; reducedMotion: boolean; showHints: boolean; animations: 'full' | 'fast' | 'minimal' }
export interface Profile {
  uid: string; username: string; usernameLower: string; avatar: string; alignment: Alignment;
  cinders: number; packs: number; packsOpened: number; rating: number;
  wins: number; losses: number; draws: number; botWins: number; botLosses: number; streak: number; bestStreak: number;
  campaign: { beaten: Record<string, number>; bestLevel: number };
  collection: Record<string, { count: number; level: number }>;
  decks: Deck[]; activeDeck: string;
  settings: Settings; tutorialDone: boolean; titles: string[]; activeMatch?: string | null;
  createdAt?: unknown; dailyClaimedAt?: Timestamp | null; lastRewardAt?: Timestamp | null;
}
export interface MatchRecord { mode: 'bot' | 'online'; opponent: string; opponentId?: string; result: 'win' | 'loss' | 'draw'; turns: number; at: unknown; deck: string; ratingDelta?: number; reason?: string; disputed?: boolean }

export const ECONOMY = {
  starterCinders: 500, starterPacks: 3, packPrice: 150, packSize: 5,
  daily: { cinders: 100, packs: 1, cooldownHours: 20 },
  pvp: { win: 80, loss: 25, draw: 40 }, botRepeatWin: 40, botLoss: 20,
  maxRewardCinders: 1500, maxRewardPacks: 5, rewardCooldownSeconds: 45,
  rarityWeights: { common: 0.70, rare: 0.22, epic: 0.065, legendary: 0.015 } as Record<Rarity, number>,
  dustValue: { common: 5, rare: 15, epic: 50, legendary: 200 } as Record<Rarity, number>,
};

export const DEFAULT_SETTINGS: Settings = { sfx: 0.9, music: 0.35, reducedMotion: false, showHints: true, animations: 'full' };

export function newProfile(uid: string, username: string, avatar: string, alignment: Alignment): Profile {
  const dawn = starterDeck('dawn'), umbral = starterDeck('umbral');
  return {
    uid, username, usernameLower: username.toLowerCase(), avatar, alignment,
    cinders: ECONOMY.starterCinders, packs: ECONOMY.starterPacks, packsOpened: 0, rating: 1000,
    wins: 0, losses: 0, draws: 0, botWins: 0, botLosses: 0, streak: 0, bestStreak: 0,
    campaign: { beaten: {}, bestLevel: 0 },
    collection: starterCollection(),
    decks: [
      { id: 'starter_dawn', name: dawn.name, faction: 'dawn', cards: dawn.cards.map((c) => c.cardId) },
      { id: 'starter_umbral', name: umbral.name, faction: 'umbral', cards: umbral.cards.map((c) => c.cardId) },
    ],
    activeDeck: alignment === 'umbral' ? 'starter_umbral' : 'starter_dawn',
    settings: { ...DEFAULT_SETTINGS }, tutorialDone: false, titles: [], activeMatch: null,
  };
}

const userRef = (uid: string) => doc(fbDb(), 'users', uid);

export async function loadProfile(uid: string): Promise<Profile | null> {
  const snap = await getDoc(userRef(uid));
  return snap.exists() ? (snap.data() as Profile) : null;
}
export async function loadPublicProfile(uid: string): Promise<Pick<Profile, 'username' | 'avatar' | 'rating' | 'collection' | 'alignment'> | null> {
  const p = await loadProfile(uid);
  return p ? { username: p.username, avatar: p.avatar, rating: p.rating, collection: p.collection, alignment: p.alignment } : null;
}

export function validUsername(name: string): string | null {
  if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) return 'Use 3–16 letters, numbers or underscores.';
  return null;
}

/** Creates the profile and claims the username atomically. Throws if the name is taken. */
export async function createProfile(uid: string, username: string, avatar: string, alignment: Alignment): Promise<Profile> {
  const p = newProfile(uid, username, avatar, alignment);
  const batch = writeBatch(fbDb());
  batch.set(doc(fbDb(), 'usernames', p.usernameLower), { uid });
  batch.set(userRef(uid), { ...p, createdAt: serverTimestamp(), dailyClaimedAt: null, lastRewardAt: null });
  await batch.commit();
  return p;
}

export async function saveProfileFields(uid: string, fields: Partial<Profile>): Promise<void> {
  await updateDoc(userRef(uid), fields as any);
}

export async function deleteProfile(uid: string, usernameLower: string): Promise<void> {
  const matches = await getDocs(collection(fbDb(), 'users', uid, 'matches'));
  const batch = writeBatch(fbDb());
  matches.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(fbDb(), 'usernames', usernameLower));
  batch.delete(userRef(uid));
  await batch.commit();
}

// ───────────── economy ─────────────

export function dailyAvailable(p: Profile, now = Date.now()): boolean {
  const last = p.dailyClaimedAt instanceof Timestamp ? p.dailyClaimedAt.toMillis() : 0;
  return now - last >= ECONOMY.daily.cooldownHours * 3600 * 1000;
}
export async function claimDaily(p: Profile): Promise<Profile> {
  const next = { ...p, cinders: p.cinders + ECONOMY.daily.cinders, packs: p.packs + ECONOMY.daily.packs };
  await updateDoc(userRef(p.uid), { cinders: next.cinders, packs: next.packs, dailyClaimedAt: serverTimestamp() });
  return { ...next, dailyClaimedAt: Timestamp.now() };
}
export async function buyPack(p: Profile, n = 1): Promise<Profile> {
  if (p.cinders < ECONOMY.packPrice * n) throw new Error('Not enough cinders');
  const next = { ...p, cinders: p.cinders - ECONOMY.packPrice * n, packs: p.packs + n };
  await updateDoc(userRef(p.uid), { cinders: next.cinders, packs: next.packs });
  return next;
}

/** Deterministic pack contents from a seed; rarity-weighted with a guaranteed rare-or-better. */
export function rollPack(seed: number, alignment: Alignment): string[] {
  let s = seed >>> 0 || 1;
  const rnd = () => { const r = rngNext(s); s = r.state; return r.value; };
  const pool = (r: Rarity) => COLLECTIBLE_CARDS.filter((c) => c.rarity === r);
  const out: string[] = [];
  for (let i = 0; i < ECONOMY.packSize; i++) {
    let x = rnd(); let rarity: Rarity = 'common';
    for (const [r, w] of Object.entries(ECONOMY.rarityWeights) as [Rarity, number][]) { if (x < w) { rarity = r; break; } x -= w; }
    if (i === ECONOMY.packSize - 1 && !out.some((id) => getCard(id).rarity !== 'common')) rarity = rnd() < 0.85 ? 'rare' : 'epic';
    let cands = pool(rarity);
    // alignment nudges the pack toward the player's faction without excluding the other
    if (alignment !== 'unsworn' && rnd() < 0.5) { const f = cands.filter((c) => c.faction === alignment || c.faction === 'neutral'); if (f.length) cands = f; }
    out.push(cands[Math.floor(rnd() * cands.length)].id);
  }
  return out;
}
export async function openPack(p: Profile): Promise<{ profile: Profile; cards: string[] }> {
  if (p.packs <= 0) throw new Error('No packs to open');
  const seed = hashString(`${p.uid}:${p.packsOpened}:${Date.now()}`);
  const cards = rollPack(seed, p.alignment);
  const collection = { ...p.collection };
  for (const id of cards) collection[id] = { count: (collection[id]?.count ?? 0) + 1, level: collection[id]?.level ?? 1 };
  const next = { ...p, packs: p.packs - 1, packsOpened: p.packsOpened + 1, collection };
  await updateDoc(userRef(p.uid), { packs: next.packs, packsOpened: next.packsOpened, collection });
  return { profile: next, cards };
}
export function canUpgrade(p: Profile, cardId: string): { ok: boolean; reason?: string; cost?: { cards: number; cinders: number } } {
  const entry = p.collection[cardId]; if (!entry) return { ok: false, reason: 'Not owned' };
  const cost = upgradeCost(getCard(cardId).rarity, entry.level);
  if (!cost) return { ok: false, reason: 'Max level' };
  if (entry.count - 1 < cost.cards) return { ok: false, reason: `Need ${cost.cards} spare copies`, cost };
  if (p.cinders < cost.cinders) return { ok: false, reason: `Need ${cost.cinders} cinders`, cost };
  return { ok: true, cost };
}
export async function upgradeCard(p: Profile, cardId: string): Promise<Profile> {
  const u = canUpgrade(p, cardId); if (!u.ok || !u.cost) throw new Error(u.reason);
  const entry = p.collection[cardId];
  const collection = { ...p.collection, [cardId]: { count: entry.count - u.cost.cards, level: entry.level + 1 } };
  const next = { ...p, cinders: p.cinders - u.cost.cinders, collection };
  await updateDoc(userRef(p.uid), { cinders: next.cinders, collection });
  return next;
}
export async function dustCard(p: Profile, cardId: string): Promise<Profile> {
  const entry = p.collection[cardId]; if (!entry || entry.count <= 1) throw new Error('Keep at least one copy');
  const collection = { ...p.collection, [cardId]: { ...entry, count: entry.count - 1 } };
  const next = { ...p, cinders: p.cinders + ECONOMY.dustValue[getCard(cardId).rarity], collection };
  // dusting is a cinders increase: it goes through the throttled reward path
  await updateDoc(userRef(p.uid), { cinders: next.cinders, collection, lastRewardAt: serverTimestamp() });
  return next;
}

// ───────────── progression ─────────────

export function eloDelta(my: number, their: number, score: 0 | 0.5 | 1, k = 32): number {
  const expected = 1 / (1 + Math.pow(10, (their - my) / 400));
  return Math.max(-50, Math.min(50, Math.round(k * (score - expected))));
}

export interface MatchOutcome { mode: 'bot' | 'online'; result: 'win' | 'loss' | 'draw'; opponent: string; opponentId?: string; opponentRating?: number; botId?: string; botLevel?: number; botReward?: { cinders: number; packs: number; unlock?: string }; turns: number; deck: string; reason?: string; disputed?: boolean }

/** Applies rewards, stats, rating and history for a finished match in a single write (+1 history write). */
export async function recordMatch(p: Profile, o: MatchOutcome): Promise<{ profile: Profile; rewards: { cinders: number; packs: number; ratingDelta: number; firstClear: boolean; unlock?: string } }> {
  let cinders = 0, packs = 0, ratingDelta = 0, firstClear = false, unlock: string | undefined;
  const next: Profile = { ...p, campaign: { ...p.campaign, beaten: { ...p.campaign.beaten } }, titles: p.titles.slice() };
  if (o.mode === 'bot') {
    if (o.result === 'win') {
      next.botWins++;
      if (o.botId && o.botReward) {
        if (!next.campaign.beaten[o.botId]) { firstClear = true; cinders = o.botReward.cinders; packs = o.botReward.packs; if (o.botReward.unlock && !next.titles.includes(o.botReward.unlock)) { unlock = o.botReward.unlock; next.titles.push(o.botReward.unlock); } }
        else cinders = ECONOMY.botRepeatWin;
        next.campaign.beaten[o.botId] = (next.campaign.beaten[o.botId] ?? 0) + 1;
        next.campaign.bestLevel = Math.max(next.campaign.bestLevel, o.botLevel ?? 0);
      }
    } else { next.botLosses++; cinders = o.result === 'loss' ? ECONOMY.botLoss : 0; }
  } else if (!o.disputed) {
    if (o.result === 'win') { next.wins++; next.streak++; next.bestStreak = Math.max(next.bestStreak, next.streak); cinders = ECONOMY.pvp.win; }
    else if (o.result === 'loss') { next.losses++; next.streak = 0; cinders = ECONOMY.pvp.loss; }
    else { next.draws++; cinders = ECONOMY.pvp.draw; }
    ratingDelta = eloDelta(p.rating, o.opponentRating ?? p.rating, o.result === 'win' ? 1 : o.result === 'loss' ? 0 : 0.5);
    next.rating = Math.max(0, p.rating + ratingDelta);
  }
  next.cinders += cinders; next.packs += packs;
  const fields: Record<string, unknown> = {
    cinders: next.cinders, packs: next.packs, rating: next.rating, wins: next.wins, losses: next.losses, draws: next.draws,
    botWins: next.botWins, botLosses: next.botLosses, streak: next.streak, bestStreak: next.bestStreak, campaign: next.campaign, titles: next.titles, activeMatch: null,
  };
  if (cinders > 0 || packs > 0) fields.lastRewardAt = serverTimestamp();
  const batch = writeBatch(fbDb());
  batch.update(userRef(p.uid), fields);
  const rec: MatchRecord = { mode: o.mode, opponent: o.opponent, result: o.result, turns: o.turns, at: serverTimestamp(), deck: o.deck, ratingDelta };
  if (o.opponentId) rec.opponentId = o.opponentId;
  if (o.reason) rec.reason = o.reason;
  if (o.disputed) rec.disputed = true;
  batch.set(doc(collection(fbDb(), 'users', p.uid, 'matches')), rec);
  await batch.commit();
  return { profile: next, rewards: { cinders, packs, ratingDelta, firstClear, unlock } };
}

export async function loadHistory(uid: string, n = 30): Promise<(MatchRecord & { id: string })[]> {
  const q = query(collection(fbDb(), 'users', uid, 'matches'), orderBy('at', 'desc'), limit(n));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as MatchRecord) }));
}

/** Local fallback used when Firestore is unreachable (offline or quota): keeps play possible, syncs later. */
export const localStore = {
  key: (uid: string) => `vf-profile-${uid}`,
  save(p: Profile) { try { localStorage.setItem(this.key(p.uid), JSON.stringify(p)); } catch { /* ignore */ } },
  load(uid: string): Profile | null { try { const s = localStorage.getItem(this.key(uid)); return s ? JSON.parse(s) : null; } catch { return null; } },
};
