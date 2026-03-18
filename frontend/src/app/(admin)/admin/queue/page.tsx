'use client';
import { useState, useEffect, useCallback } from 'react';
import { getPlayers, getQueue, getHistory, deleteHistory, getSplittableItems, createMatch, updateMatch, deleteMatch } from '@/lib/api';
import type { Player, Match, MatchType, Level, CatalogItem } from '@/lib/api';
import { Button } from '@/app/components/ui/Button'
import { sileo } from 'sileo'

const LEVEL_ORDER: Record<Level, number> = { A: 0, B: 1, C: 2, D: 3 };
const LEVEL_COLOR: Record<Level, string>  = { A: '#d97706', B: '#16a34a', C: '#0891b2', D: '#7c3aed' };
const MATCH_LABELS: Record<MatchType, string> = { MD: 'Mens Doubles', WD: 'Womens Doubles', XD: 'Mixed Doubles' };

interface GeneratedMatch { team1: Player[]; team2: Player[]; matchType: MatchType; }
interface EditingSlot    { side: 'team1' | 'team2'; index: number; }

// ── Randomizer logic ──────────────────────────────────────────────────────────
function generateFairMatch(players: Player[]): GeneratedMatch | null {
  const pool    = [...players].sort((a, b) => a.matchCount - b.matchCount || LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level]);
  const males   = pool.filter(p => p.gender === 'Male');
  const females = pool.filter(p => p.gender === 'Female');
  const possible: MatchType[] = [];
  if (males.length >= 4)                            possible.push('MD');
  if (females.length >= 4)                          possible.push('WD');
  if (males.length >= 2 && females.length >= 2)     possible.push('XD');
  if (possible.length === 0) return null;

  const matchType = possible[Math.floor(Math.random() * possible.length)];
  if (matchType === 'XD') return { team1: [males[0], females[0]], team2: [males[1], females[1]], matchType: 'XD' };

  const candidates = matchType === 'MD' ? males : females;
  if (candidates.length < 4) return null;
  const top = candidates.slice(0, Math.min(8, candidates.length));
  let best: GeneratedMatch | null = null, bestScore = Infinity;
  for (let i = 0; i < top.length - 3; i++) for (let j = i + 1; j < top.length - 2; j++) for (let k = j + 1; k < top.length - 1; k++) for (let l = k + 1; l < top.length; l++) {
    const [p1, p2, p3, p4] = [top[i], top[j], top[k], top[l]];
    const combos: [Player[], Player[]][] = [[[p1, p2], [p3, p4]], [[p1, p3], [p2, p4]], [[p1, p4], [p2, p3]]];
    for (const [t1, t2] of combos) {
      const score = Math.abs((t1[0].matchCount + t1[1].matchCount) - (t2[0].matchCount + t2[1].matchCount)) * 2
        + Math.abs((LEVEL_ORDER[t1[0].level] + LEVEL_ORDER[t1[1].level]) - (LEVEL_ORDER[t2[0].level] + LEVEL_ORDER[t2[1].level]));
      if (score < bestScore) { bestScore = score; best = { team1: t1, team2: t2, matchType }; }
    }
  }
  return best ?? null;
}

// ── Shared components ─────────────────────────────────────────────────────────

function LevelBadge({ level }: { level: string }) {
  const color = LEVEL_COLOR[level as Level] ?? '#6b7280';
  return (
    <span className="font-mono text-[0.65rem] font-bold px-1.5 py-0.5 rounded"
      style={{ background: `${color}18`, color }}>
      {level}
    </span>
  );
}

// ── Player pill ───────────────────────────────────────────────────────────────
function PlayerPill({ p, side, index, editingSlot, onEdit }: {
  p: Player; side: 'team1' | 'team2'; index: number;
  editingSlot: EditingSlot | null; onEdit: (s: EditingSlot) => void;
}) {
  const active = editingSlot?.side === side && editingSlot?.index === index;
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-md border transition-all duration-150 min-w-0"
      style={{
        background: active ? '#f0fdf4' : '#fafafa',
        border: `1px solid ${active ? '#bbf7d0' : '#e5e7eb'}`,
      }}>
      <LevelBadge level={p.level} />
      <span className="flex-1 text-xs font-medium text-gray-600 truncate min-w-0">{p.name}</span>
      <span className="text-[0.65rem] text-gray-400 shrink-0">{p.gender === 'Male' ? 'M' : 'F'} {p.matchCount}x</span>
      <Button v="ghost" style={{ padding: '0.2rem 0.45rem', fontSize: '0.68rem' }}
        onClick={() => onEdit({ side, index })}>
        swap
      </Button>
    </div>
  );
}

