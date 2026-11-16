import type { Faction, Rarity } from '../engine/types';

export const FACTION_THEME: Record<Faction, { name: string; primary: string; secondary: string; glow: string; dark: string; ink: string; skyTop: string; skyBottom: string }> = {
  dawn:    { name: 'The Dawnvigil',   primary: '#f3c969', secondary: '#f8ecd2', glow: '#ffd27a', dark: '#2a1f12', ink: '#1a1208', skyTop: '#2b1d3a', skyBottom: '#7a3b2a' },
  umbral:  { name: 'The Umbral Court', primary: '#9b5cff', secondary: '#7af0c0', glow: '#b48cff', dark: '#120a1e', ink: '#0a0612', skyTop: '#0c0618', skyBottom: '#2e1448' },
  neutral: { name: 'The Unaligned',   primary: '#b9b2a6', secondary: '#d8c8a6', glow: '#d9d2c2', dark: '#1a1a1f', ink: '#101014', skyTop: '#1a1c2a', skyBottom: '#3a3a46' },
};

export const RARITY_THEME: Record<Rarity, { name: string; frame: string; frame2: string; gem: string; glow: string }> = {
  common:    { name: 'Common',    frame: '#5b5e6a', frame2: '#8a8d99', gem: '#9aa0ad', glow: 'rgba(170,175,190,0.25)' },
  rare:      { name: 'Rare',      frame: '#2f6fa8', frame2: '#8fc7ff', gem: '#6fb8ff', glow: 'rgba(111,184,255,0.45)' },
  epic:      { name: 'Epic',      frame: '#6a2fa8', frame2: '#c48cff', gem: '#b06cff', glow: 'rgba(176,108,255,0.5)' },
  legendary: { name: 'Legendary', frame: '#a8742f', frame2: '#ffd86b', gem: '#ffc73a', glow: 'rgba(255,199,58,0.55)' },
};

/** Level tiers drive the frame treatment: plain -> bronze -> silver -> gold -> ascendant (animated foil). */
export function levelTier(level: number): 'plain' | 'bronze' | 'silver' | 'gold' | 'ascendant' {
  if (level >= 7) return 'ascendant';
  if (level >= 6) return 'gold';
  if (level >= 4) return 'silver';
  if (level >= 2) return 'bronze';
  return 'plain';
}
