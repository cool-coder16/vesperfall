// Online multiplayer over the Realtime Database.
//
// Sync model (see README for the full discussion):
//  • One match node per game. Both clients run the same deterministic engine.
//  • Actions are batched per "segment" (main phase + attack, blocks, second main + end turn)
//    and committed as ONE write each, together with the state hash after the batch.
//  • The rules enforce that only the player named in `next` may append to the log and hand
//    over `next`; sequence numbers must increase by one.
//  • Hidden information: each player commits sha256(secret) at setup. Their deck order is
//    shuffle(deck, hash(secret + opponentSalt)): the opponent cannot compute it, and neither
//    player can pick their own shuffle. Secrets are revealed at the end and the whole log is
//    replayed with full information to verify every play.

import {
  ref, set, update, get, onValue, onDisconnect, remove, runTransaction, serverTimestamp, query, orderByChild, limitToFirst, type Unsubscribe, type Database,
} from 'firebase/database';
import { fbRtdb } from './app';
import type { Action, CardInst, DeckCard, DeckSpec, GameEvent, GameState, PlayerId } from '../engine/types';
import { applyAction, buildDeckInstances, createGame, hiddenDeck, other, stateHash, validateAction, whoActs } from '../engine/engine';
import { hashString, randomSecret, sha256Hex } from '../engine/rng';

export const TURN_SECONDS = 90;
export const DISCONNECT_GRACE_MS = 45_000;

export interface MatchPlayer { uid: string; name: string; avatar: string; rating: number; faction: DeckSpec['faction']; deckName: string; deck: DeckCard[]; commit: string; salt: string; ready: boolean; secret?: string }
export interface LogEntry { seq: number; by: string; actions: Action[]; hash: string; at: number; next: string }
export interface MatchResult { winner: string | 'draw'; reason: string; by: string }
export interface MatchDoc {
  p0: MatchPlayer; p1?: Partial<MatchPlayer> & { uid: string };
  status: 'setup' | 'playing' | 'ended'; seq: number; next: string; createdAt: number; lastAt: number;
  log?: Record<string, LogEntry>; presence?: Record<string, { online: boolean; at: number }>; result?: MatchResult; ack?: Record<string, boolean>; invite?: string;
}
export interface Me { uid: string; name: string; avatar: string; rating: number }

const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
const db = (d?: Database) => d ?? fbRtdb();
const matchRef = (id: string, d?: Database) => ref(db(d), `matches/${id}`);

// secrets survive a reload so a player can resume a match; in non-browser contexts (tests) they live in memory
const memSecrets = new Map<string, string>();
function secretKey(id: string) { return `vf-match-secret-${id}`; }
function storeSecret(id: string, s: string) { memSecrets.set(id, s); try { localStorage.setItem(secretKey(id), s); } catch { /* ignore */ } }
function loadSecret(id: string): string | null { try { return localStorage.getItem(secretKey(id)) ?? memSecrets.get(id) ?? null; } catch { return memSecrets.get(id) ?? null; } }

async function playerInfo(me: Me, deck: DeckSpec): Promise<{ info: MatchPlayer; secret: string }> {
  const secret = randomSecret();
  const info: MatchPlayer = { uid: me.uid, name: me.name, avatar: me.avatar, rating: me.rating, faction: deck.faction, deckName: deck.name, deck: deck.cards, commit: await sha256Hex(secret), salt: randomSecret(), ready: true };
  return { info, secret };
}

// ───────────── creating & joining ─────────────

export async function createMatch(me: Me, deck: DeckSpec, opts: { invite?: string; opponentUid?: string } = {}, d?: Database): Promise<string> {
  const id = newId();
  const { info, secret } = await playerInfo(me, deck);
  storeSecret(id, secret);
  const docData: MatchDoc = { p0: info, status: 'setup', seq: 0, next: me.uid, createdAt: Date.now(), lastAt: Date.now() };
  if (opts.opponentUid) docData.p1 = { uid: opts.opponentUid };
  if (opts.invite) docData.invite = opts.invite;
  await set(matchRef(id, d), { ...docData, createdAt: serverTimestamp(), lastAt: serverTimestamp() });
  return id;
}

