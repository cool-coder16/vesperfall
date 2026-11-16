import type { DeckSpec } from '../engine/types';
import { deckFrom } from '../engine/decks';

export interface BotProfile {
  id: string;
  level: number;          // 1..12 difficulty
  name: string;
  title: string;
  faction: 'dawn' | 'umbral' | 'neutral';
  personality: string;    // shown in the campaign and used for bot chat lines
  playstyle: string;
  lore: string;
  portrait: { motif: string; seed: number };
  cardLevel: number;      // level of the cards in the bot's deck
  reward: { cinders: number; packs: number; unlock?: string };
  lines: { intro: string; win: string; lose: string; taunt: string };
  deck: DeckSpec;
}

export const BOTS: BotProfile[] = [
  {
    id: 'pip', level: 1, name: 'Pip', title: 'the Candle-Boy', faction: 'dawn', cardLevel: 1,
    personality: 'Eager, clumsy, and absolutely certain he will be a knight one day.',
    playstyle: 'Plays whatever he draws and charges in with everything.',
    lore: 'Pip carries candles for the Emberhearth Vigil. He has never held a sword, but he has a deck of cards he found in a dead knight\'s satchel and a great deal of enthusiasm.',
    portrait: { motif: 'knight', seed: 901 }, reward: { cinders: 150, packs: 1 },
    lines: { intro: 'I\'ve been practising! Mostly against the cat.', win: 'I won? I WON! Wait until the Sergeant hears!', lose: 'That\'s fine. That\'s fine. The cat beats me too.', taunt: 'Is that... is that a good card? It looks like a good card.' },
    deck: deckFrom('Pip\'s Satchel', 'dawn', [['d_acolyte', 2], ['d_squire', 2], ['d_initiate', 2], ['d_footman', 2], ['d_torch', 2], ['d_hawk', 2], ['d_pilgrim', 2], ['d_knight', 2], ['d_guard', 2], ['d_candle', 2], ['d_lance', 2], ['n_sellsword', 2], ['n_moth', 2], ['n_bear', 2], ['d_chaplain', 2]]),
  },
  {
    id: 'maudrey', level: 2, name: 'Old Maudrey', title: 'the Hedge Witch', faction: 'neutral', cardLevel: 1,
    personality: 'Cackling, forgetful, and fond of explosions.',
    playstyle: 'Throws spells at whatever is nearest and summons odd beasts from the fen.',
    lore: 'Maudrey sells curses to the Vigil and blessings to the Court, and charges both twice. She plays cards the way she brews: with no recipe and great confidence.',
    portrait: { motif: 'witch', seed: 902 }, reward: { cinders: 200, packs: 1 },
    lines: { intro: 'Sit, sit. Mind the toad. Now, where did I put my deck...', win: 'Ha! The toad said you\'d lose. The toad is never wrong.', lose: 'Bah. The toad lied. Again.', taunt: 'That one goes boom. I think. Let\'s see.' },
    deck: deckFrom('Fen Brew', 'neutral', [['n_sellsword', 2], ['n_moth', 2], ['n_pikeman', 2], ['n_witch', 2], ['n_crow', 2], ['n_bomb', 2], ['n_gale', 2], ['n_oracle', 2], ['n_golem', 2], ['n_bear', 2], ['n_ashfall', 1], ['n_troll', 2], ['n_hunter', 2], ['n_shrine', 2], ['n_cartographer', 2], ['n_elixir', 1]]),
  },
  {
    id: 'halvard', level: 3, name: 'Sergeant Halvard', title: 'of the Gate Watch', faction: 'dawn', cardLevel: 1,
    personality: 'Gruff, loud, and allergic to retreat.',
    playstyle: 'Aggressive knights. Always attacks, rarely blocks.',
    lore: 'Halvard has held the Emberhearth gate for eleven years. He believes the best defence is a cavalry charge and has the scars to prove he is only occasionally right.',
    portrait: { motif: 'captain', seed: 903 }, reward: { cinders: 250, packs: 1 },
    lines: { intro: 'No speeches. Draw your cards and show me what you\'ve got.', win: 'Hah! Back to the drill yard with you.', lose: 'Good. Good! The Vigil needs people who can beat me.', taunt: 'FORWARD!' },
    deck: deckFrom('Gate Watch Charge', 'dawn', [['d_squire', 2], ['d_torch', 2], ['d_footman', 2], ['d_hawk', 2], ['d_knight', 2], ['d_lance', 2], ['d_vow', 1], ['d_captain', 2], ['d_cavalry', 2], ['d_chaplain', 2], ['d_beacon', 1], ['n_sellsword', 2], ['n_oathbreaker', 2], ['n_pikeman', 2], ['d_arrow', 2], ['d_warden', 2]]),
  },
  {
    id: 'isolde', level: 4, name: 'Lady Isolde', title: 'the Pale Courtier', faction: 'umbral', cardLevel: 1,
    personality: 'Polite, patient, and quietly delighted by your mistakes.',
    playstyle: 'Trades carefully, draws cards from deaths, and wins the long game.',
    lore: 'Isolde was the first of the Court to learn that the Hollow does not want blood. It wants patience. She has a great deal of it.',
    portrait: { motif: 'noble', seed: 904 }, reward: { cinders: 300, packs: 1 },
    lines: { intro: 'Please, take your time. I always do.', win: 'There. Was that not civilised?', lose: 'How refreshing. I shall remember you.', taunt: 'Every card you play tells me a little more.' },
    deck: deckFrom('Pale Patience', 'umbral', [['u_courtier', 2], ['u_touch', 2], ['u_whisper', 2], ['u_tithe', 2], ['u_leech', 2], ['u_assassin', 2], ['u_shackles', 2], ['u_scholar', 2], ['u_siphon', 2], ['u_priest', 2], ['u_unmaking', 2], ['u_wagon', 2], ['u_whisperer', 1], ['n_oracle', 2], ['n_gale', 1], ['u_mother', 2]]),
  },
  {
    id: 'tomasz', level: 5, name: 'Brother Tomasz', title: 'Keeper of the Choir', faction: 'dawn', cardLevel: 2,
    personality: 'Serene, kind, and impossible to kill.',
    playstyle: 'Heals constantly. Every heal makes his choir stronger.',
    lore: 'The Choir sings the hymn that held back the dark on the first night of the Vesperfall. Tomasz has not stopped singing it since. He does not win fast. He simply does not lose.',
    portrait: { motif: 'cleric', seed: 905 }, reward: { cinders: 350, packs: 2 },
    lines: { intro: 'The hymn is long. We have time.', win: 'Rest now. The choir will sing you home.', lose: 'The hymn goes on. Perhaps you will carry it further than I.', taunt: 'Another verse, I think.' },
    deck: deckFrom('Unbroken Hymn', 'dawn', [['d_acolyte', 2], ['d_novice', 2], ['d_candle', 2], ['d_pilgrim', 2], ['d_sister', 2], ['d_mercy', 2], ['d_hymn', 2], ['d_guard', 2], ['d_ground', 1], ['d_herald', 2], ['d_chaplain', 2], ['d_colossus', 2], ['d_verdict', 1], ['d_ilvara', 1], ['n_golem', 2], ['d_shield', 2], ['d_footman', 1]], 2),
  },
  {
    id: 'ratking', level: 6, name: 'The Rat King', title: 'of the Undercroft', faction: 'umbral', cardLevel: 2,
    personality: 'Manic, swarming, and gleefully disposable.',
    playstyle: 'Floods the board with Husks and feeds on their deaths.',
    lore: 'Nobody has seen the Rat King. What they have seen is the tide of husks that pours out of the undercroft when the bells stop, and the thing that laughs behind it.',
    portrait: { motif: 'rat', seed: 906 }, reward: { cinders: 400, packs: 2 },
    lines: { intro: 'More. More! There are always more of us.', win: 'The undercroft grows by one tonight.', lose: 'Fine! FINE! We have more where those came from.', taunt: 'Count them. Go on. You\'ll lose count.' },
    deck: deckFrom('Tide of Husks', 'umbral', [['u_rat', 2], ['u_courtier', 2], ['u_shambler', 2], ['u_mote', 2], ['u_husktithe', 2], ['u_hound', 2], ['u_scholar', 2], ['u_altar', 2], ['u_wagon', 2], ['u_devour', 2], ['u_pact', 1], ['u_choir', 1], ['u_hulk', 2], ['u_mother', 2], ['u_touch', 2], ['n_banner', 1], ['u_tyrant', 1]], 2),
  },
  {
    id: 'veyra', level: 7, name: 'Captain Veyra', title: 'of the Free Companies', faction: 'neutral', cardLevel: 3,
    personality: 'Professional, pragmatic, paid in advance.',
    playstyle: 'Tempo. Efficient trades, bounces, and burn to the face.',
    lore: 'The Free Companies fight for whichever side pays. Veyra has fought for both, against both, and once, memorably, for neither. She does not believe in the war. She believes in winning it.',
    portrait: { motif: 'sellsword', seed: 907 }, reward: { cinders: 450, packs: 2 },
    lines: { intro: 'Coin on the table. Let\'s get this done.', win: 'Pleasure doing business.', lose: 'Noted. Next time, I charge more.', taunt: 'That one\'s not worth my time. This one is.' },
    deck: deckFrom('Company Contract', 'neutral', [['n_sellsword', 2], ['n_moth', 2], ['n_pikeman', 2], ['n_witch', 2], ['n_crow', 2], ['n_bomb', 2], ['n_gale', 2], ['n_hunter', 2], ['n_dancer', 2], ['n_oracle', 2], ['n_oathbreaker', 2], ['n_banner', 1], ['n_ashfall', 2], ['n_steed', 2], ['n_wyrm', 1], ['n_watchtower', 1], ['n_cartographer', 1]], 3),
  },
  {
    id: 'greaves', level: 8, name: 'Mother Greaves', title: 'the Wither-Nurse', faction: 'umbral', cardLevel: 3,
    personality: 'Tender, slow, and utterly rotten.',
    playstyle: 'Wither everything. Nothing you play keeps its stats for long.',
    lore: 'Greaves ran the plague house at Hollowmere before the Vesperfall. She still does. The patients no longer complain, and they never leave.',
    portrait: { motif: 'priest', seed: 908 }, reward: { cinders: 500, packs: 2 },
    lines: { intro: 'There, there. This will only hurt for the rest of your life.', win: 'Shh. It\'s over. It\'s all over.', lose: 'Hm. A clean one. How unusual.', taunt: 'Feeling weaker? That\'s the idea, dear.' },
    deck: deckFrom('Wither-Nurse\'s Rounds', 'umbral', [['u_touch', 2], ['u_whisper', 2], ['u_shackles', 2], ['u_leech', 2], ['u_priest', 2], ['u_shade', 2], ['u_siphon', 2], ['u_whisperer', 2], ['u_reaper', 2], ['u_unmaking', 2], ['u_gloamknight', 2], ['u_swarm', 2], ['u_lantern', 2], ['u_mother', 1], ['u_choir', 1], ['u_tyrant', 1], ['u_bargain', 1]], 3),
  },
  {
    id: 'aurel', level: 9, name: 'Knight-Commander Aurel', title: 'the Dawnsworn', faction: 'dawn', cardLevel: 4,
    personality: 'Noble, exacting, and tired in a way that sleep does not fix.',
    playstyle: 'Disciplined midrange. Every creature arrives stronger than the last.',
    lore: 'Aurel commands what is left of the knightly orders. He has buried more friends than he has living ones, and he fights as though each card is the last knight in Aurenne. Sometimes it is.',
    portrait: { motif: 'captain', seed: 909 }, reward: { cinders: 600, packs: 3 },
    lines: { intro: 'I have no time for games. Prove this is not one.', win: 'Rise. You fought with honour. That is rarer than victory.', lose: 'Then the Vigil has a new blade. Use it well.', taunt: 'Stand with me.' },
    deck: deckFrom('Dawnsworn Order', 'dawn', [['d_squire', 2], ['d_footman', 2], ['d_torch', 2], ['d_lance', 2], ['d_knight', 2], ['d_beacon', 2], ['d_arrow', 2], ['d_captain', 2], ['d_warden', 2], ['d_herald', 1], ['d_cavalry', 2], ['d_colossus', 2], ['d_sunder', 1], ['d_chorus', 1], ['d_verdict', 1], ['d_archon', 1], ['d_vow', 2], ['d_shield', 1]], 4),
  },
  {
    id: 'vaelthorn', level: 10, name: 'Lord Vaelthorn', title: 'the Unsated', faction: 'umbral', cardLevel: 4,
    personality: 'Charming, ancient, and never, ever full.',
    playstyle: 'Control. Removes your threats, steals your best creature, and finishes with legends.',
    lore: 'Vaelthorn was the first to kneel to the Hollow, and the Hollow has rewarded him with every appetite and no satisfaction. He takes what he likes. He has liked a great many things.',
    portrait: { motif: 'vampire', seed: 910 }, reward: { cinders: 750, packs: 3 },
    lines: { intro: 'Ah. A guest. Do come in; I insist.', win: 'Delicious. Do visit again.', lose: 'Impossible. ...No. Merely rare. I shall savour it.', taunt: 'That one? I believe I\'ll have that one.' },
    deck: deckFrom('The Unsated Court', 'umbral', [['u_courtier', 2], ['u_touch', 2], ['u_whisper', 2], ['u_tithe', 2], ['u_assassin', 2], ['u_shackles', 1], ['u_siphon', 2], ['u_unmaking', 2], ['u_gravecaller', 2], ['u_whisperer', 2], ['u_reaper', 2], ['u_pact', 2], ['u_swarm', 1], ['u_vaelthorn', 1], ['u_mother', 2], ['u_tyrant', 1], ['u_hollowking', 1], ['u_wagon', 1]], 4),
  },
  {
    id: 'ilvara', level: 11, name: 'Saint Ilvara', title: 'the Unburnt', faction: 'dawn', cardLevel: 5,
    personality: 'Gentle, radiant, and terrifyingly calm.',
    playstyle: 'Perfect value. Heals, draws, and overwhelms with light.',
    lore: 'They tied her to the pyre on the night the sun died. In the morning the pyre was ash and she was not. She has walked ahead of the Vigil ever since, and the dark parts for her like water.',
    portrait: { motif: 'saint', seed: 911 }, reward: { cinders: 900, packs: 4 },
    lines: { intro: 'You have come a long way in the dark. Let us see what you carried.', win: 'Not yet. But soon. I can see it in you.', lose: 'Then the light has a new bearer. Go. The Hollow waits.', taunt: 'Light does not argue. It simply arrives.' },
    deck: deckFrom('Unburnt Procession', 'dawn', [['d_acolyte', 2], ['d_reckoning', 2], ['d_novice', 2], ['d_lance', 2], ['d_sister', 2], ['d_mercy', 2], ['d_hymn', 2], ['d_arrow', 1], ['d_captain', 2], ['d_herald', 2], ['d_ground', 1], ['d_colossus', 2], ['d_chorus', 2], ['d_sunder', 1], ['d_ilvara', 1], ['d_verdict', 1], ['d_archon', 1], ['d_sunrise', 1], ['d_warden', 1]], 5),
  },
  {
    id: 'hollow', level: 12, name: 'The Hollow', title: 'That Ate the Sun', faction: 'umbral', cardLevel: 6,
    personality: 'It does not speak. It is spoken through.',
    playstyle: 'Everything, all at once. Wither, swarm, steal, and the Voice itself.',
    lore: 'There was a sun. Then there was the Hollow. Everything the Court is, everything the husks are, every dusk that will not end: it is all one word, still being spoken.',
    portrait: { motif: 'void', seed: 912 }, reward: { cinders: 1500, packs: 5, unlock: 'title_sunbearer' },
    lines: { intro: '...', win: '', lose: '', taunt: '' },
    deck: deckFrom('The Word', 'umbral', [['u_touch', 1], ['u_whisper', 2], ['u_tithe', 2], ['u_shambler', 2], ['u_assassin', 2], ['u_siphon', 2], ['u_priest', 2], ['u_husktithe', 1], ['u_unmaking', 2], ['u_gravecaller', 1], ['u_whisperer', 2], ['u_reaper', 2], ['u_pact', 1], ['u_swarm', 2], ['u_choir', 1], ['u_vaelthorn', 1], ['u_mother', 1], ['u_tyrant', 1], ['u_hollowking', 1], ['n_dragon', 1]], 6),
  },
];

