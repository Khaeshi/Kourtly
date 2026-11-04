'use client';
import { useState, useEffect, useCallback } from 'react';
import { sileo } from 'sileo';
import {
  getPlayers, getItems, getOpenTabs,
  openTab, addItemToTab, removeItemFromTab, payTab, markUnpaid, payUnpaid, closeTab, splitItem,
  getTodayReservationTabs, addItemToReservationTab,
  removeItemFromReservationTab, payReservationTab, markReservationUnpaid, payReservationUnpaid, clearReservationTab,
  collectReservationBalance,
  getTabHistoryPaged, getReservationTabHistoryPaged,
  OfflineUnavailableError,
} from '@/lib/api';
import type { Player, CatalogItem, Tab, ReservationTab, PaginatedTabs, PaginatedResTabs } from '@/lib/api';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { useConnectivity } from '@/lib/connectivity';
import { Button } from '@/app/components/ui/Button';
import { Modal } from '@/app/components/ui/Modal';
import { LevelMark } from '@/app/components/ui/LevelMark';
import { StatusDot } from '@/app/components/ui/StatusDot';
import { AdminHeader } from '@/app/components/ui/AdminHeader';
import ProductPanel from '@/app/components/admin/ProductPanel';

const fmt = (n: number) => `₱${n.toFixed(2)}`;
const CARD = 'rounded-xl bg-[#FBF9F3] border border-[#C9C3B3] shadow-[0_1px_0_rgba(14,36,32,.1),0_2px_6px_rgba(14,36,32,.06)]';
const SELECTED = 'border-[#0E2420] shadow-[inset_3px_0_0_#E3A92B,0_2px_6px_rgba(14,36,32,.12)]';
const NOTICE = 'mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900';

