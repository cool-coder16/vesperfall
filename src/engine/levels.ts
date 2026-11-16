import type { CardDef, Rarity } from './types';
import { RULES } from './types';

/**
 * Card levels run 1..7 for every rarity. Each level adds roughly 10% to stats (rounded, never
 * below base). Level 7 is "Ascendant": the frame animates and stats get an extra +1.
 */
export function scaleStat(base: number, level: number): number {
  if (base <= 0) return base;
  const lvl = Math.max(1, Math.min(RULES.maxLevel, level));
  const scaled = Math.round(base * (1 + 0.1 * (lvl - 1)) + 1e-9);
  const ascend = lvl === RULES.maxLevel ? 1 : 0;
  return Math.max(base, scaled) + ascend;
}

export function scaledCard(def: CardDef, level: number) {
  return {
    attack: def.attack === undefined ? undefined : scaleStat(def.attack, level),
    health: def.health === undefined ? undefined : scaleStat(def.health, level),
  };
}

/** Effect amounts marked `scale: true` grow more slowly than stats: +1 at levels 4 and 7. */
export function scaleAmount(base: number, level: number): number {
  let bonus = 0;
  if (level >= 4) bonus++;
  if (level >= 7) bonus++;
  return base + bonus;
}

/** Duplicate cards consumed to reach the next level (index = current level). */
const UPGRADE_CARDS: Record<Rarity, number[]> = {
  common:    [0, 2, 4, 10, 20, 50, 100],
  rare:      [0, 2, 4, 8, 15, 30, 60],
  epic:      [0, 1, 2, 4, 8, 15, 30],
  legendary: [0, 1, 1, 2, 3, 5, 8],
};
/** Cinders (currency) spent to upgrade from the given level. */
const UPGRADE_CINDERS: Record<Rarity, number[]> = {
  common:    [0, 20, 50, 150, 400, 1000, 2500],
  rare:      [0, 50, 150, 400, 1000, 2000, 4000],
  epic:      [0, 150, 400, 1000, 2000, 4000, 8000],
  legendary: [0, 400, 1000, 2000, 4000, 8000, 15000],
};

export function upgradeCost(rarity: Rarity, currentLevel: number): { cards: number; cinders: number } | null {
  if (currentLevel >= RULES.maxLevel || currentLevel < 1) return null;
  return { cards: UPGRADE_CARDS[rarity][currentLevel], cinders: UPGRADE_CINDERS[rarity][currentLevel] };
}

export const LEVEL_NAMES = ['', 'Novice', 'Tempered', 'Honed', 'Gilded', 'Exalted', 'Mythic', 'Ascendant'];
