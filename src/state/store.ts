import { signal, computed, effect } from '@preact/signals';
import type { User } from 'firebase/auth';
import type { Profile, Settings } from '../firebase/profile';
import { DEFAULT_SETTINGS, localStore, saveProfileFields } from '../firebase/profile';
import { friendlyError } from '../firebase/app';
import { audio } from '../audio/synth';

export type Route =
  | { name: 'title' } | { name: 'auth'; mode?: 'login' | 'signup' | 'reset' } | { name: 'onboard' } | { name: 'home' }
  | { name: 'campaign' } | { name: 'collection' } | { name: 'decks'; deckId?: string } | { name: 'packs' }
  | { name: 'profile' } | { name: 'settings' } | { name: 'online'; join?: string } | { name: 'about' }
  | { name: 'match'; mode: 'bot' | 'online' | 'tutorial'; botId?: string; matchId?: string; deckId?: string };

export const user = signal<User | null | undefined>(undefined); // undefined = unknown yet
export const profile = signal<Profile | null>(null);
export const route = signal<Route>(parseHash(location.hash));
export const toasts = signal<{ id: number; text: string; kind: 'info' | 'error' | 'reward' }[]>([]);
export const offlineMode = signal(false); // true when Firestore writes fail (quota/offline): we keep a local copy
export const settings = computed<Settings>(() => profile.value?.settings ?? loadLocalSettings());

let toastId = 0;
export function toast(text: string, kind: 'info' | 'error' | 'reward' = 'info', ms = 3200) {
  const id = ++toastId;
  toasts.value = [...toasts.value, { id, text, kind }];
  setTimeout(() => { toasts.value = toasts.value.filter((t) => t.id !== id); }, ms);
}

export function navigate(r: Route) {
  route.value = r;
  const h = toHash(r);
  if (location.hash !== h) history.pushState(null, '', h);
  window.scrollTo(0, 0);
}
window.addEventListener('popstate', () => { route.value = parseHash(location.hash); });
window.addEventListener('hashchange', () => { route.value = parseHash(location.hash); });

export function toHash(r: Route): string {
  switch (r.name) {
    case 'match': return `#/match/${r.mode}${r.botId ? '/' + r.botId : r.matchId ? '/' + r.matchId : ''}${r.deckId ? '?deck=' + r.deckId : ''}`;
    case 'decks': return r.deckId ? `#/decks/${r.deckId}` : '#/decks';
    case 'online': return r.join ? `#/online/${r.join}` : '#/online';
    case 'auth': return `#/auth${r.mode ? '/' + r.mode : ''}`;
    default: return `#/${r.name}`;
  }
}
export function parseHash(h: string): Route {
  const path = h.replace(/^#\/?/, '');
  const [p, q] = path.split('?');
  const parts = p.split('/').filter(Boolean);
  const params = new URLSearchParams(q ?? '');
  switch (parts[0]) {
    case undefined: case '': return { name: 'title' };
    case 'match': {
      const mode = parts[1] as 'bot' | 'online' | 'tutorial';
      if (mode === 'bot') return { name: 'match', mode, botId: parts[2], deckId: params.get('deck') ?? undefined };
      if (mode === 'online') return { name: 'match', mode, matchId: parts[2], deckId: params.get('deck') ?? undefined };
      return { name: 'match', mode: 'tutorial' };
    }
    case 'decks': return { name: 'decks', deckId: parts[1] };
    case 'online': return { name: 'online', join: parts[1] };
    case 'auth': return { name: 'auth', mode: parts[1] as any };
    case 'home': case 'campaign': case 'collection': case 'packs': case 'profile': case 'settings': case 'onboard': case 'about': return { name: parts[0] } as Route;
    default: return { name: 'title' };
  }
}

// GitHub Pages 404 fallback stores the deep link before redirecting to the app root
try {
  const redirect = sessionStorage.getItem('vf-redirect');
  if (redirect) { sessionStorage.removeItem('vf-redirect'); const r = parseHash(redirect.startsWith('#') ? redirect : '#' + redirect); route.value = r; history.replaceState(null, '', toHash(r)); }
} catch { /* ignore */ }

function loadLocalSettings(): Settings {
  try { const s = localStorage.getItem('vf-settings'); return s ? { ...DEFAULT_SETTINGS, ...JSON.parse(s) } : DEFAULT_SETTINGS; } catch { return DEFAULT_SETTINGS; }
}

/** Update the profile in memory, in local storage, and (best-effort) in Firestore. */
export async function updateProfile(fields: Partial<Profile>, opts: { persist?: boolean } = { persist: true }): Promise<void> {
  const p = profile.value; if (!p) return;
  const next = { ...p, ...fields };
  profile.value = next;
  localStore.save(next);
  if (opts.persist === false) return;
  try { await saveProfileFields(p.uid, fields); offlineMode.value = false; }
  catch (e) { offlineMode.value = true; toast(friendlyError(e), 'error'); }
}

export function setProfile(p: Profile | null) {
  profile.value = p;
  if (p) localStore.save(p);
}

export async function updateSettings(s: Partial<Settings>) {
  const merged = { ...settings.value, ...s };
  try { localStorage.setItem('vf-settings', JSON.stringify(merged)); } catch { /* ignore */ }
  if (profile.value) await updateProfile({ settings: merged });
}

// keep audio and reduced-motion in sync with settings
effect(() => {
  const s = settings.value;
  audio.enabled = s.sfx > 0;
  audio.setMusicEnabled(s.music > 0);
  audio.setVolumes(s.sfx, s.music);
  document.documentElement.dataset.motion = s.reducedMotion ? 'reduced' : s.animations;
});

export function reducedMotion(): boolean {
  return settings.value.reducedMotion || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}
