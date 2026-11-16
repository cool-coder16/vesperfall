// A full two-player online match through the Realtime Database emulator, with both clients
// driven by bots, plus a disconnect/timeout claim and a reconnect. Run via `npm run test:rules`.
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { get, ref, set, serverTimestamp } from 'firebase/database';
import { OnlineMatch, createInvite, joinInvite, type Me } from '../src/firebase/online';
import { starterDeck } from '../src/engine/decks';
import { botNextAction, paramsForLevel } from '../src/ai/bot';
import { stateHash } from '../src/engine/engine';
import type { GameState } from '../src/engine/types';

let env: RulesTestEnvironment;
beforeAll(async () => {
  env = await initializeTestEnvironment({ projectId: 'demo-vesperfall', database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9005 } });
  await env.clearDatabase();
});
afterAll(async () => { await env.cleanup(); });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const ALICE: Me = { uid: 'alice', name: 'Alice', avatar: 'av_knight', rating: 1000 };
const BOB: Me = { uid: 'bob', name: 'Bob', avatar: 'av_wraith', rating: 1050 };

interface Client { om: OnlineMatch; ends: any[]; errors: string[]; statuses: string[]; states: GameState[] }
function client(id: string, me: Me, deck: any, db: any, opts: any = {}): Client {
  const c: Client = { om: null as any, ends: [], errors: [], statuses: [], states: [] };
  c.om = new OnlineMatch(id, me, deck, {
    onState: (st) => c.states.push(st),
    onStatus: (s) => c.statuses.push(s),
    onEnd: (sum) => c.ends.push(sum),
    onError: (m) => c.errors.push(m),
  }, { db, ...opts });
  return c;
}

async function driveUntil(clients: Client[], pred: () => boolean, maxMs: number, level = 4) {
  const params = paramsForLevel(level);
  const start = Date.now();
  while (!pred()) {
    for (const c of clients) {
      if (c.om.isMyTurn()) {
        const a = botNextAction(c.om.state!, c.om.myIdx, params);
        if (a) { const err = c.om.act(a); if (err) throw new Error(err); }
      }
    }
    await sleep(40);
    if (Date.now() - start > maxMs) throw new Error('timed out: ' + clients.map((c) => `${c.om.me.name}:${c.om.state?.turn}/${c.om.state?.phase}/${c.statuses.at(-1)} errs=${c.errors.join('|')}`).join(' ; '));
  }
}

