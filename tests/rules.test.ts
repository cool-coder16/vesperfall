// Security-rule tests against the Firebase Emulator Suite.
// Run with: npm run test:rules  (wraps vitest in `firebase emulators:exec`)
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { doc, setDoc, getDoc, updateDoc, writeBatch, serverTimestamp, collection, addDoc } from 'firebase/firestore';
import { ref, set, update, get, remove } from 'firebase/database';
import { newProfile } from '../src/firebase/profile';

let env: RulesTestEnvironment;
const PROJECT = 'demo-vesperfall';

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: 8085 },
    database: { rules: readFileSync('database.rules.json', 'utf8'), host: '127.0.0.1', port: 9005 },
  });
});
afterAll(async () => { await env.cleanup(); });
beforeEach(async () => { await env.clearFirestore(); await env.clearDatabase(); });

const alice = () => env.authenticatedContext('alice');
const bob = () => env.authenticatedContext('bob');
const anon = () => env.unauthenticatedContext();

async function createAlice() {
  const db = alice().firestore();
  const p = newProfile('alice', 'Alice_1', 'av_knight', 'dawn');
  const b = writeBatch(db);
  b.set(doc(db, 'usernames', 'alice_1'), { uid: 'alice' });
  b.set(doc(db, 'users', 'alice'), { ...p, createdAt: serverTimestamp(), dailyClaimedAt: null, lastRewardAt: null });
  await b.commit();
}

