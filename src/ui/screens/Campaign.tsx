import { useState } from 'preact/hooks';
import { navigate, profile } from '../../state/store';
import { TopBar, BotPortrait } from '../Chrome';
import { BOTS, CHAPTERS, type BotProfile } from '../../ai/bots';
import { sfx } from '../../audio/synth';

export function Campaign() {
  const p = profile.value!;
  const [intro, setIntro] = useState<BotProfile | null>(null);
  const beatenCount = Object.keys(p.campaign.beaten).length;
  const unlockedLevel = Math.max(1, ...BOTS.filter((b) => p.campaign.beaten[b.id]).map((b) => b.level + 1));
  return (
    <main class="screen narrow">
      <TopBar title="The Long Dusk" />
      <h2 class="mb">The Long Dusk</h2>
      <p class="muted mb">Twelve chapters from the last holdfast of the Vigil to the place where the sun used to be. Each opponent plays differently and each one plays better than the last. Rewards are granted once per chapter; replays pay a smaller purse.</p>
      <p class="hint mb">{beatenCount}/12 chapters cleared.</p>
      <div class="ladder">
        {BOTS.map((b) => {
          const ch = CHAPTERS.find((c) => c.bot === b.id)!;
          const beaten = !!p.campaign.beaten[b.id];
          const locked = b.level > unlockedLevel;
          const current = !beaten && !locked;
          return (
            <div key={b.id} class={`ladder-node ${beaten ? 'beaten' : ''} ${locked ? 'locked' : ''} ${current ? 'current' : ''}`}>
              <BotPortrait motif={b.portrait.motif} seed={b.portrait.seed} faction={b.faction} />
              <div>
                <div class="lvl">Chapter {ch.chapter} · {ch.place} · Difficulty {b.level}/12 · {b.faction === 'dawn' ? 'Dawnvigil' : b.faction === 'umbral' ? 'Umbral Court' : 'Unaligned'}</div>
                <h3>{b.name}, {b.title}</h3>
                <p class="story">{ch.story}</p>
                <div class="rewards"><span>{b.playstyle}</span></div>
                <div class="rewards mt"><span><i class="cinder-icon" /> {b.reward.cinders}</span><span><i class="pack-icon" /> ×{b.reward.packs}</span>{b.reward.unlock && <span class="gold">+ title</span>}{beaten && <span class="muted">(claimed · replay {40})</span>}</div>
              </div>
              <div class="actions"><button class="btn primary" disabled={locked} onClick={() => { sfx('click'); setIntro(b); }}>{beaten ? 'Replay' : locked ? 'Locked' : 'Challenge'}</button></div>
              {beaten && <span class="check">✓ CLEARED {p.campaign.beaten[b.id] > 1 ? `×${p.campaign.beaten[b.id]}` : ''}</span>}
            </div>
          );
        })}
      </div>
      {intro && (
        <div class="bot-intro" role="dialog" aria-modal="true" aria-label={`Challenge ${intro.name}`}>
          <div class="panel">
            <BotPortrait motif={intro.portrait.motif} seed={intro.portrait.seed} faction={intro.faction} />
            <h2>{intro.name}</h2>
            <p class="gold">{intro.title}</p>
            <p class="lore">{intro.lore}</p>
            <p><b>Personality:</b> {intro.personality}</p>
            <p><b>Deck:</b> {intro.deck.name} · cards at level {intro.cardLevel}</p>
            <p class="muted">"{intro.lines.intro}"</p>
            <div class="btn-row" style="justify-content:center">
              <button class="btn primary big" onClick={() => navigate({ name: 'match', mode: 'bot', botId: intro.id })}>Begin</button>
              <button class="btn ghost" onClick={() => setIntro(null)}>Not yet</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