export async function joinMatch(id: string, me: Me, deck: DeckSpec, d?: Database): Promise<void> {
  const { info, secret } = await playerInfo(me, deck);
  storeSecret(id, secret);
  await update(ref(db(d), `matches/${id}/p1`), info);
}

// ───────────── invites ─────────────

export function makeInviteCode(): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 6 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}
export async function createInvite(me: Me, deck: DeckSpec, d?: Database): Promise<{ code: string; matchId: string }> {
  const code = makeInviteCode();
  const matchId = await createMatch(me, deck, { invite: code }, d);
  await set(ref(db(d), `invites/${code}`), { host: me.uid, matchId, at: serverTimestamp() });
  return { code, matchId };
}
export async function joinInvite(code: string, me: Me, deck: DeckSpec, d?: Database): Promise<string> {
  const snap = await get(ref(db(d), `invites/${code.toUpperCase()}`));
  if (!snap.exists()) throw new Error('No match with that code.');
  const inv = snap.val() as { host: string; matchId: string; guest?: string };
  if (inv.host === me.uid) throw new Error('That is your own invite.');
  if (inv.guest && inv.guest !== me.uid) throw new Error('Someone already joined that match.');
  await update(ref(db(d), `invites/${code.toUpperCase()}`), { guest: me.uid });
  await joinMatch(inv.matchId, me, deck, d);
  return inv.matchId;
}
export async function cancelInvite(code: string, matchId: string, d?: Database): Promise<void> {
  await remove(ref(db(d), `invites/${code}`));
  await remove(matchRef(matchId, d)).catch(() => {});
}

// ───────────── matchmaking ─────────────

export interface QueueEntry { uid: string; rating: number; at: number; name: string; matchId?: string; claimedBy?: string }

export function startMatchmaking(me: Me, deck: DeckSpec, onMatched: (matchId: string) => void, onError: (e: unknown) => void, d?: Database): () => void {
  const myRef = ref(db(d), `queue/${me.uid}`);
  let done = false;
  const unsubs: Unsubscribe[] = [];
  const finish = (id: string) => { if (done) return; done = true; cleanup(); onMatched(id); };
  const cleanup = () => { unsubs.forEach((u) => u()); remove(myRef).catch(() => {}); };
  (async () => {
    try {
      await set(myRef, { uid: me.uid, rating: me.rating, at: serverTimestamp(), name: me.name });
      onDisconnect(myRef).remove();
      // 1) someone claimed us
      unsubs.push(onValue(myRef, async (snap) => {
        const v = snap.val() as QueueEntry | null;
        if (v?.matchId && !done) { await joinMatch(v.matchId, me, deck, d); finish(v.matchId); }
      }));
      // 2) we try to claim someone (only the lexicographically smaller uid claims, to avoid cross-claims)
      const q = query(ref(db(d), 'queue'), orderByChild('at'), limitToFirst(12));
      unsubs.push(onValue(q, async (snap) => {
        if (done) return;
        const entries: QueueEntry[] = [];
        snap.forEach((c) => { entries.push(c.val()); });
        const cand = entries.find((e) => e.uid !== me.uid && !e.matchId && !e.claimedBy && me.uid < e.uid);
        if (!cand) return;
        const matchId = newId();
        const res = await runTransaction(ref(db(d), `queue/${cand.uid}`), (cur: QueueEntry | null) => {
          if (!cur || cur.matchId || cur.claimedBy) return; // abort
          return { ...cur, claimedBy: me.uid, matchId };
        });
        if (!res.committed || done) return;
        // create the match with the pre-chosen id so the claimed player can join it
        const { info, secret } = await playerInfo(me, deck);
        storeSecret(matchId, secret);
        await set(matchRef(matchId, d), { p0: info, p1: { uid: cand.uid }, status: 'setup', seq: 0, next: me.uid, createdAt: serverTimestamp(), lastAt: serverTimestamp() });
        finish(matchId);
      }));
    } catch (e) { cleanup(); onError(e); }
  })();
  return () => { done = true; cleanup(); };
}

