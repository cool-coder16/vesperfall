// Core types for the Vesperfall rules engine. The engine is a pure, deterministic reducer:
// the same (state, action) always produces the same next state, so two clients can run it
// independently and compare results.

export type Faction = 'dawn' | 'umbral' | 'neutral';
export type Rarity = 'common' | 'rare' | 'epic' | 'legendary';
export type CardType = 'creature' | 'spell' | 'relic';
export type PlayerId = 0 | 1;

/** Keyword abilities. Names are original to Vesperfall. */
export type Keyword =
  | 'swift'      // may attack the turn it arrives
  | 'ward'       // the first damage it would take each turn is prevented
  | 'piercing'   // excess combat damage past blockers hits the enemy hero
  | 'winged'     // can only be blocked by winged or farsight creatures
  | 'farsight'   // may block winged creatures
  | 'venom'      // any damage it deals to a creature destroys it
  | 'radiant'    // damage it deals also heals your hero for that amount
  | 'quick'      // deals combat damage before creatures without quick
  | 'dread'      // can't be blocked except by two or more creatures
  | 'steadfast'  // attacking does not exhaust it
  | 'hollow'     // when it dies, leave a 1/1 Husk behind
  | 'shroud'     // can't be targeted by enemy spells or abilities
  | 'relentless';// when it attacks, it gets +1/+0 permanently

export type Trigger =
  | 'onPlay'        // when played from hand (creature/spell/relic)
  | 'onDeath'       // when this creature dies
  | 'onAttack'      // when this creature is declared as an attacker
  | 'onTurnStart'   // at the start of its controller's turn
  | 'onTurnEnd'     // at the end of its controller's turn
  | 'onAllyEnter'   // when another friendly creature enters
  | 'onHeal'        // when its controller's hero is healed
  | 'onSpellCast'   // when its controller casts a spell
  | 'onKill'        // when it destroys a creature in combat
  | 'onAllyDeath'   // when another friendly creature dies
  | 'onDamageTaken';// when it survives damage

export type TargetSpec =
  | 'none'
  | 'self'
  | 'ownHero'
  | 'enemyHero'
  | 'anyCreature'
  | 'enemyCreature'
  | 'allyCreature'
  | 'anyTarget'      // creature or hero, chosen
  | 'allEnemies'     // all enemy creatures
  | 'allAllies'      // all friendly creatures (other than self for creature sources)
  | 'allCreatures'
  | 'randomEnemy'
  | 'randomAlly'
  | 'weakestEnemy'   // lowest-attack enemy creature
  | 'strongestEnemy' // highest-attack enemy creature
  | 'triggering'       // the creature that caused the trigger (onAllyEnter / onAllyDeath / onKill)
  | 'graveyardCreature'; // chosen friendly creature card in graveyard

export type EffectAction =
  | { kind: 'damage'; amount: number; scale?: boolean }
  | { kind: 'heal'; amount: number; scale?: boolean }
  | { kind: 'draw'; count: number }
  | { kind: 'buff'; attack: number; health: number; untilEndOfTurn?: boolean; scale?: boolean }
  | { kind: 'wither'; amount: number; scale?: boolean }      // -1/-1 counters
  | { kind: 'summon'; cardId: string; count: number }
  | { kind: 'destroy' }
  | { kind: 'bounce' }                                         // return creature to its owner's hand
  | { kind: 'gainEssence'; amount: number }
  | { kind: 'gainMaxEssence'; amount: number }
  | { kind: 'grant'; keyword: Keyword }
  | { kind: 'shackle' }                                        // can't attack or block until controller's next turn ends
  | { kind: 'silence' }
  | { kind: 'reanimate'; maxCost?: number }                   // return chosen friendly creature from graveyard to the board
  | { kind: 'steal'; maxAttack: number }                      // take control of an enemy creature
  | { kind: 'sacrifice' }                                      // destroy a friendly creature as part of the cost; then run `then`
  | { kind: 'discardRandom'; count: number }
  | { kind: 'aura'; attack: number; health: number; filter?: 'all' | 'tribe'; tribe?: string } // static, from relics or creatures
  | { kind: 'armor'; amount: number }
  | { kind: 'restoreWard' }
  | { kind: 'setHealth'; amount: number }
  | { kind: 'damageHeroes'; amount: number; scale?: boolean }  // both heroes
  | { kind: 'transform'; cardId: string };

export interface Effect {
  trigger: Trigger;
  action: EffectAction;
  target?: TargetSpec;
  /** Optional condition evaluated when the trigger fires. */
  condition?: 'ownHeroBelowHalf' | 'enemyHeroBelowHalf' | 'hasAllyTribe' | 'graveyardHasCreature' | 'targetIsWithered' | 'controlsRelic';
  conditionTribe?: string;
  /** For sacrifice effects: the effect to run after the sacrifice. */
  then?: { action: EffectAction; target?: TargetSpec };
  /** Cap on how many times this effect may trigger per game. */
  oncePerGame?: boolean;
}

export interface CardDef {
  id: string;
  name: string;
  faction: Faction;
  rarity: Rarity;
  type: CardType;
  cost: number;
  attack?: number;
  health?: number;
  tribe?: string;
  keywords?: Keyword[];
  effects?: Effect[];
  text: string;
  flavor: string;
  /** Procedural-art parameters. */
  art: { motif: string; seed: number; hue?: number };
  /** Token cards cannot be put in decks or collected. */
  token?: boolean;
  /** Relic duration in turns (undefined = permanent). */
  duration?: number;
}

