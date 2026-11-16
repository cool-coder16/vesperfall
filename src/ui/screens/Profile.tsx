import { useEffect, useState } from 'preact/hooks';
import { navigate, profile, setProfile, toast, updateProfile, user } from '../../state/store';
import { TopBar, Portrait } from '../Chrome';
import { deleteProfile, loadHistory, type MatchRecord, type Alignment } from '../../firebase/profile';
import { deleteAccount, resendVerification, logOut } from '../../firebase/auth';
import { friendlyError } from '../../firebase/app';
import { AVATARS } from '../../art/cardArt';
import { sfx } from '../../audio/synth';

const TITLES: Record<string, string> = { title_sunbearer: 'Sunbearer' };

export function ProfileScreen() {
  const p = profile.value!; const u = user.value!;
  const [history, setHistory] = useState<(MatchRecord & { id: string })[] | null>(null);
  const [pw, setPw] = useState(''); const [confirmDel, setConfirmDel] = useState(false); const [busy, setBusy] = useState(false);
  useEffect(() => { loadHistory(p.uid).then(setHistory).catch(() => setHistory([])); }, [p.uid]);
  const total = p.wins + p.losses + p.draws;
  const del = async () => {
    setBusy(true);
    try { await deleteProfile(p.uid, p.usernameLower); await deleteAccount(pw || undefined); try { localStorage.removeItem(`vf-profile-${p.uid}`); } catch {} setProfile(null); toast('Your account and data were deleted.'); navigate({ name: 'title' }); }
    catch (e) { toast(friendlyError(e), 'error'); } finally { setBusy(false); }
  };
  return (
    <main class="screen narrow">
      <TopBar title="Profile" />
      <div class="panel">
        <div class="row"><Portrait avatar={p.avatar} /><div><h2>{p.username}</h2><p class="muted" style="margin:0">{p.alignment === 'dawn' ? 'Sworn to the Dawnvigil' : p.alignment === 'umbral' ? 'Sworn to the Umbral Court' : 'Unsworn'}{p.titles.map((t) => <span key={t} class="gold"> · {TITLES[t] ?? t}</span>)}</p><p class="hint" style="margin:0">{u.email}{u.providerData.some((x) => x.providerId === 'password') && !u.emailVerified && <> · <span class="error">unverified</span> <button class="btn small ghost" onClick={async () => { try { await resendVerification(); toast('Verification email sent.'); } catch (e) { toast(friendlyError(e), 'error'); } }}>Resend</button></>}</p></div></div>
        <div class="stat-grid mt">
          <div><b>{p.rating}</b><span>Rating</span></div><div><b>{p.wins}–{p.losses}{p.draws ? `–${p.draws}` : ''}</b><span>Online</span></div><div><b>{total ? Math.round((p.wins / total) * 100) : 0}%</b><span>Win rate</span></div>
          <div><b>{p.botWins}</b><span>Bot wins</span></div><div><b>{Object.keys(p.campaign.beaten).length}/12</b><span>Chapters</span></div><div><b>{p.bestStreak}</b><span>Best streak</span></div>
          <div><b>{Object.keys(p.collection).length}</b><span>Cards</span></div><div><b>{Object.values(p.collection).filter((c) => c.level >= 7).length}</b><span>Ascendant</span></div><div><b>{p.packsOpened}</b><span>Reliquaries</span></div>
        </div>
      </div>
      <div class="panel">
        <h3 class="mb">Sigil</h3>
        <div class="avatar-grid">{AVATARS.map((a) => <button key={a.id} class={`portrait ${a.faction} ${p.avatar === a.id ? 'on' : ''}`} aria-label={a.name} aria-pressed={p.avatar === a.id} style="padding:0;border-width:3px" onClick={() => { updateProfile({ avatar: a.id }); sfx('click'); }}><Portrait avatar={a.id} /></button>)}</div>
        <h3 class="mt mb">Alignment</h3>
        <div class="btn-row">{(['dawn', 'umbral', 'unsworn'] as Alignment[]).map((a) => <button key={a} class={`btn small ${a === 'umbral' ? 'umbral' : ''} ${p.alignment === a ? 'primary' : ''}`} onClick={() => updateProfile({ alignment: a })}>{a}</button>)}</div>
        <p class="hint">Alignment shapes your hall, your reliquaries and your oath in Unsworn-less decks. Change it any time.</p>
      </div>
      <div class="panel">
        <h3 class="mb">Match history</h3>
        {history === null ? <div class="spinner" /> : history.length === 0 ? <p class="muted">No matches yet.</p> : (
          <div class="history">{history.map((h) => <div key={h.id} class="history-row"><span class={`res ${h.result}`}>{h.result.toUpperCase()}</span><span>{h.mode === 'bot' ? '🤖 ' : '⚔ '}{h.opponent} · {h.deck} · {h.turns} turns{h.reason ? ` · ${h.reason}` : ''}{h.disputed ? ' · disputed' : ''}</span><span class="muted small">{h.ratingDelta ? (h.ratingDelta > 0 ? `+${h.ratingDelta}` : h.ratingDelta) : ''}</span></div>)}</div>
        )}
      </div>
      <div class="panel">
        <h3 class="mb">Account</h3>
        <div class="btn-row"><button class="btn" onClick={async () => { await logOut(); navigate({ name: 'title' }); }}>Sign out</button><button class="btn danger" onClick={() => setConfirmDel(true)}>Delete account</button></div>
        {confirmDel && (
          <div class="mt">
            <p class="error">This permanently deletes your profile, collection, decks and match history. It cannot be undone.</p>
            {u.providerData.some((x) => x.providerId === 'password') && <div class="field"><label for="dpw">Confirm your password</label><input id="dpw" type="password" value={pw} onInput={(e) => setPw((e.target as HTMLInputElement).value)} /></div>}
            <div class="btn-row"><button class="btn danger" disabled={busy} onClick={del}>Yes, delete everything</button><button class="btn ghost" onClick={() => setConfirmDel(false)}>Cancel</button></div>
          </div>
        )}
      </div>
    </main>
  );
}
