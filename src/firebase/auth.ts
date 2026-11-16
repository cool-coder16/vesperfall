import {
  createUserWithEmailAndPassword, signInWithEmailAndPassword, signInWithPopup, GoogleAuthProvider, sendEmailVerification,
  sendPasswordResetEmail, signOut, onAuthStateChanged, deleteUser, reauthenticateWithCredential, EmailAuthProvider,
  reauthenticateWithPopup, type User,
} from 'firebase/auth';
import { fbAuth } from './app';

export function watchAuth(cb: (u: User | null) => void): () => void {
  return onAuthStateChanged(fbAuth(), cb);
}
export async function signUpEmail(email: string, password: string): Promise<User> {
  const cred = await createUserWithEmailAndPassword(fbAuth(), email, password);
  try { await sendEmailVerification(cred.user); } catch { /* verification mail is best-effort */ }
  return cred.user;
}
export async function signInEmail(email: string, password: string): Promise<User> {
  return (await signInWithEmailAndPassword(fbAuth(), email, password)).user;
}
export async function signInGoogle(): Promise<User> {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: 'select_account' });
  return (await signInWithPopup(fbAuth(), provider)).user;
}
export async function resendVerification(): Promise<void> {
  const u = fbAuth().currentUser; if (u) await sendEmailVerification(u);
}
export async function resetPassword(email: string): Promise<void> {
  await sendPasswordResetEmail(fbAuth(), email);
}
export async function logOut(): Promise<void> { await signOut(fbAuth()); }
export function currentUser(): User | null { return fbAuth().currentUser; }

/** Deletes the auth user. Callers delete the Firestore profile first (the user can only do that while signed in). */
export async function deleteAccount(password?: string): Promise<void> {
  const u = fbAuth().currentUser; if (!u) return;
  try {
    await deleteUser(u);
  } catch (e: any) {
    if (e?.code !== 'auth/requires-recent-login') throw e;
    const isPwd = u.providerData.some((p) => p.providerId === 'password');
    if (isPwd && password && u.email) await reauthenticateWithCredential(u, EmailAuthProvider.credential(u.email, password));
    else await reauthenticateWithPopup(u, new GoogleAuthProvider());
    await deleteUser(u);
  }
}
