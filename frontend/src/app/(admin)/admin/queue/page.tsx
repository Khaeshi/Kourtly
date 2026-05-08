'use client';
import { useState, useEffect, useCallback } from 'react';
import { getPlayers, getQueue, getHistory, getSplittableItems, createMatch, updateMatch, deleteMatch, proofreadMatch } from '@/lib/api';
import type { Player, Match, MatchType, Level, CatalogItem } from '@/lib/api';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { OfflineQueuedError } from '@/lib/offlineOutbox';

const LEVEL_ORDER: Record<Level, number> = { A:0, B:1, C:2, D:3 };
const LEVEL_COLOR: Record<Level, string>  = { A:'#d97706', B:'#16a34a', C:'#0891b2', D:'#7c3aed' };
const MATCH_LABELS: Record<MatchType, string> = { MD:'Mens Doubles', WD:'Womens Doubles', XD:'Mixed Doubles' };

interface GeneratedMatch { team1: Player[]; team2: Player[]; matchType: MatchType; }
interface EditingSlot    { side: 'team1'|'team2'; index: number; }

// ── Randomizer ────────────────────────────────────────────────────────────────

export type MatchMode = 'balanced' | 'solid';
export type MatchTypePreference = 'auto' | 'MD' | 'WD' | 'XD';

// ── Scoring helpers ───────────────────────────────────────────────────────────

/**
 * Score a team pairing. Lower = better (more balanced).
 *
 * BALANCED scoring philosophy:
 *   - The two teams should be as close in total level as possible → heaviest weight
 *   - Within each team, having similar levels is preferred but NOT enforced
 *     so A+D vs B+C is allowed — both teams are level-sum 3, perfectly balanced
 *   - Match count fairness (who's played least) is secondary
 *   - A small random jitter introduces variety so the same match isn't always generated
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

/**
 * BALANCED match:
 * Finds the combo where the two teams' total level sums are as close as possible.
 * All pairings (A+D vs B+C, B+C vs B+C, A+B vs C+D, etc.) are valid candidates —
 * the score simply picks whichever produces the most even match.
 * Small random jitter ensures variety across repeated generates.
 */
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

