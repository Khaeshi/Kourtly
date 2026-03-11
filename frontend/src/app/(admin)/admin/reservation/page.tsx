'use client';
import { useState, useEffect, useCallback } from 'react';
import { sileo } from 'sileo';
import { getReservations, updateReservation, deleteReservation } from '@/lib/api';
import type { Reservation } from '@/lib/api';

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLE: Record<string, { dot: string; label: string; text: string }> = {
  pending:   { dot: 'bg-yellow-400',  label: 'bg-yellow-50 border-yellow-200 text-yellow-700',  text: 'Pending'   },
  confirmed: { dot: 'bg-green-400',   label: 'bg-green-50  border-green-200  text-green-700',   text: 'Confirmed' },
  cancelled: { dot: 'bg-red-300',     label: 'bg-red-50    border-red-200    text-red-400',      text: 'Cancelled' },
  completed: { dot: 'bg-gray-300',    label: 'bg-gray-100  border-gray-200   text-gray-500',     text: 'Completed' },
};

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}

const Btn = ({
  v = 'ghost', children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { v?: 'primary' | 'ghost' | 'danger' }) => {
  const cls = {
    primary: 'bg-green-100/70 border border-green-300/60 text-green-700 hover:bg-green-100',
    ghost:   'bg-white border border-gray-200 text-gray-500 hover:border-gray-300',
    danger:  'bg-red-50 border border-red-200/60 text-red-300 hover:bg-red-100',
  };
  return (
    <button {...props}
      className={`${cls[v]} px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-40 ${props.className ?? ''}`}>
      {children}
    </button>
  );
};

// ── Detail modal ──────────────────────────────────────────────────────────────
function DetailModal({ r, onClose, onUpdate }: {
  r: Reservation;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [notes, setNotes] = useState(r.notes);
  const s = STATUS_STYLE[r.status];

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
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-lg"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-5 border-b border-gray-100 flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className={`text-[0.65rem] font-semibold tracking-widest uppercase px-2.5 py-1 rounded-full border ${s.label}`}>
                {s.text}
              </span>
              <span className="font-mono text-xs text-gray-300">Court {r.court}</span>
            </div>
            <h2 className="text-lg font-semibold text-gray-800">{r.name}</h2>
            <p className="text-sm text-gray-400 font-mono mt-0.5">{fmtDate(r.date)} · {r.timeSlot}</p>
          </div>
          <button onClick={onClose} className="text-gray-300 hover:text-gray-500 transition-colors mt-1">✕</button>
        </div>

        {/* Body */}
        <div className="px-6 py-5 space-y-4">

          {/* Contact info */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-300 mb-1">Phone</p>
              <p className="text-sm text-gray-700 font-mono">{r.phone}</p>
            </div>
            {r.email && (
              <div>
                <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-300 mb-1">Email</p>
                <p className="text-sm text-gray-700">{r.email}</p>
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

          {/* Notes */}
          <div>
            <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-300 mb-1.5">Notes</p>
            <textarea
              className="w-full bg-gray-50 border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-700 outline-none focus:border-green-400 resize-none"
              rows={3} value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Add notes about this reservation..."
            />
          </div>

          {/* Submitted */}
          <p className="text-[0.65rem] text-gray-300 font-mono">
            Submitted {new Date(r.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
          </p>
        </div>

        {/* Footer actions */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-1.5 flex-wrap">
            {r.status !== 'confirmed'  && <Btn v="primary" onClick={() => setStatus('confirmed')}>Confirm</Btn>}
            {r.status !== 'completed'  && <Btn v="ghost"   onClick={() => setStatus('completed')}>Mark Done</Btn>}
            {r.status !== 'cancelled'  && <Btn v="danger"  onClick={() => setStatus('cancelled')}>Cancel</Btn>}
          </div>
          <Btn v="primary" onClick={saveNotes}>Save Notes</Btn>
        </div>
      </div>
    </div>
  );
}

// ── Main admin page ───────────────────────────────────────────────────────────
export default function ReservationsPage() {
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [selected,     setSelected]     = useState<Reservation | null>(null);
  const [dateFilter,   setDateFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courtFilter,  setCourtFilter]  = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    const params: { date?: string; status?: string } = {};
    if (dateFilter)              params.date   = dateFilter;
    if (statusFilter !== 'all')  params.status = statusFilter;
    const data = await getReservations(params);
    setReservations(data);
    setLoading(false);
  }, [dateFilter, statusFilter]);

  useEffect(() => { load(); }, [load]);

  const handleDelete = async (r: Reservation) => {
    if (!confirm(`Delete reservation for ${r.name}?`)) return;
    await deleteReservation(r._id);
    sileo.success({ title: 'Reservation deleted', description: `${r.name}'s booking has been removed.` });
    load();
  };

  const filtered = reservations.filter(r =>
    courtFilter === 'all' || String(r.court) === courtFilter
  );

  // Group by date
  const grouped = filtered.reduce((acc, r) => {
    if (!acc[r.date]) acc[r.date] = [];
    acc[r.date].push(r);
    return acc;
  }, {} as Record<string, Reservation[]>);

  const counts = {
    pending:   reservations.filter(r => r.status === 'pending').length,
    confirmed: reservations.filter(r => r.status === 'confirmed').length,
  };

  return (
    <>
      {selected && (
        <DetailModal r={selected} onClose={() => setSelected(null)} onUpdate={() => { load(); setSelected(null); }} />
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
              <div className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-0.5">Pending</div>
              <div className="font-mono text-xl text-yellow-600">{counts.pending}</div>
            </div>
            <div className="text-right">
              <div className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-0.5">Confirmed</div>
              <div className="font-mono text-xl text-green-700">{counts.confirmed}</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6 items-center">
          <input
            type="date"
            className="bg-white border border-gray-200 rounded-md px-3 py-1.5 text-sm text-gray-700 outline-none focus:border-green-400"
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
          />
          {dateFilter && (
            <button onClick={() => setDateFilter('')}
              className="text-xs text-gray-400 hover:text-gray-600 transition-colors">Clear date</button>
          )}

          {/* Status filter */}
          <div className="flex gap-1">
            {['all', 'pending', 'confirmed', 'cancelled', 'completed'].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150 ${
                  statusFilter === s
                    ? 'bg-gray-900 border-gray-900 text-white'
                    : 'bg-white border-gray-200 text-gray-400 hover:text-gray-600'
                }`}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>

          {/* Court filter */}
          <div className="flex gap-1 ml-auto">
            {['all', '1', '2', '3', '4'].map(c => (
              <button key={c} onClick={() => setCourtFilter(c)}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all duration-150 ${
                  courtFilter === c
                    ? 'bg-green-50 border-green-200 text-green-700'
                    : 'bg-white border-gray-200 text-gray-400'
                }`}>
                {c === 'all' ? 'All Courts' : `Court ${c}`}
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
            {dateFilter && (
              <p className="text-xs text-gray-300 mt-1">Try clearing the date filter or check a different day.</p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {Object.entries(grouped)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([date, items]) => (
                <div key={date}>
                  {/* Date group header */}
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`text-sm font-semibold text-gray-700 ${date === todayStr() ? 'text-green-700' : ''}`}>
                      {fmtDate(date)}
                      {date === todayStr() && <span className="ml-2 text-[0.65rem] font-medium tracking-widest uppercase text-green-500">Today</span>}
                    </span>
                    <div className="flex-1 h-px bg-gray-100" />
                    <span className="font-mono text-xs text-gray-300">{items.length} booking{items.length !== 1 ? 's' : ''}</span>
                  </div>

                  <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                    {/* Table header */}
                    <div className="grid px-5 py-2.5 bg-gray-50/60 border-b border-gray-100"
                      style={{ gridTemplateColumns: '80px 1fr 1fr 100px 80px 80px 100px' }}>
                      {['Time', 'Name', 'Contact', 'Court', 'Pax', 'Status', ''].map(h => (
                        <span key={h} className="text-[0.63rem] font-semibold tracking-widest uppercase text-gray-300">{h}</span>
                      ))}
                    </div>

                    {items.map((r, i) => {
                      const s = STATUS_STYLE[r.status];
                      return (
                        <div key={r._id}
                          className="grid px-5 py-3.5 items-center hover:bg-gray-50/40 transition-colors cursor-pointer"
                          style={{
                            gridTemplateColumns: '80px 1fr 1fr 100px 80px 80px 100px',
                            borderBottom: i < items.length - 1 ? '1px solid #f3f4f6' : 'none',
                          }}
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
                          <div className="text-xs text-gray-500">{r.playerCount} pax</div>
                          <div onClick={e => e.stopPropagation()}>
                            <span className={`text-[0.65rem] font-semibold tracking-wide px-2 py-0.5 rounded-full border ${s.label}`}>
                              {s.text}
                            </span>
                          </div>
                          <div className="flex gap-1.5 justify-end" onClick={e => e.stopPropagation()}>
                            <Btn v="ghost" onClick={() => setSelected(r)}>View</Btn>
                            <Btn v="danger" onClick={() => handleDelete(r)}>✕</Btn>
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