// ── Match card ────────────────────────────────────────────────────────────────
function MatchCard({ match, index, showActions, onUpdate }: {
  match: Match; index: number; showActions: boolean; onUpdate: () => void;
}) {
  // Dynamic border based on status — kept inline
  const borderColor = match.status === 'playing' ? '#fde68a' : '#e5e7eb';
  const statusColor = match.status === 'playing' ? '#d97706' : match.status === 'done' ? '#9ca3af' : '#16a34a';

  return (
    <div className="bg-white rounded-lg p-4 transition-colors duration-150"
      style={{ border: `1px solid ${borderColor}` }}>

      {/* Header */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        <span className="font-mono text-[0.65rem] text-gray-400">#{String(index + 1).padStart(2, '0')}</span>
        <span className="text-[0.7rem] font-semibold bg-gray-100 text-gray-600 px-2 py-0.5 rounded">
          Court {match.court}
        </span>
        <span className="text-[0.7rem] text-gray-500">{MATCH_LABELS[match.matchType]}</span>
        <span className="ml-auto text-[0.68rem] font-bold tracking-wide uppercase"
          style={{ color: statusColor }}>
          {match.status}
        </span>
      </div>

      {/* Teams */}
      <div className="grid items-center gap-1.5" style={{ gridTemplateColumns: '1fr auto 1fr' }}>
        <div className="flex flex-col gap-1">
          {match.team1.map(p => (
            <div key={p._id} className="flex items-center gap-1.5">
              <LevelBadge level={p.level} />
              <span className="text-xs font-medium text-gray-600">{p.name}</span>
            </div>
          ))}
        </div>
        <span className="font-mono text-[0.65rem] text-gray-300 px-1.5">vs</span>
        <div className="flex flex-col gap-1">
          {match.team2.map(p => (
            <div key={p._id} className="flex items-center gap-1.5">
              <LevelBadge level={p.level} />
              <span className="text-xs font-medium text-gray-600">{p.name}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      {showActions && (
        <div className="flex gap-1.5 mt-3 pt-3 border-t border-gray-100">
          {match.status === 'queued'  && <Button v="warning"   onClick={() => updateMatch(match._id, { status: 'playing' }).then(onUpdate)}>Mark Playing</Button>}
          {match.status === 'playing' && <Button v="primary" onClick={() => updateMatch(match._id, { status: 'done' }).then(onUpdate)}>Mark Done</Button>}
          <Button v="danger" onClick={() => { if (confirm('Remove match?')) deleteMatch(match._id).then(onUpdate); }}>Remove</Button>
        </div>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function QueuePage() {
  const [players,       setPlayers]       = useState<Player[]>([]);
  const [queueList,     setQueueList]     = useState<Match[]>([]);
  const [historyList,   setHistoryList]   = useState<Match[]>([]);
  const [shuttles,      setShuttles]      = useState<CatalogItem[]>([]);
  const [generated,     setGenerated]     = useState<GeneratedMatch | null>(null);
  const [edited,        setEdited]        = useState<GeneratedMatch | null>(null);
  const [editingSlot,   setEditingSlot]   = useState<EditingSlot | null>(null);
  const [selectedCourt, setSelectedCourt] = useState(1);
  const [shuttlecockId, setShuttlecockId] = useState('');
  const [mobileTab,     setMobileTab]     = useState<'randomizer' | 'queue' | 'history'>('randomizer');
  const [loading,       setLoading]       = useState(true);
  const [submitting,    setSubmitting]    = useState(false);

  const loadAll = useCallback(async () => {
    setLoading(true);
    const [p, q, h, s] = await Promise.all([getPlayers(), getQueue(), getHistory(), getSplittableItems()]);
    setPlayers(p); setQueueList(q); setHistoryList(h); setShuttles(s); setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const busyIds   = new Set(queueList.flatMap(m => [...m.team1, ...m.team2].map(p => p._id)));
  const available = players.filter(p => !busyIds.has(p._id));
  const usedCourts = new Set(queueList.map(m => m.court));

  const handleGenerate = useCallback(() => {
    const m = generateFairMatch(available);
    setGenerated(m); setEdited(m ? { ...m, team1: [...m.team1], team2: [...m.team2] } : null); setEditingSlot(null);
  }, [available]);

  const handleSwap = (p: Player) => {
    if (!editingSlot || !edited) return;
    setEdited({ ...edited, [editingSlot.side]: edited[editingSlot.side].map((x, i) => i === editingSlot.index ? p : x) });
    setEditingSlot(null);
  };

  const handleDeleteAll = async () => {
    if(window.confirm("Are you sure you want to clear all history?")) {
    await deleteHistory();
    sileo.success({title: "History Deleted"})
    await loadAll();
    }
  }

  const handleSubmit = async () => {
    if (!edited) return;
    setSubmitting(true);
    await createMatch({
      team1: edited.team1.map(p => p._id),
      team2: edited.team2.map(p => p._id),
      matchType: edited.matchType,
      court: selectedCourt,
      shuttlecockId: shuttlecockId || undefined,
    });
    setGenerated(null); setEdited(null); setShuttlecockId('');
    await loadAll(); setSubmitting(false);
  };

  const swapCandidates = editingSlot && edited
    ? players.filter(p => ![...edited.team1, ...edited.team2].map(x => x._id).includes(p._id))
    : [];

  // ── Panels ─────────────────────────────────────────────────────────────────

  const RandomizerPanel = () => (
    <div className="flex flex-col gap-3.5">

      {/* Empty state */}
      {!generated ? (
        <div className="bg-white border border-dashed border-gray-200 rounded-lg p-8 flex flex-col items-center gap-3 text-center">
          <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400">Randomizer</p>
          <p className="text-sm text-gray-400 leading-relaxed max-w-full">
            Generates the fairest match from {available.length} available players.
          </p>
          <Button v="primary" onClick={handleGenerate} disabled={available.length < 4}
            style={{ opacity: available.length < 4 ? 0.4 : 1 }}>
            {available.length < 4 ? `Need ${4 - available.length} more` : 'Generate Match'}
          </Button>
        </div>
      ) : edited && (
        /* Generated match card */
        <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-3.5">

          {/* Match type + fair label */}
          <div className="flex items-center justify-between">
            <span className="text-[0.7rem] font-semibold tracking-wide uppercase text-gray-400">
              {MATCH_LABELS[edited.matchType]}
            </span>
            <span className="font-mono text-[0.65rem] text-green-600">fair match</span>
          </div>

          {/* Teams grid — dynamic border kept inline */}
          <div className="grid items-start gap-1.5 min-w-0 w-full"
            style={{ gridTemplateColumns: '1fr 24px 1fr' }}>
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-[0.62rem] font-semibold tracking-widest uppercase text-gray-300 mb-0.5">Team A</span>
              {edited.team1.map((p, i) => (
                <PlayerPill key={p._id} p={p} side="team1" index={i} editingSlot={editingSlot} onEdit={setEditingSlot} />
              ))}
            </div>
            <div className="flex items-center justify-center pt-6">
              <span className="font-mono text-[0.65rem] text-gray-300">vs</span>
            </div>
            <div className="flex flex-col gap-1.5 min-w-0">
              <span className="text-[0.62rem] font-semibold tracking-widest uppercase text-gray-300 mb-0.5">Team B</span>
              {edited.team2.map((p, i) => (
                <PlayerPill key={p._id} p={p} side="team2" index={i} editingSlot={editingSlot} onEdit={setEditingSlot} />
              ))}
            </div>
          </div>

          {/* Swap picker */}
          {editingSlot && swapCandidates.length > 0 && (
            <div className="bg-gray-50 border border-gray-200 rounded-md p-3">
              <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-2">
                Select replacement
              </p>
              <div className="flex flex-col gap-1 max-h-40 overflow-y-auto">
                {swapCandidates.map(p => (
                  <button key={p._id} onClick={() => handleSwap(p)}
                    className="flex items-center gap-2 px-2.5 py-2 bg-white border border-gray-200 rounded-md cursor-pointer text-left hover:border-green-300 transition-colors duration-100">
                    <LevelBadge level={p.level} />
                    <span className="flex-1 text-xs font-medium text-gray-600">{p.name}</span>
                    <span className="text-[0.65rem] text-gray-400">{p.gender === 'Male' ? 'M' : 'F'} {p.matchCount}x</span>
                  </button>
                ))}
              </div>
              <Button v="ghost" className="mt-1.5 text-[0.7rem]" onClick={() => setEditingSlot(null)}>Cancel</Button>
            </div>
          )}

          {/* Court selector — dynamic colors kept inline */}
          <div>
            <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5">Court</p>
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map(c => {
                const isSelected = selectedCourt === c;
                const isUsed     = usedCourts.has(c);
                return (
                  <button key={c} onClick={() => setSelectedCourt(c)}
                    className="flex-1 py-2 rounded-md cursor-pointer font-mono text-sm font-medium transition-all duration-150"
                    style={{
                      border:     `1px solid ${isSelected ? '#bbf7d0' : isUsed ? '#fecaca' : '#e5e7eb'}`,
                      background: isSelected ? '#f0fdf4' : isUsed ? '#fef2f2' : '#fff',
                      color:      isSelected ? '#15803d' : isUsed ? '#dc2626' : '#374151',
                      fontWeight: isSelected ? 600 : 400,
                    }}>
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Shuttlecock picker */}
          <div>
            <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5">
              Shuttlecock <span className="text-gray-300 font-normal">(optional — auto-splits fee)</span>
            </p>
            <select value={shuttlecockId} onChange={e => setShuttlecockId(e.target.value)}
              className="w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-green-400 transition-colors duration-150"
              style={{ color: shuttlecockId ? '#111827' : '#9ca3af' }}>
              <option value="">None — skip split</option>
              {shuttles.map(s => (
                <option key={s._id} value={s._id}>
                  {s.name} — ₱{s.price} (÷4 = ₱{(s.price / 4).toFixed(2)}/player)
                </option>
              ))}
            </select>
            {shuttlecockId && (
              <p className="text-xs text-green-600 mt-1">✓ Will auto-add to each player's billing tab</p>
            )}
          </div>

          {/* Submit buttons */}
          <div className="flex gap-1.5 pt-1">
            <Button v="warning" className="flex-1"
              onClick={() => { setGenerated(null); setEdited(null); setTimeout(handleGenerate, 80); }}>
              Re-generate
            </Button>
            <Button v="primary" className="flex-1" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Submitting...' : 'Submit to Queue'}
            </Button>
          </div>
        </div>
      )}

      {/* Available players list */}
      <div className="bg-white border border-gray-200 rounded-lg p-3.5">
        <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-2.5">
          Available · {available.length}
        </p>
        <div className="flex flex-col gap-0.5 max-h-[200px] overflow-y-auto">
          {available.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-3">All players in active matches</p>
          ) : available.map(p => (
            <div key={p._id} className="flex items-center gap-2 px-1.5 py-1.5">
              <LevelBadge level={p.level} />
              <span className="flex-1 text-xs text-gray-600">{p.name}</span>
              <span className="text-[0.65rem] text-gray-400 font-mono">{p.gender === 'Male' ? 'M' : 'F'} {p.matchCount}x</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const QueuePanel = () => (
    <div className="flex flex-col gap-2.5">
      <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400">
        Active · {queueList.length}
      </p>
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
      ) : queueList.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8 bg-white border border-dashed border-gray-200 rounded-lg">
          No active matches.
        </p>
      ) : queueList.map((m, i) => (
        <MatchCard key={m._id} match={m} index={i} showActions onUpdate={loadAll} />
      ))}
    </div>
  );

  const HistoryPanel = () => (
    <div className="flex flex-col gap-2.5">
      <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400">
        Completed · {historyList.length}
        <Button v="danger" onClick={handleDeleteAll} className="ml-4">
        Clear all history
      </Button>
      </p>

      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">Loading...</p>
      ) : historyList.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8 bg-white border border-dashed border-gray-200 rounded-lg">
          No completed matches yet.
        </p>
      ) : historyList.map((m, i) => (
        <div key={m._id} className="opacity-70">
          <MatchCard match={m} index={historyList.length - 1 - i} showActions={false} onUpdate={loadAll} />
          <p className="font-mono text-[0.65rem] text-gray-400 mt-0.5 pl-1">
            {new Date(m.updatedAt).toLocaleString()}
          </p>
        </div>
      ))}
    </div>
  );

  return (
    <div className="w-full font-sans">
      <style>{`
        .queue-desktop  { display: grid; }
        .queue-mob-tabs { display: none; }
        .queue-mob-body { display: none; }
        @media (max-width: 900px) {
          .queue-desktop  { display: none !important; }
          .queue-mob-tabs { display: flex !important; }
          .queue-mob-body { display: block !important; }
        }
        .mob-tab       { flex: 1; padding: 0.55rem; background: transparent; border: none; border-bottom: 2px solid transparent; font-size: 0.78rem; font-weight: 500; cursor: pointer; font-family: inherit; color: #6b7280; transition: all 0.12s; }
        .mob-tab.active { color: #111827; border-bottom-color: #111827; }
      `}</style>

      {/* Page header */}
      <div className="mb-6 pb-5 border-b border-gray-100">
        <p className="text-[0.72rem] font-medium tracking-wide uppercase text-gray-400 mb-1.5">Management</p>
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Queue System</h1>
      </div>

      {/* Desktop 3-col */}
      <div className="queue-desktop" style={{ gridTemplateColumns: '2fr 1.2fr 1.2fr', gap: '1.25rem', alignItems: 'start' }}>
        <RandomizerPanel />
        <QueuePanel />
        <HistoryPanel />
      </div>

      {/* Mobile tab bar */}
      <div className="queue-mob-tabs border-b border-gray-200 mb-5">
        {(['randomizer', 'queue', 'history'] as const).map(t => (
          <button key={t} className={`mob-tab${mobileTab === t ? ' active' : ''}`}
            onClick={() => setMobileTab(t)}>
            {t.charAt(0).toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>
      <div className="queue-mob-body">
        {mobileTab === 'randomizer' && <RandomizerPanel />}
        {mobileTab === 'queue'      && <QueuePanel />}
        {mobileTab === 'history'    && <HistoryPanel />}
      </div>
    </div>
  );
}