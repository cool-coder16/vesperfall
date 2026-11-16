import { navigate, user } from '../../state/store';
import { audio, sfx } from '../../audio/synth';
import { firebaseConfigured } from '../../firebase/app';

export function Title() {
  const go = () => { audio.init(); sfx('click'); navigate(user.value ? { name: 'home' } : { name: 'auth', mode: 'login' }); };
  return (
    <main class="screen title-screen">
      <div class="title-sun" aria-hidden="true" />
      <h1 class="title-logo">VESPERFALL</h1>
      <p class="title-sub">The sun was devoured. In the realm of Aurenne, the last keepers of the emberhearths hold the line against a court that sold its soul to the dark. Build your deck. Choose your light.</p>
      <div class="btn-row">
        <button class="btn primary big" onClick={go}>{user.value ? 'Enter the Hall' : 'Begin'}</button>
        <button class="btn big" onClick={() => { audio.init(); navigate({ name: 'match', mode: 'tutorial' }); }}>Learn to play</button>
      </div>
      <p class="hint">A dark-fantasy deck-building card game. Original world, cards and art. Nothing to install.</p>
      {!firebaseConfigured() && <p class="error">Firebase is not configured yet (see src/firebase/config.ts). Bot matches and the tutorial still work.</p>}
      <p class="hint small"><a href="#/about" onClick={(e) => { e.preventDefault(); navigate({ name: 'about' }); }}>How to play · Factions · Credits</a></p>
    </main>
  );
}
