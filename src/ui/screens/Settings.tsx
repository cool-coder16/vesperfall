import { settings, updateSettings, navigate } from '../../state/store';
import { TopBar } from '../Chrome';
import { audio, sfx } from '../../audio/synth';

export function SettingsScreen() {
  const s = settings.value;
  return (
    <main class="screen narrow">
      <TopBar title="Settings" />
      <div class="panel">
        <h2 class="mb">Sound</h2>
        <div class="field"><label for="sfx">Effects: {Math.round(s.sfx * 100)}%</label><input id="sfx" type="range" min="0" max="1" step="0.05" value={s.sfx} onInput={(e) => updateSettings({ sfx: +(e.target as HTMLInputElement).value })} onChange={() => { audio.init(); sfx('click'); }} /></div>
        <div class="field"><label for="music">Music: {Math.round(s.music * 100)}%</label><input id="music" type="range" min="0" max="1" step="0.05" value={s.music} onInput={(e) => updateSettings({ music: +(e.target as HTMLInputElement).value })} onChange={() => audio.init()} /></div>
        <p class="hint">All sound is synthesized in your browser. Music starts after your first click (browser policy).</p>
      </div>
      <div class="panel">
        <h2 class="mb">Motion & accessibility</h2>
        <div class="field"><label><input type="checkbox" checked={s.reducedMotion} onChange={(e) => updateSettings({ reducedMotion: (e.target as HTMLInputElement).checked })} /> Reduce motion (disables screen shake, foil shimmer and particle effects)</label></div>
        <div class="field"><label for="anim">Animation speed</label><select id="anim" value={s.animations} onChange={(e) => updateSettings({ animations: (e.target as HTMLSelectElement).value as any })}><option value="full">Cinematic</option><option value="fast">Fast</option><option value="minimal">Minimal</option></select></div>
        <div class="field"><label><input type="checkbox" checked={s.showHints} onChange={(e) => updateSettings({ showHints: (e.target as HTMLInputElement).checked })} /> Show in-match hints</label></div>
        <p class="hint">Keyboard: <span class="kbd">Tab</span> moves between cards and buttons, <span class="kbd">Enter</span> selects, <span class="kbd">E</span> ends your turn, <span class="kbd">A</span> attacks with the selected creatures, <span class="kbd">Esc</span> cancels targeting.</p>
      </div>
      <div class="panel"><button class="btn" onClick={() => navigate({ name: 'about' })}>Rules & lore</button></div>
    </main>
  );
}
