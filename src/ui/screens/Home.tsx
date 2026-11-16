import { useMemo } from 'preact/hooks';
import { navigate, profile, toast, setProfile } from '../../state/store';
import { TopBar } from '../Chrome';
import { BOTS, CHAPTERS } from '../../ai/bots';
import { claimDaily, dailyAvailable, ECONOMY } from '../../firebase/profile';
import { friendlyError } from '../../firebase/app';
import { cardArtSVG } from '../../art/cardArt';
import { sfx } from '../../audio/synth';

function TileArt({ motif, seed, faction }: { motif: string; seed: number; faction: 'dawn' | 'umbral' | 'neutral' }) {
  const svg = useMemo(() => cardArtSVG({ id: `tile-${motif}-${seed}`, faction, art: { motif, seed }, type: 'creature' }), [motif, seed]);
  return <div class="tile-art" dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Home() {
  const p = profile.value!;
  const nextBot = BOTS.find((b) => !p.campaign.beaten[b.id]) ?? BOTS[BOTS.length - 1];
  const chapter = CHAPTERS.find((c) => c.bot === nextBot.id)!;
  const daily = dailyAvailable(p);
  const claim = async () => {
    try { const np = await claimDaily(p); setProfile(np); sfx('coin'); toast(`Vigil kept: +${ECONOMY.daily.cinders} cinders, +${ECONOMY.daily.packs} reliquary`, 'reward'); }
    catch (e) { toast(friendlyError(e), 'error'); }
  };
  return (
    <main class="screen wide">
      <TopBar />
      <h1 class="mb">Welcome, {p.username}.</h1>
      <p class="muted mb">{p.alignment === 'dawn' ? 'The emberhearths burn a little brighter while you stand watch.' : p.alignment === 'umbral' ? 'The Court has set a place for you. It always does.' : 'Neither banner claims you. Both are watching.'}</p>
      <div class="hub">
        <button class="hub-tile wide" onClick={() => navigate({ name: 'campaign' })}><TileArt motif={nextBot.portrait.motif} seed={nextBot.portrait.seed} faction={nextBot.faction} /><h3>Campaign · Chapter {chapter.chapter}</h3><p>{chapter.place}: {nextBot.name} {nextBot.title}. {p.campaign.bestLevel >= 12 ? 'The Hollow has fallen. Replay any chapter.' : `${Object.keys(p.campaign.beaten).length} of 12 chapters cleared.`}</p></button>
        <button class="hub-tile" onClick={() => navigate({ name: 'online' })}><TileArt motif="banner" seed={5} faction="neutral" /><h3>Online duel</h3><p>Matchmaking or invite a friend. Rating {p.rating}.</p></button>
        <button class="hub-tile" onClick={daily ? claim : () => navigate({ name: 'packs' })}><TileArt motif="lantern" seed={9} faction={p.alignment === 'umbral' ? 'umbral' : 'dawn'} />{daily && <span class="badge">Ready</span>}<h3>Daily vigil</h3><p>{daily ? `Claim ${ECONOMY.daily.cinders} cinders and a reliquary.` : 'Already kept today. Return tomorrow.'}</p></button>
        <button class="hub-tile" onClick={() => navigate({ name: 'decks' })}><TileArt motif="contract" seed={3} faction="neutral" /><h3>Deck forge</h3><p>{p.decks.length} decks · active: {p.decks.find((d) => d.id === p.activeDeck)?.name ?? '—'}</p></button>
        <button class="hub-tile" onClick={() => navigate({ name: 'collection' })}><TileArt motif="tower" seed={7} faction="dawn" /><h3>Collection</h3><p>{Object.keys(p.collection).length} cards found. Level them with duplicates and cinders.</p></button>
        <button class="hub-tile" onClick={() => navigate({ name: 'packs' })}><TileArt motif="chalice" seed={2} faction="umbral" />{p.packs > 0 && <span class="badge">{p.packs}</span>}<h3>Reliquary</h3><p>Open packs, buy more with cinders.</p></button>
        <button class="hub-tile" onClick={() => navigate({ name: 'match', mode: 'tutorial' })}><TileArt motif="candle" seed={4} faction="dawn" /><h3>Tutorial</h3><p>{p.tutorialDone ? 'Replay the guided first match.' : 'Learn the rules in a guided match.'}</p></button>
      </div>
    </main>
  );
}
