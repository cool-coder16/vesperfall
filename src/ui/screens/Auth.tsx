import { useState } from 'preact/hooks';
import { navigate, route, toast, user } from '../../state/store';
import { signInEmail, signUpEmail, signInGoogle, resetPassword } from '../../firebase/auth';
import { friendlyError, firebaseConfigured } from '../../firebase/app';
import { sfx } from '../../audio/synth';

export function Auth() {
  const r = route.value as { name: 'auth'; mode?: 'login' | 'signup' | 'reset' };
  const mode = r.mode ?? 'login';
  const [email, setEmail] = useState(''); const [pw, setPw] = useState(''); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  const run = async (fn: () => Promise<unknown>) => {
    setBusy(true); setErr('');
    try { await fn(); } catch (e) { setErr(friendlyError(e)); sfx('error'); } finally { setBusy(false); }
  };
  const submit = (e: Event) => {
    e.preventDefault();
    if (mode === 'reset') return run(async () => { await resetPassword(email); toast('Password reset email sent.'); navigate({ name: 'auth', mode: 'login' }); });
    if (mode === 'signup') return run(async () => { await signUpEmail(email, pw); toast('Account created. We sent you a verification email.'); });
    return run(() => signInEmail(email, pw));
  };
  if (user.value) { navigate({ name: 'home' }); return null; }
  return (
    <main class="screen narrow">
      <div class="panel" style="margin-top: 8vh">
        <h2 class="center mb">{mode === 'signup' ? 'Take the Oath' : mode === 'reset' ? 'Recover your name' : 'Return to the Vigil'}</h2>
        {!firebaseConfigured() && <p class="error">Firebase is not configured, so accounts are unavailable. You can still play the tutorial and bots from the title screen.</p>}
        <form onSubmit={submit}>
          <div class="field"><label for="email">Email</label><input id="email" type="email" required autocomplete="email" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} /></div>
          {mode !== 'reset' && <div class="field"><label for="pw">Password</label><input id="pw" type="password" required minLength={6} autocomplete={mode === 'signup' ? 'new-password' : 'current-password'} value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} /></div>}
          {err && <p class="error" role="alert">{err}</p>}
          <div class="btn-row">
            <button class="btn primary" type="submit" disabled={busy}>{mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset email' : 'Sign in'}</button>
            {mode !== 'reset' && <button class="btn" type="button" disabled={busy} onClick={() => run(signInGoogle)}>Continue with Google</button>}
          </div>
        </form>
        <p class="hint mt">
          {mode === 'login' && <>New here? <a href="#/auth/signup" onClick={(e) => { e.preventDefault(); navigate({ name: 'auth', mode: 'signup' }); }}>Create an account</a> · <a href="#/auth/reset" onClick={(e) => { e.preventDefault(); navigate({ name: 'auth', mode: 'reset' }); }}>Forgot password</a></>}
          {mode !== 'login' && <a href="#/auth/login" onClick={(e) => { e.preventDefault(); navigate({ name: 'auth', mode: 'login' }); }}>Back to sign in</a>}
        </p>
        <p class="hint small"><a href="#/" onClick={(e) => { e.preventDefault(); navigate({ name: 'title' }); }}>← Title</a></p>
      </div>
    </main>
  );
}
