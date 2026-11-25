'use client';
import { useState, useEffect, useCallback } from 'react';
import { sileo } from 'sileo';
import { getPlayers, getQueue, getHistory, getSplittableItems, createMatch, updateMatchStatus, deleteMatch, proofreadMatch } from '@/lib/api';
import { OfflineUnavailableError } from '@/lib/api';
import { useCapabilityState } from '@/lib/entitlements';
import type { Player, Match, MatchType, Level, CatalogItem } from '@/lib/api';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { useConnectivity } from '@/lib/connectivity';
import { Button } from '@/app/components/ui/Button';
import { LevelMark } from '@/app/components/ui/LevelMark';
import { StatusDot } from '@/app/components/ui/StatusDot';
import { AdminHeader } from '@/app/components/ui/AdminHeader';

const LEVEL_ORDER: Record<Level, number> = { A:0, B:1, C:2, D:3 };
const MATCH_LABELS: Record<MatchType, string> = { MD:'Mens Doubles', WD:'Womens Doubles', XD:'Mixed Doubles' };

interface GeneratedMatch { team1: Player[]; team2: Player[]; matchType: MatchType; }
interface EditingSlot    { side: 'team1'|'team2'; index: number; }

// ── Randomizer ──────────────────────────────────────────────
export type MatchMode = 'balanced' | 'solid';
export type MatchTypePreference = 'auto' | 'MD' | 'WD' | 'XD';

/**
 * Score a team pairing. Lower = better (more balanced).
 * Between-team level balance is heaviest, match-count fairness is secondary,
 * and a small random jitter keeps repeated generates varied.
 */
function scoreCombo(t1: Player[], t2: Player[]): number {
  const t1LevelSum  = LEVEL_ORDER[t1[0].level] + LEVEL_ORDER[t1[1].level];
  const t2LevelSum  = LEVEL_ORDER[t2[0].level] + LEVEL_ORDER[t2[1].level];
  const t1MatchSum  = t1[0].matchCount + t1[1].matchCount;
  const t2MatchSum  = t2[0].matchCount + t2[1].matchCount;

  // Between-team level balance (most important)
  const levelGap    = Math.abs(t1LevelSum - t2LevelSum);
  // Match count fairness (secondary)
  const matchGap    = Math.abs(t1MatchSum - t2MatchSum);
  // Small jitter so identical scores produce varied results
  const jitter      = Math.random() * 0.5;

  return levelGap * 10 + matchGap + jitter;
}

function pickMatchType(
  males: Player[], females: Player[],
  preference: MatchTypePreference
): MatchType | null {
  const possible: MatchType[] = [];
  if (males.length >= 4)                        possible.push('MD');
  if (females.length >= 4)                      possible.push('WD');
  if (males.length >= 2 && females.length >= 2) possible.push('XD');
  if (possible.length === 0) return null;

  if (preference !== 'auto' && possible.includes(preference as MatchType)) {
    return preference as MatchType;
  }
  return possible[Math.floor(Math.random() * possible.length)];
}