// ───────────── the live match ─────────────

export type OnlineStatus = 'connecting' | 'waiting' | 'playing' | 'ended' | 'abandoned';
export interface OnlineCallbacks {
  onState: (st: GameState, events: GameEvent[], source: 'local' | 'remote' | 'replay') => void;
  onStatus: (status: OnlineStatus, info: { opponent?: Partial<MatchPlayer>; message?: string }) => void;
  onEnd: (summary: { result: 'win' | 'loss' | 'draw'; reason: string; verified: boolean; disputed: boolean; opponent: Partial<MatchPlayer>; turns: number }) => void;
  onError: (message: string) => void;
}

export class OnlineMatch {
  me: Me; id: string; myIdx: PlayerId = 0; doc: MatchDoc | null = null; state: GameState | null = null;
  private secret: string; private unsub: Unsubscribe | null = null; private processedSeq = 0; private pending: Action[] = [];
  private started = false; private ended = false; private timer: number | null = null; private cb: OnlineCallbacks;
  private revealed = false; private finalized = false; private deckSpec: DeckSpec;
  private db: Database; graceMs = DISCONNECT_GRACE_MS; turnMs = TURN_SECONDS * 1000;
  disputed = false;

  constructor(id: string, me: Me, deck: DeckSpec, cb: OnlineCallbacks, opts: { db?: Database; graceMs?: number; turnMs?: number } = {}) {
    this.id = id; this.me = me; this.cb = cb; this.deckSpec = deck;
    this.db = db(opts.db); if (opts.graceMs) this.graceMs = opts.graceMs; if (opts.turnMs) this.turnMs = opts.turnMs;
    this.secret = loadSecret(id) ?? '';
  }
  private ref(path = '') { return ref(this.db, `matches/${this.id}${path ? '/' + path : ''}`); }

  get opponentIdx(): PlayerId { return other(this.myIdx); }
  get myUid() { return this.me.uid; }
  opponentInfo(): Partial<MatchPlayer> { return (this.myIdx === 0 ? this.doc?.p1 : this.doc?.p0) ?? {}; }
  myInfo(): MatchPlayer | undefined { return (this.myIdx === 0 ? this.doc?.p0 : this.doc?.p1) as MatchPlayer | undefined; }
  isMyTurn(): boolean { return !!this.state && this.state.winner === null && whoActs(this.state) === this.myIdx; }
  secondsLeft(): number { if (!this.doc) return TURN_SECONDS; return Math.max(0, TURN_SECONDS - Math.floor((Date.now() - (this.doc.lastAt || Date.now())) / 1000)); }

  connect(): void {
    const presRef = this.ref(`presence/${this.me.uid}`);
    set(presRef, { online: true, at: serverTimestamp() }).catch(() => {});
    onDisconnect(presRef).set({ online: false, at: serverTimestamp() });
    this.cb.onStatus('connecting', {});
    this.unsub = onValue(this.ref(), (snap) => {
      const d = snap.val() as MatchDoc | null;
      if (!d) { if (!this.ended) this.cb.onStatus('abandoned', { message: 'The match was removed.' }); this.dispose(); return; }
      this.doc = d;
      this.myIdx = d.p0.uid === this.me.uid ? 0 : 1;
      this.tick(d);
    }, (err) => this.cb.onError(String(err)));
    this.timer = setInterval(() => this.checkTimeouts(), 1000) as unknown as number;
  }

