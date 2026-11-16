// Prints a win-rate matrix between bot difficulty levels (mirror decks, alternating sides).
// Usage: npm run bots:ladder [games-per-pair]
import { createGame, whoActs } from '../src/engine/engine';
import { botPlayTurn, paramsForLevel } from '../src/ai/bot';
import { starterDeck } from '../src/engine/decks';
import type { PlayerId } from '../src/engine/types';

function rand(seed: number) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }
function play(a: number, b: number, seed: number): PlayerId | 'draw' {
  const decks = seed % 2 ? [starterDeck('umbral'), starterDeck('dawn')] : [starterDeck('dawn'), starterDeck('umbral')];
  let st = createGame({ players: [{ name: 'A', deck: decks[0] }, { name: 'B', deck: decks[1] }], seed, firstPlayer: ((seed >> 1) & 1) as PlayerId });
  const pa = { ...paramsForLevel(a), rand: rand(seed * 3 + 1) }, pb = { ...paramsForLevel(b), rand: rand(seed * 7 + 2) };
  let g = 0;
  while (st.winner === null && g++ < 400) { const p = whoActs(st); st = botPlayTurn(st, p, p === 0 ? pa : pb); }
  return st.winner ?? 'draw';
}
const games = Number(process.argv[2] ?? 20);
const levels = [1, 3, 6, 9, 12];
console.log('Win rate of ROW level vs COLUMN level over', games, 'games each (mirror starter decks, sides alternate)');
console.log('      ' + levels.map((l) => String(l).padStart(6)).join(''));
for (const a of levels) {
  let row = String(a).padStart(4) + ': ';
  for (const b of levels) {
    let wins = 0, losses = 0;
    for (let g = 0; g < games; g++) {
      const flip = g % 2 === 1;
      const w = flip ? play(b, a, 500 + g) : play(a, b, 500 + g);
      const aWon = flip ? w === 1 : w === 0, bWon = flip ? w === 0 : w === 1;
      if (aWon) wins++; else if (bWon) losses++;
    }
    row += `${Math.round((100 * wins) / Math.max(1, wins + losses))}%`.padStart(6);
  }
  console.log(row);
}