describe('Firestore rules: profiles', () => {
  it('a signed-in user can create their own profile with starter values and claim a username', async () => {
    await assertSucceeds(createAlice());
    expect((await getDoc(doc(alice().firestore(), 'users', 'alice'))).data()?.cinders).toBe(500);
  });
  it('rejects a profile that grants itself extra starting currency', async () => {
    const db = alice().firestore();
    const p = { ...newProfile('alice', 'Alice_1', 'av_knight', 'dawn'), cinders: 99999 };
    const b = writeBatch(db);
    b.set(doc(db, 'usernames', 'alice_1'), { uid: 'alice' });
    b.set(doc(db, 'users', 'alice'), { ...p, createdAt: serverTimestamp() });
    await assertFails(b.commit());
  });
  it('rejects creating a profile for another uid or without the username doc', async () => {
    const db = alice().firestore();
    const p = newProfile('bob', 'Bobby', 'av_knight', 'dawn');
    await assertFails(setDoc(doc(db, 'users', 'bob'), { ...p, createdAt: serverTimestamp() }));
    const p2 = newProfile('alice', 'Alice_1', 'av_knight', 'dawn');
    await assertFails(setDoc(doc(db, 'users', 'alice'), { ...p2, createdAt: serverTimestamp() }));
  });
  it('unauthenticated users cannot read profiles; other players can read but not write', async () => {
    await createAlice();
    await assertFails(getDoc(doc(anon().firestore(), 'users', 'alice')));
    await assertSucceeds(getDoc(doc(bob().firestore(), 'users', 'alice')));
    await assertFails(updateDoc(doc(bob().firestore(), 'users', 'alice'), { cinders: 0 }));
  });
  it('spending is allowed; granting cinders without a throttled reward write is not', async () => {
    await createAlice();
    const db = alice().firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', 'alice'), { cinders: 350, packs: 4 }));   // bought a pack
    await assertFails(updateDoc(doc(db, 'users', 'alice'), { cinders: 350, packs: 6 }));      // packs without paying
    await assertFails(updateDoc(doc(db, 'users', 'alice'), { cinders: 5000 }));               // free money
  });
  it('rewards are bounded and throttled to one per 45 seconds', async () => {
    await createAlice();
    const db = alice().firestore();
    await assertSucceeds(updateDoc(doc(db, 'users', 'alice'), { cinders: 500 + 1500, packs: 3 + 5, lastRewardAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'users', 'alice'), { cinders: 2000 + 100, lastRewardAt: serverTimestamp() })); // too soon
    await assertFails(updateDoc(doc(db, 'users', 'alice'), { cinders: 2000 + 1501, lastRewardAt: serverTimestamp() })); // too much
  });
  it('the daily vigil can be claimed once, with a bounded amount', async () => {
    await createAlice();
    const db = alice().firestore();
    await assertFails(updateDoc(doc(db, 'users', 'alice'), { cinders: 700, packs: 4, dailyClaimedAt: serverTimestamp() }));  // 200 > 100
    await assertSucceeds(updateDoc(doc(db, 'users', 'alice'), { cinders: 600, packs: 4, dailyClaimedAt: serverTimestamp() }));
    await assertFails(updateDoc(doc(db, 'users', 'alice'), { cinders: 700, packs: 5, dailyClaimedAt: serverTimestamp() }));  // again too soon
  });
  it('identity fields and rating jumps are protected', async () => {
    await createAlice();
    const db = alice().firestore();
    await assertFails(updateDoc(doc(db, 'users', 'alice'), { username: 'Hacker' }));
    await assertFails(updateDoc(doc(db, 'users', 'alice'), { rating: 1200 }));
    await assertSucceeds(updateDoc(doc(db, 'users', 'alice'), { rating: 1030 }));
  });
  it('match history is append-only and private', async () => {
    await createAlice();
    const db = alice().firestore();
    const ref1 = await assertSucceeds(addDoc(collection(db, 'users', 'alice', 'matches'), { mode: 'bot', result: 'win', at: serverTimestamp(), turns: 10 }));
    await assertFails(updateDoc(ref1, { result: 'loss' }));
    await assertFails(getDoc(doc(bob().firestore(), 'users', 'alice', 'matches', ref1.id)));
  });
  it('usernames are unique and lower-case', async () => {
    await createAlice();
    await assertFails(setDoc(doc(bob().firestore(), 'usernames', 'alice_1'), { uid: 'bob' }));
    await assertFails(setDoc(doc(bob().firestore(), 'usernames', 'Bobby'), { uid: 'bob' }));
    await assertSucceeds(setDoc(doc(bob().firestore(), 'usernames', 'bobby'), { uid: 'bob' }));
  });
  it('the owner can delete their profile and username', async () => {
    await createAlice();
    const db = alice().firestore();
    const b = writeBatch(db); b.delete(doc(db, 'usernames', 'alice_1')); b.delete(doc(db, 'users', 'alice'));
    await assertSucceeds(b.commit());
  });
});

