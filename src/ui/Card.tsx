import { useMemo } from 'preact/hooks';
import { getCard, KEYWORD_HELP } from '../engine/cards';
import { cardArtSVG } from '../art/cardArt';
import { RARITY_THEME, levelTier } from '../art/palette';
import { scaledCard } from '../engine/levels';
import { LEVEL_NAMES } from '../engine/levels';
import type { Creature, GameState } from '../engine/types';
import { effAttack, effHealth, effMaxHealth } from '../engine/engine';

export interface CardProps {
  cardId: string; level?: number; size?: 'xs' | 's' | 'm' | 'l';
  creature?: Creature; state?: GameState; // live stats on the board
  selected?: boolean; dimmed?: boolean; targetable?: boolean; attacking?: boolean; blocking?: boolean; exhausted?: boolean;
  onClick?: (e: MouseEvent) => void; onKeyDown?: (e: KeyboardEvent) => void; tabIndex?: number; className?: string; count?: number; showText?: boolean; title?: string;
  'aria-label'?: string;
}

export function CardView(p: CardProps) {
  const def = getCard(p.cardId);
  const level = p.level ?? p.creature?.level ?? 1;
  const art = useMemo(() => cardArtSVG(def, { animated: level >= 7 }), [def.id, level >= 7]);
  const rarity = RARITY_THEME[def.rarity];
  const tier = levelTier(level);
  const base = scaledCard(def, level);
  let atk = base.attack, hp = base.health, maxHp = base.health;
  let buffed = false, hurt = false;
  if (p.creature && p.state) {
    atk = effAttack(p.state, p.creature); hp = effHealth(p.state, p.creature); maxHp = effMaxHealth(p.state, p.creature);
    buffed = (atk ?? 0) > (base.attack ?? 0) || (maxHp ?? 0) > (base.health ?? 0);
    hurt = (hp ?? 0) < (maxHp ?? 0);
  }
  const kws = p.creature ? p.creature.keywords : (def.keywords ?? []);
  const cls = ['card', `rarity-${def.rarity}`, `faction-${def.faction}`, `tier-${tier}`, `size-${p.size ?? 'm'}`, p.selected && 'selected', p.dimmed && 'dimmed', p.targetable && 'targetable', p.attacking && 'attacking', p.blocking && 'blocking', p.exhausted && 'exhausted', p.creature?.shackled && 'shackled', p.creature?.silenced && 'silenced', p.className].filter(Boolean).join(' ');
  const label = p['aria-label'] ?? `${def.name}, ${def.type}, cost ${def.cost}${def.type === 'creature' ? `, ${atk} attack, ${hp} health` : ''}, ${def.rarity}, level ${level}`;
  return (
    <div class={cls} style={{ '--frame': rarity.frame, '--frame2': rarity.frame2, '--gem': rarity.gem, '--glow': rarity.glow } as any}
      onClick={p.onClick as any} onKeyDown={p.onKeyDown as any} tabIndex={p.tabIndex} role={p.onClick ? 'button' : undefined} aria-label={label} aria-pressed={p.onClick ? !!p.selected : undefined} title={p.title}>
      <div class="card-inner">
        <div class="card-frame" />
        {tier === 'ascendant' && <div class="card-foil" aria-hidden="true" />}
        <div class="card-cost" aria-hidden="true"><span>{def.cost}</span></div>
        <div class="card-art" dangerouslySetInnerHTML={{ __html: art }} />
        <div class="card-name"><span>{def.name}</span></div>
        <div class="card-type"><span>{def.type === 'creature' ? def.tribe ?? 'Creature' : def.type === 'spell' ? 'Spell' : 'Relic'}</span><i class="rarity-gem" title={rarity.name} /></div>
        {(p.showText ?? p.size !== 'xs') && (
          <div class="card-text">
            {kws.length > 0 && <div class="card-kws">{kws.map((k) => <b key={k} title={KEYWORD_HELP[k]}>{k}</b>)}</div>}
            {def.text && <p>{def.text}</p>}
            {p.size === 'l' && def.flavor && <em class="card-flavor">{def.flavor}</em>}
          </div>
        )}
        {def.type === 'creature' && (
          <>
            <div class={'card-stat stat-attack' + (buffed ? ' up' : '')} aria-hidden="true"><span>{atk}</span></div>
            <div class={'card-stat stat-health' + (hurt ? ' hurt' : buffed ? ' up' : '')} aria-hidden="true"><span>{hp}</span></div>
          </>
        )}
        <div class="card-level" title={`Level ${level}: ${LEVEL_NAMES[level]}`} aria-hidden="true">
          {Array.from({ length: 7 }, (_, i) => <i key={i} class={i < level ? 'on' : ''} />)}
        </div>
        {p.count !== undefined && <div class="card-count">×{p.count}</div>}
        {p.creature && (p.creature.wardUsed === false && kws.includes('ward') && !p.creature.silenced) && <div class="card-ward" aria-hidden="true" />}
      </div>
    </div>
  );
}

export function CardBack({ size = 'm', faction = 'neutral', className = '' }: { size?: 'xs' | 's' | 'm' | 'l'; faction?: string; className?: string }) {
  return (
    <div class={`card card-back size-${size} faction-${faction} ${className}`} aria-hidden="true">
      <div class="card-inner"><div class="card-back-sigil"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="34" fill="none" stroke="currentColor" stroke-width="2" /><path d="M50 16 L58 42 L84 50 L58 58 L50 84 L42 58 L16 50 L42 42 Z" fill="currentColor" opacity=".9" /><circle cx="50" cy="50" r="8" fill="#0b0912" /></svg></div></div>
    </div>
  );
}
