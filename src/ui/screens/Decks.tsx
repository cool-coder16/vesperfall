import { useMemo, useState } from 'preact/hooks';
import { navigate, profile, route, toast, updateProfile } from '../../state/store';
import { TopBar } from '../Chrome';
import { CardView } from '../Card';
import { getCard } from '../../engine/cards';
import { validateDeck, costCurve, deckFactionOf } from '../../engine/deck';
import { RULES } from '../../engine/types';
import { applyFilters, DEFAULT_FILTERS, FilterBar, type Filters, CardDetail } from './Collection';
import type { Deck } from '../../firebase/profile';
import { RARITY_THEME } from '../../art/palette';
import { sfx } from '../../audio/synth';

export function deckToSpec(d: Deck, collection: Record<string, { count: number; level: number }>) {
  return { name: d.name, faction: d.faction, cards: d.cards.map((id) => ({ cardId: id, level: collection[id]?.level ?? 1 })) };
}

export function Decks() {
  const p = profile.value!;
  const r = route.value as { name: 'decks'; deckId?: string };
  if (r.deckId) return <DeckEditor deckId={r.deckId} />;
  const newDeck = (faction: 'dawn' | 'umbral') => {
    const id = 'd' + Date.now().toString(36);
    const d: Deck = { id, name: faction === 'dawn' ? 'New Vigil deck' : 'New Court deck', faction, cards: [] };
    updateProfile({ decks: [...p.decks, d] });
    navigate({ name: 'decks', deckId: id });
  };
  const del = (id: string) => { if (!confirm('Delete this deck?')) return; const decks = p.decks.filter((d) => d.id !== id); updateProfile({ decks, activeDeck: p.activeDeck === id ? decks[0]?.id ?? '' : p.activeDeck }); };
  const copy = (d: Deck) => { const id = 'd' + Date.now().toString(36); updateProfile({ decks: [...p.decks, { ...d, id, name: d.name + ' (copy)' }] }); };
  return (
    <main class="screen wide">
      <TopBar title="Deck forge" />
      <div class="row spread mb"><h2>Your decks</h2><div class="btn-row"><button class="btn" onClick={() => newDeck('dawn')}>+ Dawn deck</button><button class="btn umbral" onClick={() => newDeck('umbral')}>+ Umbral deck</button></div></div>
      <div class="deck-tiles">
        {p.decks.map((d) => {
          const problems = validateDeck(deckToSpec(d, p.collection));
          return (
            <div key={d.id} class={`deck-tile ${p.activeDeck === d.id ? 'active' : ''}`}>
              <div class="row spread"><b><i class={`faction-pip ${d.faction}`} /> {d.name}</b><span class={problems.length ? 'error small' : 'teal small'}>{d.cards.length}/30{problems.length ? ' · invalid' : ' · ready'}</span></div>
              <div class="deck-cards-mini">{d.cards.slice(0, 6).map((id, i) => <CardView key={i} cardId={id} level={p.collection[id]?.level ?? 1} size="xs" showText={false} />)}{d.cards.length > 6 && <span class="muted">+{d.cards.length - 6}</span>}</div>
              <div class="btn-row">
                <button class="btn small primary" onClick={() => navigate({ name: 'decks', deckId: d.id })}>Edit</button>
                <button class="btn small" disabled={p.activeDeck === d.id || problems.length > 0} onClick={() => { updateProfile({ activeDeck: d.id }); sfx('click'); }}>{p.activeDeck === d.id ? 'Active' : 'Make active'}</button>
                <button class="btn small ghost" onClick={() => copy(d)}>Copy</button>
                <button class="btn small danger" onClick={() => del(d.id)} disabled={p.decks.length <= 1}>Delete</button>
              </div>
            </div>
          );
        })}
      </div>
    </main>
  );
}