  dispose(): void {
    this.unsub?.(); this.unsub = null;
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    const presRef = this.ref(`presence/${this.me.uid}`);
    set(presRef, { online: false, at: serverTimestamp() }).catch(() => {});
  }

  private tick(d: MatchDoc): void {
    const opp = this.opponentInfo();
    if (d.status === 'setup') {
      if (!d.p1 || !d.p1.ready || !d.p0.ready) { this.cb.onStatus('waiting', { opponent: opp, message: 'Waiting for an opponent…' }); return; }
      // both ready: the host decides who starts (deterministically from both salts) and opens play
      if (this.myIdx === 0 && d.next === this.me.uid) {
        const seed = hashString(d.p0.salt + d.p1.salt!);
        const first = seed & 1;
        update(this.ref(), { status: 'playing', next: first === 0 ? d.p0.uid : d.p1.uid, lastAt: serverTimestamp() }).catch((e) => this.cb.onError(String(e)));
      }
      return;
    }
    if (!this.started) this.startGame(d);
    this.applyRemoteLog(d);
    if (d.status === 'ended' || d.result) this.handleEnd(d);
    else this.cb.onStatus('playing', { opponent: opp });
  }

  private startGame(d: MatchDoc): void {
    const p0 = d.p0, p1 = d.p1 as MatchPlayer;
    const seed = hashString(p0.salt + p1.salt);
    const first = (seed & 1) as PlayerId;
    const mine = this.myIdx === 0 ? p0 : p1, theirs = this.myIdx === 0 ? p1 : p0;
    const myDeck: DeckSpec = { name: mine.deckName, faction: mine.faction, cards: mine.deck };
    const theirDeck: DeckSpec = { name: theirs.deckName, faction: theirs.faction, cards: theirs.deck };
    const myOrder = buildDeckInstances(myDeck, this.myIdx, hashString(this.secret + ':' + theirs.salt));
    const orders: [CardInst[] | null, CardInst[] | null] = [null, null];
    orders[this.myIdx] = myOrder; orders[this.opponentIdx] = hiddenDeck(this.opponentIdx, theirs.deck.length);
    const players = [{ name: p0.name, deck: this.myIdx === 0 ? myDeck : theirDeck }, { name: p1.name, deck: this.myIdx === 1 ? myDeck : theirDeck }] as [any, any];
    this.state = createGame({ players, seed, firstPlayer: first, deckOrders: orders });
    this.started = true;
    this.cb.onState(this.state, [], 'replay');
  }

  /** Applies any log entries we have not processed yet (ours are skipped; the local state already has them). */
  private applyRemoteLog(d: MatchDoc): void {
    if (!this.state) return;
    const entries = Object.values(d.log ?? {}).sort((a, b) => a.seq - b.seq);
    for (const e of entries) {
      if (e.seq <= this.processedSeq) continue;
      if (e.seq !== this.processedSeq + 1) { this.dispute(`Log gap at ${e.seq}`); return; }
      this.processedSeq = e.seq;
      if (e.by === this.me.uid) continue; // our own commit
      for (const a of e.actions) {
        if (this.state.winner !== null) break;
        const actor = whoActs(this.state);
        const actorUid = actor === 0 ? d.p0.uid : d.p1!.uid;
        if (actorUid !== e.by || a.player !== actor) { this.dispute('Opponent acted out of turn'); return; }
        const err = validateAction(this.state, a);
        if (err) { this.dispute(`Illegal opponent action: ${err}`); return; }
        this.state = applyAction(this.state, a);
        this.cb.onState(this.state, this.state.events as GameEvent[], 'remote');
      }
      if (stateHash(this.state) !== e.hash) this.dispute('State hash mismatch');
      if (this.state.winner !== null) this.onLocalGameOver();
    }
  }

  private dispute(reason: string): void {
    if (this.disputed) return;
    this.disputed = true;
    this.cb.onError(`Desync detected (${reason}). This match will not count toward your rating.`);
  }

