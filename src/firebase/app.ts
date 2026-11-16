import { initializeApp, getApps } from 'firebase/app';
import { getAuth, connectAuthEmulator, type Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, type Firestore } from 'firebase/firestore';
import { getDatabase, connectDatabaseEmulator, type Database } from 'firebase/database';
import { firebaseConfig, USE_EMULATORS } from './config';

let _auth: Auth | null = null, _db: Firestore | null = null, _rtdb: Database | null = null;

export function firebaseConfigured(): boolean {
  return firebaseConfig.apiKey !== 'REPLACE_ME';
}

function app() {
  return getApps()[0] ?? initializeApp(firebaseConfig);
}
export function fbAuth(): Auth {
  if (!_auth) {
    _auth = getAuth(app());
    if (USE_EMULATORS) connectAuthEmulator(_auth, 'http://127.0.0.1:9105', { disableWarnings: true });
  }
  return _auth;
}
export function fbDb(): Firestore {
  if (!_db) {
    _db = getFirestore(app());
    if (USE_EMULATORS) connectFirestoreEmulator(_db, '127.0.0.1', 8085);
  }
  return _db;
}
export function fbRtdb(): Database {
  if (!_rtdb) {
    _rtdb = getDatabase(app());
    if (USE_EMULATORS) connectDatabaseEmulator(_rtdb, '127.0.0.1', 9005);
  }
  return _rtdb;
}

/** Turns Firebase errors into short, human messages and flags quota exhaustion. */
export function friendlyError(e: unknown): string {
  const code = (e as any)?.code ?? '';
  const msg = String((e as any)?.message ?? e);
  if (code.includes('resource-exhausted') || /quota/i.test(msg)) return 'The free-tier quota for today is exhausted. Your progress is kept locally; please try again later.';
  if (code.includes('permission-denied') || /PERMISSION_DENIED/.test(msg)) return 'That action was rejected by the security rules.';
  if (code.includes('network') || code.includes('unavailable')) return 'Network problem. Check your connection and try again.';
  const known: Record<string, string> = {
    'auth/invalid-email': 'That email address does not look right.',
    'auth/user-not-found': 'No account with that email.',
    'auth/wrong-password': 'Wrong password.',
    'auth/invalid-credential': 'Wrong email or password.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/weak-password': 'Use a password of at least 6 characters.',
    'auth/popup-closed-by-user': 'The sign-in window was closed.',
    'auth/requires-recent-login': 'Please sign in again before doing that.',
    'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
    'auth/unauthorized-domain': 'This domain is not authorised for sign-in in the Firebase project.',
  };
  return known[code] ?? msg.replace(/^Firebase: /, '').replace(/\(auth\/.*\)\.?$/, '').trim();
}
