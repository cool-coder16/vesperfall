import { useState } from 'preact/hooks';
import { navigate, setProfile, user } from '../../state/store';
import { createProfile, validUsername, type Alignment } from '../../firebase/profile';
import { friendlyError } from '../../firebase/app';
import { AVATARS } from '../../art/cardArt';
import { Portrait } from '../Chrome';
import { sfx } from '../../audio/synth';

export function Onboard() {
  const [name, setName] = useState(''); const [avatar, setAvatar] = useState(AVATARS[0].id); const [align, setAlign] = useState<Alignment>('dawn'); const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (e: Event) => {
    e.preventDefault();
    const v = validUsername(name); if (v) { setErr(v); return; }
    setBusy(true); setErr('');
    try { const p = await createProfile(user.value!.uid, name, avatar, align); setProfile(p); sfx('levelup'); navigate({ name: 'home' }); }
    catch (ex) { setErr(friendlyError(ex).includes('rules') ? 'That name is already taken.' : friendlyError(ex)); }
    finally { setBusy(false); }
  };
  return (
    <main class="screen narrow">
      <form class="panel" style="margin-top: 4vh" onSubmit={submit}>
        <h2 class="mb">Who walks the dusk?</h2>
        <div class="field"><label for="un">Name</label><input id="un" type="text" required value={name} onInput={(e) => setName((e.target as HTMLInputElement).value)} placeholder="3–16 letters, numbers, _" /></div>
        <div class="field"><label>Sigil</label><div class="avatar-grid" role="radiogroup" aria-label="Avatar">{AVATARS.map((a) => <button type="button" key={a.id} class={`portrait ${a.faction} ${avatar === a.id ? 'on' : ''}`} role="radio" aria-checked={avatar === a.id} aria-label={a.name} onClick={() => { setAvatar(a.id); sfx('click'); }} style="padding:0;border-width:3px"><Portrait avatar={a.id} /></button>)}</div></div>
        <div class="field"><label>Alignment</label>
          <div class="align-pick" role="radiogroup" aria-label="Alignment">
            {([['dawn', 'The Dawnvigil', 'Hold the light. Wards, healing and rallying knights. Your reliquaries lean toward Dawn cards and your hall glows gold.'], ['umbral', 'The Umbral Court', 'Feed the dark. Wither, sacrifice and the restless dead. Your reliquaries lean toward Umbral cards and your hall turns violet.'], ['unsworn', 'Unsworn', 'Serve no banner. Reliquaries draw from every faction equally.']] as [Alignment, string, string][]).map(([id, t, d]) => (
              <button type="button" key={id} class={`align-card ${id} ${align === id ? 'on' : ''}`} role="radio" aria-checked={align === id} onClick={() => { setAlign(id); sfx('click'); }}><h3>{t}</h3><p>{d}</p></button>
            ))}
          </div>
        </div>
        {err && <p class="error" role="alert">{err}</p>}
        <button class="btn primary big" type="submit" disabled={busy}>Enter Aurenne</button>
      </form>
    </main>
  );
}