  /** Perform one of my actions locally; commits to the database when the segment ends. */
  act(a: Action): string | null {
    if (!this.state || !this.doc) return 'Not connected';
    if (!this.isMyTurn()) return 'Not your turn';
    const err = validateAction(this.state, a); if (err) return err;
    if (a.type === 'play') { const c = this.state.players[a.player].hand.find((x) => x.inst === a.inst); if (c) a = { ...a, reveal: { cardId: c.cardId, level: c.level } }; }
    this.state = applyAction(this.state, a);
    this.pending.push(a);
    this.cb.onState(this.state, this.state.events, 'local');
    const handsOver = this.state.winner !== null || whoActs(this.state) !== this.myIdx || a.type === 'endTurn' || a.type === 'block';
    if (handsOver) this.commit();
    return null;
  }

  private async commit(): Promise<void> {
    if (!this.state || !this.doc || this.pending.length === 0) return;
    const d = this.doc;
    const seq = this.processedSeq + 1;
    const nextIdx = this.state.winner === null ? whoActs(this.state) : null;
    const next = nextIdx === null ? 'none' : nextIdx === 0 ? d.p0.uid : d.p1!.uid;
    const entry: LogEntry = { seq, by: this.me.uid, actions: JSON.parse(JSON.stringify(this.pending)), hash: stateHash(this.state), at: Date.now(), next }; // JSON round-trip drops undefined fields, which RTDB rejects
    this.pending = [];
    this.processedSeq = seq;
    const updates: Record<string, unknown> = { [`log/${seq}`]: { ...entry, at: serverTimestamp() }, seq, next, lastAt: serverTimestamp() };
    try {
      await update(this.ref(), updates);
    } catch (e) {
      this.cb.onError('Could not send your move: ' + String((e as any)?.message ?? e));
    }
    if (this.state.winner !== null) this.onLocalGameOver();
  }

  private async onLocalGameOver(): Promise<void> {
    if (!this.state || !this.doc || this.ended) return;
    this.ended = true;
    const w = this.state.winner;
    const winnerUid = w === 'draw' ? 'draw' : w === 0 ? this.doc.p0.uid : this.doc.p1!.uid;
    const upd: Record<string, unknown> = { status: 'ended', [`p${this.myIdx}/secret`]: this.secret };
    if (!this.doc.result) upd.result = { winner: winnerUid, reason: this.state.winReason ?? 'Game over', by: this.me.uid };
    this.revealed = true;
    await update(this.ref(), upd).catch((e) => this.cb.onError(String(e)));
  }

  /** Claim a win when the opponent has timed out or disconnected on their turn. */
  async claimTimeout(reason: 'timeout' | 'disconnect'): Promise<void> {
    if (!this.doc || this.ended || this.doc.result) return;
    this.ended = true;
    await update(this.ref(), { status: 'ended', result: { winner: this.me.uid, reason: reason === 'timeout' ? 'Opponent ran out of time' : 'Opponent disconnected', by: this.me.uid }, [`p${this.myIdx}/secret`]: this.secret }).catch((e) => this.cb.onError(String(e)));
  }

  private checkTimeouts(): void {
    const d = this.doc; if (!d || d.status !== 'playing' || this.ended || !this.state) return;
    if (d.next === this.me.uid || d.next === 'none') return;
    const oppUid = this.opponentInfo().uid; if (!oppUid) return;
    const pres = d.presence?.[oppUid];
    const idle = Date.now() - (d.lastAt || Date.now());
    if (idle > this.turnMs + 5000) this.claimTimeout('timeout');
    else if (pres && !pres.online && Date.now() - pres.at > this.graceMs && idle > this.graceMs) this.claimTimeout('disconnect');
  }