/** A specific physical card in a game: an instance id plus a definition and a level. */
export interface CardInst {
  inst: string;
  cardId: string; // '?' when hidden from this client (opponent's unrevealed card)
  level: number;
}

export interface Creature extends CardInst {
  attack: number;
  health: number;
  maxHealth: number;
  baseAttack: number;
  baseHealth: number;
  keywords: Keyword[];
  exhausted: boolean;
  enteredTurn: number;
  wardUsed: boolean;
  shackled: boolean;
  silenced: boolean;
  tempAttack: number;
  tempHealth: number;
  wither: number;
  owner: PlayerId;
  controller: PlayerId;
  relentlessBonus: number;
  firedOnce: string[];
}

export interface Relic extends CardInst {
  turnsLeft?: number;
  controller: PlayerId;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  faction: Faction;
  health: number;
  maxHealth: number;
  armor: number;
  essence: number;
  maxEssence: number;
  deck: CardInst[];
  hand: CardInst[];
  board: Creature[];
  graveyard: CardInst[];
  relics: Relic[];
  fatigue: number;
  oathUsed: boolean;
  spellsCastThisTurn: number;
  /** Number of draws taken from the deck (used to map hidden draws for commit-reveal). */
  drawCount: number;
}

export type Phase = 'main1' | 'block' | 'main2' | 'ended';

export interface Action_Play { type: 'play'; player: PlayerId; inst: string; targets?: string[]; reveal?: { cardId: string; level: number }; sacrifice?: string; position?: number }
export interface Action_Attack { type: 'attack'; player: PlayerId; attackers: string[] }
export interface Action_Block { type: 'block'; player: PlayerId; blocks: { attacker: string; blocker: string }[] }
export interface Action_Oath { type: 'oath'; player: PlayerId; target: string }
export interface Action_EndTurn { type: 'endTurn'; player: PlayerId }
export interface Action_Concede { type: 'concede'; player: PlayerId }
export type Action = Action_Play | Action_Attack | Action_Block | Action_Oath | Action_EndTurn | Action_Concede;

export type GameEvent =
  | { kind: 'turnStart'; player: PlayerId; turn: number }
  | { kind: 'draw'; player: PlayerId; inst: string; cardId: string; fatigue?: number }
  | { kind: 'play'; player: PlayerId; inst: string; cardId: string; targets?: string[] }
  | { kind: 'summon'; player: PlayerId; inst: string; cardId: string }
  | { kind: 'damage'; target: string; amount: number; source?: string; prevented?: boolean }
  | { kind: 'heal'; target: string; amount: number }
  | { kind: 'death'; player: PlayerId; inst: string; cardId: string }
  | { kind: 'attack'; attackers: string[] }
  | { kind: 'block'; attacker: string; blockers: string[] }
  | { kind: 'clash'; attacker: string; blocker: string }
  | { kind: 'heroHit'; player: PlayerId; attacker: string; amount: number }
  | { kind: 'buff'; target: string; attack: number; health: number }
  | { kind: 'wither'; target: string; amount: number }
  | { kind: 'keyword'; target: string; keyword: Keyword }
  | { kind: 'essence'; player: PlayerId; essence: number; max: number }
  | { kind: 'oath'; player: PlayerId; target: string }
  | { kind: 'bounce'; inst: string }
  | { kind: 'steal'; inst: string; to: PlayerId }
  | { kind: 'shackle'; target: string }
  | { kind: 'silence'; target: string }
  | { kind: 'discard'; player: PlayerId; inst: string; cardId: string }
  | { kind: 'relic'; player: PlayerId; inst: string; cardId: string; expired?: boolean }
  | { kind: 'gameOver'; winner: PlayerId | 'draw'; reason: string }
  | { kind: 'phase'; phase: Phase; active: PlayerId }
  | { kind: 'reanimate'; player: PlayerId; inst: string; cardId: string };

export interface GameState {
  seq: number;
  turn: number;
  active: PlayerId;
  phase: Phase;
  players: [PlayerState, PlayerState];
  pendingAttack: string[] | null;
  winner: PlayerId | 'draw' | null;
  winReason: string | null;
  rng: number; // xorshift32 state, deterministic and shared
  nextInst: number;
  events: GameEvent[]; // events produced by the last applyAction
  firstPlayer: PlayerId;
  /** Marks the game as a tutorial so the UI can inject guidance. */
  tutorial?: boolean;
}

export interface DeckCard { cardId: string; level: number }
export interface DeckSpec { name: string; faction: Faction; cards: DeckCard[] }

export interface GameConfig {
  players: [{ name: string; deck: DeckSpec }, { name: string; deck: DeckSpec }];
  seed: number;
  firstPlayer?: PlayerId;
  /** Explicit deck orders (instance lists). When provided, the engine does not shuffle. */
  deckOrders?: [CardInst[] | null, CardInst[] | null];
  startingHand?: number;
  tutorial?: boolean;
}

export const RULES = {
  deckSize: 30,
  maxCopies: 2,
  maxLegendaryCopies: 1,
  startHealth: 30,
  maxEssence: 10,
  maxHand: 8,
  maxBoard: 6,
  startingHand: 4,
  maxLevel: 7,
  oathCost: 2,
} as const;
