import { useEffect, useMemo, useRef, useState, useCallback } from 'preact/hooks';
import type { Action, Creature, GameEvent, GameState, PlayerId, TargetSpec } from '../../engine/types';
import { RULES } from '../../engine/types';
import { applyAction, canAttack, canBlock, candidates, createGame, hasKw, needsSacrifice, other, OATHS, targetSlots, validateAction, whoActs, buildDeckInstances, findCreature, effAttack } from '../../engine/engine';
import { getCard } from '../../engine/cards';
import { botNextAction, paramsForLevel, type BotParams } from '../../ai/bot';
import { BOT_BY_ID, type BotProfile } from '../../ai/bots';
import { navigate, profile, route, settings, setProfile, toast, user, reducedMotion } from '../../state/store';
import { recordMatch, type MatchOutcome } from '../../firebase/profile';
import { friendlyError } from '../../firebase/app';
import { OnlineMatch, TURN_SECONDS, type MatchPlayer } from '../../firebase/online';
import { CardView, CardBack } from '../Card';
import { Background } from '../Background';
import { BotPortrait, Portrait, Toasts } from '../Chrome';
import { playEvents } from './fx';
import { TUTORIAL_BOT_DECK, TUTORIAL_BOT_ORDER, TUTORIAL_PLAYER_DECK, TUTORIAL_PLAYER_ORDER, TUTORIAL_STEPS } from './tutorial';
import { deckToSpec } from '../screens/Decks';
import { audio, sfx } from '../../audio/synth';
import { starterDeck } from '../../engine/decks';
import type { CardInst } from '../../engine/types';

type Targeting = { kind: 'play'; inst: string; slots: TargetSpec[]; chosen: string[]; sacrifice?: string; needSac: boolean } | { kind: 'oath' };
interface Opp { name: string; portrait: preact.JSX.Element; sub?: string; bot?: BotProfile }

function orderedDeck(spec: { cards: { cardId: string; level: number }[] }, order: string[], p: PlayerId): CardInst[] {
  const pool = spec.cards.slice(); const out: typeof pool = [];
  for (const id of order) { const i = pool.findIndex((c) => c.cardId === id); if (i >= 0) out.push(pool.splice(i, 1)[0]); }
  return [...out, ...pool].map((c, k) => ({ inst: `p${p}d${k}`, cardId: c.cardId, level: c.level }));
}