  private async handleEnd(d: MatchDoc): Promise<void> {
    if (this.finalized || !d.result) return;
    if (!this.revealed) { this.revealed = true; this.ended = true; update(this.ref(), { [`p${this.myIdx}/secret`]: this.secret }).catch(() => {}); }
    const opp = this.opponentInfo();
    const oppSecret = (opp as MatchPlayer).secret;
    const engineEnded = !!this.state && this.state.winner !== null;
    // wait briefly for the opponent's secret so we can verify; fall back to unverified after a few seconds
    if (!oppSecret && engineEnded && !this._endWait) { this._endWait = setTimeout(() => this.handleEnd(this.doc!), 6000) as unknown as number; return; }
    this.finalized = true;
    if (this._endWait) { clearTimeout(this._endWait); this._endWait = null; }
    let verified = false;
    if (oppSecret) verified = await this.verifyFull(d, oppSecret as string);
    const r = d.result;
    const result: 'win' | 'loss' | 'draw' = r.winner === 'draw' ? 'draw' : r.winner === this.me.uid ? 'win' : 'loss';
    // the opponent claimed a win while the engine disagrees -> dispute
    if (result === 'loss' && r.by !== this.me.uid && this.state && this.state.winner === this.myIdx) this.disputed = true;
    this.cb.onEnd({ result, reason: r.reason, verified, disputed: this.disputed, opponent: opp, turns: this.state?.turn ?? 0 });
    // acknowledge; the second player to acknowledge removes the match node
    await set(this.ref(`ack/${this.me.uid}`), true).catch(() => {});
    const snap = await get(this.ref('ack')).catch(() => null);
    const acks = snap?.val() ?? {};
    if (acks[d.p0.uid] && d.p1 && acks[d.p1.uid]) await remove(this.ref()).catch(() => {});
    if (d.invite) await remove(ref(this.db, `invites/${d.invite}`)).catch(() => {});
    this.dispose();
  }
  private _endWait: number | null = null;

  /** Replays the entire log with both secrets revealed. */
  private async verifyFull(d: MatchDoc, oppSecret: string): Promise<boolean> {
    try {
      const p0 = d.p0, p1 = d.p1 as MatchPlayer;
      const theirs = this.myIdx === 0 ? p1 : p0, mine = this.myIdx === 0 ? p0 : p1;
      if ((await sha256Hex(oppSecret)) !== theirs.commit) return false;
      const seed = hashString(p0.salt + p1.salt);
      const mk = (pl: MatchPlayer): DeckSpec => ({ name: pl.deckName, faction: pl.faction, cards: pl.deck });
      const orders: [CardInst[], CardInst[]] = [[], []];
      orders[this.myIdx] = buildDeckInstances(mk(mine), this.myIdx, hashString(this.secret + ':' + theirs.salt));
      orders[this.opponentIdx] = buildDeckInstances(mk(theirs), this.opponentIdx, hashString(oppSecret + ':' + mine.salt));
      let st = createGame({ players: [{ name: p0.name, deck: mk(p0) }, { name: p1.name, deck: mk(p1) }], seed, firstPlayer: (seed & 1) as PlayerId, deckOrders: orders });
      const entries = Object.values(d.log ?? {}).sort((a, b) => a.seq - b.seq);
      for (const e of entries) {
        for (const a of e.actions) {
          if (st.winner !== null) break;
          const actorUid = whoActs(st) === 0 ? p0.uid : p1.uid;
          if (actorUid !== e.by) return false;
          st = applyAction(st, a); // throws on anything illegal, including a reveal that lies about the card
        }
        if (stateHash(st) !== e.hash) return false;
      }
      return true;
    } catch { return false; }
  }

  /** Resume after a reload: the stored secret lets us rebuild the state from the log. */
  static canResume(id: string): boolean { return !!loadSecret(id); }
}

/** Deletes a stale match the user was part of (used on login cleanup). */
export async function cleanupMatch(id: string, d?: Database): Promise<void> {
  await remove(matchRef(id, d)).catch(() => {});
}
