import { useEffect, useState } from 'preact/hooks';
import { navigate, profile, route, toast } from '../../state/store';
import { TopBar, copyText } from '../Chrome';
import { createInvite, joinInvite, startMatchmaking, cancelInvite, type Me } from '../../firebase/online';
import { friendlyError } from '../../firebase/app';
import { deckToSpec } from './Decks';
import { validateDeck } from '../../engine/deck';
import { fbRtdb } from '../../firebase/app';
import { onValue, ref } from 'firebase/database';
import { sfx } from '../../audio/synth';

export function Online() {
  const p = profile.value!;
  const r = route.value as { name: 'online'; join?: string };
  const [mode, setMode] = useState<'idle' | 'queue' | 'host' | 'join'>('idle');
  const [code, setCode] = useState(r.join ?? ''); const [hosted, setHosted] = useState<{ code: string; matchId: string } | null>(null); const [busy, setBusy] = useState(false);
  const [deckId, setDeckId] = useState(p.activeDeck);
  const deck = p.decks.find((d) => d.id === deckId) ?? p.decks[0];
  const spec = deck ? deckToSpec(deck, p.collection) : null;
  const problems = spec ? validateDeck(spec) : [{ message: 'No deck' }];
  const me: Me = { uid: p.uid, name: p.username, avatar: p.avatar, rating: p.rating };
  const go = (matchId: string) => navigate({ name: 'match', mode: 'online', matchId, deckId: deck.id });

  useEffect(() => {
    if (mode !== 'queue' || !spec) return;
    const stop = startMatchmaking(me, spec, (id) => { sfx('turn'); go(id); }, (e) => { toast(friendlyError(e), 'error'); setMode('idle'); });
    return stop;
  }, [mode]);
  useEffect(() => {
    if (!hosted) return;
    // wait for a guest to join the hosted match
    const unsub = onValue(ref(fbRtdb(), `matches/${hosted.matchId}/p1/ready`), (snap) => { if (snap.val() === true) { sfx('turn'); go(hosted.matchId); } });
    return unsub;
  }, [hosted]);

  const host = async () => { if (!spec) return; setBusy(true); try { const h = await createInvite(me, spec); setHosted(h); setMode('host'); } catch (e) { toast(friendlyError(e), 'error'); } finally { setBusy(false); } };
  const join = async () => { if (!spec) return; setBusy(true); try { const id = await joinInvite(code.trim(), me, spec); go(id); } catch (e) { toast(friendlyError(e), 'error'); } finally { setBusy(false); } };
  const cancelHost = async () => { if (hosted) await cancelInvite(hosted.code, hosted.matchId).catch(() => {}); setHosted(null); setMode('idle'); };

  return (
    <main class="screen narrow">
      <TopBar title="Online" />
      <div class="panel">
        <h2 class="mb">Online duel</h2>
        <div class="field"><label for="deck">Deck</label><select id="deck" value={deckId} onChange={(e) => setDeckId((e.target as HTMLSelectElement).value)} disabled={mode !== 'idle'}>{p.decks.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.cards.length}/30)</option>)}</select>{problems.length > 0 && <p class="error">{problems[0].message} <a href="#/decks" onClick={(e) => { e.preventDefault(); navigate({ name: 'decks', deckId: deck?.id }); }}>Fix in the forge</a></p>}</div>
        {mode === 'idle' && (
          <div class="btn-row">
            <button class="btn primary big" disabled={problems.length > 0} onClick={() => { sfx('click'); setMode('queue'); }}>Find an opponent</button>
            <button class="btn" disabled={problems.length > 0 || busy} onClick={host}>Create invite</button>
            <button class="btn" disabled={problems.length > 0} onClick={() => setMode('join')}>Join with code</button>
          </div>
        )}
        {mode === 'queue' && <div class="center"><div class="spinner" /><p class="mt">Searching for a worthy opponent… Rating {p.rating}.</p><p class="hint">Leave this page open. Matchmaking pairs any two players waiting at the same time.</p><button class="btn ghost" onClick={() => setMode('idle')}>Cancel</button></div>}
        {mode === 'host' && hosted && <div class="center"><p>Share this code. The match starts when your friend joins.</p><div class="code-box" aria-label="Invite code">{hosted.code}</div><div class="btn-row mt" style="justify-content:center"><button class="btn small" onClick={() => copyText(hosted.code)}>Copy code</button><button class="btn small" onClick={() => copyText(`${location.origin}${location.pathname}#/online/${hosted.code}`)}>Copy link</button><button class="btn ghost small" onClick={cancelHost}>Cancel</button></div><div class="spinner mt" /></div>}
        {mode === 'join' && <div><div class="field"><label for="code">Invite code</label><input id="code" type="text" value={code} maxLength={6} style="text-transform:uppercase;letter-spacing:0.3em" onInput={(e) => setCode((e.target as HTMLInputElement).value.toUpperCase())} /></div><div class="btn-row"><button class="btn primary" disabled={code.length < 6 || busy} onClick={join}>Join</button><button class="btn ghost" onClick={() => setMode('idle')}>Back</button></div></div>}
      </div>
      <div class="panel">
        <h3 class="mb">How online play works</h3>
        <p class="small muted">Both players run the same rules engine and verify every move. Each player has {90} seconds per turn; if your opponent leaves for more than 45 seconds on their turn, you win. Matches are verified at the end using a commit-reveal of each player's shuffle secret, so a tampered client is detected and the match is marked disputed instead of counting for rating.</p>
      </div>
    </main>
  );
}
