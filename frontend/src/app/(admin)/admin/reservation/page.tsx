'use client';
import { useState, useEffect, useCallback } from 'react';
import { sileo } from 'sileo';
import {
  createReservationBillingTab,
  getReservations,
  updateReservation,
  deleteReservation,
  OfflineUnavailableError,
} from '@/lib/api';
import type { Reservation } from '@/lib/api';
import { Button } from '@/app/components/ui/Button';
import { Modal } from '@/app/components/ui/Modal';
import { StatusDot, type StatusTone } from '@/app/components/ui/StatusDot';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { useCapabilities } from '@/lib/entitlements';
import { useConnectivity } from '@/lib/connectivity';

// ── Constants ─────────────────────────────────────────────────────────────────
const STATUS_STYLE: Record<string, { tone: StatusTone; text: string }> = {
  pending_admin: { tone: 'wait', text: 'Awaiting payment' },
  approved_waiting_payment: { tone: 'wait', text: 'Awaiting payment' },
  pending:   { tone: 'wait', text: 'Pending'   },
  confirmed: { tone: 'ok',   text: 'Confirmed' },
  cancelled: { tone: 'bad',  text: 'Cancelled' },
  completed: { tone: 'off',  text: 'Completed' },
};
const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'approved_waiting_payment', label: 'Awaiting payment' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'completed', label: 'Completed' },
];
const COLS = '80px 1fr 1fr 90px 60px 150px 150px';

function todayStr() { return new Date().toISOString().slice(0, 10); }
function fmtDate(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' });
}
function Fact({ label, children, tone = '' }: { label: string; children: React.ReactNode; tone?: string }) {
  return (
    <div>
      <p className="ad-eyebrow mb-1">{label}</p>
      <div className={`text-sm ${tone}`}>{children}</div>
    </div>
  );
}

// ── Delete modal (all logic unchanged) ───────────────────────────────────────
function DeleteModal({ r, onClose, onDeleted }: { r: Reservation; onClose: () => void; onDeleted: () => void }) {
  const [typed,    setTyped]    = useState('');
  const [deleting, setDeleting] = useState(false);
  const { status } = useConnectivity();
  const offline = status !== 'online';
  const offlineTitle = offline ? 'Reconnect to make changes' : undefined;
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
    <Modal onClose={onClose} width="max-w-md" label="Delete reservation">
      <div className="px-6 pt-6 pb-4 border-b border-[#E1DBCB] flex items-start justify-between gap-4">
        <div>
          <p className="ad-eyebrow mb-1">Cannot be undone</p>
          <h2 className="text-lg font-bold text-[#B8431F]">Delete reservation</h2>
        </div>
        <Button v="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
      <div className="px-6 py-5 space-y-4">
        <div className="border-t-2 border-[#0E2420]">
          {([['Name', r.name], ['Court', `Court ${r.court}`], ['Date', fmtDate(r.date)], ['Time', r.timeSlot]] as [string, string][]).map(([label, value]) => (
            <div key={label} className="flex justify-between items-center py-2 border-b border-[#E1DBCB]">
              <span className="ad-eyebrow">{label}</span>
              <span className="text-sm font-medium">{value}</span>
            </div>
          ))}
        </div>
        <div>
          <label htmlFor="rs-confirm" className="ad-label !normal-case !tracking-normal !text-sm !font-normal !font-sans">
            Type the name <b className="ad-mono">{r.name}</b> to confirm
          </label>
          <input id="rs-confirm" autoFocus type="text" value={typed} onChange={e => setTyped(e.target.value)} placeholder={r.name}
            className={`ad-input ad-mono${confirmed ? ' is-invalid' : ''}`} />
          {typed.length > 0 && !confirmed && (
            <p className="ad-muted text-xs mt-1.5">Keep typing, the name doesn’t match yet.</p>
          )}
        </div>
        <div className={`transition-all duration-200 overflow-hidden motion-reduce:transition-none ${confirmed ? 'max-h-20 opacity-100' : 'max-h-0 opacity-0'}`}>
          <Button v="dark" loading={deleting} disabled={!confirmed || offline} title={offlineTitle} onClick={handleDelete}
            className="w-full !bg-[#B8431F] !border-[#B8431F]">
            Delete {r.name}’s reservation
          </Button>
        </div>
        <Button v="ghost" className="w-full" onClick={onClose}>Keep reservation</Button>
      </div>
    </Modal>
  );
}

