import { useMemo, useState } from 'preact/hooks';
import { profile, setProfile, toast } from '../../state/store';
import { TopBar } from '../Chrome';
import { CardView } from '../Card';
import { COLLECTIBLE_CARDS, getCard } from '../../engine/cards';
import { canUpgrade, upgradeCard, dustCard, ECONOMY } from '../../firebase/profile';
import { friendlyError } from '../../firebase/app';
import { LEVEL_NAMES } from '../../engine/levels';
import { sfx } from '../../audio/synth';
import type { Faction, Rarity, CardType } from '../../engine/types';

export interface Filters { q: string; faction: Faction | 'all'; rarity: Rarity | 'all'; type: CardType | 'all'; owned: 'all' | 'owned' | 'missing'; cost: number | 'all'; sort: 'cost' | 'name' | 'rarity' | 'level' }
export const DEFAULT_FILTERS: Filters = { q: '', faction: 'all', rarity: 'all', type: 'all', owned: 'all', cost: 'all', sort: 'cost' };
const RARITY_ORDER: Record<Rarity, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export function applyFilters(f: Filters, collection: Record<string, { count: number; level: number }>, restrictFaction?: Faction) {
  const q = f.q.trim().toLowerCase();
  return COLLECTIBLE_CARDS.filter((c) => {
    if (restrictFaction && c.faction !== 'neutral' && c.faction !== restrictFaction) return false;
    if (f.faction !== 'all' && c.faction !== f.faction) return false;
    if (f.rarity !== 'all' && c.rarity !== f.rarity) return false;
    if (f.type !== 'all' && c.type !== f.type) return false;
    if (f.cost !== 'all' && (f.cost === 7 ? c.cost < 7 : c.cost !== f.cost)) return false;
    const owned = !!collection[c.id];
    if (f.owned === 'owned' && !owned) return false;
    if (f.owned === 'missing' && owned) return false;
    if (q && !(c.name.toLowerCase().includes(q) || c.text.toLowerCase().includes(q) || (c.tribe ?? '').toLowerCase().includes(q) || (c.keywords ?? []).some((k) => k.includes(q)))) return false;
    return true;
  }).sort((a, b) => {
    if (f.sort === 'name') return a.name.localeCompare(b.name);
    if (f.sort === 'rarity') return RARITY_ORDER[b.rarity] - RARITY_ORDER[a.rarity] || a.cost - b.cost;
    if (f.sort === 'level') return (collection[b.id]?.level ?? 0) - (collection[a.id]?.level ?? 0) || a.cost - b.cost;
    return a.cost - b.cost || a.name.localeCompare(b.name);
  });
}