/** BALANCED: the two teams' total level sums are as close as possible (A+D vs B+C is fine). */
function generateBalancedMatch(
  players: Player[],
  preference: MatchTypePreference = 'auto'
): GeneratedMatch | null {
  // Sort by match count first so least-played players are prioritised
  const pool    = [...players].sort((a,b) => a.matchCount - b.matchCount || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const males   = pool.filter(p => p.gender === 'Male');
  const females = pool.filter(p => p.gender === 'Female');

  const matchType = pickMatchType(males, females, preference);
  if (!matchType) return null;

  if (matchType === 'XD') {
    // XD: interleave closest levels
    return { team1: [males[0], females[0]], team2: [males[1], females[1]], matchType: 'XD' };
  }

  const candidates = matchType === 'MD' ? males : females;
  if (candidates.length < 4) return null;

  let best: GeneratedMatch | null = null;
  let bestScore = Infinity;

  const top = candidates.slice(0, Math.min(8, candidates.length));
  for (let i = 0; i < top.length - 3; i++)
  for (let j = i + 1; j < top.length - 2; j++)
  for (let k = j + 1; k < top.length - 1; k++)
  for (let l = k + 1; l < top.length; l++) {
    const [p1, p2, p3, p4] = [top[i], top[j], top[k], top[l]];
    for (const [t1, t2] of [
      [[p1,p2],[p3,p4]] as [Player[],Player[]],
      [[p1,p3],[p2,p4]] as [Player[],Player[]],
      [[p1,p4],[p2,p3]] as [Player[],Player[]],
    ]) {
      const score = scoreCombo(t1, t2);
      if (score < bestScore) { bestScore = score; best = { team1: t1, team2: t2, matchType }; }
    }
  }

  return best ?? null;
}

/** SOLID: same-level players grouped together (A+A vs A+A ideal, falls back to adjacent levels). */
function generateSolidMatch(
  players: Player[],
  preference: MatchTypePreference = 'auto'
): GeneratedMatch | null {
  const pool    = [...players].sort((a,b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.matchCount - b.matchCount);
  const males   = pool.filter(p => p.gender === 'Male');
  const females = pool.filter(p => p.gender === 'Female');

  const matchType = pickMatchType(males, females, preference);
  if (!matchType) return null;

  if (matchType === 'XD') {
    const mLevel = males[0].level;
    const sameF  = females.find(f => f.level === mLevel) ?? females[0];
    const sameM2 = males.find(m => m !== males[0] && m.level === sameF.level) ?? males[1];
    const sameF2 = females.find(f => f !== sameF) ?? females[1];
    return { team1: [males[0], sameF], team2: [sameM2, sameF2], matchType: 'XD' };
  }

  const candidates = matchType === 'MD' ? males : females;
  if (candidates.length < 4) return null;

  const byLevel: Record<Level, Player[]> = { A: [], B: [], C: [], D: [] };
  candidates.forEach(p => byLevel[p.level].push(p));

  // 4+ same level → purest solid match
  for (const level of ['A','B','C','D'] as Level[]) {
    if (byLevel[level].length >= 4) {
      const four = byLevel[level].slice(0, 4);
      return { team1: [four[0], four[1]], team2: [four[2], four[3]], matchType };
    }
  }

  // 2+ of two different levels → A+A vs B+B style
  const levels = (['A','B','C','D'] as Level[]).filter(l => byLevel[l].length >= 2);
  if (levels.length >= 2) {
    return {
      team1: [byLevel[levels[0]][0], byLevel[levels[0]][1]],
      team2: [byLevel[levels[1]][0], byLevel[levels[1]][1]],
      matchType,
    };
  }

  // Fallback to balanced
  return generateBalancedMatch(players, preference);
}

/** Entry point */
function generateMatch(
  players: Player[],
  mode: MatchMode,
  preference: MatchTypePreference = 'auto'
): GeneratedMatch | null {
  return mode === 'solid'
    ? generateSolidMatch(players, preference)
    : generateBalancedMatch(players, preference);
}

// ── Small components ──────────────────────────────────────────────────────────
const Chip = ({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) => (
  <button type="button" aria-pressed={on} className={`filter-btn${on ? ' active' : ''}`} onClick={onClick}>{children}</button>
);

// ── Player pill (in generated match) ─────────────────────────────────────────
function PlayerPill({ p, side, index, editingSlot, onEdit }: {
  p: Player; side:'team1'|'team2'; index:number;
  editingSlot: EditingSlot|null; onEdit:(s:EditingSlot)=>void;
}) {
  const active = editingSlot?.side === side && editingSlot?.index === index;
  return (
    <div className={`flex items-center gap-2 pl-3 pr-1 min-h-[44px] rounded-md border bg-[#FBF9F3] min-w-0 transition-colors ${active ? 'border-[#0E2420] shadow-[inset_3px_0_0_#E3A92B]' : 'border-[#C9C3B3]'}`}>
      <LevelMark level={p.level} />
      <span className="flex-1 text-sm font-bold min-w-0 truncate">{p.name}</span>
      <span className="ad-mono ad-muted text-xs shrink-0">{p.matchCount}x</span>
      <Button v="ghost" size="sm" onClick={() => onEdit({ side, index })}>Swap</Button>
    </div>
  );
}

// ── Match card (active queue) ────────────────────────────────────────────────
function MatchCard({ match, index, showActions, onUpdate }: {
  match:Match; index:number; showActions:boolean; onUpdate:()=>void;
}) {
  const { status } = useConnectivity();
  const offline = status !== 'online';
  const offlineTitle = offline ? 'Reconnect to make changes' : undefined;
  const updateStatus = async (nextStatus: Extract<Match['status'], 'playing' | 'done'>) => {
    try {
      await updateMatchStatus(match._id, nextStatus);
      await onUpdate();
    } catch (error) {
      sileo.error({ title: 'Could not update match', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  };
  const remove = async () => {
    if (!confirm('Remove match?')) return;
    try {
      await deleteMatch(match._id);
      await onUpdate();
    } catch (error) {
      sileo.error({ title: 'Could not remove match', description: error instanceof Error ? error.message : 'Please try again.' });
    }
  };
  const team = (list: Player[]) => (
    <div className="flex flex-col gap-0.5">
      {list.map(p => (
        <div key={p._id} className="flex items-center gap-2">
          <LevelMark level={p.level} />
          <span className="text-sm font-bold">{p.name}</span>
        </div>
      ))}
    </div>
  );
  return (
    <div className={`py-4 border-b border-[#E1DBCB] ${match.status === 'playing' ? 'shadow-[inset_3px_0_0_#E3A92B] pl-3' : ''}`}>
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <span className="ad-mono ad-muted text-xs">#{String(index+1).padStart(2,'0')}</span>
        <b className="text-sm">Court {match.court}</b>
        <span className="ad-muted text-sm">{MATCH_LABELS[match.matchType]}</span>
        <span className="ml-auto">
          <StatusDot tone={match.status === 'playing' ? 'wait' : match.status === 'done' ? 'off' : 'ok'}>
            {match.status === 'playing' ? 'Playing' : match.status === 'done' ? 'Done' : 'Queued'}
          </StatusDot>
        </span>
      </div>

      <div className="grid items-center gap-2" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        {team(match.team1)}
        <span className="ad-mono ad-muted text-xs">vs</span>
        {team(match.team2)}
      </div>

      {showActions && (
        <div className="flex gap-2 mt-3 flex-wrap items-center">
          {match.status === 'queued'  && <Button v="primary" className="flex-1 sm:flex-none" onClick={() => updateStatus('playing')} disabled={offline} title={offlineTitle}>Start playing</Button>}
          {match.status === 'playing' && <Button v="primary" className="flex-1 sm:flex-none" onClick={() => updateStatus('done')} disabled={offline} title={offlineTitle}>Done playing</Button>}
          <Button v="danger" className="flex-1 sm:flex-none" onClick={remove} disabled={offline} title={offlineTitle}>Remove…</Button>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function QueuePage() {
  const [players,      setPlayers]      = useState<Player[]>([]);
  const [queueList,    setQueueList]    = useState<Match[]>([]);
  const [historyList,  setHistoryList]  = useState<Match[]>([]);
  const [shuttles,     setShuttles]     = useState<CatalogItem[]>([]);
  const [generated,    setGenerated]    = useState<GeneratedMatch|null>(null);
  const [edited,       setEdited]       = useState<GeneratedMatch|null>(null);
  const [editingSlot,  setEditingSlot]  = useState<EditingSlot|null>(null);
  const [selectedCourt,setSelectedCourt]= useState(1);
  const [shuttlecockId,setShuttlecockId]= useState('');
  const [mobileTab,    setMobileTab]    = useState<'randomizer'|'queue'|'history'>('randomizer');
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState('');
  const [submitting,   setSubmitting]   = useState(false);
  const [matchMode,    setMatchMode]    = useState<MatchMode>('balanced');
  const [matchTypePref,setMatchTypePref]= useState<MatchTypePreference>('auto');
  const [proofread,    setProofread]    = useState<{ verdict: 'fair' | 'review'; explanation: string; aiUsed: boolean } | null>(null);
  const [proofreadBusy,setProofreadBusy]= useState(false);
  const [histCourt,    setHistCourt]    = useState<'all' | number>('all');
  const [histQuery,    setHistQuery]    = useState('');
  const [histLimit,    setHistLimit]    = useState(10);
  const { status } = useConnectivity();
  const offline = status !== 'online';
  const offlineTitle = offline ? 'Reconnect to make changes' : undefined;
  const { status: capabilityStatus, capabilities } = useCapabilityState();
  const canSplitItems = capabilityStatus === 'known' && capabilities?.modules.item_tabs === true;


  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [p, q, h] = await Promise.all([getPlayers(), getQueue(), getHistory()]);
      setPlayers(p); setQueueList(q); setHistoryList(h);
    } catch (error) {
      setPlayers([]); setQueueList([]); setHistoryList([]);
      setLoadError(error instanceof OfflineUnavailableError
        ? 'Not cached yet. Open this page once while online.'
        : 'Could not load queue data.');
      if (!(error instanceof OfflineUnavailableError)) console.error('Could not load queue data.', error);
    } finally {
      setLoading(false);
    }
  }, []);

  // Optional shuttlecock list. A 403 on lower tiers is expected, so it stays quiet.
  const loadShuttles = useCallback(async () => {
    if (!canSplitItems) { setShuttles([]); setShuttlecockId(''); return; }
    try {
      setShuttles(await getSplittableItems());
    } catch (error) {
      setShuttles([]);
      const code = (error as { status?: number } | null)?.status;
      const msg = error instanceof Error ? error.message : '';
      if (code !== 403 && !/not enabled/i.test(msg)) console.error('Could not load splittable items.', error);
    }
  }, [canSplitItems]);


  useEffect(() => { loadAll(); }, [loadAll]);
  useSocketEvent('queue:updated', useCallback(() => { loadAll(); }, [loadAll]));
  useSocketEvent('players:updated', useCallback(() => { loadAll(); }, [loadAll]));
  useSocketEvent('items:updated', useCallback(() => { loadAll(); }, [loadAll]));

  const busyIds   = new Set(queueList.flatMap(m => [...m.team1,...m.team2].map(p=>p._id)));
  const available = players.filter(p => !busyIds.has(p._id));
  const maleCount = available.filter(p => p.gender === 'Male').length;
  const femaleCount = available.filter(p => p.gender === 'Female').length;
  const canGenerate = maleCount >= 4 || femaleCount >= 4 || (maleCount >= 2 && femaleCount >= 2);
  const usedCourts= new Set(queueList.map(m=>m.court));

  const handleGenerate = useCallback(() => {
    const m = generateMatch(available, matchMode, matchTypePref);
    setGenerated(m);
    setEdited(m ? {...m,team1:[...m.team1],team2:[...m.team2]} : null);
    setEditingSlot(null);
    setProofread(null);
  }, [available, matchMode, matchTypePref]);

  const handleSwap = (p: Player) => {
    if (!editingSlot || !edited) return;
    setEdited({ ...edited, [editingSlot.side]: edited[editingSlot.side].map((x,i) => i===editingSlot.index ? p : x) });
    setEditingSlot(null);
  };

  const handleSubmit = async () => {
    if (!edited) return;
    setSubmitting(true);
    try {
      await createMatch({
        team1: edited.team1.map(p=>p._id),
        team2: edited.team2.map(p=>p._id),
        matchType: edited.matchType,
        court: selectedCourt,
        shuttlecockId: canSplitItems 
        ? shuttlecockId || undefined
        : undefined,
      });
      setGenerated(null); setEdited(null); setShuttlecockId('');
      await loadAll();
    } catch (error) {
      sileo.error({ title: 'Could not submit match', description: error instanceof Error ? error.message : 'Please try again.' });
    } finally {
      setSubmitting(false);
    }
  };

  const swapCandidates = editingSlot && edited
    ? players.filter(p => ![...edited.team1,...edited.team2].map(x=>x._id).includes(p._id))
    : [];

  const runProofread = useCallback(async () => {
    if (!edited) return;
    setProofreadBusy(true);
    try {
      const result = await proofreadMatch({
        team1: edited.team1.map((p) => p._id),
        team2: edited.team2.map((p) => p._id),
        matchType: edited.matchType,
      });
      setProofread({
        verdict: result.verdict,
        explanation: result.explanation,
        aiUsed: result.aiUsed,
      });
    } catch {
      setProofread({
        verdict: 'review',
        explanation: 'AI proofread is unavailable right now. You can still proceed with your strict level rules.',
        aiUsed: false,
      });
    } finally {
      setProofreadBusy(false);
    }
  }, [edited]);

  // ── Panels ─────────────────────────────────────────────────────────────────

  const modeChips = (
    <div className="flex gap-2 flex-wrap">
      {(['balanced','solid'] as MatchMode[]).map(mode => (
        <Chip key={mode} on={matchMode === mode} onClick={() => setMatchMode(mode)}>{mode === 'balanced' ? 'Balanced' : 'Solid'}</Chip>
      ))}
    </div>
  );
  const typeChips = (
    <div className="flex gap-2 flex-wrap">
      {(['auto','MD','WD','XD'] as MatchTypePreference[]).map(t => (
        <Chip key={t} on={matchTypePref === t} onClick={() => setMatchTypePref(t)}>{t === 'auto' ? 'Auto' : t}</Chip>
      ))}
    </div>
  );

  const RandomizerPanel = ({ s }: { s: string }) => (
    <div className="flex flex-col gap-8">
      {!generated ? (
        <div>
          <h2 className="text-[17px] font-bold mb-3">Randomizer</h2>
          {modeChips}
          <p className="ad-muted text-sm my-3 max-w-xs">
            {matchMode === 'balanced'
              ? 'Teams are level-balanced. Any pairing is valid if teams are even.'
              : 'Same-level players grouped. A vs A, B vs B, etc.'}
          </p>
          <p className="ad-label">Match type</p>
          <div className="mb-5">{typeChips}</div>
          <Button v="primary" onClick={handleGenerate} disabled={!canGenerate}>
            {available.length < 4
              ? `Need ${4 - available.length} more`
              : !canGenerate
                ? 'Need 2 men + 2 women, or 4 of one gender'
                : 'Generate match'}
          </Button>
        </div>
      ) : edited && (
        <div className="flex flex-col gap-5">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-[17px] font-bold">{MATCH_LABELS[edited.matchType]}</h2>
            <div className="flex items-center gap-2">
              <span className="ad-mono ad-muted text-xs">{matchMode === 'solid' ? 'solid' : 'balanced'}</span>
              <button type="button" className="text-xs underline ad-muted min-h-[44px] px-1" onClick={() => {
                const next: MatchMode = matchMode === 'balanced' ? 'solid' : 'balanced';
                setMatchMode(next);
                setTimeout(() => { setGenerated(null); setEdited(null); setTimeout(handleGenerate, 80); }, 80);
              }}>switch</button>
            </div>
          </div>

          {/* Controls stay visible so the next set can be adjusted */}
          <div className="flex flex-col gap-2">{typeChips}{modeChips}</div>

          {/* Teams: side by side on wide, stacked with a "vs" on narrow */}
          <div className="grid gap-2 grid-cols-1 min-[481px]:grid-cols-[1fr_24px_1fr] items-start">
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="ad-eyebrow">Team A</span>
              {edited.team1.map((p,i) => <PlayerPill key={p._id} p={p} side="team1" index={i} editingSlot={editingSlot} onEdit={setEditingSlot} />)}
            </div>
            <span className="ad-mono ad-muted text-xs text-center pt-6 max-[480px]:pt-0">vs</span>
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="ad-eyebrow">Team B</span>
              {edited.team2.map((p,i) => <PlayerPill key={p._id} p={p} side="team2" index={i} editingSlot={editingSlot} onEdit={setEditingSlot} />)}
            </div>
          </div>

          {/* Swap picker */}
          {editingSlot && swapCandidates.length > 0 && (
            <div className="border-t-2 border-[#0E2420] pt-3">
              <p className="ad-label">Select a replacement</p>
              <div className="flex flex-col gap-1 max-h-44 overflow-y-auto">
                {swapCandidates.map(p => (
                  <button key={p._id} type="button" onClick={() => handleSwap(p)}
                    className="flex items-center gap-2 px-3 min-h-[44px] rounded-md border border-[#C9C3B3] bg-[#FBF9F3] text-left hover:border-[#0E2420] transition-colors">
                    <LevelMark level={p.level} />
                    <span className="flex-1 text-sm">{p.name}</span>
                    <span className="ad-mono ad-muted text-xs">{p.gender==='Male'?'M':'F'} {p.matchCount}x</span>
                  </button>
                ))}
              </div>
              <Button v="ghost" size="sm" className="mt-2" onClick={() => setEditingSlot(null)}>Cancel swap</Button>
            </div>
          )}

          {/* Court selector */}
          <div>
            <p className="ad-label">Court</p>
            <div className="flex gap-2">
              {[1,2,3,4].map(c => (
                <button key={c} type="button" aria-pressed={selectedCourt === c}
                  title={usedCourts.has(c) ? 'A match is already on this court' : undefined}
                  onClick={() => setSelectedCourt(c)}
                  className={`filter-btn flex-1 ad-mono${selectedCourt === c ? ' active' : ''} ${usedCourts.has(c) && selectedCourt !== c ? '!text-[#B8431F] !border-[#B8431F]' : ''}`}>
                  {c}
                </button>
              ))}
            </div>
            {usedCourts.has(selectedCourt) && <p className="ad-error">A match is already on court {selectedCourt}.</p>}
          </div>

          {/* Shuttlecock picker */}
          {canSplitItems && (
            <div>
              <label htmlFor={`q-shuttle-${s}`} className="ad-label">Shuttlecock (optional, splits the fee)</label>
              <select id={`q-shuttle-${s}`} value={shuttlecockId} onChange={e => setShuttlecockId(e.target.value)} className="ad-input">
                <option value="">None — skip split</option>
                {shuttles.map(s => (
                  <option key={s._id} value={s._id}>{s.name} — ₱{s.price} (÷4 = ₱{(s.price/4).toFixed(2)}/player)</option>
                ))}
              </select>
              {shuttlecockId && <p className="text-sm mt-1.5 text-[#1F8A7A]">Will be added to each player’s billing tab.</p>}
            </div>
            )}

            <div className="flex gap-2">
              <Button v="ghost" className="flex-1" onClick={() => { setGenerated(null); setEdited(null); setTimeout(handleGenerate, 80); }}>Re-generate</Button>
              <Button v="primary" className="flex-1" onClick={handleSubmit} loading={submitting} disabled={offline} title={offlineTitle}>
                {submitting ? 'Submitting...' : 'Submit to queue'}
              </Button>
            </div>


          {/* AI proofread */}
          <div className="border-t border-[#C9C3B3] pt-3">
            <div className="flex items-center justify-between mb-2 gap-2">
              <span className="ad-eyebrow">AI match proofread</span>
              <Button v="ghost" size="sm" onClick={runProofread} loading={proofreadBusy} disabled={offline} title={offlineTitle}>
                {proofreadBusy ? 'Checking...' : 'Check fairness'}
              </Button>
            </div>
            {!proofread ? (
              <p className="ad-muted text-sm">Run the proofread to get a fairness explanation for this match.</p>
            ) : (
              <div>
                <p className="mb-1"><StatusDot tone={proofread.verdict === 'fair' ? 'ok' : 'wait'}>
                  <b>{proofread.verdict === 'fair' ? 'Fair' : 'Needs review'}</b>
                </StatusDot></p>
                <p className="text-sm">{proofread.explanation}</p>
                <p className="ad-muted text-xs mt-1">{proofread.aiUsed ? 'AI-assisted review' : 'Heuristic fallback review'}</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Available players */}
      <div>
        <h2 className="text-[17px] font-bold mb-2">Available · {loadError ? '—' : available.length}</h2>
        <div className="flex flex-col max-h-[240px] overflow-y-auto">
          {available.length === 0
            ? <p className="ad-muted text-sm py-3">All players are in active matches.</p>
            : (() => {
                const maxCount = Math.max(...available.map(p => p.matchCount), 1);
                const minCount = Math.min(...available.map(p => p.matchCount));
                return available.map(p => {
                  // Fairness bar: teal = played least, red = played most
                  const pct = maxCount > minCount ? ((p.matchCount - minCount) / (maxCount - minCount)) * 100 : 0;
                  const barColor = pct < 33 ? '#1F8A7A' : pct < 66 ? '#B8821A' : '#C4401F';
                  return (
                    <div key={p._id} className="flex items-center gap-2.5 py-2 border-b border-[#E1DBCB]">
                      <LevelMark level={p.level} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium truncate">{p.name}</span>
                          <span className="ad-mono ad-muted text-xs shrink-0">{p.matchCount}x</span>
                        </div>
                        <div className="h-[3px] bg-[#E1DBCB] rounded mt-1 overflow-hidden">
                          <div className="h-full rounded" style={{ width: `${Math.max(4, pct)}%`, background: barColor }} />
                        </div>
                      </div>
                    </div>
                  );
                });
              })()
          }
        </div>
      </div>
    </div>
  );

  const QueuePanel = () => (
    <div>
      <h2 className="text-[17px] font-bold mb-1">Active · {loadError ? '—' : queueList.length}</h2>
      {loading ? <p className="ad-muted text-sm py-8 text-center">Loading...</p>
        : loadError ? <p className="text-amber-800 text-sm py-8 text-center">{loadError}</p>
        : queueList.length === 0 ? (
          <div className="py-6">
            <p className="font-bold">No matches on court.</p>
            <p className="ad-muted text-sm">Generate a match from the available players.</p>
          </div>
        )
        : queueList.map((m,i) => <MatchCard key={m._id} match={m} index={i} showActions onUpdate={loadAll} />)}
    </div>
  );

  // Completed: compact rows, newest first, filter by court / player, show 10 at a time
  const numbered = historyList.map((m, i) => ({ m, n: historyList.length - i }));
  const q = histQuery.trim().toLowerCase();
  const filteredHistory = numbered.filter(({ m }) =>
    (histCourt === 'all' || m.court === histCourt) &&
    (!q || [...m.team1, ...m.team2].some(p => p.name.toLowerCase().includes(q)))
  );
  const shownHistory = filteredHistory.slice(0, histLimit);
  const timeOf = (m: Match) => new Date(m.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const names = (list: Player[]) => list.map(p => p.name).join(' · ');

  const HistoryPanel = ({ s }: { s: string }) => (
    <div>
      <div className="flex items-center justify-between gap-3 flex-wrap mb-3">
        <h2 className="text-[17px] font-bold">Completed · {loadError ? '—' : historyList.length}</h2>
        <div className="flex gap-2 flex-wrap">
          <Chip on={histCourt === 'all'} onClick={() => { setHistCourt('all'); setHistLimit(10); }}>All</Chip>
          {[1,2,3,4].map(c => <Chip key={c} on={histCourt === c} onClick={() => { setHistCourt(c); setHistLimit(10); }}>C{c}</Chip>)}
        </div>
      </div>
      <div className="max-w-xs mb-3">
        <label htmlFor={`q-find-${s}`} className="ad-label">Find a player</label>
        <input id={`q-find-${s}`} className="ad-input" placeholder="Name" value={histQuery}
          onChange={e => { setHistQuery(e.target.value); setHistLimit(10); }} />
      </div>
      {loading ? <p className="ad-muted text-sm py-8 text-center">Loading...</p>
        : loadError ? <p className="text-amber-800 text-sm py-8 text-center">{loadError}</p>
        : historyList.length === 0 ? <p className="ad-muted text-sm py-6">No completed matches yet.</p>
        : filteredHistory.length === 0 ? <p className="ad-muted text-sm py-6">No matches for these filters.</p>
        : (
          <>
            <div className="hidden sm:block">
              <div className="grid gap-3 border-b-2 border-[#0E2420] py-2" style={{ gridTemplateColumns: '46px 84px 70px 44px 1fr 1fr' }}>
                {['#', 'Ended', 'Court', 'Type', 'Team A', 'Team B'].map(h => <span key={h} className="ad-eyebrow">{h}</span>)}
              </div>
              {shownHistory.map(({ m, n }) => (
                <div key={m._id} className="grid gap-3 items-center py-2 border-b border-[#E1DBCB] text-sm" style={{ gridTemplateColumns: '46px 84px 70px 44px 1fr 1fr' }}>
                  <span className="ad-mono ad-muted text-xs">#{String(n).padStart(2,'0')}</span>
                  <span className="ad-mono text-xs">{timeOf(m)}</span>
                  <span>Court {m.court}</span>
                  <span className="ad-mono text-xs">{m.matchType}</span>
                  <span className="truncate" title={names(m.team1)}>{names(m.team1)}</span>
                  <span className="truncate" title={names(m.team2)}>{names(m.team2)}</span>
                </div>
              ))}
            </div>
            <div className="sm:hidden">
              {shownHistory.map(({ m, n }) => (
                <div key={m._id} className="py-2.5 border-b border-[#E1DBCB]">
                  <p className="ad-mono ad-muted text-xs mb-0.5">#{String(n).padStart(2,'0')} · {timeOf(m)} · Court {m.court} · {m.matchType}</p>
                  <p className="text-sm">{names(m.team1)} <span className="ad-muted">vs</span> {names(m.team2)}</p>
                </div>
              ))}
            </div>
            {filteredHistory.length > shownHistory.length && (
              <Button v="ghost" className="mt-3" onClick={() => setHistLimit(l => l + 10)}>
                Show {Math.min(10, filteredHistory.length - shownHistory.length)} more
              </Button>
            )}
          </>
        )}
    </div>
  );

  return (
    <div className="w-full">
      <AdminHeader title="Queue" />
      {loadError && <p role="status" className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{loadError}</p>}

      {/* Desktop: controls on the left, active + completed on the right */}
      <div className="hidden min-[901px]:grid gap-10 items-start" style={{ gridTemplateColumns: '300px minmax(0,1fr)' }}>
        <RandomizerPanel s="d" />
        <div className="flex flex-col gap-10 min-w-0">
          <QueuePanel />
          <HistoryPanel s="d" />
        </div>
      </div>

      {/* Mobile tabs */}
      <div className="min-[901px]:hidden">
        <div className="flex gap-2 mb-5 flex-wrap">
          {(['randomizer','queue','history'] as const).map(t => (
            <Chip key={t} on={mobileTab === t} onClick={() => setMobileTab(t)}>{t.charAt(0).toUpperCase()+t.slice(1)}</Chip>
          ))}
        </div>
        {mobileTab==='randomizer' && <RandomizerPanel s="m" />}
        {mobileTab==='queue'      && <QueuePanel />}
        {mobileTab==='history'    && <HistoryPanel s="m" />}
      </div>
    </div>
  );
}
