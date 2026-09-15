'use client';
import { useState, useEffect, useCallback } from 'react';
import { sileo } from 'sileo';
import { getReservations, updateReservation, deleteReservation } from '@/lib/api';
import type { Reservation } from '@/lib/api';
import { Button } from '@/app/components/ui/Button';
import { useSocketEvent } from '@/hooks/useSocketEvent';

// ── Constants (unchanged) ─────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { label: string; text: string }> = {
  pending_admin: { label: 'bg-blue-50 border-blue-200 text-blue-700', text: 'Awaiting Payment' },
  approved_waiting_payment: { label: 'bg-blue-50 border-blue-200 text-blue-700', text: 'Awaiting Payment' },
  pending:   { label: 'bg-yellow-50 border-yellow-200 text-yellow-700', text: 'Pending'   },
  confirmed: { label: 'bg-green-50 border-green-200 text-green-700',    text: 'Confirmed' },
  cancelled: { label: 'bg-red-50 border-red-200 text-red-400',          text: 'Cancelled' },
  completed: { label: 'bg-gray-100 border-gray-200 text-gray-500',      text: 'Completed' },
};

function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

// ── Delete modal (all logic unchanged) ───────────────────────────────────────
function DeleteModal({ r, onClose, onDeleted }: { r: Reservation; onClose: () => void; onDeleted: () => void }) {
  const [typed,    setTyped]    = useState('');
  const [deleting, setDeleting] = useState(false);
  const confirmed = typed.trim().toLowerCase() === r.name.trim().toLowerCase();

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const handleDelete = async () => {
    if (!confirmed) return;
    setDeleting(true);
    try {
      await deleteReservation(r._id);
      sileo.success({ title: 'Reservation deleted', description: `${r.name}'s booking has been removed.` });
      onDeleted();
    } catch {
      sileo.error({ title: 'Error', description: 'Could not delete reservation.' });
      setDeleting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="px-6 pt-6 pb-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-red-50 border border-red-100 flex items-center justify-center shrink-0">
              <span className="text-red-400 text-sm">⚠</span>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-gray-800">Delete Reservation</h2>
              <p className="text-xs text-gray-400 mt-0.5">This action cannot be undone.</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors text-sm">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="bg-gray-50 border border-gray-100 rounded-lg p-4 space-y-2">
            {([['Name', r.name], ['Court', `Court ${r.court}`], ['Date', fmtDate(r.date)], ['Time', r.timeSlot]] as [string, string][]).map(([label, value]) => (
              <div key={label} className="flex justify-between items-center">
                <span className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-300">{label}</span>
                <span className="text-xs text-gray-600 font-medium">{value}</span>
              </div>
            ))}
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-2">
              Type the name{' '}
              <code className="px-1.5 py-0.5 bg-red-50 border border-red-100 rounded text-red-500 text-[0.7rem] font-mono font-semibold">{r.name}</code>
              {' '}to confirm deletion
            </label>
            <input autoFocus type="text" value={typed} onChange={e => setTyped(e.target.value)} placeholder={r.name}
              className={`w-full border rounded-lg px-3 py-2.5 text-sm outline-none transition-all font-mono ${confirmed ? 'border-red-300 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-700'}`}
            />
            {typed.length > 0 && !confirmed && (
              <p className="text-[0.65rem] text-gray-400 mt-1.5">Keep typing — name doesn't match yet</p>
            )}
          </div>
          <div className={`transition-all duration-200 overflow-hidden ${confirmed ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
            <Button v="danger" loading={deleting} disabled={!confirmed} onClick={handleDelete}
              className="w-full justify-center py-2.5 !bg-red-500 !border-red-500 !text-white hover:!bg-red-600 text-sm font-semibold">
              Confirm Delete
            </Button>
          </div>
          <button onClick={onClose} className="w-full py-1.5 text-xs text-gray-400 hover:text-gray-600 transition-colors">Cancel</button>
        </div>
      </div>
    </div>
  );
}

// ── Detail modal (all logic unchanged) ───────────────────────────────────────
function DetailModal({ r, onClose, onUpdate, onDeleteRequest }: {
  r: Reservation; onClose: () => void; onUpdate: () => void; onDeleteRequest: (r: Reservation) => void;
}) {
  const [notes, setNotes] = useState(r.notes);
  const s = STATUS_STYLE[r.status] ?? { label: 'bg-gray-100 border-gray-200 text-gray-500', text: r.status };

  const setStatus = async (status: Reservation['status']) => {
    await updateReservation(r._id, { status });
    sileo.success({ title: 'Status updated', description: `Reservation marked as ${status}.` });
    onUpdate(); onClose();
  };

  const saveNotes = async () => {
    await updateReservation(r._id, { notes });
    sileo.success({ title: 'Notes saved' });
    onUpdate(); onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/20 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[0.65rem] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full border ${s.label}`}>{s.text}</span>
              <span className="font-mono text-xs text-gray-300">Court {r.court}</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-800">{r.name}</h2>
            <p className="text-sm text-gray-400 font-mono mt-0.5">{fmtDate(r.date)} · {r.timeSlot}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors mt-1">✕</button>
        </div>
        <div className="px-6 py-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-300 mb-1">Phone</p>
              <p className="text-sm text-gray-700 font-mono">{r.phone}</p>
            </div>
            {r.email && (
              <div>
                <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-300 mb-1">Email</p>
                <p className="text-sm text-gray-700 break-all">{r.email}</p>
              </div>
            )}
            <div>
              <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-300 mb-1">Players</p>
              <p className="text-sm text-gray-700">{r.playerCount} pax</p>
            </div>
            <div>
              <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-300 mb-1">Duration</p>
              <p className="text-sm text-gray-700">{r.duration}h</p>
            </div>
          </div>
          <div>
            <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-300 mb-1.5">Notes</p>
            <textarea className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-700 outline-none focus:border-green-400 resize-none"
              rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes about this reservation..." />
          </div>
          <p className="text-[0.65rem] text-gray-300 font-mono">
            Submitted {new Date(r.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {r.status !== 'completed' && <Button v="ghost"   onClick={() => setStatus('completed')}>Mark Done</Button>}
            {r.status !== 'cancelled' && <Button v="danger"  onClick={() => setStatus('cancelled')}>Cancel</Button>}
          </div>
          <div className="flex gap-1.5">
            <Button v="ghost"  onClick={saveNotes}>Save Notes</Button>
            <Button v="danger" onClick={() => { onClose(); onDeleteRequest(r); }}>Delete</Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page (all logic unchanged) ──────────────────────────────────────────
export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState<Reservation | null>(null);
  const [toDelete,     setToDelete]     = useState<Reservation | null>(null);
  const [dateFilter,   setDateFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courtFilter,  setCourtFilter]  = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const params: { date?: string; status?: string } = {};
    if (dateFilter)             params.date   = dateFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    const data = await getReservations(params);
    setReservations(data);
    setLoading(false);
  }, [dateFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);
  useSocketEvent('reservation:updated', useCallback(() => { load(); }, [load]));

  const filtered = reservations.filter(r =>
    courtFilter === 'all' || String(r.court) === courtFilter
  );

  const grouped = filtered.reduce((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {} as Record<string, Reservation[]>);

  const counts = {
    awaiting:  reservations.filter(r => ['pending', 'pending_admin', 'approved_waiting_payment'].includes(r.status)).length,
    confirmed: reservations.filter(r => r.status === 'confirmed').length,
  };

  return (
    <>
      {selected && (
        <DetailModal r={selected} onClose={() => setSelected(null)}
          onUpdate={() => { load(); setSelected(null); }}
          onDeleteRequest={r => setToDelete(r)} />
      )}
      {toDelete && (
        <DeleteModal r={toDelete} onClose={() => setToDelete(null)}
          onDeleted={() => { setToDelete(null); load(); }} />
      )}

      <div className="w-full font-sans">
        {/* Header */}
        <div className="mb-8 pb-6 border-b border-gray-100 flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="text-[0.72rem] font-medium tracking-wide uppercase text-gray-400 mb-1.5">Management</p>
            <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Reservations</h1>
          </div>
          <div className="flex items-center gap-5">
            <div className="text-right">
              <div className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-0.5">Awaiting Payment</div>
              <div className="font-mono text-xl text-yellow-600">{counts.awaiting}</div>
            </div>
            <div className="text-right">
              <div className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-0.5">Confirmed</div>
              <div className="font-mono text-xl text-green-700">{counts.confirmed}</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 sm:gap-3 mb-6">
          <div className="flex items-center gap-2">
            <input type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)}
              className="bg-white border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-green-400" />
            {dateFilter && (
              <button onClick={() => setDateFilter('')} className="text-xs text-gray-400 hover:text-gray-600 transition-colors whitespace-nowrap">
                Clear
              </button>
            )}
          </div>
          <div className="flex gap-1 flex-wrap">
            {['all', 'approved_waiting_payment', 'confirmed', 'cancelled', 'completed'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all ${
                  statusFilter === s ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'
                }`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
          <div className="flex gap-1 flex-wrap sm:ml-auto">
            {['all', '1', '2', '3', '4'].map(c => (
              <button key={c} onClick={() => setCourtFilter(c)}
                className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all ${
                  courtFilter === c ? 'bg-green-50 border-green-200 text-green-700' : 'bg-white border-gray-200 text-gray-400'
                }`}>
                {c === 'all' ? 'All' : `C${c}`}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-16 text-center text-gray-300 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center bg-white border border-dashed border-gray-200 rounded-xl">
            <p className="text-sm text-gray-300">No reservations found.</p>
            {dateFilter && <p className="text-xs text-gray-300 mt-1">Try clearing the date filter.</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => (
              <div key={date}>
                {/* Date group header */}
                <div className="flex items-center gap-3 mb-3">
                  <span className={`text-sm font-semibold ${date === todayStr() ? 'text-green-700' : 'text-gray-700'}`}>
                    {fmtDate(date)}
                    {date === todayStr() && <span className="ml-2 text-[0.65rem] font-medium tracking-widest uppercase text-green-500">Today</span>}
                  </span>
                  <div className="flex-1 h-px bg-gray-100" />
                  <span className="font-mono text-xs text-gray-300">{items.length} booking{items.length !== 1 ? 's' : ''}</span>
                </div>

                <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                  {/* Desktop table header */}
                  <div className="hidden md:grid px-5 py-2.5 bg-gray-50/60 border-b border-gray-100"
                    style={{ gridTemplateColumns: '80px 1fr 1fr 90px 60px 90px 100px' }}>
                    {['Time', 'Name', 'Contact', 'Court', 'Pax', 'Status', ''].map(h => (
                      <span key={h} className="text-[0.63rem] font-semibold tracking-widest uppercase text-gray-300">{h}</span>
                    ))}
                  </div>

                  {items.map((r, i) => {
                    const s = STATUS_STYLE[r.status] ?? { label: 'bg-gray-100 border-gray-200 text-gray-500', text: r.status };
                    const border = i < items.length - 1 ? '1px solid #f3f4f6' : 'none';
                    return (
                      <div key={r._id} style={{ borderBottom: border }}>
                        {/* Desktop row */}
                        <div className="hidden md:grid px-5 py-3.5 items-center hover:bg-gray-50/40 transition-colors cursor-pointer"
                          style={{ gridTemplateColumns: '80px 1fr 1fr 90px 60px 90px 100px' }}
                          onClick={() => setSelected(r)}>
                          <div className="font-mono text-xs text-gray-500">{r.timeSlot.split('-')[0]}</div>
                          <div>
                            <div className="text-sm font-medium text-gray-700">{r.name}</div>
                            {r.notes && <div className="text-[0.68rem] text-gray-300 truncate mt-0.5 max-w-[140px]">{r.notes}</div>}
                          </div>
                          <div>
                            <div className="text-xs text-gray-500 font-mono">{r.phone}</div>
                            {r.email && <div className="text-[0.68rem] text-gray-300 truncate">{r.email}</div>}
                          </div>
                          <div className="text-xs font-medium text-gray-600">Court {r.court}</div>
                          <div className="text-xs text-gray-500">{r.playerCount}</div>
                          <div onClick={e => e.stopPropagation()}>
                            <span className={`text-[0.65rem] font-semibold tracking-wide px-2 py-0.5 rounded-full border ${s.label}`}>{s.text}</span>
                          </div>
                          <div className="flex gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
                            <Button v="ghost"  size="sm" onClick={() => setSelected(r)}>View</Button>
                            <Button v="danger" size="sm" onClick={() => setToDelete(r)}>✕</Button>
                          </div>
                        </div>

                        {/* Mobile card */}
                        <div className="md:hidden px-4 py-4 cursor-pointer hover:bg-gray-50/40 transition-colors"
                          onClick={() => setSelected(r)}>
                          <div className="flex items-start justify-between gap-3 mb-2">
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-gray-800 truncate">{r.name}</p>
                              <p className="text-xs text-gray-400 font-mono mt-0.5">{r.phone}</p>
                            </div>
                            <span className={`text-[0.65rem] font-semibold tracking-wide px-2 py-0.5 rounded-full border shrink-0 ${s.label}`}>{s.text}</span>
                          </div>
                          <div className="flex items-center gap-2 text-xs text-gray-500 mb-3 flex-wrap">
                            <span className="font-mono">{r.timeSlot.split('-')[0]}</span>
                            <span className="text-gray-300">·</span>
                            <span>Court {r.court}</span>
                            <span className="text-gray-300">·</span>
                            <span>{r.playerCount} pax</span>
                            <span className="text-gray-300">·</span>
                            <span>{r.duration}h</span>
                          </div>
                          <div className="flex gap-2" onClick={e => e.stopPropagation()}>
                            <Button v="ghost"  size="sm" className="flex-1 justify-center" onClick={() => setSelected(r)}>View</Button>
                            <Button v="danger" size="sm" className="flex-1 justify-center" onClick={() => setToDelete(r)}>Delete</Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}