// ── SplitModal ───────────────────────────────────────────────────────────────
// primaryTab  = the currently active tab (always charged, shown pinned at top)
// additionalIds = extra players added below the divider to split with
function SplitModal({ item, openTabs, primaryTab, onClose, onDone }: {
  item: CatalogItem; openTabs: Tab[]; primaryTab: Tab | null;
  onClose: () => void; onDone: () => void;
}) {
  const [additionalIds, setAdditionalIds] = useState<string[]>([]);
  const [loading,       setLoading]       = useState(false);
  const { status } = useConnectivity();
  const offline = status !== 'online';
  const offlineTitle = offline ? 'Reconnect to make changes' : undefined;

  const primaryId   = primaryTab?.player._id ?? null;
  const otherTabs   = openTabs.filter(t => t.player._id !== primaryId);

  // Final list sent to backend: primary always first, then additional
  const allPlayerIds = primaryId
    ? [primaryId, ...additionalIds]
    : additionalIds;

  const totalPlayers   = allPlayerIds.length;
  const perPlayer      = totalPlayers > 0
    ? Math.round((item.price / totalPlayers) * 100) / 100
    : 0;
  const isSinglePlayer = totalPlayers === 1;
  // primary is always included so canCharge is true when primaryTab exists
  const canCharge      = totalPlayers >= 1;

  const toggleAdditional = (id: string) =>
    setAdditionalIds(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const handle = async () => {
    if (!canCharge) return;
    setLoading(true);
    const successDesc = isSinglePlayer
      ? `${fmt(item.price)} fully charged to ${primaryTab?.player.name ?? 'player'}.`
      : `${fmt(item.price)} split ${totalPlayers} ways — ${fmt(perPlayer)} each.`;
    await sileo.promise(
      splitItem({ itemId: item._id, name: item.name, price: item.price, playerIds: allPlayerIds }),
      {
        loading: { title: isSinglePlayer ? 'Charging...' : 'Splitting charge...' },
        success: { title: isSinglePlayer ? 'Charged!' : 'Split complete!', description: successDesc },
        error:   { title: 'Failed' },
      }
    );
    setLoading(false); onDone(); onClose();
  };

  return (
    <Modal onClose={onClose} width="max-w-sm" label="Charge item">
      <div className="px-5 py-4 border-b border-[#E1DBCB]">
        <p className="ad-eyebrow mb-1">Charge item</p>
        <p className="text-base font-bold">{item.name}</p>
        <p className="ad-mono ad-muted text-xs mt-0.5">
          {fmt(item.price)} total
          {isSinglePlayer && ' → full charge'}
          {!isSinglePlayer && totalPlayers > 1 && ` → ${fmt(perPlayer)} × ${totalPlayers} players`}
        </p>
      </div>

      <div className="px-5 py-4 space-y-3">
        {/* PRIMARY PLAYER (pinned, always charged) */}
        <div>
          <p className="ad-label">Charged to</p>
          {primaryTab ? (
            <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 border-[#0E2420] bg-[#FBF9F3]">
              <LevelMark level={primaryTab.player.level} />
              <span className="flex-1 text-sm font-bold">{primaryTab.player.name}</span>
              <span className="ad-mono text-xs">{isSinglePlayer ? fmt(item.price) : fmt(perPlayer)}</span>
            </div>
          ) : (
            <p className="ad-error">No active tab selected. Select a player tab first.</p>
          )}
        </div>

        {/* ADDITIONAL PLAYERS (optional) */}
        {otherTabs.length > 0 && (
          <>
            <p className="ad-label !mb-0 pt-1">Also split with</p>
            <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
              {otherTabs.map(tab => {
                const checked = additionalIds.includes(tab.player._id);
                return (
                  <button key={tab._id} type="button" aria-pressed={checked} onClick={() => toggleAdditional(tab.player._id)}
                    className={`flex items-center gap-3 px-3 min-h-[44px] rounded-lg border cursor-pointer text-left transition-colors ${
                      checked ? 'bg-[#0E2420] border-[#0E2420] text-[#F5F1E8]' : 'bg-[#FBF9F3] border-[#C9C3B3] hover:border-[#0E2420]'
                    }`}>
                    <span className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 text-[10px] leading-none ${
                      checked ? 'bg-[#E3A92B] border-[#E3A92B] text-[#0E2420]' : 'border-[#8A9A94]'
                    }`}>{checked ? '✓' : ''}</span>
                    <span className={`ad-mono text-xs font-bold ${checked ? 'text-[#E3A92B]' : ''}`}>{tab.player.level}</span>
                    <span className="flex-1 text-sm font-medium">{tab.player.name}</span>
                    <span className="ad-mono text-xs opacity-80">{checked ? fmt(perPlayer) : fmt(tab.total)}</span>
                  </button>
                );
              })}
            </div>
          </>
        )}

        <p className="ad-muted text-xs">
          {isSinglePlayer
            ? `Full ${fmt(item.price)} charged to ${primaryTab?.player.name ?? '—'}.`
            : `${fmt(item.price)} ÷ ${totalPlayers} = ${fmt(perPlayer)} each.`}
        </p>
      </div>

      <div className="px-5 py-4 border-t border-[#E1DBCB] flex gap-2 justify-end">
        <Button v="ghost" onClick={onClose}>Cancel</Button>
        <Button v="primary" onClick={handle} loading={loading} disabled={!canCharge || offline} title={offlineTitle}>
          {!canCharge ? 'No player selected' : isSinglePlayer ? `Charge ${fmt(item.price)}` : `Split ${fmt(item.price)}`}
        </Button>
      </div>
    </Modal>
  );
}

// ── TabCard (all logic unchanged) ─────────────────────────────────────────────
function TabCard({ tab, isActive, onClick, onUpdate }: {
  tab: Tab; isActive: boolean; onClick: () => void; onUpdate: () => void;
}) {
  const [paying, setPaying] = useState(false);
  const { status } = useConnectivity();
  const offline = status !== 'online';
  const offlineTitle = offline ? 'Reconnect to make changes' : undefined;

  const handlePay = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setPaying(true);
    await sileo.promise(payTab(tab._id), {
      loading: { title: 'Processing...' },
      success: { title: 'Paid!', description: `${tab.player.name} — ${fmt(tab.total)}` },
      error:   { title: 'Payment failed' },
    });
    setPaying(false); onUpdate();
  };

  const handleClose = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm(`Discard ${tab.player.name}'s tab?`)) return;
    await closeTab(tab._id);
    sileo.success({ title: 'Tab closed' });
    onUpdate();
  };

  const handleRemove = async (e: React.MouseEvent, idx: number) => {
    e.stopPropagation();
    await removeItemFromTab(tab._id, idx);
    onUpdate();
  };

  return (
    <div role="button" tabIndex={0} aria-pressed={isActive} onClick={onClick}
      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); onClick(); } }}
      className={`${CARD} overflow-hidden cursor-pointer transition-colors ${isActive ? SELECTED : ''}`}>
      <div className={`px-4 py-3 flex items-center gap-2 ${tab.items.length > 0 ? 'border-b border-[#E1DBCB]' : ''}`}>
        <LevelMark level={tab.player.level} />
        <span className="flex-1 text-[15px] font-bold truncate">{tab.player.name}</span>
        <span className={`ad-mono text-sm font-bold shrink-0 ${tab.total > 0 ? '' : 'ad-muted'}`}>{fmt(tab.total)}</span>
      </div>

      {tab.items.length > 0 && (
        <div className="px-4 py-1">
          {tab.items.map((item, i) => (
            <div key={i} className={`flex items-center gap-2 py-1 ${i < tab.items.length - 1 ? 'border-b border-[#E1DBCB]' : ''}`}>
              <span className="flex-1 text-sm truncate">{item.name}</span>
              <span className="ad-mono ad-muted text-xs">×{item.quantity}</span>
              <span className="ad-mono text-xs min-w-[56px] text-right">{fmt(item.price * item.quantity)}</span>
              <button type="button" aria-label={`Remove ${item.name}`} onClick={e => handleRemove(e, i)} disabled={offline} title={offlineTitle}
                className="w-9 h-9 text-[#8A9A94] hover:text-[#B8431F] transition-colors disabled:opacity-40">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-2 border-t border-[#E1DBCB] flex gap-2 flex-wrap items-center">
        {tab.items.length > 0 && (
          <>
            <Button v="primary" size="sm" className="flex-1" onClick={handlePay} loading={paying} disabled={offline} title={offlineTitle}>
              {`Pay ${fmt(tab.total)}`}
            </Button>
            <Button v="warning" size="sm" disabled={offline} title={offlineTitle}
              onClick={async e => {
                e.stopPropagation();
                if (!confirm(`Mark ${tab.player.name}'s tab as unpaid?`)) return;
                await markUnpaid(tab._id);
                sileo.error({ title: 'Marked unpaid', description: `${tab.player.name} — ${fmt(tab.total)}` });
                onUpdate();
              }}>
              Not paid…
            </Button>
          </>
        )}
        <Button v="danger" size="sm" onClick={handleClose} disabled={offline} title={offlineTitle}>Close tab…</Button>
      </div>
    </div>
  );
}

// ── Main Page (all logic unchanged) ──────────────────────────────────────────
export default function BillingPage() {
  const { status } = useConnectivity();
  const offline = status !== 'online';
  const offlineTitle = offline ? 'Reconnect to make changes' : undefined;
  const [players,    setPlayers]    = useState<Player[]>([]);
  const [items,      setItems]      = useState<CatalogItem[]>([]);
  const [openTabs,   setOpenTabs]   = useState<Tab[]>([]);
  const [history,    setHistory]    = useState<Tab[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [loadError,  setLoadError]  = useState('');
  const [historyError, setHistoryError] = useState('');
  const [historyLoading, setHistoryLoading] = useState(false);
  const [activeTab,  setActiveTab]  = useState<string | null>(null);
  const [view,          setView]          = useState<'active' | 'reservations' | 'history'>('active');
  const [openingFor,    setOpeningFor]    = useState('');
  const [splitItem_,    setSplitItem]     = useState<CatalogItem | null>(null);
  const [addingItem,    setAddingItem]    = useState<string | null>(null);
  const [qty,           setQty]           = useState<Record<string, number>>({});
  const [resTabs,       setResTabs]       = useState<ReservationTab[]>([]);
  const [activeResTab,  setActiveResTab]  = useState<string | null>(null);
  const [addingResItem, setAddingResItem] = useState<string | null>(null);
  const [resQty,        setResQty]        = useState<Record<string, number>>({});

  const [resHistory,    setResHistory]    = useState<PaginatedResTabs | null>(null);
  const [historyPaged,  setHistoryPaged]  = useState<PaginatedTabs | null>(null);
  const [historyTab,    setHistoryTab]    = useState<'queue' | 'reservations'>('queue');
  const [histPage,      setHistPage]      = useState(1);
  const [resHistPage,   setResHistPage]   = useState(1);
  const [histStatus,    setHistStatus]    = useState<'all' | 'paid' | 'unpaid'>('all');
  const [histDate,      setHistDate]      = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [p, i, t, rt] = await Promise.all([
        getPlayers(), getItems(), getOpenTabs(), getTodayReservationTabs(),
      ]);
      setPlayers(p); setItems(i); setOpenTabs(t);
      setResTabs(rt);
    } catch (error) {
      setPlayers([]); setItems([]); setOpenTabs([]); setResTabs([]);
      setLoadError(error instanceof OfflineUnavailableError
        ? 'Not cached yet. Open this page once while online.'
        : 'Could not load billing data.');
      if (!(error instanceof OfflineUnavailableError)) {
        console.error('Could not load billing data.', error);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const [qh, rh] = await Promise.all([
        getTabHistoryPaged({ status: histStatus, date: histDate || undefined, page: histPage }),
        getReservationTabHistoryPaged({ status: histStatus, date: histDate || undefined, page: resHistPage }),
      ]);
      setHistoryPaged(qh);
      setResHistory(rh);
    } catch (error) {
      setHistoryPaged(null);
      setResHistory(null);
      setHistoryError(error instanceof OfflineUnavailableError
        ? 'Not cached yet. Open this page once while online.'
        : 'Could not load billing history.');
      if (!(error instanceof OfflineUnavailableError)) {
        console.error('Could not load billing history.', error);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [histStatus, histDate, histPage, resHistPage]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (view === 'history') loadHistory(); }, [view, loadHistory]);
  useSocketEvent('billing:tab_updated', useCallback(() => { loadAll(); }, [loadAll]));
  useSocketEvent('billing:tab_paid', useCallback(() => { loadAll(); loadHistory(); }, [loadAll, loadHistory]));
  useSocketEvent('reservation:updated', useCallback(() => { loadAll(); }, [loadAll]));

  const playersWithTab   = new Set(openTabs.map(t => t.player._id));
  const availablePlayers = players.filter(p => !playersWithTab.has(p._id));
  const grandTotal       = openTabs.reduce((s, t) => s + t.total, 0);
  const queueHistory     = historyPaged?.tabs ?? [];
  const activeTabObj     = openTabs.find(t => t._id === activeTab) ?? null;
  const activeResObj     = resTabs.find(t => t._id === activeResTab) ?? null;

  const getQty     = (id: string) => qty[id] ?? 1;
  const setItemQty = (id: string, val: number) => setQty(q => ({ ...q, [id]: Math.max(1, val) }));

  const handleOpenTab = async () => {
    if (!openingFor) return;
    try {
      await sileo.promise(openTab(openingFor), {
        loading: { title: 'Opening tab...' },
        success: { title: 'Tab opened!', description: players.find(p => p._id === openingFor)?.name },
        error:   { title: 'Could not open tab', description: 'Player may already have an open tab.' },
      });
      setOpeningFor(''); await loadAll();
    } catch { /* handled by sileo */ }
  };

  const handleQuickAdd = async (item: CatalogItem) => {
    if (!activeTab) return;
    if (item.isSplittable) { setSplitItem(item); return; }
    const quantity = getQty(item._id);
    setAddingItem(item._id);
    await addItemToTab(activeTab, { itemId: item._id, name: item.name, price: item.price, quantity });
    sileo.success({ title: 'Added', description: `${item.name} ×${quantity} → ${activeTabObj?.player.name}` });
    setItemQty(item._id, 1); await loadAll(); setAddingItem(null);
  };

  const handleResAdd = async (item: CatalogItem) => {
    if (!activeResTab) return;
    const q = resQty[item._id] ?? 1;
    setAddingResItem(item._id);
    const resTab = resTabs.find(t => t._id === activeResTab);
    await addItemToReservationTab(activeResTab, {
      itemId: item._id, name: item.name, price: item.price, quantity: q,
    });
    sileo.success({ title: 'Added', description: `${item.name} ×${q} → ${resTab?.guestName}` });
    setResQty(q2 => ({ ...q2, [item._id]: 1 }));
    await loadAll();
    setAddingResItem(null);
  };

  const viewBtn = (v: typeof view, label: string) => (
    <button type="button" aria-pressed={view === v} className={`filter-btn${view === v ? ' active' : ''}`} onClick={() => setView(v)}>{label}</button>
  );
  const subBtn = (on: boolean, label: string, click: () => void) => (
    <button type="button" aria-pressed={on} className={`filter-btn${on ? ' active' : ''}`} onClick={click}>{label}</button>
  );
  const pager = (p: { page: number; totalPages: number; total: number; hasPrev: boolean; hasNext: boolean }, set: (fn: (n: number) => number) => void) => (
    p.totalPages > 1 && (
      <div className="flex items-center justify-between mt-4 gap-3 flex-wrap">
        <span className="ad-mono ad-muted text-xs">Page {p.page} of {p.totalPages} · {p.total} records</span>
        <div className="flex gap-2">
          <Button v="ghost" size="sm" disabled={!p.hasPrev} onClick={() => set(n => n - 1)}>← Prev</Button>
          <Button v="ghost" size="sm" disabled={!p.hasNext} onClick={() => set(n => n + 1)}>Next →</Button>
        </div>
      </div>
    )
  );
  const chips = (list: { name: string; quantity: number }[]) => (
    <div className="flex flex-wrap gap-x-3 gap-y-1">
      {list.map((item, j) => <span key={j} className="ad-mono text-xs">{item.name} ×{item.quantity}</span>)}
    </div>
  );

  return (
    <div className="w-full">
      {loadError && <p className={NOTICE}>{loadError}</p>}
      {view === 'history' && historyError && <p className={NOTICE}>{historyError}</p>}
      {splitItem_ && (
        <SplitModal item={splitItem_} openTabs={openTabs} primaryTab={activeTabObj}
          onClose={() => setSplitItem(null)} onDone={loadAll} />
      )}

      <AdminHeader title="Billing" right={
        <div className="text-right">
          <div className="ad-eyebrow">Open tabs total</div>
          <div className="ad-mono text-3xl font-bold">{loadError ? '—' : fmt(grandTotal)}</div>
        </div>
      } />

      {/* View toggle */}
      <div className="flex gap-2 mb-6 flex-wrap">
        {viewBtn('active', `Queue tabs (${loadError ? '—' : openTabs.length})`)}
        {viewBtn('reservations', `Reservations today (${loadError ? '—' : resTabs.length})`)}
        {viewBtn('history', `History (${queueHistory.length})`)}
      </div>

      {/* ── ACTIVE VIEW ── */}
      {view === 'active' && (
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_320px] gap-8 items-start">
          <div className="w-full min-w-0">
            <div className="mb-4 flex flex-wrap gap-2 items-end">
              <div className="flex-1 min-w-[180px]">
                <label htmlFor="bl-open" className="ad-label">Open a tab for</label>
                <select id="bl-open" value={openingFor} onChange={e => setOpeningFor(e.target.value)} className="ad-input">
                  <option value="">Choose a player</option>
                  {availablePlayers.map(p => <option key={p._id} value={p._id}>{p.name} — {p.level}</option>)}
                </select>
              </div>
              <Button v="primary" onClick={handleOpenTab} disabled={!openingFor || offline} title={offlineTitle}>Open tab</Button>
            </div>

            {!activeTab && openTabs.length > 0 && (
              <p className="ad-muted text-sm mb-3">Select a player’s tab, then add charges from the panel.</p>
            )}

            {historyLoading ? (
              <div className="p-12 text-center ad-muted text-sm">Loading...</div>
            ) : historyError ? (
              <div className="p-12 text-center text-amber-800 text-sm">{historyError}</div>
            ) : loading ? (
              <div className="p-12 text-center ad-muted text-sm">Loading...</div>
            ) : openTabs.length === 0 ? (
              <div className="py-12 text-center">
                <p className="font-bold">No open tabs.</p>
                <p className="ad-muted text-sm mt-1">Choose a player above to open one.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {openTabs.map(tab => (
                  <TabCard key={tab._id} tab={tab}
                    isActive={activeTab === tab._id}
                    onClick={() => setActiveTab(t => t === tab._id ? null : tab._id)}
                    onUpdate={loadAll} />
                ))}
              </div>
            )}
          </div>

          <ProductPanel items={items} targetName={activeTabObj?.player.name ?? null}
            qty={qty} onQty={setItemQty} onAdd={handleQuickAdd} addingId={addingItem}
            offline={offline} offlineTitle={offlineTitle} allowSplit total={activeTabObj?.total ?? null}
            footnote="Items marked split are shared across several players." />
        </div>
      )}

      {/* ── RESERVATIONS VIEW ── */}
      {view === 'reservations' && (
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_320px] gap-8 items-start">
          <div className="w-full min-w-0">
            {loading ? (
              <div className="p-12 text-center ad-muted text-sm">Loading...</div>
            ) : resTabs.length === 0 ? (
              <div className="py-12 text-center">
                <p className="font-bold">No reservations today.</p>
                <p className="ad-muted text-sm mt-1">Confirmed reservations for today appear here automatically.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {resTabs.map(tab => {
                  const isActive = activeResTab === tab._id;
                  return (
                    <div key={tab._id} role="button" tabIndex={0} aria-pressed={isActive}
                      onClick={() => setActiveResTab(t => t === tab._id ? null : tab._id)}
                      onKeyDown={e => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setActiveResTab(t => t === tab._id ? null : tab._id); } }}
                      className={`${CARD} overflow-hidden cursor-pointer transition-colors ${isActive ? SELECTED : ''}`}>

                      <div className={`px-4 py-3 flex items-center gap-2 ${tab.items.length > 0 ? 'border-b border-[#E1DBCB]' : ''}`}>
                        <span className="ad-mono text-xs font-bold shrink-0">C{tab.court}</span>
                        <div className="flex-1 min-w-0">
                          <p className="text-[15px] font-bold truncate">{tab.guestName}</p>
                          <p className="ad-mono ad-muted text-xs truncate">{tab.date} · {tab.timeSlot} · {tab.duration}h</p>
                        </div>
                        <span className={`ad-mono text-sm font-bold shrink-0 ${tab.total > 0 ? '' : 'ad-muted'}`}>{fmt(tab.total)}</span>
                      </div>

                      {!!tab.paymentSummary && (
                        <div className="px-4 py-2 border-b border-[#E1DBCB] text-xs ad-mono">
                          <div className="flex justify-between"><span>Court fee</span><span>₱{tab.paymentSummary.reservationFee.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Paid online</span><span>₱{tab.paymentSummary.paidOnline.toFixed(2)}</span></div>
                          <div className="flex justify-between font-bold"><span>Balance due</span><span>₱{tab.paymentSummary.remainingBalance.toFixed(2)}</span></div>
                        </div>
                      )}

                      {tab.items.length > 0 && (
                        <div className="px-4 py-1">
                          {tab.items.map((item, i) => (
                            <div key={i} className={`flex items-center gap-2 py-1 ${i < tab.items.length - 1 ? 'border-b border-[#E1DBCB]' : ''}`}>
                              <span className="flex-1 text-sm truncate">{item.name}</span>
                              <span className="ad-mono ad-muted text-xs">×{item.quantity}</span>
                              <span className="ad-mono text-xs min-w-[56px] text-right">{fmt(item.price * item.quantity)}</span>
                              <button type="button" aria-label={`Remove ${item.name}`} disabled={offline} title={offlineTitle}
                                onClick={async e => {
                                  e.stopPropagation();
                                  await removeItemFromReservationTab(tab._id, i);
                                  loadAll();
                                }}
                                className="w-9 h-9 text-[#8A9A94] hover:text-[#B8431F] transition-colors disabled:opacity-40">✕</button>
                            </div>
                          ))}
                        </div>
                      )}

                      <div className="px-4 py-2 border-t border-[#E1DBCB] flex gap-2 flex-wrap items-center">
                        {tab.total > 0 && (
                          <Button v="primary" size="sm" className="flex-1" disabled={offline} title={offlineTitle}
                            onClick={async e => {
                              e.stopPropagation();
                              await sileo.promise(payReservationTab(tab._id), {
                                loading: { title: 'Processing...' },
                                success: { title: 'Paid!', description: `${tab.guestName} — ${fmt(tab.total)}` },
                                error:   { title: 'Payment failed' },
                              });
                              loadAll();
                            }}>
                            Pay {fmt(tab.total)}
                          </Button>
                        )}
                        <Button v="danger" size="sm" disabled={offline} title={offlineTitle}
                          onClick={async e => {
                            e.stopPropagation();
                            if (!confirm(`Clear ${tab.guestName}'s tab?`)) return;
                            await clearReservationTab(tab._id);
                            sileo.success({ title: 'Tab cleared' });
                            loadAll();
                          }}>
                          Clear tab…
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <ProductPanel items={items} targetName={activeResObj?.guestName ?? null}
            qty={resQty} onQty={(id, v) => setResQty(q2 => ({ ...q2, [id]: Math.max(1, v) }))}
            onAdd={handleResAdd} addingId={addingResItem}
            offline={offline} offlineTitle={offlineTitle} total={activeResObj?.total ?? null}
            footnote="Reservation billing has no auto-split." />
        </div>
      )}

      {/* ── HISTORY VIEW ── */}
      {view === 'history' && (
        <div>
          <div className="flex flex-wrap gap-3 mb-5 items-end">
            <div className="flex gap-2">
              {subBtn(historyTab === 'queue', `Queue (${historyPaged?.pagination.total ?? 0})`, () => { setHistoryTab('queue'); setHistPage(1); })}
              {subBtn(historyTab === 'reservations', `Reservations (${resHistory?.pagination.total ?? 0})`, () => { setHistoryTab('reservations'); setResHistPage(1); })}
            </div>
            <div className="flex gap-2">
              {(['all', 'paid', 'unpaid'] as const).map(s => (
                <button key={s} type="button" aria-pressed={histStatus === s} className={`filter-btn${histStatus === s ? ' active' : ''}`}
                  onClick={() => { setHistStatus(s); setHistPage(1); setResHistPage(1); }}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <div>
                <label htmlFor="bl-date" className="ad-label">Date</label>
                <input id="bl-date" type="date" className="ad-input" value={histDate}
                  onChange={e => { setHistDate(e.target.value); setHistPage(1); setResHistPage(1); }} />
              </div>
              {histDate && <Button v="ghost" onClick={() => setHistDate('')}>Clear</Button>}
            </div>
          </div>

          {/* ── Queue History ── */}
          {historyTab === 'queue' && (
            <>
              <div className="hidden sm:block">
                <div className="grid items-center border-b-2 border-[#0E2420] py-2 gap-3" style={{ gridTemplateColumns: '1fr 1.4fr 100px 150px 80px' }}>
                  {['Player', 'Items', 'Total', 'Status', 'Time'].map(h => <span key={h} className="ad-eyebrow">{h}</span>)}
                </div>
                {loading ? (
                  <div className="p-12 text-center ad-muted text-sm">Loading...</div>
                ) : queueHistory.length === 0 ? (
                  <div className="p-12 text-center ad-muted text-sm">No records found.</div>
                ) : queueHistory.map(tab => (
                  <div key={tab._id} className="grid items-center gap-3 py-3 border-b border-[#E1DBCB]" style={{ gridTemplateColumns: '1fr 1.4fr 100px 150px 80px' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <LevelMark level={tab.player.level} />
                      <span className="text-[15px] font-bold truncate">{tab.player.name}</span>
                    </div>
                    <div>
                      {chips(tab.items.slice(0, 2))}
                      {tab.items.length > 2 && <span className="ad-mono ad-muted text-xs">+{tab.items.length - 2} more</span>}
                    </div>
                    <span className="ad-mono text-sm font-bold">{fmt(tab.total)}</span>
                    <div>
                      {tab.status === 'unpaid' ? (
                        <Button v="warning" size="sm" disabled={offline} title={offlineTitle} onClick={async () => {
                          await payUnpaid(tab._id);
                          sileo.success({ title: 'Marked as paid', description: tab.player.name });
                          loadHistory();
                        }}>Collect unpaid</Button>
                      ) : <StatusDot tone="ok">Paid</StatusDot>}
                    </div>
                    <span className="ad-mono ad-muted text-xs">
                      {new Date(tab.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>

              {/* Mobile list — uses the same paged queue history as desktop */}
              <div className="sm:hidden">
                {queueHistory.length === 0 ? (
                  <div className="p-12 text-center ad-muted text-sm">No records found.</div>
                ) : queueHistory.map(tab => (
                  <div key={tab._id} className="border-b border-[#E1DBCB] py-4">
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <LevelMark level={tab.player.level} />
                        <span className="text-[15px] font-bold truncate">{tab.player.name}</span>
                      </div>
                      <span className="ad-mono text-sm font-bold">{fmt(tab.total)}</span>
                    </div>
                    <div className="mb-2">{chips(tab.items)}</div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="ad-mono ad-muted text-xs">{new Date(tab.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      {tab.status === 'unpaid' ? (
                        <Button v="warning" size="sm" disabled={offline} title={offlineTitle}
                          onClick={async () => { await payUnpaid(tab._id); sileo.success({ title: 'Paid', description: tab.player.name }); loadHistory(); }}>
                          Collect unpaid
                        </Button>
                      ) : <StatusDot tone={tab.status === 'paid' ? 'ok' : 'wait'}>{tab.status}</StatusDot>}
                    </div>
                  </div>
                ))}
              </div>

              {historyPaged && pager(historyPaged.pagination, setHistPage)}
            </>
          )}

          {/* ── Reservation History ── */}
          {historyTab === 'reservations' && (
            <>
              <div className="hidden sm:block">
                <div className="grid items-center border-b-2 border-[#0E2420] py-2 gap-3" style={{ gridTemplateColumns: '1.2fr 60px 1.4fr 100px 170px 100px' }}>
                  {['Guest', 'Court', 'Items', 'Total', 'Status', 'Date'].map(h => <span key={h} className="ad-eyebrow">{h}</span>)}
                </div>
                {historyLoading ? (
                  <div className="p-12 text-center ad-muted text-sm">Loading...</div>
                ) : historyError ? (
                  <div className="p-12 text-center text-amber-800 text-sm">{historyError}</div>
                ) : (resHistory?.tabs ?? []).length === 0 ? (
                  <div className="p-12 text-center ad-muted text-sm">No records found.</div>
                ) : (resHistory?.tabs ?? []).map(tab => (
                  <div key={tab._id} className="grid items-center gap-3 py-3 border-b border-[#E1DBCB]" style={{ gridTemplateColumns: '1.2fr 60px 1.4fr 100px 170px 100px' }}>
                    <div className="min-w-0">
                      <p className="text-[15px] font-bold truncate">{tab.guestName}</p>
                      <p className="ad-mono ad-muted text-xs">{tab.timeSlot} · {tab.duration}h</p>
                    </div>
                    <span className="ad-mono text-xs font-bold">C{tab.court}</span>
                    <div>
                      {tab.items.length === 0 ? <span className="ad-muted text-xs">—</span> : chips(tab.items.slice(0, 2))}
                      {tab.items.length > 2 && <span className="ad-mono ad-muted text-xs">+{tab.items.length - 2} more</span>}
                    </div>
                    <span className="ad-mono text-sm font-bold">{fmt(tab.total)}</span>
                    <div>
                      {tab.status === 'unpaid' ? (
                        <Button v="warning" size="sm" disabled={offline} title={offlineTitle} onClick={async () => {
                          await payReservationUnpaid(tab._id);
                          sileo.success({ title: 'Paid', description: tab.guestName });
                          loadHistory();
                        }}>Unpaid — collect</Button>
                      ) : tab.status === 'open' ? (
                        tab.total > 0 ? (
                          <Button v="primary" size="sm" disabled={offline} title={offlineTitle} onClick={async () => {
                            await payReservationTab(tab._id);
                            sileo.success({ title: 'Paid!', description: tab.guestName });
                            loadHistory();
                          }}>Pay {fmt(tab.total)}</Button>
                        ) : <StatusDot tone="wait">Open</StatusDot>
                      ) : <StatusDot tone="ok">Paid</StatusDot>}
                    </div>
                    <span className="ad-mono ad-muted text-xs">{tab.date}</span>
                  </div>
                ))}
              </div>

              <div className="sm:hidden">
                {(resHistory?.tabs ?? []).length === 0 ? (
                  <div className="p-12 text-center ad-muted text-sm">No records found.</div>
                ) : (resHistory?.tabs ?? []).map(tab => (
                  <div key={tab._id} className="border-b border-[#E1DBCB] py-4">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-[15px] font-bold">{tab.guestName}</p>
                        <p className="ad-mono ad-muted text-xs">{tab.timeSlot} · {tab.duration}h · Court {tab.court}</p>
                      </div>
                      <span className="ad-mono text-sm font-bold">{fmt(tab.total)}</span>
                    </div>
                    <div className="mb-2">
                      {tab.items.length === 0 ? <span className="ad-muted text-xs">No items charged</span> : chips(tab.items)}
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="ad-mono ad-muted text-xs">{tab.date}</span>
                      {tab.status === 'unpaid' ? (
                        <Button v="warning" size="sm" disabled={offline} title={offlineTitle}
                          onClick={async () => { await payReservationUnpaid(tab._id); sileo.success({ title: 'Paid', description: tab.guestName }); loadHistory(); }}>
                          Collect unpaid
                        </Button>
                      ) : <StatusDot tone={tab.status === 'paid' ? 'ok' : 'wait'}>{tab.status}</StatusDot>}
                    </div>
                  </div>
                ))}
              </div>

              {resHistory && pager(resHistory.pagination, setResHistPage)}
            </>
          )}
        </div>
      )}
    </div>
  );
}