export function Match() {
  const r = route.value as { name: 'match'; mode: 'bot' | 'online' | 'tutorial'; botId?: string; matchId?: string; deckId?: string };
  const p = profile.value;
  const myIdxRef = useRef<PlayerId>(0);
  const [view, setView] = useState<GameState | null>(null);          // what is displayed
  const canon = useRef<GameState | null>(null);                        // authoritative local state (bot mode)
  const queue = useRef<{ st: GameState; events: GameEvent[] }[]>([]);
  const playing = useRef(false);
  const [busy, setBusy] = useState(false);
  const [opp, setOpp] = useState<Opp | null>(null);
  const [status, setStatus] = useState<string>('');
  const [targeting, setTargeting] = useState<Targeting | null>(null);
  const [attackers, setAttackers] = useState<string[]>([]);
  const [blocks, setBlocks] = useState<{ attacker: string; blocker: string }[]>([]);
  const [selBlocker, setSelBlocker] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ text: string; cls: string } | null>(null);
  const [speech, setSpeech] = useState<string | null>(null);
  const [over, setOver] = useState<{ result: 'win' | 'loss' | 'draw'; reason: string; rewards?: { cinders: number; packs: number; ratingDelta: number; firstClear: boolean; unlock?: string }; verified?: boolean; disputed?: boolean; saving: boolean } | null>(null);
  const [tutStep, setTutStep] = useState(0);
  const [secs, setSecs] = useState<number | null>(null);
  const online = useRef<OnlineMatch | null>(null);
  const botParams = useRef<BotParams | null>(null);
  const botTimer = useRef<number | null>(null);
  const [inspect, setInspect] = useState<{ cardId: string; level: number } | null>(null);
  const endedRef = useRef(false);
  const myIdx = myIdxRef.current;
  const speedMul = settings.value.animations === 'fast' ? 0.5 : settings.value.animations === 'minimal' || reducedMotion() ? 0.15 : 1;

  // ───────── display queue: show states one at a time with FX ─────────
  const pump = useCallback(() => {
    if (playing.current) return;
    const next = queue.current.shift(); if (!next) return;
    playing.current = true; setBusy(true);
    setView(next.st);
    setTimeout(() => {
      const d = playEvents(next.events, next.st, myIdxRef.current) * speedMul;
      setTimeout(() => { playing.current = false; if (queue.current.length) pump(); else setBusy(false); }, d);
    }, 30);
  }, [speedMul]);
  const enqueue = useCallback((st: GameState, events: GameEvent[]) => { queue.current.push({ st, events }); pump(); }, [pump]);

  // ───────── setup ─────────
  useEffect(() => {
    audio.init();
    endedRef.current = false;
    if (r.mode === 'online') {
      if (!p || !user.value || !r.matchId) { navigate({ name: 'online' }); return; }
      const deck = p.decks.find((d) => d.id === r.deckId) ?? p.decks.find((d) => d.id === p.activeDeck) ?? p.decks[0];
      const om = new OnlineMatch(r.matchId, { uid: p.uid, name: p.username, avatar: p.avatar, rating: p.rating }, deckToSpec(deck, p.collection), {
        onState: (st, events, source) => { myIdxRef.current = om.myIdx; if (source === 'replay') { queue.current = []; setView(st); } else enqueue(st, events); },
        onStatus: (s, info) => {
          setStatus(s === 'waiting' ? info.message ?? 'Waiting…' : s === 'connecting' ? 'Connecting…' : s === 'abandoned' ? 'Match abandoned' : '');
          if (info.opponent?.name) setOpp({ name: info.opponent.name, portrait: <Portrait avatar={info.opponent.avatar ?? 'av_knight'} />, sub: `Rating ${info.opponent.rating ?? '?'}` });
          if (s === 'abandoned') setTimeout(() => navigate({ name: 'online' }), 1500);
        },
        onEnd: (sum) => finish(sum.result, sum.reason, { verified: sum.verified, disputed: sum.disputed, opponent: sum.opponent, turns: sum.turns }),
        onError: (m) => toast(m, 'error'),
      });
      online.current = om; om.connect();
      audio.playMusic(p.alignment === 'umbral' ? 'umbral' : 'dawn');
      return () => { om.dispose(); online.current = null; audio.playMusic('menu'); };
    }
    // bot & tutorial
    let bot: BotProfile; let myDeck; let orders: [CardInst[] | null, CardInst[] | null] | undefined; let seed = Date.now() & 0xffffff;
    if (r.mode === 'tutorial') {
      bot = { ...BOT_BY_ID['pip'], name: 'Pip', deck: TUTORIAL_BOT_DECK };
      myDeck = TUTORIAL_PLAYER_DECK;
      orders = [orderedDeck(TUTORIAL_PLAYER_DECK, TUTORIAL_PLAYER_ORDER, 0), orderedDeck(TUTORIAL_BOT_DECK, TUTORIAL_BOT_ORDER, 1)];
      seed = 7;
      botParams.current = { ...paramsForLevel(1), mistakeRate: 0.3 };
    } else {
      bot = BOT_BY_ID[r.botId ?? 'pip'] ?? BOT_BY_ID['pip'];
      const d = p ? (p.decks.find((x) => x.id === r.deckId) ?? p.decks.find((x) => x.id === p.activeDeck) ?? p.decks[0]) : null;
      myDeck = d && p ? deckToSpec(d, p.collection) : starterDeck('dawn');
      if (myDeck.cards.length !== RULES.deckSize) myDeck = starterDeck(myDeck.faction === 'umbral' ? 'umbral' : 'dawn');
      botParams.current = paramsForLevel(bot.level);
    }
    myIdxRef.current = 0;
    setOpp({ name: bot.name, portrait: <BotPortrait motif={bot.portrait.motif} seed={bot.portrait.seed} faction={bot.faction} />, sub: `${bot.title} · Lv ${bot.level}`, bot });
    const st = createGame({ players: [{ name: p?.username ?? 'You', deck: myDeck }, { name: bot.name, deck: bot.deck }], seed, firstPlayer: r.mode === 'tutorial' ? 0 : ((seed & 1) as PlayerId), deckOrders: orders, tutorial: r.mode === 'tutorial' });
    canon.current = st; setView(st);
    if (bot.lines.intro) setTimeout(() => setSpeech(bot.lines.intro), 600);
    setTimeout(() => setSpeech(null), 5000);
    audio.playMusic(bot.faction === 'umbral' ? 'umbral' : 'dawn');
    if (whoActs(st) === 1) scheduleBot(st);
    return () => { if (botTimer.current) clearTimeout(botTimer.current); audio.playMusic('menu'); };
  }, [r.mode, r.botId, r.matchId]);

  // ───────── bot driver ─────────
  const scheduleBot = (st: GameState) => {
    if (botTimer.current) clearTimeout(botTimer.current);
    botTimer.current = window.setTimeout(() => runBotStep(st), 900 * speedMul + 300);
  };
  const runBotStep = (st: GameState) => {
    if (st.winner !== null || whoActs(st) !== 1 || !botParams.current) return;
    const a = botNextAction(st, 1, botParams.current);
    if (!a) return;
    let next: GameState;
    try { next = applyAction(st, a); } catch { next = applyAction(st, st.phase === 'block' ? { type: 'block', player: 1, blocks: [] } : { type: 'endTurn', player: 1 }); }
    canon.current = next;
    if (a.type === 'play' && opp?.bot) { const c = st.players[1].hand.find((x) => x.inst === a.inst); const def = c ? getCard(c.cardId) : null; if (def && (def.rarity === 'legendary' || def.rarity === 'epic') && opp.bot.lines.taunt) { setSpeech(opp.bot.lines.taunt); setTimeout(() => setSpeech(null), 3500); } }
    enqueue(next, next.events);
    if (next.winner !== null) { onLocalOver(next); return; }
    if (whoActs(next) === 1) scheduleBot(next); 
  };

  // ───────── acting ─────────
  const act = (a: Action): boolean => {
    if (r.mode === 'online') {
      const err = online.current?.act(a) ?? 'Not connected';
      if (err) { toast(err, 'error'); sfx('error'); return false; }
      return true;
    }
    const st = canon.current; if (!st) return false;
    const err = validateAction(st, a); if (err) { toast(err, 'error'); sfx('error'); return false; }
    const next = applyAction(st, a); canon.current = next;
    enqueue(next, next.events);
    if (next.winner !== null) { onLocalOver(next); return true; }
    if (whoActs(next) === 1) scheduleBot(next);
    return true;
  };

  const onLocalOver = (st: GameState) => {
    const res: 'win' | 'loss' | 'draw' = st.winner === 'draw' ? 'draw' : st.winner === myIdxRef.current ? 'win' : 'loss';
    finish(res, st.winReason ?? '', { turns: st.turn });
  };

  const finish = async (result: 'win' | 'loss' | 'draw', reason: string, extra: { verified?: boolean; disputed?: boolean; opponent?: Partial<MatchPlayer>; turns: number }) => {
    if (endedRef.current) return; endedRef.current = true;
    setTargeting(null); setAttackers([]); setBlocks([]);
    const wait = Math.min(2500, (queue.current.length + 1) * 700 * speedMul);
    setTimeout(() => {
      sfx(result === 'win' ? 'victory' : result === 'loss' ? 'defeat' : 'turn');
      if (opp?.bot) { const line = result === 'win' ? opp.bot.lines.lose : opp.bot.lines.win; if (line) setSpeech(line); }
      setOver({ result, reason, saving: !!p, verified: extra.verified, disputed: extra.disputed });
    }, wait);
    if (!p) return;
    const isTut = r.mode === 'tutorial';
    const deckName = r.mode === 'tutorial' ? 'Lantern Primer' : (p.decks.find((d) => d.id === r.deckId) ?? p.decks.find((d) => d.id === p.activeDeck))?.name ?? 'Deck';
    const outcome: MatchOutcome = r.mode === 'online'
      ? { mode: 'online', result, opponent: extra.opponent?.name ?? 'Opponent', opponentId: extra.opponent?.uid, opponentRating: extra.opponent?.rating, turns: extra.turns, deck: deckName, reason, disputed: extra.disputed }
      : { mode: 'bot', result, opponent: opp?.bot?.name ?? 'Bot', botId: isTut ? undefined : opp?.bot?.id, botLevel: opp?.bot?.level, botReward: isTut ? undefined : opp?.bot?.reward, turns: extra.turns, deck: deckName, reason };
    try {
      const { profile: np, rewards } = await recordMatch(isTut ? { ...p, tutorialDone: true } : p, outcome);
      if (isTut) np.tutorialDone = true;
      setProfile(np);
      setOver((o) => (o ? { ...o, rewards, saving: false } : o));
      setTimeout(() => setOver((o) => (o && !o.rewards ? { ...o, rewards, saving: false } : o)), wait + 50);
    } catch (e) { toast(friendlyError(e), 'error'); setOver((o) => (o ? { ...o, saving: false } : o)); }
  };

  // ───────── tutorial progression ─────────
  useEffect(() => {
    if (r.mode !== 'tutorial' || !view) return;
    const step = TUTORIAL_STEPS[tutStep]; if (!step) return;
    if (step.done(view, { phaseUi: '' })) setTutStep(tutStep + 1);
  }, [view, tutStep]);

  // ───────── timers & banners ─────────
  useEffect(() => {
    if (r.mode !== 'online') return;
    const t = setInterval(() => setSecs(online.current?.secondsLeft() ?? null), 500);
    return () => clearInterval(t);
  }, [r.mode]);
  const lastTurn = useRef(0);
  useEffect(() => {
    if (!view) return;
    if (view.turn !== lastTurn.current) {
      lastTurn.current = view.turn;
      const mine = view.active === myIdx;
      setBanner({ text: mine ? 'Your turn' : `${opp?.name ?? 'Enemy'}'s turn`, cls: mine ? '' : 'umbral' });
      setTimeout(() => setBanner(null), 1400);
      setAttackers([]); setBlocks([]); setSelBlocker(null); setTargeting(null);
    }
  }, [view?.turn]);

  // keyboard
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (over || !view) return;
      if (e.key === 'Escape') { setTargeting(null); setSelBlocker(null); }
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'e' || e.key === 'E') endTurn();
      if (e.key === 'a' || e.key === 'A') declareAttack();
    };
    addEventListener('keydown', onKey); return () => removeEventListener('keydown', onKey);
  });

  if (!view) return <div class="loading-screen"><Background /><div class="spinner" /><span>{status || 'Preparing the board…'}</span></div>;

  const st = view;
  const me = st.players[myIdx], en = st.players[other(myIdx)];
  const myTurn = st.winner === null && whoActs(st) === myIdx && !busy;
  const isBlockStep = st.phase === 'block' && whoActs(st) === myIdx;
  const canPlayNow = myTurn && (st.phase === 'main1' || st.phase === 'main2');

  // ───────── interaction helpers ─────────
  const startPlay = (inst: string) => {
    if (!canPlayNow) return;
    const card = me.hand.find((c) => c.inst === inst); if (!card) return;
    const def = getCard(card.cardId);
    if (def.cost > me.essence) { toast('Not enough essence', 'error'); sfx('error'); return; }
    const slots = targetSlots(def);
    const needSac = needsSacrifice(def);
    if (slots.length === 0 && !needSac) { act({ type: 'play', player: myIdx, inst }); return; }
    const anyCands = slots.some((s) => candidates(st, myIdx, s, def, (def.effects ?? []).find((e) => e.trigger === 'onPlay' && (e.target === s || e.then?.target === s))).length > 0);
    if (!anyCands && !needSac) { act({ type: 'play', player: myIdx, inst }); return; }
    if (def.type === 'spell' && !anyCands && !needSac) { toast('No legal target', 'error'); return; }
    setTargeting({ kind: 'play', inst, slots, chosen: [], needSac });
    sfx('click');
  };
  const targetCandidates = (): string[] => {
    if (!targeting) return [];
    if (targeting.kind === 'oath') return candidates(st, myIdx, 'anyTarget');
    const card = me.hand.find((c) => c.inst === targeting.inst); if (!card) return [];
    const def = getCard(card.cardId);
    if (targeting.needSac && !targeting.sacrifice) return me.board.map((c) => c.inst);
    const slot = targeting.slots[targeting.chosen.length]; if (!slot) return [];
    const eff = (def.effects ?? []).find((e) => e.trigger === 'onPlay' && (e.target === slot || e.then?.target === slot));
    return candidates(st, myIdx, slot, def, eff).filter((t) => t !== targeting.sacrifice);
  };
  const cands = targetCandidates();
  const pickTarget = (tid: string) => {
    if (!targeting || !cands.includes(tid)) return;
    if (targeting.kind === 'oath') { setTargeting(null); act({ type: 'oath', player: myIdx, target: tid }); return; }
    let t = { ...targeting };
    if (t.needSac && !t.sacrifice) t.sacrifice = tid; else t.chosen = [...t.chosen, tid];
    // skip slots with no candidates
    const card = me.hand.find((c) => c.inst === t.inst)!; const def = getCard(card.cardId);
    while (t.chosen.length < t.slots.length) {
      const slot = t.slots[t.chosen.length];
      const eff = (def.effects ?? []).find((e) => e.trigger === 'onPlay' && (e.target === slot || e.then?.target === slot));
      if (candidates(st, myIdx, slot, def, eff).filter((x) => x !== t.sacrifice).length > 0) break;
      t.chosen = [...t.chosen, ''];
    }
    if (t.chosen.length >= t.slots.length) { setTargeting(null); act({ type: 'play', player: myIdx, inst: t.inst, targets: t.chosen.filter(Boolean), sacrifice: t.sacrifice }); }
    else setTargeting(t);
  };
  const toggleAttacker = (inst: string) => {
    if (!myTurn || st.phase !== 'main1') return;
    const c = me.board.find((x) => x.inst === inst); if (!c || !canAttack(st, c)) { toast(c ? `${getCard(c.cardId).name} cannot attack now` : '', 'error'); return; }
    sfx('click');
    setAttackers((a) => (a.includes(inst) ? a.filter((x) => x !== inst) : [...a, inst]));
  };
  const declareAttack = () => { if (!myTurn || st.phase !== 'main1' || attackers.length === 0) return; const ok = act({ type: 'attack', player: myIdx, attackers }); if (ok) setAttackers([]); };
  const endTurn = () => { if (!myTurn || st.phase === 'block') return; setTargeting(null); setAttackers([]); act({ type: 'endTurn', player: myIdx }); };
  const useOath = () => {
    if (!canPlayNow || me.oathUsed || me.essence < RULES.oathCost) return;
    const o = OATHS[me.faction];
    if (o.targets === 'none') act({ type: 'oath', player: myIdx, target: '' }); else { setTargeting({ kind: 'oath' }); sfx('click'); }
  };
  const onMyCreatureClick = (c: Creature) => {
    if (targeting) { pickTarget(c.inst); return; }
    if (isBlockStep) { if (!canBlock(st, c, findCreature(st, st.pendingAttack![0])!.c) && !st.pendingAttack!.some((a) => canBlock(st, c, findCreature(st, a)!.c))) { toast('That creature cannot block', 'error'); return; } setBlocks((b) => b.filter((x) => x.blocker !== c.inst)); setSelBlocker(selBlocker === c.inst ? null : c.inst); sfx('click'); return; }
    toggleAttacker(c.inst);
  };
  const onEnemyCreatureClick = (c: Creature) => {
    if (targeting) { pickTarget(c.inst); return; }
    if (isBlockStep && selBlocker && st.pendingAttack?.includes(c.inst)) {
      const b = findCreature(st, selBlocker)!.c;
      if (!canBlock(st, b, c)) { toast(`${getCard(b.cardId).name} cannot block ${getCard(c.cardId).name}`, 'error'); return; }
      setBlocks((bl) => [...bl.filter((x) => x.blocker !== selBlocker), { attacker: c.inst, blocker: selBlocker }]); setSelBlocker(null); sfx('click'); return;
    }
    setInspect({ cardId: c.cardId, level: c.level });
  };
  const confirmBlocks = () => { const err = validateAction(st, { type: 'block', player: myIdx, blocks }); if (err) { toast(err, 'error'); return; } act({ type: 'block', player: myIdx, blocks }); setBlocks([]); setSelBlocker(null); };

  const factionCls = `faction-${me.faction}-essence`;
  const oath = OATHS[me.faction];
  const tut = r.mode === 'tutorial' && settings.value.showHints ? TUTORIAL_STEPS[tutStep] : null;
  const showTut = tut && (!tut.when || tut.when(st));
  const Essence = ({ pl }: { pl: typeof me }) => <div class="essence" aria-label={`${pl.essence} of ${pl.maxEssence} essence`}>{Array.from({ length: Math.max(pl.maxEssence, Math.min(10, pl.essence)) }, (_, i) => <i key={i} class={i < pl.essence ? 'on' : ''} />)}<span class="n">{pl.essence}/{pl.maxEssence}</span></div>;
  const heroTargetable = (pid: PlayerId) => !!targeting && cands.includes(`hero:${pid}`);

  return (
    <div class={`match ${factionCls}`}>
      <Background mood={en.faction === 'umbral' ? 'umbral' : 'dawn'} />
      <div id="fx-layer" class="fx-layer" aria-hidden="true" />
      <Toasts />
      {banner && <div class={`phase-banner ${banner.cls}`} aria-live="polite">{banner.text}</div>}
      {targeting && <div class="targeting-msg" role="status">{targeting.kind === 'oath' ? `${oath.name}: choose a target` : targeting.needSac && !targeting.sacrifice ? 'Choose a creature to sacrifice' : 'Choose a target'} · Esc to cancel</div>}

      {/* opponent */}
      <div class="hero-bar" style="position:relative">
        <div class="who">{opp?.portrait}<div><div class="name">{opp?.name ?? en.name}</div><div class="sub">{opp?.sub}{status ? ` · ${status}` : ''}</div></div></div>
        <button class={`hero-health ${heroTargetable(other(myIdx)) ? 'targetable' : ''}`} data-tid={`hero:${other(myIdx)}`} aria-label={`Enemy hero, ${en.health} health`} onClick={() => heroTargetable(other(myIdx)) && pickTarget(`hero:${other(myIdx)}`)}>{en.health}{en.armor > 0 && <span class="armor">{en.armor}</span>}</button>
        <Essence pl={en} />
        <div class="relics">{en.relics.map((rl) => <span key={rl.inst} class="relic-chip" title={getCard(rl.cardId).text} data-tid={rl.inst}>◆ {getCard(rl.cardId).name}{rl.turnsLeft !== undefined ? ` (${rl.turnsLeft})` : ''}</span>)}</div>
        <div class="counts"><span title="Cards in hand">✋ {en.hand.length}</span><span title="Cards in deck">▤ {en.deck.length}</span><span title="Graveyard">☠ {en.graveyard.length}</span></div>
        {speech && <div class="speech" role="status">{speech}</div>}
      </div>
      <div class="opp-hand" aria-hidden="true">{en.hand.slice(0, 10).map((c) => <CardBack key={c.inst} size="xs" faction={en.faction} />)}</div>

      <div class={`board-row ${en.board.length ? '' : 'empty'}`} data-empty="The enemy field lies empty" aria-label="Enemy creatures">
        {en.board.map((c) => <div key={c.inst} data-tid={c.inst}><CardView cardId={c.cardId} creature={c} state={st} size="s" exhausted={c.exhausted} attacking={!!st.pendingAttack?.includes(c.inst) && st.active !== myIdx} blocking={st.active === myIdx && st.pendingAttack !== null && false} targetable={!!targeting && cands.includes(c.inst)} selected={blocks.some((b) => b.attacker === c.inst) && isBlockStep} onClick={() => onEnemyCreatureClick(c)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onEnemyCreatureClick(c); } }} showText={false} title={blocks.filter((b) => b.attacker === c.inst).map((b) => `blocked by ${getCard(findCreature(st, b.blocker)!.c.cardId).name}`).join(', ') || getCard(c.cardId).text} /></div>)}
      </div>

      <div class="divider">
        <span class={`turn-badge ${st.active === myIdx ? 'mine' : ''}`} aria-live="polite">
          Turn {st.turn} · {st.winner !== null ? 'Game over' : st.phase === 'block' ? (isBlockStep ? 'Declare blocks' : 'Enemy is blocking') : st.active === myIdx ? (st.phase === 'main1' ? 'Your main phase' : 'After combat') : 'Enemy turn'}
          {secs !== null && st.winner === null && <span class={`timer ${secs <= 15 ? 'low' : ''}`} aria-label="Seconds left">{secs}s</span>}
        </span>
      </div>

      <div class={`board-row ${me.board.length ? '' : 'empty'}`} data-empty="Your field awaits" aria-label="Your creatures">
        {me.board.map((c) => <div key={c.inst} data-tid={c.inst}><CardView cardId={c.cardId} creature={c} state={st} size="s" exhausted={c.exhausted} attacking={attackers.includes(c.inst) || (!!st.pendingAttack?.includes(c.inst) && st.active === myIdx)} blocking={blocks.some((b) => b.blocker === c.inst) || selBlocker === c.inst} targetable={!!targeting && cands.includes(c.inst)} dimmed={myTurn && st.phase === 'main1' && !targeting && !canAttack(st, c) && !isBlockStep} onClick={() => onMyCreatureClick(c)} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onMyCreatureClick(c); } if (e.key === 'i') setInspect({ cardId: c.cardId, level: c.level }); }} showText={false} title={getCard(c.cardId).text + (canAttack(st, c) && myTurn ? ' · Click to select as attacker' : '')} /></div>)}
      </div>

      <div class="hero-bar mine">
        <div class="who">{p ? <Portrait avatar={p.avatar} /> : <Portrait avatar="av_knight" />}<div><div class="name">{me.name}</div><div class="sub">{me.faction === 'dawn' ? 'Dawnvigil' : me.faction === 'umbral' ? 'Umbral Court' : 'Unsworn'}</div></div></div>
        <button class={`hero-health ${heroTargetable(myIdx) ? 'targetable' : ''}`} data-tid={`hero:${myIdx}`} aria-label={`Your hero, ${me.health} health`} onClick={() => heroTargetable(myIdx) && pickTarget(`hero:${myIdx}`)}>{me.health}{me.armor > 0 && <span class="armor">{me.armor}</span>}</button>
        <Essence pl={me} />
        <div class="relics">{me.relics.map((rl) => <span key={rl.inst} class="relic-chip" title={getCard(rl.cardId).text} data-tid={rl.inst}>◆ {getCard(rl.cardId).name}{rl.turnsLeft !== undefined ? ` (${rl.turnsLeft})` : ''}</span>)}</div>
        <div class="counts"><span title="Cards in deck">▤ {me.deck.length}</span><span title="Graveyard">☠ {me.graveyard.length}</span></div>
      </div>

      <div class="action-bar">
        {st.winner === null && (isBlockStep ? (
          <>
            <span class="status">{selBlocker ? 'Now click the attacker to block' : 'Click a creature to block with, or take the hit'}</span>
            <button class="btn primary" onClick={confirmBlocks}>{blocks.length ? `Confirm ${blocks.length} block${blocks.length > 1 ? 's' : ''}` : 'No block'}</button>
            {blocks.length > 0 && <button class="btn ghost small" onClick={() => { setBlocks([]); setSelBlocker(null); }}>Clear</button>}
          </>
        ) : (
          <>
            <button class="btn" disabled={!canPlayNow || me.oathUsed || me.essence < RULES.oathCost} onClick={useOath} title={oath.text}>{oath.name} (2)</button>
            {st.phase === 'main1' && <button class="btn umbral" disabled={!myTurn || attackers.length === 0} onClick={declareAttack}>Attack{attackers.length ? ` (${attackers.length})` : ''}</button>}
            <button class="btn primary" disabled={!myTurn || st.phase === 'block'} onClick={endTurn}>End turn</button>
            {r.mode !== 'online' && <button class="btn ghost small" onClick={() => { if (confirm('Concede this match?')) act({ type: 'concede', player: myIdx }); }}>Concede</button>}
            {r.mode === 'online' && <button class="btn ghost small" onClick={() => { if (confirm('Concede this match?')) online.current?.act({ type: 'concede', player: myIdx }); }}>Concede</button>}
            {!myTurn && st.winner === null && <span class="status">{st.phase === 'block' ? 'Waiting for blocks…' : 'Waiting…'}</span>}
          </>
        ))}
        {st.winner !== null && !over && <span class="status">Resolving…</span>}
      </div>

      <div class="hand" aria-label="Your hand">
        {me.hand.map((c) => { const def = getCard(c.cardId); const playable = canPlayNow && def.cost <= me.essence && (def.type !== 'creature' || me.board.length < RULES.maxBoard); return <CardView key={c.inst} cardId={c.cardId} level={c.level} size="m" className={playable ? '' : 'unplayable'} selected={!!targeting && targeting.kind === 'play' && targeting.inst === c.inst} onClick={() => (targeting ? setTargeting(null) : startPlay(c.inst))} tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); startPlay(c.inst); } if (e.key === 'i') setInspect({ cardId: c.cardId, level: c.level }); }} title={playable ? 'Click to play · press i to inspect' : def.cost > me.essence ? 'Not enough essence' : 'Not playable now'} />; })}
        {me.hand.length === 0 && <span class="muted">Your hand is empty.</span>}
      </div>

      {showTut && tut && (
        <div class="hint-box" role="status"><h4>{tut.title}</h4><p>{tut.text}</p><button class="btn small ghost" onClick={() => setTutStep(tutStep + 1)}>Got it</button></div>
      )}
      {inspect && (
        <div class="card-detail" role="dialog" aria-modal="true" onClick={() => setInspect(null)} onKeyDown={(e) => { if (e.key === 'Escape') setInspect(null); }}>
          <div class="inner" onClick={(e) => e.stopPropagation()}><CardView cardId={inspect.cardId} level={inspect.level} size="l" /><div class="info"><h2>{getCard(inspect.cardId).name}</h2><p class="lore">{getCard(inspect.cardId).flavor}</p><button class="btn" onClick={() => setInspect(null)} autoFocus>Close</button></div></div>
        </div>
      )}
      {over && (
        <div class="gameover" role="dialog" aria-modal="true" aria-label="Match over">
          <div class="panel">
            <h1 class={over.result}>{over.result === 'win' ? 'Victory' : over.result === 'loss' ? 'Defeat' : 'Stalemate'}</h1>
            <p class="muted">{over.reason}{over.disputed ? ' · This match was disputed and does not count.' : over.verified === false && r.mode === 'online' ? ' · Opponent did not reveal; result unverified.' : ''}</p>
            <div class="summary">
              <div><b>{st.turn}</b><span>Turns</span></div><div><b>{me.health}</b><span>Your health</span></div><div><b>{me.graveyard.length + en.graveyard.length}</b><span>Cards lost</span></div>
            </div>
            {over.saving && <div class="spinner" />}
            {over.rewards && (over.rewards.cinders > 0 || over.rewards.packs > 0 || over.rewards.ratingDelta !== 0) && (
              <p class="reward-line">{over.rewards.firstClear ? 'Chapter cleared! ' : ''}{over.rewards.cinders > 0 && <>+{over.rewards.cinders} <i class="cinder-icon" /> </>}{over.rewards.packs > 0 && <>+{over.rewards.packs} <i class="pack-icon" /> </>}{over.rewards.ratingDelta !== 0 && <>{over.rewards.ratingDelta > 0 ? '+' : ''}{over.rewards.ratingDelta} rating</>}{over.rewards.unlock && <> · Title unlocked: Sunbearer</>}</p>
            )}
            {!p && <p class="hint">Sign in to keep rewards, progress and a collection.</p>}
            <div class="btn-row" style="justify-content:center">
              {r.mode === 'bot' && <button class="btn primary" onClick={() => navigate({ name: 'campaign' })}>Campaign</button>}
              {r.mode === 'bot' && <button class="btn" onClick={() => { setOver(null); endedRef.current = false; navigate({ name: 'match', mode: 'bot', botId: (r.botId ?? 'pip') + '' }); location.reload(); }}>Rematch</button>}
              {r.mode === 'online' && <button class="btn primary" onClick={() => navigate({ name: 'online' })}>Back to lobby</button>}
              {r.mode === 'tutorial' && <button class="btn primary" onClick={() => navigate(p ? { name: 'home' } : { name: 'auth', mode: 'signup' })}>{p ? 'To the Hall' : 'Create an account'}</button>}
              <button class="btn ghost" onClick={() => navigate(p ? { name: 'home' } : { name: 'title' })}>Home</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