describe('online multiplayer (emulator)', () => {
  it('plays a complete verified match between two clients with one commit per turn segment', async () => {
    const dbA = env.authenticatedContext("alice").database() as any, dbB = env.authenticatedContext("bob").database() as any;
    const deckA = starterDeck('dawn'), deckB = starterDeck('umbral');
    const { code, matchId } = await createInvite(ALICE, deckA, dbA);
    await joinInvite(code, BOB, deckB, dbB);
    const A = client(matchId, ALICE, deckA, dbA), B = client(matchId, BOB, deckB, dbB);
    A.om.connect(); B.om.connect();
    await driveUntil([A, B], () => A.ends.length > 0 && B.ends.length > 0, 90_000);
    expect(A.errors).toEqual([]); expect(B.errors).toEqual([]);
    expect(A.ends[0].verified).toBe(true); expect(B.ends[0].verified).toBe(true);
    expect(A.ends[0].disputed).toBe(false); expect(B.ends[0].disputed).toBe(false);
    expect([A.ends[0].result, B.ends[0].result].sort()).toEqual(['loss', 'win']);
    // both clients agree on the final public state
    expect(stateHash(A.om.state!)).toBe(stateHash(B.om.state!));
    // commits were batched: far fewer log entries than actions
    const totalActions = A.om.state!.seq;
    expect(A.om.state!.turn).toBeGreaterThan(5);
    // match node was cleaned up after both acknowledged
    await sleep(500);
    const snap = await get(ref(dbA, `matches/${matchId}`)).catch(() => null);
    expect(snap?.exists() ?? false).toBe(false);
    expect(totalActions).toBeGreaterThan(A.om.state!.turn);
  }, 120_000);

  it('a hidden-information view: each client only ever sees its own hand', async () => {
    const dbA = env.authenticatedContext("alice").database() as any, dbB = env.authenticatedContext("bob").database() as any;
    const deckA = starterDeck('dawn'), deckB = starterDeck('umbral');
    const { code, matchId } = await createInvite(ALICE, deckA, dbA);
    await joinInvite(code, BOB, deckB, dbB);
    const A = client(matchId, ALICE, deckA, dbA), B = client(matchId, BOB, deckB, dbB);
    A.om.connect(); B.om.connect();
    await driveUntil([A, B], () => !!A.om.state && !!B.om.state && A.om.state.turn >= 2 && B.om.state.turn >= 2, 30_000);
    const a = A.om.state!, b = B.om.state!;
    expect(a.players[A.om.opponentIdx].hand.every((c) => c.cardId === '?')).toBe(true);
    expect(b.players[B.om.opponentIdx].hand.every((c) => c.cardId === '?')).toBe(true);
    expect(a.players[A.om.myIdx].hand.every((c) => c.cardId !== '?')).toBe(true);
    // played cards are revealed to the opponent
    const revealed = [...a.players[A.om.opponentIdx].board, ...a.players[A.om.opponentIdx].graveyard];
    for (const c of revealed) expect(c.cardId).not.toBe('?');
    A.om.dispose(); B.om.dispose();
    await set(ref(dbA, `matches/${matchId}/status`), 'ended');
  }, 60_000);

  it('handles a disconnect: the remaining player claims the win after the grace period', async () => {
    const dbA = env.authenticatedContext("alice").database() as any, dbB = env.authenticatedContext("bob").database() as any;
    const deckA = starterDeck('dawn'), deckB = starterDeck('umbral');
    const { code, matchId } = await createInvite(ALICE, deckA, dbA);
    await joinInvite(code, BOB, deckB, dbB);
    const A = client(matchId, ALICE, deckA, dbA, { graceMs: 1500 }), B = client(matchId, BOB, deckB, dbB, { graceMs: 1500 });
    A.om.connect(); B.om.connect();
    await driveUntil([A, B], () => !!A.om.state && !!B.om.state && A.om.state.turn >= 2, 30_000);
    // whoever's turn it is "disconnects": stop their client and mark presence offline (what onDisconnect would do)
    const leaver = A.om.isMyTurn() ? A : B, stayer = leaver === A ? B : A;
    leaver.om.dispose();
    await set(ref(leaver === A ? dbA : dbB, `matches/${matchId}/presence/${leaver.om.me.uid}`), { online: false, at: serverTimestamp() });
    const start = Date.now();
    while (stayer.ends.length === 0 && Date.now() - start < 15_000) await sleep(100);
    expect(stayer.ends.length).toBe(1);
    expect(stayer.ends[0].result).toBe('win');
    expect(stayer.ends[0].reason).toMatch(/disconnected/);
    stayer.om.dispose();
  }, 60_000);

  it('reconnects: a client rebuilds the game from the log after a reload', async () => {
    const dbA = env.authenticatedContext("alice").database() as any, dbB = env.authenticatedContext("bob").database() as any;
    const deckA = starterDeck('dawn'), deckB = starterDeck('umbral');
    const { code, matchId } = await createInvite(ALICE, deckA, dbA);
    await joinInvite(code, BOB, deckB, dbB);
    const A = client(matchId, ALICE, deckA, dbA), B = client(matchId, BOB, deckB, dbB);
    A.om.connect(); B.om.connect();
    await driveUntil([A, B], () => !!A.om.state && A.om.state.turn >= 3, 30_000);
    const before = stateHash(A.om.state!);
    A.om.dispose();
    const A2 = client(matchId, ALICE, deckA, dbA);
    A2.om.connect();
    const start = Date.now();
    while (!A2.om.state && Date.now() - start < 10_000) await sleep(50);
    expect(A2.om.state).toBeTruthy();
    expect(stateHash(A2.om.state!)).toBe(before);
    expect(stateHash(A2.om.state!)).toBe(stateHash(B.om.state!));
    // and play can continue to the end
    await driveUntil([A2, B], () => A2.ends.length > 0 && B.ends.length > 0, 90_000);
    expect(A2.ends[0].verified).toBe(true);
    expect(B.ends[0].verified).toBe(true);
  }, 150_000);
});