function DeckEditor({ deckId }: { deckId: string }) {
  const p = profile.value!;
  const deck = p.decks.find((d) => d.id === deckId);
  const [f, setF] = useState<Filters>({ ...DEFAULT_FILTERS, owned: 'owned' });
  const [sel, setSel] = useState<string | null>(null);
  const [name, setName] = useState(deck?.name ?? '');
  if (!deck) { navigate({ name: 'decks' }); return null; }
  const cards = useMemo(() => applyFilters(f, p.collection, deck.faction), [f, p.collection, deck.faction]);
  const spec = deckToSpec({ ...deck, name }, p.collection);
  const problems = validateDeck(spec);
  const counts = deck.cards.reduce<Record<string, number>>((m, id) => ((m[id] = (m[id] ?? 0) + 1), m), {});
  const save = (cardsList: string[], newName = name) => updateProfile({ decks: p.decks.map((d) => (d.id === deckId ? { ...d, cards: cardsList, name: newName, faction: deckFactionOf(cardsList) === 'neutral' ? d.faction : deckFactionOf(cardsList) as any } : d)) });
  const add = (id: string) => {
    const def = getCard(id);
    const max = def.rarity === 'legendary' ? RULES.maxLegendaryCopies : RULES.maxCopies;
    const owned = p.collection[id]?.count ?? 0;
    if (deck.cards.length >= RULES.deckSize) return toast('The deck is full (30 cards).', 'error');
    if ((counts[id] ?? 0) >= max) return toast(`Only ${max} cop${max > 1 ? 'ies' : 'y'} of ${def.name} allowed.`, 'error');
    if ((counts[id] ?? 0) >= owned) return toast(`You own ${owned} cop${owned === 1 ? 'y' : 'ies'} of ${def.name}.`, 'error');
    if (def.faction !== 'neutral' && def.faction !== deck.faction) return toast(`${def.name} belongs to the other faction.`, 'error');
    sfx('draw'); save([...deck.cards, id]);
  };
  const removeOne = (id: string) => { const i = deck.cards.indexOf(id); if (i >= 0) { sfx('click'); save([...deck.cards.slice(0, i), ...deck.cards.slice(i + 1)]); } };
  const autofill = () => {
    const list = deck.cards.slice();
    const pool = applyFilters({ ...DEFAULT_FILTERS, owned: 'owned' }, p.collection, deck.faction).sort((a, b) => a.cost - b.cost);
    let guard = 0;
    while (list.length < RULES.deckSize && guard++ < 500) {
      const curve = costCurve(list);
      const want = [1, 2, 2, 3, 3, 4, 5, 6].map((n, i) => (i === 0 ? 4 : i <= 2 ? 6 : i <= 4 ? 5 : i === 5 ? 4 : i === 6 ? 3 : 2)); // target shape
      let best: string | null = null, bestScore = -Infinity;
      for (const c of pool) {
        const n = list.filter((x) => x === c.id).length;
        const max = c.rarity === 'legendary' ? 1 : 2;
        if (n >= max || n >= (p.collection[c.id]?.count ?? 0)) continue;
        const bucket = Math.min(7, c.cost);
        const score = (want[bucket] ?? 1) - curve[bucket] + Math.random() * 0.5;
        if (score > bestScore) { bestScore = score; best = c.id; }
      }
      if (!best) break; list.push(best);
    }
    save(list); toast('Deck filled with a balanced curve.');
  };
  const curve = costCurve(deck.cards);
  const maxCurve = Math.max(1, ...curve);
  const sorted = Object.keys(counts).sort((a, b) => getCard(a).cost - getCard(b).cost || getCard(a).name.localeCompare(getCard(b).name));
  return (
    <main class="screen wide">
      <TopBar title="Deck forge" />
      <div class="deckbuilder">
        <section>
          <FilterBar f={f} set={setF} showOwned={false} />
          <div class="card-grid">
            {cards.map((c) => { const e = p.collection[c.id]; const inDeck = counts[c.id] ?? 0; return <CardView key={c.id} cardId={c.id} level={e?.level ?? 1} count={e ? e.count - inDeck : undefined} dimmed={!e || inDeck >= Math.min(e.count, c.rarity === 'legendary' ? 1 : 2)} selected={inDeck > 0} onClick={() => add(c.id)} tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); add(c.id); } if (ev.key === 'i') setSel(c.id); }} title="Click to add · press i for details" />; })}
          </div>
        </section>
        <aside class="deck-side panel">
          <div class="field"><label for="dn">Deck name</label><input id="dn" type="text" value={name} maxLength={28} onInput={(e) => setName((e.target as HTMLInputElement).value)} onBlur={() => save(deck.cards, name)} /></div>
          <div class="deck-meta"><span><i class={`faction-pip ${deck.faction}`} /> {deck.faction === 'dawn' ? 'Dawnvigil' : 'Umbral Court'}</span><span class={problems.length ? 'bad' : 'ok'}>{deck.cards.length}/{RULES.deckSize}{problems.length ? '' : ' ✓'}</span></div>
          <div class="curve" aria-label="Cost curve">{curve.map((n, i) => <div key={i}><span class="sr-only">{n} cards costing {i}</span><i style={{ height: `${(n / maxCurve) * 50}px` }} /><span>{i === 7 ? '7+' : i}</span><span>{n || ''}</span></div>)}</div>
          {problems.length > 0 && <ul class="error small" style="padding-left:18px;margin:4px 0">{problems.map((x) => <li key={x.message}>{x.message}</li>)}</ul>}
          <div class="btn-row"><button class="btn small" onClick={autofill} disabled={deck.cards.length >= 30}>Auto-fill</button><button class="btn small ghost" onClick={() => save([])} disabled={!deck.cards.length}>Clear</button><button class="btn small primary" disabled={problems.length > 0} onClick={() => { updateProfile({ activeDeck: deckId }); toast('Deck is now active.'); navigate({ name: 'decks' }); }}>Use deck</button></div>
          <div class="deck-list" role="list" aria-label="Cards in deck">
            {sorted.map((id) => { const d = getCard(id); return <div key={id} role="listitem" class={`deck-row ${d.faction}`} style={{ '--frame': RARITY_THEME[d.rarity].frame } as any} onClick={() => removeOne(id)} title="Click to remove one" tabIndex={0} onKeyDown={(ev) => { if (ev.key === 'Enter' || ev.key === 'Backspace') removeOne(id); }}><span class="cost">{d.cost}</span><span class="name">{d.name}</span><span class="n">L{p.collection[id]?.level ?? 1} ×{counts[id]}</span></div>; })}
            {deck.cards.length === 0 && <p class="hint">Click cards on the left to add them. The deck must contain exactly 30 cards.</p>}
          </div>
        </aside>
      </div>
      {sel && <CardDetail cardId={sel} onClose={() => setSel(null)} />}
    </main>
  );
}
