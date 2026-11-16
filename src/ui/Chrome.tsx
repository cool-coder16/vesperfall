import { navigate, profile, route, toasts, offlineMode, toast } from '../state/store';
import { logOut } from '../firebase/auth';
import { sfx } from '../audio/synth';
import { portraitSVG, AVATARS } from '../art/cardArt';
import { useMemo } from 'preact/hooks';

export function TopBar({ title }: { title?: string }) {
  const p = profile.value;
  const r = route.value.name;
  const link = (name: any, label: string) => <a href={`#/${name}`} class={r === name ? 'active' : ''} onClick={(e) => { e.preventDefault(); sfx('click'); navigate({ name }); }}>{label}</a>;
  return (
    <header class="topbar">
      <a class="brand" href="#/home" onClick={(e) => { e.preventDefault(); navigate({ name: 'home' }); }}>VESPERFALL{title ? ` · ${title}` : ''}</a>
      <nav aria-label="Main">
        {link('home', 'Hall')}{link('campaign', 'Campaign')}{link('online', 'Online')}{link('decks', 'Decks')}{link('collection', 'Collection')}{link('packs', 'Reliquary')}{link('profile', 'Profile')}{link('settings', 'Settings')}
        <button onClick={async () => { await logOut(); navigate({ name: 'title' }); }}>Sign out</button>
      </nav>
      {p && <div class="wallet" aria-label="Wallet"><span title="Cinders"><i class="cinder-icon" />{p.cinders}</span><span title="Unopened reliquaries"><i class="pack-icon" />{p.packs}</span><span title="Rating">★ {p.rating}</span></div>}
    </header>
  );
}

export function Toasts() {
  return <div class="toasts" aria-live="polite">{toasts.value.map((t) => <div key={t.id} class={`toast ${t.kind}`}>{t.text}</div>)}{offlineMode.value && <div class="toast error">Working offline — progress is saved on this device and will sync when Firebase is reachable.</div>}</div>;
}

export function Portrait({ avatar, size = 'normal', faction }: { avatar: string; size?: 'normal' | 'small'; faction?: string }) {
  const a = AVATARS.find((x) => x.id === avatar) ?? AVATARS[0];
  const svg = useMemo(() => portraitSVG(a.motif, a.seed, a.faction), [a.id]);
  return <div class={`portrait ${size === 'small' ? 'small' : ''} ${faction ?? a.faction}`} dangerouslySetInnerHTML={{ __html: svg }} aria-hidden="true" />;
}

export function BotPortrait({ motif, seed, faction, size = 'normal' }: { motif: string; seed: number; faction: 'dawn' | 'umbral' | 'neutral'; size?: 'normal' | 'small' }) {
  const svg = useMemo(() => portraitSVG(motif, seed, faction), [motif, seed]);
  return <div class={`portrait ${size === 'small' ? 'small' : ''} ${faction}`} dangerouslySetInnerHTML={{ __html: svg }} aria-hidden="true" />;
}

export function copyText(t: string) { navigator.clipboard?.writeText(t).then(() => toast('Copied')).catch(() => {}); }