// ── Detail modal (all logic unchanged) ───────────────────────────────────────
function DetailModal({ r, onClose, onUpdate, onDeleteRequest, canCreateBillingTab }: {
  r: Reservation; onClose: () => void; onUpdate: () => void; onDeleteRequest: (r: Reservation) => void; canCreateBillingTab: boolean;
}) {
  const [notes, setNotes] = useState(r.notes ?? '');
  const [creatingBillingTab, setCreatingBillingTab] = useState(false);
  const { status } = useConnectivity();
  const offline = status !== 'online';
  const offlineTitle = offline ? 'Reconnect to make changes' : undefined;
  const s = STATUS_STYLE[r.status] ?? { tone: 'off' as StatusTone, text: r.status };

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

  const createBillingTab = async () => {
    setCreatingBillingTab(true);
    try {
      await createReservationBillingTab(r._id);
      sileo.success({ title: 'Billing tab created', description: 'The remaining court fee is ready in Billing.' });
      onUpdate(); onClose();
    } catch (error) {
      sileo.error({ title: 'Could not create billing tab', description: error instanceof Error ? error.message : 'Try again.' });
    } finally {
      setCreatingBillingTab(false);
    }
  };

  return (
    <Modal onClose={onClose} width="max-w-lg" label="Reservation details">
      <div className="px-6 py-5 border-b border-[#E1DBCB] flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1">
            <StatusDot tone={s.tone}>{s.text}</StatusDot>
            <span className="ad-mono ad-muted text-xs">Court {r.court}</span>
          </div>
          <h2 className="text-xl font-bold">{r.name}</h2>
          <p className="ad-mono ad-muted text-sm mt-0.5">{fmtDate(r.date)} · {r.timeSlot}</p>
        </div>
        <Button v="ghost" size="sm" onClick={onClose}>Close</Button>
      </div>
      <div className="px-6 py-5 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <Fact label="Phone"><span className="ad-mono">{r.phone}</span></Fact>
          {r.email && <Fact label="Email"><span className="break-all">{r.email}</span></Fact>}
          <Fact label="Players">{r.playerCount} pax</Fact>
          <Fact label="Duration">{r.duration}h</Fact>
        </div>
        <div className="grid grid-cols-2 gap-4 rounded-lg bg-[#CFE8E2] p-4">
          <Fact label="Payment plan">{r.paymentOption === 'full' ? '100% full payment' : '50% downpayment'}</Fact>
          <Fact label="Payment status">{r.paymentStatus === 'paid' ? 'Paid' : r.paymentStatus || 'Unpaid'}</Fact>
          <Fact label="Paid online"><span className="ad-mono font-bold">₱{Number(r.amountPaidOnline || 0).toFixed(2)}</span></Fact>
          <Fact label="Court fee balance"><span className="ad-mono font-bold">₱{Number(r.remainingBalanceAmount || 0).toFixed(2)}</span></Fact>
        </div>
        <div>
          <label htmlFor="rs-notes" className="ad-label">Notes</label>
          <textarea id="rs-notes" className="ad-input resize-none" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add notes about this reservation" />
        </div>
        <p className="ad-mono ad-muted text-xs">
          Submitted {new Date(r.createdAt).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short' })}
        </p>
      </div>
      <div className="px-6 py-4 border-t border-[#E1DBCB] flex items-center gap-2 flex-wrap">
        {canCreateBillingTab && ['confirmed','completed'].includes(r.status) && (
          <Button v="primary" loading={creatingBillingTab} onClick={createBillingTab} disabled={offline} title={offlineTitle}>Create billing tab</Button>
        )}
        {r.status !== 'completed' && <Button v="ghost" onClick={() => setStatus('completed')} disabled={offline} title={offlineTitle}>Mark done</Button>}
        <Button v="ghost" onClick={saveNotes} disabled={offline} title={offlineTitle}>Save notes</Button>
        <span className="flex-1" />
        {r.status !== 'cancelled' && <Button v="danger" onClick={() => setStatus('cancelled')} disabled={offline} title={offlineTitle}>Cancel reservation…</Button>}
        <Button v="danger" onClick={() => { onClose(); onDeleteRequest(r); }} disabled={offline} title={offlineTitle}>Delete…</Button>
      </div>
    </Modal>
  );
}

// ── Main page (all logic unchanged) ──────────────────────────────────────────
export default function ReservationsPage() {
  const capabilities = useCapabilities();
  const { status } = useConnectivity();
  const offline = status !== 'online';
  const offlineTitle = offline ? 'Reconnect to make changes' : undefined;
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading,      setLoading]      = useState(true);
  const [loadError,    setLoadError]    = useState('');
  const [selected,     setSelected]     = useState<Reservation | null>(null);
  const [toDelete,     setToDelete]     = useState<Reservation | null>(null);
  const [dateFilter,   setDateFilter]   = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [courtFilter,  setCourtFilter]  = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    const params: { date?: string; status?: string } = {};
    if (dateFilter)             params.date   = dateFilter;
    if (statusFilter !== 'all') params.status = statusFilter;
    try {
      const data = await getReservations(params);
      setReservations(data);
    } catch (error) {
      setReservations([]);
      setLoadError(error instanceof OfflineUnavailableError
        ? error.message === 'Not cached for this date'
          ? error.message
          : 'Not cached yet. Open this page once while online.'
        : 'Could not load reservations.');
      if (!(error instanceof OfflineUnavailableError)) {
        console.error('Could not load reservations.', error);
      }
    } finally {
      setLoading(false);
    }
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
    awaiting:  loadError ? '—' : reservations.filter(r => ['pending', 'pending_admin', 'approved_waiting_payment'].includes(r.status)).length,
    confirmed: loadError ? '—' : reservations.filter(r => r.status === 'confirmed').length,
  };

  return (
    <>
      {selected && (
        <DetailModal r={selected} onClose={() => setSelected(null)}
          onUpdate={() => { load(); setSelected(null); }}
          onDeleteRequest={r => setToDelete(r)}
          canCreateBillingTab={capabilities.modules.item_tabs} />
      )}
      {toDelete && (
        <DeleteModal r={toDelete} onClose={() => setToDelete(null)}
          onDeleted={() => { setToDelete(null); load(); }} />
      )}

      <div className="w-full">
        {/* Header */}
        <div className="mb-6 flex items-end justify-between flex-wrap gap-4">
          <div>
            <p className="ad-eyebrow">Management</p>
            <h1 className="ad-h1">Reservations</h1>
          </div>
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="ad-eyebrow mb-0.5">Awaiting payment</div>
              <div className="ad-mono text-2xl font-bold text-[#B8821A]">{counts.awaiting}</div>
            </div>
            <div className="text-right">
              <div className="ad-eyebrow mb-0.5">Confirmed</div>
              <div className="ad-mono text-2xl font-bold text-[#1F8A7A]">{counts.confirmed}</div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row flex-wrap gap-3 mb-6 items-start sm:items-end">
          <div className="flex items-end gap-2">
            <div>
              <label htmlFor="rs-date" className="ad-label">Date</label>
              <input id="rs-date" type="date" value={dateFilter} onChange={e => setDateFilter(e.target.value)} className="ad-input" />
            </div>
            {dateFilter && <Button v="ghost" onClick={() => setDateFilter('')}>Clear</Button>}
          </div>
          <div className="flex gap-2 flex-wrap">
            {STATUS_FILTERS.map(f => (
              <button key={f.value} type="button" aria-pressed={statusFilter === f.value}
                className={`filter-btn${statusFilter === f.value ? ' active' : ''}`} onClick={() => setStatusFilter(f.value)}>
                {f.label}
              </button>
            ))}
          </div>
          <div className="flex gap-2 flex-wrap sm:ml-auto">
            {['all', '1', '2', '3', '4'].map(c => (
              <button key={c} type="button" aria-pressed={courtFilter === c}
                className={`filter-btn${courtFilter === c ? ' active' : ''}`} onClick={() => setCourtFilter(c)}>
                {c === 'all' ? 'All' : `C${c}`}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-16 text-center ad-muted text-sm">Loading...</div>
        ) : loadError ? (
          <div className="p-12 text-center rounded-xl bg-amber-50 border border-amber-200">
            <p className="text-sm text-amber-900">{loadError}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-14 text-center">
            <p className="font-bold">No reservations found.</p>
            {dateFilter && <p className="ad-muted text-sm mt-1">Try clearing the date filter.</p>}
          </div>
        ) : (
          <div className="flex flex-col gap-8">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, items]) => (
              <section key={date}>
                <div className="flex items-baseline justify-between gap-3 mb-1">
                  <h2 className={`text-[17px] font-bold ${date === todayStr() ? 'text-[#1F8A7A]' : ''}`}>
                    {fmtDate(date)}
                    {date === todayStr() && <span className="ad-eyebrow ml-2">Today</span>}
                  </h2>
                  <span className="ad-mono ad-muted text-xs">{items.length} booking{items.length !== 1 ? 's' : ''}</span>
                </div>

                {/* Desktop table header */}
                <div className="hidden md:grid gap-3 border-b-2 border-[#0E2420] py-2" style={{ gridTemplateColumns: COLS }}>
                  {['Time', 'Name', 'Contact', 'Court', 'Pax', 'Status', ''].map((h, i) => <span key={i} className="ad-eyebrow">{h}</span>)}
                </div>

                {items.map(r => {
                  const s = STATUS_STYLE[r.status] ?? { tone: 'off' as StatusTone, text: r.status };
                  return (
                    <div key={r._id} className="border-b border-[#E1DBCB]">
                      {/* Desktop row */}
                      <div className="hidden md:grid gap-3 py-3.5 items-center hover:bg-[#EDE8D8]/50 transition-colors cursor-pointer"
                        style={{ gridTemplateColumns: COLS }} onClick={() => setSelected(r)}>
                        <div className="ad-mono text-sm">{r.timeSlot.split('-')[0]}</div>
                        <div className="min-w-0">
                          <div className="text-[15px] font-bold truncate">{r.name}</div>
                          {r.notes && <div className="ad-muted text-xs truncate mt-0.5">{r.notes}</div>}
                        </div>
                        <div className="min-w-0">
                          <div className="ad-mono text-xs">{r.phone}</div>
                          {r.email && <div className="ad-muted text-xs truncate">{r.email}</div>}
                        </div>
                        <div className="text-sm">Court {r.court}</div>
                        <div className="ad-mono text-sm">{r.playerCount}</div>
                        <div><StatusDot tone={s.tone}>{s.text}</StatusDot></div>
                        <div className="flex gap-2 justify-end" onClick={e => e.stopPropagation()}>
                          <Button v="ghost" size="sm" onClick={() => setSelected(r)}>View</Button>
                        </div>
                      </div>

                      {/* Mobile card */}
                      <div className="md:hidden py-4">
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <div className="min-w-0">
                            <p className="text-[15px] font-bold truncate">{r.name}</p>
                            <p className="ad-mono ad-muted text-xs mt-0.5">{r.phone}</p>
                          </div>
                          <StatusDot tone={s.tone}>{s.text}</StatusDot>
                        </div>
                        <p className="ad-muted text-sm mb-3">
                          <span className="ad-mono">{r.timeSlot.split('-')[0]}</span> · Court {r.court} · {r.playerCount} pax · {r.duration}h
                        </p>
                        <div className="flex gap-2">
                          <Button v="ghost" className="flex-1" onClick={() => setSelected(r)}>View</Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
