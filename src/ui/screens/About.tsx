import { navigate, user } from '../../state/store';
import { TopBar } from '../Chrome';
import { KEYWORD_HELP } from '../../engine/cards';
import { FACTION_THEME } from '../../art/palette';

export function About() {
  return (
    <main class="screen narrow">
      {user.value ? <TopBar title="Codex" /> : <p><a href="#/" onClick={(e) => { e.preventDefault(); navigate({ name: 'title' }); }}>← Title</a></p>}
      <div class="panel">
        <h2 class="mb">How to play</h2>
        <ul class="rules-list">
          <li>Each player starts with 30 health and a 30-card deck. You lose when your health reaches 0.</li>
          <li><b>Essence</b> is your resource. You start with 1 crystal and gain one more each turn, up to 10. It refills every turn.</li>
          <li>On your turn: play creatures, spells and relics from your hand, then choose attackers. Creatures can't attack the turn they arrive unless they are <b>Swift</b>.</li>
          <li>The defender then assigns <b>blockers</b>. Blocked attackers fight the blocker; unblocked ones hit the enemy hero. Attacking exhausts a creature until your next turn, so it can't block (unless it is <b>Steadfast</b>).</li>
          <li>After combat you may play more cards, then end your turn.</li>
          <li>Your <b>Oath</b> is a hero ability usable once per turn for 2 essence: Dawn heals 2, Umbral deals 1 damage, Unsworn draws a card.</li>
          <li>Decks hold exactly 30 cards, at most 2 copies of a card and 1 of each legendary, from one faction plus neutral cards.</li>
        </ul>
        <h3 class="mt">Keywords</h3>
        <ul class="rules-list">{Object.entries(KEYWORD_HELP).map(([k, v]) => <li key={k}><b style="text-transform:capitalize">{k}</b>: {v}</li>)}</ul>
        <h3 class="mt">Card levels</h3>
        <p>Every card has seven levels. Each level adds about 10% to attack and health; spell and effect amounts marked with scaling grow at levels 4 and 7. Level 7 (Ascendant) adds an extra +1 and an animated foil frame. Level up a card by spending duplicate copies and cinders in your collection.</p>
      </div>
      <div class="panel">
        <h2 class="mb">The world of Aurenne</h2>
        <p class="lore">There was a sun. Then there was the Hollow. At the Vesperfall the sky was eaten in a single evening, and the realm of Aurenne has lived in dusk ever since.</p>
        <h3 class="mt" style={{ color: FACTION_THEME.dawn.primary }}>The Dawnvigil</h3>
        <p>Knights, clerics and wardens who keep the emberhearths, the last fires that remember daylight. They fight with <b>Ward</b>, <b>Radiant</b> healing and <b>Rally</b> effects that make every ally arriving stronger. Slow, resilient, and very hard to put down.</p>
        <h3 class="mt" style={{ color: FACTION_THEME.umbral.primary }}>The Umbral Court</h3>
        <p>Nobles who bargained with the Hollow and were rewarded with eternity and appetite. They <b>Wither</b> enemies permanently, <b>sacrifice</b> their own for power, and leave <b>Hollow</b> husks behind when they fall. Aggressive, grinding, and never truly out of creatures.</p>
        <h3 class="mt" style={{ color: FACTION_THEME.neutral.primary }}>The Unaligned</h3>
        <p>Mercenaries, witches and beasts that fight for either side. Neutral cards fit any deck.</p>
      </div>
      <div class="panel">
        <h2 class="mb">Credits</h2>
        <p>Vesperfall is an original work. World, factions, cards, art and music were created for this game. All illustrations are procedurally generated SVG; all sound is synthesized with the Web Audio API. No external images or audio are used.</p>
      </div>
    </main>
  );
}
