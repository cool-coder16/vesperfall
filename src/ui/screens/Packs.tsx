import { useState } from 'preact/hooks';
import { profile, setProfile, toast } from '../../state/store';
import { TopBar } from '../Chrome';
import { CardView } from '../Card';
import { buyPack, openPack, ECONOMY } from '../../firebase/profile';
import { friendlyError } from '../../firebase/app';
import { getCard } from '../../engine/cards';
import { sfx } from '../../audio/synth';

export function Packs() {
  const p = profile.value!;
  const [stage, setStage] = useState<'idle' | 'opening' | 'revealed'>('idle');
  const [cards, setCards] = useState<{ id: string; isNew: boolean }[]>([]);
  const open = async () => {
    if (p.packs <= 0) return;
    sfx('pack'); setStage('opening');
    try {
      const before = p.collection;
      const res = await openPack(p);
      setTimeout(() => {
        setProfile(res.profile);
        setCards(res.cards.map((id) => ({ id, isNew: !before[id] })));
        setStage('revealed');
        res.cards.forEach((id, i) => setTimeout(() => sfx(getCard(id).rarity === 'legendary' || getCard(id).rarity === 'epic' ? 'levelup' : 'reveal'), 300 + i * 220));
      }, 900);
    } catch (e) { toast(friendlyError(e), 'error'); setStage('idle'); }
  };
  const buy = async () => { try { setProfile(await buyPack(p)); sfx('coin'); } catch (e) { toast(friendlyError(e), 'error'); } };
  return (
    <main class="screen narrow">
      <TopBar title="Reliquary" />
      <div class="pack-stage">
        {stage !== 'revealed' && (
          <>
            <h2>The Reliquary</h2>
            <p class="muted center">Five cards per reliquary, at least one rare or better. Your alignment nudges what you find.<br />Duplicates feed card levels.</p>
            <button class={`pack-box ${stage === 'opening' ? 'opening' : ''}`} onClick={open} disabled={p.packs <= 0 || stage === 'opening'} aria-label={`Open a reliquary (${p.packs} left)`}>
              <svg viewBox="0 0 100 130" aria-hidden="true"><defs><linearGradient id="pk" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffe39a" /><stop offset="1" stop-color="#8a5f1c" /></linearGradient></defs><rect x="14" y="20" width="72" height="90" rx="6" fill="none" stroke="url(#pk)" stroke-width="3" /><path d="M50 30 L60 55 L85 62 L60 69 L50 94 L40 69 L15 62 L40 55 Z" fill="url(#pk)" opacity="0.9" /><circle cx="50" cy="62" r="7" fill="#0b0912" /></svg>
            </button>
            <p class="gold">{p.packs} unopened</p>
            <div class="btn-row"><button class="btn primary" onClick={open} disabled={p.packs <= 0 || stage === 'opening'}>Open reliquary</button><button class="btn" onClick={buy} disabled={p.cinders < ECONOMY.packPrice}>Buy one ({ECONOMY.packPrice} <i class="cinder-icon" />)</button></div>
          </>
        )}
        {stage === 'revealed' && (
          <>
            <h2>The seal breaks</h2>
            <div class="pack-cards">
              {cards.map((c, i) => <div key={i} style={{ position: 'relative', animationDelay: `${i * 0.2}s` }} class="pack-card-wrap">{c.isNew && <span class="new-tag">NEW</span>}<CardView cardId={c.id} level={p.collection[c.id]?.level ?? 1} className="" /></div>)}
            </div>
            <div class="btn-row"><button class="btn primary" onClick={open} disabled={p.packs <= 0}>Open another ({p.packs})</button><button class="btn" onClick={() => setStage('idle')}>Done</button></div>
          </>
        )}
      </div>
    </main>
  );
}