export function FilterBar({ f, set, showOwned = true }: { f: Filters; set: (f: Filters) => void; showOwned?: boolean }) {
  const chip = (on: boolean, label: string, fn: () => void) => <button type="button" class={`chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={() => { sfx('click'); fn(); }}>{label}</button>;
  return (
    <div class="filters" role="group" aria-label="Filters">
      <input type="search" placeholder="Search name, text, keyword…" value={f.q} onInput={(e) => set({ ...f, q: (e.target as HTMLInputElement).value })} aria-label="Search cards" />
      {(['all', 'dawn', 'umbral', 'neutral'] as const).map((x) => chip(f.faction === x, x === 'all' ? 'All' : x, () => set({ ...f, faction: x })))}
      {(['creature', 'spell', 'relic'] as const).map((x) => chip(f.type === x, x, () => set({ ...f, type: f.type === x ? 'all' : x })))}
      {(['common', 'rare', 'epic', 'legendary'] as const).map((x) => chip(f.rarity === x, x, () => set({ ...f, rarity: f.rarity === x ? 'all' : x })))}
      {[1, 2, 3, 4, 5, 6, 7].map((c) => chip(f.cost === c, c === 7 ? '7+' : String(c), () => set({ ...f, cost: f.cost === c ? 'all' : c })))}
      {showOwned && (['owned', 'missing'] as const).map((x) => chip(f.owned === x, x, () => set({ ...f, owned: f.owned === x ? 'all' : x })))}
      <select value={f.sort} onChange={(e) => set({ ...f, sort: (e.target as HTMLSelectElement).value as any })} aria-label="Sort"><option value="cost">Sort: cost</option><option value="name">Sort: name</option><option value="rarity">Sort: rarity</option><option value="level">Sort: level</option></select>
    </div>
  );
}

export function Collection() {
  const p = profile.value!;
  const [f, setF] = useState<Filters>(DEFAULT_FILTERS);
  const [sel, setSel] = useState<string | null>(null);
  const cards = useMemo(() => applyFilters(f, p.collection), [f, p.collection]);
  const ownedCount = COLLECTIBLE_CARDS.filter((c) => p.collection[c.id]).length;
  const doUpgrade = async (id: string) => { try { setProfile(await upgradeCard(p, id)); sfx('levelup'); toast(`${getCard(id).name} reached level ${p.collection[id].level + 1}: ${LEVEL_NAMES[p.collection[id].level + 1]}`, 'reward'); } catch (e) { toast(friendlyError(e), 'error'); } };
  const doDust = async (id: string) => { try { setProfile(await dustCard(p, id)); sfx('coin'); toast(`+${ECONOMY.dustValue[getCard(id).rarity]} cinders`, 'reward'); } catch (e) { toast(friendlyError(e), 'error'); } };
  return (
    <main class="screen wide">
      <TopBar title="Collection" />
      <div class="row spread mb"><h2>Collection</h2><span class="muted">{ownedCount} / {COLLECTIBLE_CARDS.length} cards discovered</span></div>
      <FilterBar f={f} set={setF} />
      <div class="card-grid">
        {cards.map((c) => { const e = p.collection[c.id]; return <CardView key={c.id} cardId={c.id} level={e?.level ?? 1} count={e?.count} dimmed={!e} onClick={() => { sfx('click'); setSel(c.id); }} tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); setSel(c.id); } }} />; })}
      </div>
      {cards.length === 0 && <p class="center muted mt">No cards match those filters.</p>}
      {sel && <CardDetail cardId={sel} onClose={() => setSel(null)} onUpgrade={doUpgrade} onDust={doDust} />}
    </main>
  );
}

export function CardDetail({ cardId, onClose, onUpgrade, onDust }: { cardId: string; onClose: () => void; onUpgrade?: (id: string) => void; onDust?: (id: string) => void }) {
  const p = profile.value;
  const def = getCard(cardId);
  const e = p?.collection[cardId];
  const up = p ? canUpgrade(p, cardId) : { ok: false };
  return (
    <div class="card-detail" role="dialog" aria-modal="true" aria-label={def.name} onClick={onClose} onKeyDown={(ev) => { if (ev.key === 'Escape') onClose(); }}>
      <div class="inner" onClick={(ev) => ev.stopPropagation()}>
        <CardView cardId={cardId} level={e?.level ?? 1} size="l" />
        <div class="info">
          <h2>{def.name}</h2>
          <p class="muted">{def.rarity} · {def.type}{def.tribe ? ` · ${def.tribe}` : ''} · {def.faction === 'dawn' ? 'Dawnvigil' : def.faction === 'umbral' ? 'Umbral Court' : 'Unaligned'}</p>
          <p class="lore">{def.flavor}</p>
          {e ? <p>Owned ×{e.count} · Level {e.level} <span class="muted">({LEVEL_NAMES[e.level]})</span></p> : <p class="muted">Not yet found. Open reliquaries to discover it.</p>}
          {e && onUpgrade && (up.cost ? <p class="small">Next level: {up.cost.cards} spare copies + {up.cost.cinders} cinders{!up.ok && <span class="error"> — {up.reason}</span>}</p> : <p class="small gold">Ascendant: maximum level.</p>)}
          <div class="btn-row">
            {e && onUpgrade && up.ok && <button class="btn primary" onClick={() => onUpgrade(cardId)}>Level up</button>}
            {e && onDust && e.count > 1 && <button class="btn ghost" onClick={() => onDust(cardId)}>Dust one (+{ECONOMY.dustValue[def.rarity]})</button>}
            <button class="btn" onClick={onClose} autoFocus>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