export const BOT_BY_ID: Record<string, BotProfile> = Object.fromEntries(BOTS.map((b) => [b.id, b]));

/** Campaign chapters: the ladder told as a descent from the last holdfast to the Hollow's throne. */
export const CHAPTERS: { bot: string; chapter: string; place: string; story: string }[] = [
  { bot: 'pip', chapter: 'I', place: 'The Emberhearth Yard', story: 'The Vigil\'s last holdfast. Candles in every window; a boy with a borrowed deck.' },
  { bot: 'maudrey', chapter: 'II', place: 'The Fen Road', story: 'Mist, toads, and a hut that moves when you stop looking at it.' },
  { bot: 'halvard', chapter: 'III', place: 'The Gate Watch', story: 'The last wall between the Vigil and the dusk. Its sergeant does not open it for anyone who cannot beat him.' },
  { bot: 'isolde', chapter: 'IV', place: 'The Pale Salon', story: 'A candlelit room on the edge of Court lands. The hostess has already read your ending.' },
  { bot: 'tomasz', chapter: 'V', place: 'The Choir Loft', story: 'A hymn that has not stopped since the sun died. To pass, you must outlast it.' },
  { bot: 'ratking', chapter: 'VI', place: 'The Undercroft', story: 'The bells have stopped. Something beneath Hollowmere is laughing.' },
  { bot: 'veyra', chapter: 'VII', place: 'The Free Camp', story: 'Mercenaries in the ruins of a chapel. Their captain names a price.' },
  { bot: 'greaves', chapter: 'VIII', place: 'The Plague House', story: 'The patients do not complain. They never leave.' },
  { bot: 'aurel', chapter: 'IX', place: 'The Order\'s Last Field', story: 'Banners in the ash. The Knight-Commander wants proof you are not just another ghost.' },
  { bot: 'vaelthorn', chapter: 'X', place: 'Vaelthorn\'s Hall', story: 'The first of the fallen nobles sets the table. You are the guest. You are also the meal.' },
  { bot: 'ilvara', chapter: 'XI', place: 'The Unburnt Road', story: 'A saint walks ahead of you into the dark. She will not let you pass until you can walk it alone.' },
  { bot: 'hollow', chapter: 'XII', place: 'Where the Sun Was', story: 'There is no throne. There is a word, still being spoken. Finish it.' },
];