/**
 * SOLID match — same-level players grouped together.
 * A+A vs A+A is the ideal; falls back to adjacent levels when unavailable.
 * Examples: all-B, all-C, A+A vs B+B, B+B vs C+C, etc.
 */
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
const Btn = ({ v='ghost', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { v?:'primary'|'ghost'|'danger'|'gold' }) => {
  const map = {
    primary: { bg:'#f0fdf4', border:'#bbf7d0', color:'#15803d' },
    ghost:   { bg:'#fff',    border:'#e5e7eb', color:'#6b7280' },
    danger:  { bg:'#fef2f2', border:'#fecaca', color:'#dc2626' },
    gold:    { bg:'#fffbeb', border:'#fde68a', color:'#92400e' },
  };
  const s = map[v];
  return <button {...props} style={{ background:s.bg, border:`1px solid ${s.border}`, color:s.color, padding:'0.4rem 0.85rem', borderRadius:'6px', fontSize:'0.78rem', fontWeight:500, cursor:'pointer', fontFamily:"'Inter',sans-serif", transition:'all 0.12s', ...props.style }}>{children}</button>;
};

function LevelBadge({ level }: { level: string }) {
  const color = LEVEL_COLOR[level as Level] ?? '#6b7280';
  return <span style={{ background:`${color}18`, color, fontFamily:'monospace', fontSize:'0.65rem', fontWeight:700, padding:'0.15rem 0.4rem', borderRadius:'4px' }}>{level}</span>;
}

// ── Player pill (in generated match) ─────────────────────────────────────────
function PlayerPill({ p, side, index, editingSlot, onEdit }: {
  p: Player; side:'team1'|'team2'; index:number;
  editingSlot: EditingSlot|null; onEdit:(s:EditingSlot)=>void;
}) {
  const active = editingSlot?.side === side && editingSlot?.index === index;
  return (
    <div style={{ display:'flex', alignItems:'center', gap:'0.35rem', padding:'0.45rem 0.6rem', background: active ? '#f0fdf4' : '#fafafa', border:`1px solid ${active ? '#bbf7d0' : '#e5e7eb'}`, borderRadius:'6px', transition:'all 0.12s', minWidth:0 }}>
      <LevelBadge level={p.level} />
      <span style={{ flex:1, fontSize:'0.78rem', fontWeight:500, color:'#374151', minWidth:0, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
      <span style={{ fontSize:'0.62rem', color:'#9ca3af', flexShrink:0 }}>{p.matchCount}x</span>
      <Btn v="ghost" style={{ padding:'0.15rem 0.4rem', fontSize:'0.65rem', flexShrink:0 }} onClick={() => onEdit({ side, index })}>swap</Btn>
    </div>
  );
}

// ── Match card (queue/history) ────────────────────────────────────────────────
function MatchCard({ match, index, showActions, onUpdate }: {
  match:Match; index:number; showActions:boolean; onUpdate:()=>void;
}) {
  const isPendingSync = match._id.startsWith('offline-');
  return (
    <div style={{ background:'#fff', border:`1px solid ${match.status==='playing'?'#fde68a':'#e5e7eb'}`, borderRadius:'8px', padding:'1rem', transition:'border-color 0.15s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:'0.5rem', marginBottom:'0.75rem', flexWrap:'wrap' }}>
        <span style={{ fontFamily:'monospace', fontSize:'0.65rem', color:'#9ca3af' }}>#{String(index+1).padStart(2,'0')}</span>
        <span style={{ fontSize:'0.7rem', fontWeight:600, background:'#f3f4f6', color:'#374151', padding:'0.15rem 0.5rem', borderRadius:'3px' }}>Court {match.court}</span>
        <span style={{ fontSize:'0.7rem', color:'#6b7280' }}>{MATCH_LABELS[match.matchType]}</span>
        {isPendingSync && (
          <span style={{ fontSize:'0.65rem', fontWeight:700, color:'#d97706', background:'#fffbeb', border:'1px solid #fde68a', padding:'0.15rem 0.45rem', borderRadius:'4px', fontFamily:'monospace' }}>
            pending sync
          </span>
        )}
        <span style={{ marginLeft:'auto', fontSize:'0.68rem', fontWeight:600, color: match.status==='playing'?'#d97706': match.status==='done'?'#9ca3af':'#16a34a', textTransform:'uppercase', letterSpacing:'0.06em' }}>
          {match.status}
        </span>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr auto 1fr', gap:'0.4rem', alignItems:'center' }}>
        <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
          {match.team1.map(p => (
            <div key={p._id} style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
              <LevelBadge level={p.level} />
              <span style={{ fontSize:'0.8rem', color:'#374151', fontWeight:500 }}>{p.name}</span>
            </div>
          ))}
        </div>
        <span style={{ fontFamily:'monospace', fontSize:'0.65rem', color:'#d1d5db', padding:'0 0.4rem' }}>vs</span>
        <div style={{ display:'flex', flexDirection:'column', gap:'3px' }}>
          {match.team2.map(p => (
            <div key={p._id} style={{ display:'flex', alignItems:'center', gap:'0.35rem' }}>
              <LevelBadge level={p.level} />
              <span style={{ fontSize:'0.8rem', color:'#374151', fontWeight:500 }}>{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {showActions && (
        <div style={{ display:'flex', gap:'6px', marginTop:'0.75rem', paddingTop:'0.75rem', borderTop:'1px solid #f3f4f6' }}>
          {match.status === 'queued' && (
            <Btn
              v="gold"
              onClick={async () => {
                try {
                  await updateMatch(match._id, { status: 'playing' });
                  onUpdate();
                } catch (err) {
                  if (err instanceof OfflineQueuedError) {
                    onUpdate();
                  } else {
                    alert(err instanceof Error ? err.message : 'Failed to update.');
                  }
                }
              }}
              disabled={isPendingSync}
              style={{ opacity: isPendingSync ? 0.5 : 1 }}
            >
              Mark Playing
            </Btn>
          )}
          {match.status === 'playing' && (
            <Btn
              v="primary"
              onClick={async () => {
                try {
                  await updateMatch(match._id, { status: 'done' });
                  onUpdate();
                } catch (err) {
                  if (err instanceof OfflineQueuedError) {
                    onUpdate();
                  } else {
                    alert(err instanceof Error ? err.message : 'Failed to update.');
                  }
                }
              }}
              disabled={isPendingSync}
              style={{ opacity: isPendingSync ? 0.5 : 1 }}
            >
              Mark Done
            </Btn>
          )}
          <Btn
            v="danger"
            onClick={async () => {
              if (!confirm('Remove match?')) return;
              try {
                await deleteMatch(match._id);
                onUpdate();
              } catch (err) {
                if (err instanceof OfflineQueuedError) {
                  onUpdate();
                } else {
                  alert(err instanceof Error ? err.message : 'Failed to remove.');
                }
              }
            }}
            disabled={isPendingSync}
            style={{ opacity: isPendingSync ? 0.5 : 1 }}
          >
            Remove
          </Btn>
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
  const [submitting,   setSubmitting]   = useState(false);
  const [matchMode,    setMatchMode]    = useState<MatchMode>('balanced');
  const [matchTypePref,setMatchTypePref]= useState<MatchTypePreference>('auto');
  const [proofread,    setProofread]    = useState<{ verdict: 'fair' | 'review'; explanation: string; aiUsed: boolean } | null>(null);
  const [proofreadBusy,setProofreadBusy]= useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [p,q,h,s] = await Promise.all([getPlayers(),getQueue(),getHistory(),getSplittableItems()]);
    setPlayers(p); setQueueList(q); setHistoryList(h); setShuttles(s); setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);
  useSocketEvent('queue:updated', useCallback(() => { loadAll(); }, [loadAll]));
  useSocketEvent('players:updated', useCallback(() => { loadAll(); }, [loadAll]));
  useSocketEvent('items:updated', useCallback(() => { loadAll(); }, [loadAll]));

  const busyIds   = new Set(queueList.flatMap(m => [...m.team1,...m.team2].map(p=>p._id)));
  const available = players.filter(p => !busyIds.has(p._id));
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
        shuttlecockId: shuttlecockId || undefined,
      });
      setGenerated(null); setEdited(null); setShuttlecockId('');
      await loadAll();
    } catch (err) {
      if (err instanceof OfflineQueuedError) {
        // Optimistic UI: show a local "pending sync" match immediately.
        const tmp: Match = {
          _id: `offline-${err.outboxId}`,
          team1: edited.team1,
          team2: edited.team2,
          matchType: edited.matchType,
          court: selectedCourt,
          status: 'queued',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        setQueueList((q) => [tmp, ...q]);
        setGenerated(null); setEdited(null); setShuttlecockId('');
      } else {
        alert(err instanceof Error ? err.message : 'Failed to submit match.');
      }
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

  const RandomizerPanel = () => (
    <div style={{ display:'flex', flexDirection:'column', gap:'0.85rem' }}>
      {!generated ? (
        <div style={{ background:'#fff', border:'1px dashed #e5e7eb', borderRadius:'8px', padding:'2rem', textAlign:'center', display:'flex', flexDirection:'column', alignItems:'center', gap:'0.85rem' }}>
          <p style={{ fontSize:'0.65rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#9ca3af' }}>Randomizer</p>

          {/* Mode toggle */}
          <div style={{ display:'flex', gap:'2px', background:'#f3f4f6', padding:'3px', borderRadius:'8px' }}>
            {(['balanced','solid'] as MatchMode[]).map(mode => (
              <button key={mode} onClick={() => setMatchMode(mode)} style={{
                padding:'0.35rem 0.85rem', borderRadius:'6px', fontSize:'0.75rem', fontWeight:600,
                border:'none', cursor:'pointer', transition:'all 0.15s',
                background: matchMode === mode ? '#fff' : 'transparent',
                color: matchMode === mode ? (mode === 'solid' ? '#92400e' : '#15803d') : '#9ca3af',
                boxShadow: matchMode === mode ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
              }}>
                {mode === 'balanced' ? '⚖ Balanced' : '🔥 Solid'}
              </button>
            ))}
          </div>

          <p style={{ fontSize:'0.78rem', color:'#9ca3af', maxWidth:'220px', lineHeight:1.6 }}>
            {matchMode === 'balanced'
              ? 'Teams are level-balanced. Any pairing is valid if teams are even.'
              : 'Same-level players grouped. A vs A, B vs B, etc.'}
          </p>

          {/* Match type preference */}
          <div style={{ width:'100%' }}>
            <p style={{ fontSize:'0.62rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#d1d5db', marginBottom:'0.4rem', textAlign:'center' }}>Match Type</p>
            <div style={{ display:'flex', gap:'4px', justifyContent:'center' }}>
              {(['auto','MD','WD','XD'] as MatchTypePreference[]).map(t => (
                <button key={t} onClick={() => setMatchTypePref(t)} style={{
                  padding:'0.3rem 0.7rem', borderRadius:'5px', fontSize:'0.72rem', fontWeight:600,
                  border:`1px solid ${matchTypePref === t ? '#bbf7d0' : '#e5e7eb'}`,
                  background: matchTypePref === t ? '#f0fdf4' : '#fff',
                  color: matchTypePref === t ? '#15803d' : '#9ca3af',
                  cursor:'pointer', transition:'all 0.12s',
                }}>
                  {t === 'auto' ? 'Auto' : t}
                </button>
              ))}
            </div>
          </div>

          <Btn v="primary" onClick={handleGenerate} disabled={available.length < 4} style={{ opacity: available.length < 4 ? 0.4 : 1 }}>
            {available.length < 4 ? `Need ${4-available.length} more` : 'Generate Match'}
          </Btn>
        </div>
      ) : edited && (
        <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'1rem', display:'flex', flexDirection:'column', gap:'0.85rem' }}>
          {/* Match type label + mode indicator */}
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:'0.35rem' }}>
            <span style={{ fontSize:'0.7rem', fontWeight:600, letterSpacing:'0.08em', textTransform:'uppercase', color:'#9ca3af' }}>{MATCH_LABELS[edited.matchType]}</span>
            <div style={{ display:'flex', alignItems:'center', gap:'0.5rem' }}>
              <span style={{ fontFamily:'monospace', fontSize:'0.65rem', color: matchMode === 'solid' ? '#d97706' : '#16a34a' }}>
                {matchMode === 'solid' ? '🔥 solid' : '⚖ balanced'}
              </span>
              <button onClick={() => {
                const next: MatchMode = matchMode === 'balanced' ? 'solid' : 'balanced';
                setMatchMode(next);
                setTimeout(() => { setGenerated(null); setEdited(null); setTimeout(handleGenerate, 80); }, 80);
              }} style={{ fontSize:'0.65rem', color:'#9ca3af', background:'none', border:'none', cursor:'pointer', textDecoration:'underline', padding:0 }}>
                switch
              </button>
            </div>
          </div>

          {/* Match type + mode controls — visible after generate so next set can be adjusted */}
          <div style={{ display:'flex', gap:'6px', alignItems:'center', flexWrap:'wrap' }}>
            {/* Match type buttons */}
            <div style={{ display:'flex', gap:'3px', background:'#f9fafb', padding:'2px', borderRadius:'6px' }}>
              {(['auto','MD','WD','XD'] as MatchTypePreference[]).map(t => (
                <button key={t} onClick={() => setMatchTypePref(t)} style={{
                  padding:'0.2rem 0.55rem', borderRadius:'4px', fontSize:'0.68rem', fontWeight:600,
                  border:'none', cursor:'pointer', transition:'all 0.12s',
                  background: matchTypePref === t ? '#fff' : 'transparent',
                  color: matchTypePref === t ? '#15803d' : '#9ca3af',
                  boxShadow: matchTypePref === t ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}>
                  {t === 'auto' ? 'Auto' : t}
                </button>
              ))}
            </div>
            {/* Balanced / Solid toggle */}
            <div style={{ display:'flex', gap:'2px', background:'#f9fafb', padding:'2px', borderRadius:'6px' }}>
              {(['balanced','solid'] as MatchMode[]).map(mode => (
                <button key={mode} onClick={() => setMatchMode(mode)} style={{
                  padding:'0.2rem 0.55rem', borderRadius:'4px', fontSize:'0.68rem', fontWeight:600,
                  border:'none', cursor:'pointer', transition:'all 0.12s',
                  background: matchMode === mode ? '#fff' : 'transparent',
                  color: matchMode === mode ? (mode === 'solid' ? '#92400e' : '#15803d') : '#9ca3af',
                  boxShadow: matchMode === mode ? '0 1px 2px rgba(0,0,0,0.06)' : 'none',
                }}>
                  {mode === 'balanced' ? '⚖' : '🔥'}
                </button>
              ))}
            </div>
          </div>

          {/* Teams — responsive: side-by-side on desktop, stacked on mobile */}
          <style>{`
            .teams-grid { display: grid; grid-template-columns: 1fr 20px 1fr; gap: 0.4rem; align-items: start; }
            @media (max-width: 480px) {
              .teams-grid { grid-template-columns: 1fr; }
              .teams-vs    { display: none !important; }
              .teams-b-label::before { content: 'vs  '; color: #d1d5db; }
            }
          `}</style>
          <div className="teams-grid">
            <div style={{ display:'flex', flexDirection:'column', gap:'5px', minWidth:0 }}>
              <span style={{ fontSize:'0.62rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#d1d5db', marginBottom:'1px' }}>Team A</span>
              {edited.team1.map((p,i) => <PlayerPill key={p._id} p={p} side="team1" index={i} editingSlot={editingSlot} onEdit={setEditingSlot} />)}
            </div>
            <div className="teams-vs" style={{ display:'flex', alignItems:'center', justifyContent:'center', paddingTop:'1.4rem' }}>
              <span style={{ fontFamily:'monospace', fontSize:'0.65rem', color:'#d1d5db' }}>vs</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:'5px', minWidth:0 }}>
              <span className="teams-b-label" style={{ fontSize:'0.62rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#d1d5db', marginBottom:'1px' }}>Team B</span>
              {edited.team2.map((p,i) => <PlayerPill key={p._id} p={p} side="team2" index={i} editingSlot={editingSlot} onEdit={setEditingSlot} />)}
            </div>
          </div>

          {/* Swap picker */}
          {editingSlot && swapCandidates.length > 0 && (
            <div style={{ background:'#f9fafb', border:'1px solid #e5e7eb', borderRadius:'6px', padding:'0.65rem' }}>
              <p style={{ fontSize:'0.65rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#9ca3af', marginBottom:'0.5rem' }}>Select replacement</p>
              <div style={{ display:'flex', flexDirection:'column', gap:'3px', maxHeight:'160px', overflowY:'auto' }}>
                {swapCandidates.map(p => (
                  <button key={p._id} onClick={() => handleSwap(p)} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.4rem 0.6rem', background:'#fff', border:'1px solid #e5e7eb', borderRadius:'5px', cursor:'pointer', textAlign:'left', transition:'border-color 0.1s', fontFamily:"'Inter',sans-serif" }}
                    onMouseOver={e => (e.currentTarget.style.borderColor='#bbf7d0')}
                    onMouseOut={e => (e.currentTarget.style.borderColor='#e5e7eb')}>
                    <LevelBadge level={p.level} />
                    <span style={{ flex:1, fontSize:'0.8rem', color:'#374151' }}>{p.name}</span>
                    <span style={{ fontSize:'0.65rem', color:'#9ca3af' }}>{p.gender==='Male'?'M':'F'} {p.matchCount}x</span>
                  </button>
                ))}
              </div>
              <Btn v="ghost" style={{ marginTop:'0.4rem', fontSize:'0.7rem' }} onClick={() => setEditingSlot(null)}>Cancel</Btn>
            </div>
          )}

          {/* Court selector */}
          <div>
            <p style={{ fontSize:'0.65rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#9ca3af', marginBottom:'0.4rem' }}>Court</p>
            <div style={{ display:'flex', gap:'5px' }}>
              {[1,2,3,4].map(c => (
                <button key={c} onClick={() => setSelectedCourt(c)} style={{
                  flex:1, padding:'0.45rem', borderRadius:'6px', cursor:'pointer', fontFamily:'monospace', fontSize:'0.8rem', transition:'all 0.12s',
                  border:`1px solid ${selectedCourt===c?'#bbf7d0':usedCourts.has(c)?'#fecaca':'#e5e7eb'}`,
                  background: selectedCourt===c?'#f0fdf4':usedCourts.has(c)?'#fef2f2':'#fff',
                  color: selectedCourt===c?'#15803d':usedCourts.has(c)?'#dc2626':'#374151',
                  fontWeight: selectedCourt===c?600:400,
                }}>{c}</button>
              ))}
            </div>
          </div>

          {/* Shuttlecock picker */}
          <div>
            <p style={{ fontSize:'0.65rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#9ca3af', marginBottom:'0.4rem' }}>
              Shuttlecock <span style={{ color:'#d1d5db', fontWeight:400 }}>(optional — auto-splits fee)</span>
            </p>
            <select value={shuttlecockId} onChange={e => setShuttlecockId(e.target.value)} style={{ width:'100%', background:'#fff', border:'1px solid #e5e7eb', borderRadius:'6px', padding:'0.45rem 0.65rem', fontSize:'0.82rem', color: shuttlecockId ? '#111827' : '#9ca3af', outline:'none', fontFamily:"'Inter',sans-serif" }}>
              <option value="">None — skip split</option>
              {shuttles.map(s => (
                <option key={s._id} value={s._id}>{s.name} — ₱{s.price} (÷4 = ₱{(s.price/4).toFixed(2)}/player)</option>
              ))}
            </select>
            {shuttlecockId && (
              <p style={{ fontSize:'0.72rem', color:'#16a34a', marginTop:'0.3rem' }}>
                ✓ Will auto-add to each player's billing tab
              </p>
            )}
          </div>

          {/* Submit */}
          <div style={{ display:'flex', gap:'6px', paddingTop:'0.25rem' }}>
            <Btn v="ghost" style={{ flex:1 }} onClick={() => { setGenerated(null); setEdited(null); setTimeout(handleGenerate, 80); }}>Re-generate</Btn>
            <Btn v="gold"  style={{ flex:1 }} onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit to Queue'}
            </Btn>
          </div>

          <div style={{ border:'1px solid #e5e7eb', borderRadius:'8px', padding:'0.75rem', background:'#fcfcfc' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'0.45rem' }}>
              <span style={{ fontSize:'0.65rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#9ca3af' }}>
                AI Match Proofread
              </span>
              <Btn v="ghost" onClick={runProofread} disabled={proofreadBusy} style={{ padding:'0.2rem 0.5rem', fontSize:'0.68rem' }}>
                {proofreadBusy ? 'Checking...' : 'Check Fairness'}
              </Btn>
            </div>
            {!proofread ? (
              <p style={{ fontSize:'0.75rem', color:'#9ca3af' }}>Run proofread to get a fairness explanation for this generated match.</p>
            ) : (
              <div>
                <p style={{ fontSize:'0.72rem', fontWeight:600, color: proofread.verdict === 'fair' ? '#16a34a' : '#d97706', marginBottom:'0.3rem' }}>
                  Verdict: {proofread.verdict === 'fair' ? 'Fair' : 'Needs Review'}
                </p>
                <p style={{ fontSize:'0.76rem', color:'#4b5563', lineHeight:1.45 }}>{proofread.explanation}</p>
                <p style={{ fontSize:'0.65rem', color:'#9ca3af', marginTop:'0.35rem' }}>
                  {proofread.aiUsed ? 'AI-assisted review' : 'Heuristic fallback review'}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Available players */}
      <div style={{ background:'#fff', border:'1px solid #e5e7eb', borderRadius:'8px', padding:'0.85rem' }}>
        <p style={{ fontSize:'0.65rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#9ca3af', marginBottom:'0.6rem' }}>Available · {available.length}</p>
        <div style={{ display:'flex', flexDirection:'column', gap:'2px', maxHeight:'200px', overflowY:'auto' }}>
          {available.length === 0
            ? <p style={{ fontSize:'0.78rem', color:'#9ca3af', textAlign:'center', padding:'0.75rem' }}>All players in active matches</p>
            : (() => {
                const maxCount = Math.max(...available.map(p => p.matchCount), 1);
                const minCount = Math.min(...available.map(p => p.matchCount));
                return available.map(p => {
                  // Fairness bar: green = played least, red = played most
                  const pct = maxCount > minCount ? ((p.matchCount - minCount) / (maxCount - minCount)) * 100 : 0;
                  const barColor = pct < 33 ? '#16a34a' : pct < 66 ? '#d97706' : '#ef4444';
                  return (
                    <div key={p._id} style={{ display:'flex', alignItems:'center', gap:'0.5rem', padding:'0.3rem 0.4rem' }}>
                      <LevelBadge level={p.level} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:'0.25rem' }}>
                          <span style={{ fontSize:'0.8rem', color:'#374151', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{p.name}</span>
                          <span style={{ fontSize:'0.62rem', color:'#9ca3af', fontFamily:'monospace', flexShrink:0 }}>{p.matchCount}x</span>
                        </div>
                        {/* Fairness bar */}
                        <div style={{ height:'2px', background:'#f3f4f6', borderRadius:'2px', marginTop:'2px', overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${Math.max(4, pct)}%`, background: barColor, borderRadius:'2px', transition:'width 0.3s' }} />
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
    <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
      <p style={{ fontSize:'0.65rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#9ca3af' }}>Active · {queueList.length}</p>
      {loading ? <p style={{ color:'#9ca3af', fontSize:'0.82rem', padding:'2rem', textAlign:'center' }}>Loading...</p>
        : queueList.length === 0 ? <p style={{ color:'#9ca3af', fontSize:'0.82rem', padding:'2rem', textAlign:'center', background:'#fff', border:'1px dashed #e5e7eb', borderRadius:'8px' }}>No active matches.</p>
        : queueList.map((m,i) => <MatchCard key={m._id} match={m} index={i} showActions onUpdate={loadAll} />)}
    </div>
  );

  const HistoryPanel = () => (
    <div style={{ display:'flex', flexDirection:'column', gap:'0.6rem' }}>
      <p style={{ fontSize:'0.65rem', fontWeight:600, letterSpacing:'0.1em', textTransform:'uppercase', color:'#9ca3af' }}>Completed · {historyList.length}</p>
      {loading ? <p style={{ color:'#9ca3af', fontSize:'0.82rem', padding:'2rem', textAlign:'center' }}>Loading...</p>
        : historyList.length === 0 ? <p style={{ color:'#9ca3af', fontSize:'0.82rem', padding:'2rem', textAlign:'center', background:'#fff', border:'1px dashed #e5e7eb', borderRadius:'8px' }}>No completed matches yet.</p>
        : historyList.map((m,i) => (
            <div key={m._id} style={{ opacity:0.7 }}>
              <MatchCard match={m} index={historyList.length-1-i} showActions={false} onUpdate={loadAll} />
              <p style={{ fontSize:'0.65rem', color:'#9ca3af', marginTop:'3px', paddingLeft:'0.25rem', fontFamily:'monospace' }}>
                {new Date(m.updatedAt).toLocaleString()}
              </p>
            </div>
          ))
      }
    </div>
  );

  return (
    <div className="queue-root" style={{ fontFamily:"'Inter',sans-serif" }}>
      <style>{`
        .queue-desktop { display: grid; }
        .queue-mob-tabs { display: none; }
        .queue-mob-content { display: none; }
        @media (max-width: 900px) {
          .queue-desktop { display: none !important; }
          .queue-mob-tabs { display: flex !important; }
          .queue-mob-content { display: block !important; }
        }
        .mob-tab { flex:1; padding:0.55rem; background:transparent; border:none; border-bottom:2px solid transparent; font-size:0.78rem; font-weight:500; cursor:pointer; font-family:'Inter',sans-serif; color:#6b7280; transition:all 0.12s; }
        .mob-tab.active { color:#111827; border-bottom-color:#111827; }
        /* Prevent horizontal swipe-back gesture in fullscreen */
        .queue-root { touch-action: pan-y; overscroll-behavior-x: none; }
      `}</style>

      <div style={{ marginBottom:'1.5rem', paddingBottom:'1.25rem', borderBottom:'1px solid #f3f4f6' }}>
        <p style={{ fontSize:'0.72rem', fontWeight:500, letterSpacing:'0.05em', textTransform:'uppercase', color:'#9ca3af', marginBottom:'0.35rem' }}>Management</p>
        <h1 style={{ fontSize:'1.5rem', fontWeight:700, color:'#111827', letterSpacing:'-0.02em' }}>Queue System</h1>
      </div>

      {/* Desktop 3-col */}
      <div className="queue-desktop" style={{ gridTemplateColumns:'300px 1fr 1fr', gap:'1.25rem', alignItems:'start' }}>
        <RandomizerPanel />
        <QueuePanel />
        <HistoryPanel />
      </div>

      {/* Mobile tabs */}
      <div className="queue-mob-tabs" style={{ borderBottom:'1px solid #e5e7eb', marginBottom:'1.25rem' }}>
        {(['randomizer','queue','history'] as const).map(t => (
          <button key={t} className={`mob-tab${mobileTab===t?' active':''}`} onClick={() => setMobileTab(t)}>
            {t.charAt(0).toUpperCase()+t.slice(1)}
          </button>
        ))}
      </div>
      <div className="queue-mob-content">
        {mobileTab==='randomizer' && <RandomizerPanel />}
        {mobileTab==='queue'      && <QueuePanel />}
        {mobileTab==='history'    && <HistoryPanel />}
      </div>
    </div>
  );
}