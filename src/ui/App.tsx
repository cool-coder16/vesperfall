import { useEffect, useState } from 'preact/hooks';
import { route, user, profile, setProfile, navigate, toast, offlineMode } from '../state/store';
import { watchAuth } from '../firebase/auth';
import { loadProfile, localStore } from '../firebase/profile';
import { firebaseConfigured, friendlyError } from '../firebase/app';
import { Background } from './Background';
import { Toasts } from './Chrome';
import { Title } from './screens/Title';
import { Auth } from './screens/Auth';
import { Onboard } from './screens/Onboard';
import { Home } from './screens/Home';
import { Campaign } from './screens/Campaign';
import { Collection } from './screens/Collection';
import { Decks } from './screens/Decks';
import { Packs } from './screens/Packs';
import { ProfileScreen } from './screens/Profile';
import { SettingsScreen } from './screens/Settings';
import { Online } from './screens/Online';
import { About } from './screens/About';
import { Match } from './match/Match';
import { audio } from '../audio/synth';

export function App() {
  const [loadingProfile, setLoadingProfile] = useState(false);
  useEffect(() => {
    if (!firebaseConfigured()) { user.value = null; return; }
    return watchAuth(async (u) => {
      user.value = u;
      if (!u) { setProfile(null); return; }
      setLoadingProfile(true);
      try {
        const p = await loadProfile(u.uid);
        setProfile(p); offlineMode.value = false;
      } catch (e) {
        const cached = localStore.load(u.uid);
        if (cached) { setProfile(cached); offlineMode.value = true; toast('Could not reach Firestore; using your last saved progress.', 'error'); }
        else toast(friendlyError(e), 'error');
      } finally { setLoadingProfile(false); }
    });
  }, []);
  useEffect(() => { const start = () => { audio.init(); if (route.value.name !== 'match') audio.playMusic('menu'); }; addEventListener('pointerdown', start, { once: true }); addEventListener('keydown', start, { once: true }); }, []);

  const r = route.value; const u = user.value; const p = profile.value;
  if (u === undefined) return <div class="loading-screen"><Background /><div class="spinner" /><span>Lighting the lanterns…</span></div>;
  if (r.name === 'match') return <Match key={`${r.mode}-${r.botId ?? r.matchId ?? ''}`} />;
  const needsAuth = !['title', 'auth', 'about'].includes(r.name);
  let screen: preact.JSX.Element;
  if (needsAuth && !u) screen = <Auth />;
  else if (needsAuth && u && !p) screen = loadingProfile ? <div class="loading-screen"><div class="spinner" /><span>Reading the ledgers…</span></div> : <Onboard />;
  else switch (r.name) {
    case 'title': screen = <Title />; break;
    case 'auth': screen = <Auth />; break;
    case 'onboard': screen = p ? <Home /> : <Onboard />; break;
    case 'home': screen = <Home />; break;
    case 'campaign': screen = <Campaign />; break;
    case 'collection': screen = <Collection />; break;
    case 'decks': screen = <Decks />; break;
    case 'packs': screen = <Packs />; break;
    case 'profile': screen = <ProfileScreen />; break;
    case 'settings': screen = <SettingsScreen />; break;
    case 'online': screen = <Online />; break;
    case 'about': screen = <About />; break;
    default: screen = <Title />;
  }
  const mood = p?.alignment === 'umbral' ? 'umbral' : p?.alignment === 'dawn' ? 'dawn' : 'menu';
  return <><Background mood={mood} /><Toasts />{screen}<span class="version" aria-hidden="true">Vesperfall · v{__APP_VERSION__}</span></>;
}