describe('Realtime Database rules: matches', () => {
  const baseMatch = (host: string) => ({ p0: { uid: host, name: 'A', ready: true, commit: 'c', salt: 's', deck: [{ cardId: 'd_acolyte', level: 1 }], faction: 'dawn', deckName: 'x', avatar: 'a', rating: 1000 }, status: 'setup', seq: 0, next: host, createdAt: Date.now(), lastAt: Date.now() });
  const entry = (seq: number, by: string, next: string) => ({ seq, by, actions: [{ type: 'endTurn', player: 0 }], hash: 'h', at: { '.sv': 'timestamp' }, next });

  it('only the host can create a match for themselves; outsiders cannot read it once both players are set', async () => {
    const a = alice().database();
    await assertSucceeds(set(ref(a, 'matches/m1'), baseMatch('alice')));
    await assertFails(set(ref(bob().database(), 'matches/m2'), baseMatch('alice')));
    await assertSucceeds(update(ref(bob().database(), 'matches/m1/p1'), { uid: 'bob', ready: true, commit: 'c', salt: 't', deck: [], faction: 'umbral', deckName: 'y', avatar: 'a', rating: 1000 }));
    await assertFails(get(ref(env.authenticatedContext('carol').database(), 'matches/m1')));
    await assertFails(get(ref(anon().database(), 'matches/m1')));
    await assertSucceeds(get(ref(a, 'matches/m1')));
  });
  it('enforces turn order: only `next` may append to the log, sequence numbers must increase by one', async () => {
    const a = alice().database(), b = bob().database();
    await set(ref(a, 'matches/m1'), baseMatch('alice'));
    await update(ref(b, 'matches/m1/p1'), { uid: 'bob', ready: true, commit: 'c', salt: 't' });
    await assertSucceeds(update(ref(a, 'matches/m1'), { status: 'playing' }));
    // bob is not `next`
    await assertFails(update(ref(b, 'matches/m1'), { 'log/1': entry(1, 'bob', 'alice'), seq: 1, next: 'alice' }));
    // alice cannot impersonate bob
    await assertFails(update(ref(a, 'matches/m1'), { 'log/1': entry(1, 'bob', 'alice'), seq: 1, next: 'bob' }));
    // wrong seq
    await assertFails(update(ref(a, 'matches/m1'), { 'log/2': entry(2, 'alice', 'bob'), seq: 2, next: 'bob' }));
    // correct
    await assertSucceeds(update(ref(a, 'matches/m1'), { 'log/1': entry(1, 'alice', 'bob'), seq: 1, next: 'bob' }));
    // alice has handed over; she cannot act again, bob can
    await assertFails(update(ref(a, 'matches/m1'), { 'log/2': entry(2, 'alice', 'bob'), seq: 2, next: 'bob' }));
    await assertSucceeds(update(ref(b, 'matches/m1'), { 'log/2': entry(2, 'bob', 'alice'), seq: 2, next: 'alice' }));
    // log entries are immutable
    await assertFails(update(ref(b, 'matches/m1'), { 'log/2': entry(2, 'bob', 'bob') }));
    // next must be a player
    await assertFails(update(ref(a, 'matches/m1'), { 'log/3': entry(3, 'alice', 'carol'), seq: 3, next: 'carol' }));
  });
  it('players cannot edit each other\'s setup data, and results can only be written once', async () => {
    const a = alice().database(), b = bob().database();
    await set(ref(a, 'matches/m1'), baseMatch('alice'));
    await update(ref(b, 'matches/m1/p1'), { uid: 'bob', ready: true });
    await assertFails(update(ref(b, 'matches/m1/p0'), { deck: [] }));
    await assertFails(update(ref(a, 'matches/m1/p1'), { ready: false }));
    await assertSucceeds(set(ref(a, 'matches/m1/result'), { winner: 'alice', reason: 'test', by: 'alice' }));
    await assertFails(set(ref(b, 'matches/m1/result'), { winner: 'bob', reason: 'test', by: 'bob' }));
  });
  it('finished matches can be removed by a player; live ones cannot', async () => {
    const a = alice().database(), b = bob().database();
    await set(ref(a, 'matches/m1'), baseMatch('alice'));
    await update(ref(b, 'matches/m1/p1'), { uid: 'bob', ready: true });
    await assertFails(remove(ref(b, 'matches/m1')));
    await assertSucceeds(update(ref(b, 'matches/m1'), { status: 'ended' }));
    await assertSucceeds(remove(ref(b, 'matches/m1')));
  });
  it('queue entries belong to their player; a claim may only set matchId/claimedBy', async () => {
    const a = alice().database(), b = bob().database();
    await assertSucceeds(set(ref(a, 'queue/alice'), { uid: 'alice', rating: 1000, at: { '.sv': 'timestamp' }, name: 'A' }));
    await assertFails(set(ref(b, 'queue/alice'), { uid: 'alice', rating: 1, at: 0, name: 'A' }));
    await assertFails(update(ref(b, 'queue/alice'), { uid: 'bob' }));
    await assertSucceeds(update(ref(b, 'queue/alice'), { claimedBy: 'bob', matchId: 'm9' }));
    await assertFails(update(ref(env.authenticatedContext('carol').database(), 'queue/alice'), { claimedBy: 'carol', matchId: 'm10' }));
  });
});
