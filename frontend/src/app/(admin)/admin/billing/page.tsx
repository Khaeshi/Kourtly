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
} from '@/lib/api';
import type { Player, CatalogItem, Tab, ReservationTab, PaginatedTabs, PaginatedResTabs } from '@/lib/api';

// ── Constants (unchanged) ─────────────────────────────────────────────────────
const LEVEL_COLOR: Record<string, string> = {
  A: '#d97706', B: '#16a34a', C: '#0891b2', D: '#7c3aed',
};
const fmt = (n: number) => `₱${n.toFixed(2)}`;

// ── LevelBadge ────────────────────────────────────────────────────────────────
function LevelBadge({ level }: { level: string }) {
  const color = LEVEL_COLOR[level] ?? '#6b7280';
  return (
    <span className="font-mono text-[0.65rem] font-bold px-1.5 py-0.5 rounded shrink-0"
      style={{ background: `${color}18`, color }}>
      {level}
    </span>
  );
}

// ── SplitModal ───────────────────────────────────────────────────────────────
// primaryTab  = the currently active tab (always charged, shown pinned at top)
// additionalIds = extra players added below the divider to split with
function SplitModal({ item, openTabs, primaryTab, onClose, onDone }: {
  item: CatalogItem; openTabs: Tab[]; primaryTab: Tab | null;
  onClose: () => void; onDone: () => void;
}) {
  const [additionalIds, setAdditionalIds] = useState<string[]>([]);
  const [loading,       setLoading]       = useState(false);

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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/15 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-sm" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-5 py-4 border-b border-gray-100">
          <p className="text-[0.65rem] font-bold tracking-widest uppercase text-gray-400 mb-1">Charge Item</p>
          <p className="text-base font-semibold text-gray-900">{item.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {fmt(item.price)} total
            {isSinglePlayer && <span className="text-yellow-600 ml-2">→ full charge</span>}
            {!isSinglePlayer && totalPlayers > 1 && <span className="text-green-600 ml-2">→ {fmt(perPlayer)} × {totalPlayers} players</span>}
          </p>
        </div>

        <div className="px-5 py-4 space-y-3">

          {/* ── PRIMARY PLAYER (pinned, always charged) ── */}
          <div>
            <p className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-2">
              Charged to
            </p>
            {primaryTab ? (
              <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border-2 border-green-300 bg-green-50">
                {/* Lock icon to show this is fixed */}
                <span className="text-green-500 text-xs shrink-0">🔒</span>
                <LevelBadge level={primaryTab.player.level} />
                <span className="flex-1 text-sm font-semibold text-gray-800">{primaryTab.player.name}</span>
                <span className="text-xs text-gray-500 font-mono">
                  {isSinglePlayer ? fmt(item.price) : fmt(perPlayer)}
                </span>
              </div>
            ) : (
              <p className="text-xs text-red-400 px-1">No active tab selected. Select a player tab first.</p>
            )}
          </div>

          {/* ── DIVIDER ── */}
          {otherTabs.length > 0 && (
            <div className="relative flex items-center gap-3">
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 shrink-0">
                Also split with
              </span>
              <div className="flex-1 h-px bg-gray-200" />
            </div>
          )}

          {/* ── ADDITIONAL PLAYERS (optional) ── */}
          {otherTabs.length > 0 && (
            <div className="flex flex-col gap-1.5 max-h-44 overflow-y-auto">
              {otherTabs.map(tab => {
                const checked = additionalIds.includes(tab.player._id);
                return (
                  <button key={tab._id} onClick={() => toggleAdditional(tab.player._id)}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer text-left transition-all ${
                      checked ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-gray-300'
                    }`}>
                    <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-all ${
                      checked ? 'bg-green-600 border-green-600' : 'bg-white border-gray-300'
                    }`}>
                      {checked && <span className="text-white text-[10px] leading-none">✓</span>}
                    </div>
                    <LevelBadge level={tab.player.level} />
                    <span className="flex-1 text-sm font-medium text-gray-700">{tab.player.name}</span>
                    <span className="text-xs text-gray-400 font-mono">
                      {checked ? fmt(perPlayer) : fmt(tab.total)}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* hint */}
          <p className="text-[0.65rem] text-gray-400">
            {isSinglePlayer
              ? `Full ${fmt(item.price)} charged to ${primaryTab?.player.name ?? '—'}.`
              : `${fmt(item.price)} ÷ ${totalPlayers} = ${fmt(perPlayer)} each.`}
          </p>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <button onClick={onClose}
            className="px-4 py-1.5 rounded-md border border-gray-200 bg-white text-gray-500 text-xs cursor-pointer hover:bg-gray-50 transition-all">
            Cancel
          </button>
          <button onClick={handle} disabled={!canCharge || loading}
            className={`px-4 py-1.5 rounded-md border text-xs font-semibold transition-all ${
              !canCharge
                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                : isSinglePlayer
                  ? 'bg-yellow-50 border-yellow-200 text-yellow-800 hover:bg-yellow-100 cursor-pointer'
                  : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 cursor-pointer'
            }`}>
            {loading ? '...'
              : !canCharge ? 'No player selected'
              : isSinglePlayer ? `Charge ${fmt(item.price)}`
              : `Split ${fmt(item.price)}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── TabCard (all logic unchanged) ─────────────────────────────────────────────
function TabCard({ tab, isActive, onClick, onUpdate }: {
  tab: Tab; isActive: boolean; onClick: () => void; onUpdate: () => void;
}) {
  const [paying, setPaying] = useState(false);

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
    <div onClick={onClick}
      className={`bg-white rounded-xl overflow-hidden cursor-pointer transition-all ${
        isActive ? 'ring-2 ring-green-500 ring-offset-1' : 'border border-gray-200'
      }`}>
      <div className={`px-4 py-3 flex items-center gap-2 ${tab.items.length > 0 ? 'border-b border-gray-100' : ''}`}>
        <LevelBadge level={tab.player.level} />
        <span className="flex-1 text-sm font-semibold text-gray-900 truncate">{tab.player.name}</span>
        <span className={`font-mono text-sm font-semibold shrink-0 ${tab.total > 0 ? 'text-yellow-900' : 'text-gray-300'}`}>
          {fmt(tab.total)}
        </span>
      </div>

      {tab.items.length > 0 && (
        <div className="px-4 py-1.5">
          {tab.items.map((item, i) => (
            <div key={i} className={`flex items-center gap-2 py-1.5 ${i < tab.items.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <span className="flex-1 text-xs text-gray-600 truncate">{item.name}</span>
              <span className="text-[0.7rem] text-gray-400 font-mono">×{item.quantity}</span>
              <span className="text-xs text-gray-600 font-mono min-w-[44px] text-right">{fmt(item.price * item.quantity)}</span>
              <button onClick={e => handleRemove(e, i)} className="text-gray-300 hover:text-red-400 transition-colors text-xs px-0.5 leading-none">✕</button>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60 flex gap-1.5">
        {tab.items.length > 0 && (
          <>
            <button onClick={handlePay} disabled={paying}
              className="flex-1 py-1.5 rounded-md border border-yellow-200 bg-yellow-50 text-yellow-900 text-xs font-semibold cursor-pointer hover:bg-yellow-100 transition-all disabled:opacity-40">
              {paying ? '...' : `Pay ${fmt(tab.total)}`}
            </button>
            <button onClick={async e => {
                e.stopPropagation();
                if (!confirm(`Mark ${tab.player.name}'s tab as unpaid?`)) return;
                await markUnpaid(tab._id);
                sileo.error({ title: 'Marked unpaid', description: `${tab.player.name} — ${fmt(tab.total)}` });
                onUpdate();
              }}
              className="px-2.5 py-1.5 rounded-md border border-orange-200 bg-orange-50 text-orange-600 text-xs font-semibold cursor-pointer hover:bg-orange-100 transition-all">
              Not Paid
            </button>
          </>
        )}
        <button onClick={handleClose}
          className="px-2.5 py-1.5 rounded-md border border-red-100 bg-red-50/60 text-red-400 text-xs cursor-pointer hover:bg-red-100 transition-all">
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Main Page (all logic unchanged) ──────────────────────────────────────────
export default function BillingPage() {
  const [players,    setPlayers]    = useState<Player[]>([]);
  const [items,      setItems]      = useState<CatalogItem[]>([]);
  const [openTabs,   setOpenTabs]   = useState<Tab[]>([]);
  const [history,    setHistory]    = useState<Tab[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState<string | null>(null);
  const [view,          setView]          = useState<'active' | 'reservations' | 'history'>('active');
  const [openingFor,    setOpeningFor]    = useState('');
  const [search,        setSearch]        = useState('');
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
    const [p, i, t, rt] = await Promise.all([
      getPlayers(), getItems(), getOpenTabs(), getTodayReservationTabs(),
    ]);
    setPlayers(p); setItems(i); setOpenTabs(t);
    setResTabs(rt); setLoading(false);
  }, []);

  const loadHistory = useCallback(async () => {
    const [qh, rh] = await Promise.all([
      getTabHistoryPaged({ status: histStatus, date: histDate || undefined, page: histPage }),
      getReservationTabHistoryPaged({ status: histStatus, date: histDate || undefined, page: resHistPage }),
    ]);
    setHistoryPaged(qh);
    setResHistory(rh);
  }, [histStatus, histDate, histPage, resHistPage]);

  useEffect(() => { loadAll(); }, [loadAll]);
  useEffect(() => { if (view === 'history') loadHistory(); }, [view, loadHistory]);

  const playersWithTab   = new Set(openTabs.map(t => t.player._id));
  const availablePlayers = players.filter(p => !playersWithTab.has(p._id));
  const grandTotal       = openTabs.reduce((s, t) => s + t.total, 0);
  const queueHistory     = historyPaged?.tabs ?? [];
  const activeTabObj     = openTabs.find(t => t._id === activeTab) ?? null;

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

  const CATEGORY_ORDER = ['court fee', 'equipment', 'drinks', 'food', 'general'];
  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {} as Record<string, CatalogItem[]>);



  return (
    <div className="w-full font-sans">
      {splitItem_ && (
        <SplitModal item={splitItem_} openTabs={openTabs} primaryTab={activeTabObj}
          onClose={() => setSplitItem(null)} onDone={loadAll} />
      )}

      {/* Header */}
      <div className="mb-6 pb-5 border-b border-gray-100 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-[0.72rem] font-medium tracking-wide uppercase text-gray-400 mb-1.5">Management</p>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Billing</h1>
        </div>
        <div className="text-right">
          <div className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-0.5">Open Tabs Total</div>
          <div className="font-mono text-2xl font-semibold text-yellow-900">{fmt(grandTotal)}</div>
        </div>
      </div>

      {/* View toggle */}
      <div className="flex gap-1.5 mb-5 flex-wrap">
        <button onClick={() => setView('active')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-all ${
            view === 'active' ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
          }`}>
          Queue Tabs ({openTabs.length})
        </button>
        <button onClick={() => setView('reservations')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-all ${
            view === 'reservations'
              ? 'bg-blue-600 border-blue-600 text-white'
              : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
          }`}>
          Reservations Today ({resTabs.length})
          {resTabs.length > 0 && view !== 'reservations' && (
            <span className="ml-1.5 inline-flex items-center justify-center w-4 h-4 rounded-full bg-blue-500 text-white text-[0.6rem] font-bold">
              {resTabs.length}
            </span>
          )}
        </button>
        <button onClick={() => setView('history')}
          className={`px-4 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-all ${
            view === 'history' ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
          }`}>
          History ({queueHistory.length})
        </button>
      </div>

      {/* ── ACTIVE VIEW ── */}
      {view === 'active' && (
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_280px] gap-6 items-start">

          {/* LEFT: Tabs */}
          <div className="w-full min-w-0">
            {/* Open tab bar */}
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4 flex flex-wrap gap-2 items-center">
              <select value={openingFor} onChange={e => setOpeningFor(e.target.value)}
                className={`flex-1 min-w-[160px] bg-white border border-gray-200 rounded-md px-3 py-2 text-sm outline-none focus:border-green-400 ${openingFor ? 'text-gray-900' : 'text-gray-400'}`}>
                <option value="">Open tab for player...</option>
                {availablePlayers.map(p => <option key={p._id} value={p._id}>{p.name} — {p.level}</option>)}
              </select>
              <button onClick={handleOpenTab} disabled={!openingFor}
                className={`px-4 py-2 rounded-md text-xs font-semibold border transition-all ${
                  openingFor ? 'bg-green-50 border-green-200 text-green-700 cursor-pointer hover:bg-green-100' : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                }`}>
                Open Tab
              </button>
              {activeTab && (
                <span className="text-xs text-gray-400 w-full sm:w-auto">
                  Selected: <strong className="text-gray-600">{activeTabObj?.player.name}</strong>
                </span>
              )}
            </div>

            {!activeTab && openTabs.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md px-4 py-2.5 mb-3.5 text-xs text-yellow-800">
                Click a player card to select it, then use the item panel to add charges.
              </div>
            )}

            {loading ? (
              <div className="p-12 text-center text-gray-400 text-sm">Loading...</div>
            ) : openTabs.length === 0 ? (
              <div className="p-12 text-center bg-white border border-dashed border-gray-200 rounded-xl">
                <p className="text-sm text-gray-400">No open tabs. Select a player above to open one.</p>
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

          {/* RIGHT: Item sidebar */}
          <div className="w-full lg:w-auto bg-white border border-gray-200 rounded-xl overflow-hidden lg:sticky lg:top-4">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
              <p className="text-[0.65rem] font-bold tracking-widest uppercase text-gray-400">
                {activeTab ? `Add to ${activeTabObj?.player.name}` : 'Select a player first'}
              </p>
            </div>

            <div className="max-h-[60vh] lg:max-h-[calc(100vh-280px)] overflow-y-auto">
              {Object.entries(grouped).map(([cat, catItems]) => (
                <div key={cat}>
                  <div className="px-4 py-1.5 bg-gray-50/60 border-b border-gray-100">
                    <span className="text-[0.62rem] font-bold tracking-widest uppercase text-gray-300">{cat}</span>
                  </div>
                  {catItems.map(item => (
                    <div key={item._id}
                      className={`flex items-center px-3 py-2 gap-1.5 border-b border-gray-50 transition-colors ${activeTab ? 'hover:bg-gray-50' : 'opacity-45'}`}>
                      {item.isSplittable && (
                        <span className="text-[0.6rem] font-bold px-1 py-0.5 rounded shrink-0 bg-blue-50 border border-blue-200 text-blue-500">÷</span>
                      )}
                      <span className="flex-1 text-xs text-gray-600 truncate min-w-0">{item.name}</span>
                      <span className="text-[0.7rem] font-mono text-gray-400 shrink-0 min-w-[46px] text-right">
                        {fmt(item.price * getQty(item._id))}
                      </span>
                      {!item.isSplittable && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button disabled={!activeTab} onClick={e => { e.stopPropagation(); setItemQty(item._id, getQty(item._id) - 1); }}
                            className="w-5 h-5 rounded border border-gray-200 bg-white text-gray-500 text-sm flex items-center justify-center disabled:cursor-not-allowed hover:border-gray-300 transition-colors">−</button>
                          <span className="font-mono text-xs min-w-[18px] text-center text-gray-800 font-semibold">{getQty(item._id)}</span>
                          <button disabled={!activeTab} onClick={e => { e.stopPropagation(); setItemQty(item._id, getQty(item._id) + 1); }}
                            className="w-5 h-5 rounded border border-gray-200 bg-white text-gray-500 text-sm flex items-center justify-center disabled:cursor-not-allowed hover:border-gray-300 transition-colors">+</button>
                        </div>
                      )}
                      <button disabled={!activeTab} onClick={() => handleQuickAdd(item)}
                        className={`px-2 py-1 rounded text-[0.7rem] font-semibold shrink-0 border transition-all ${
                          !activeTab ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                            : item.isSplittable ? 'bg-blue-50 border-blue-200 text-blue-600 cursor-pointer hover:bg-blue-100'
                            : 'bg-green-50 border-green-200 text-green-700 cursor-pointer hover:bg-green-100'
                        }`}>
                        {addingItem === item._id ? '...' : item.isSplittable ? 'Charge' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              ))}
              {items.length === 0 && (
                <p className="p-8 text-center text-gray-400 text-xs">No items in catalog.</p>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
              <p className="text-[0.65rem] text-gray-300">
                <span className="text-blue-400 font-semibold">÷</span> items split across multiple players
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── RESERVATIONS VIEW ── */}
      {view === 'reservations' && (
        <div className="flex flex-col lg:grid lg:grid-cols-[1fr_280px] gap-6 items-start">

          {/* LEFT: Reservation tabs */}
          <div className="w-full min-w-0">
            {loading ? (
              <div className="p-12 text-center text-gray-400 text-sm">Loading...</div>
            ) : resTabs.length === 0 ? (
              <div className="p-12 text-center bg-white border border-dashed border-blue-100 rounded-xl">
                <p className="text-sm text-blue-300 font-medium mb-1">No reservations today</p>
                <p className="text-xs text-gray-400">Confirmed reservations for today will appear here automatically.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                {resTabs.map(tab => {
                  const isActive = activeResTab === tab._id;
                  return (
                    <div key={tab._id}
                      onClick={() => setActiveResTab(t => t === tab._id ? null : tab._id)}
                      className={`bg-white rounded-xl overflow-hidden cursor-pointer transition-all ${
                        isActive ? 'ring-2 ring-blue-500 ring-offset-1' : 'border border-gray-200'
                      }`}>

                      {/* Header — blue tinted to distinguish from queue tabs */}
                      <div className={`px-4 py-3 flex items-center gap-2 ${tab.items.length > 0 ? 'border-b border-gray-100' : ''}`}
                        style={{ background: isActive ? '#eff6ff' : '#f8faff' }}>
                        {/* Court badge */}
                        <span className="text-[0.65rem] font-bold px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 shrink-0">
                          C{tab.court}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">{tab.guestName}</p>
                          <p className="text-[0.65rem] text-gray-400 font-mono truncate">
                            {tab.timeSlot} · {tab.duration}h
                          </p>
                        </div>
                        <span className={`font-mono text-sm font-semibold shrink-0 ${tab.total > 0 ? 'text-yellow-900' : 'text-gray-300'}`}>
                          {fmt(tab.total)}
                        </span>
                      </div>

                      {!!tab.paymentSummary && (
                        <div className="px-4 py-2 border-b border-blue-50 text-[0.7rem] text-gray-600 bg-blue-50/20">
                          <div className="flex justify-between"><span>Court Fee</span><span>₱{tab.paymentSummary.reservationFee.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Paid Online</span><span>₱{tab.paymentSummary.paidOnline.toFixed(2)}</span></div>
                          <div className="flex justify-between"><span>Balance Due</span><span>₱{tab.paymentSummary.remainingBalance.toFixed(2)}</span></div>
                        </div>
                      )}

                      {/* Items */}
                      {tab.items.length > 0 && (
                        <div className="px-4 py-1.5">
                          {tab.items.map((item, i) => (
                            <div key={i} className={`flex items-center gap-2 py-1.5 ${i < tab.items.length - 1 ? 'border-b border-gray-50' : ''}`}>
                              <span className="flex-1 text-xs text-gray-600 truncate">{item.name}</span>
                              <span className="text-[0.7rem] text-gray-400 font-mono">×{item.quantity}</span>
                              <span className="text-xs text-gray-600 font-mono min-w-[44px] text-right">{fmt(item.price * item.quantity)}</span>
                              <button
                                onClick={async e => {
                                  e.stopPropagation();
                                  await removeItemFromReservationTab(tab._id, i);
                                  loadAll();
                                }}
                                className="text-gray-300 hover:text-red-400 transition-colors text-xs px-0.5 leading-none">
                                ✕
                              </button>
                            </div>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/60 flex gap-1.5">
                        {tab.items.length > 0 && (
                          <button
                            onClick={async e => {
                              e.stopPropagation();
                              await sileo.promise(payReservationTab(tab._id), {
                                loading: { title: 'Processing...' },
                                success: { title: 'Paid!', description: `${tab.guestName} — ${fmt(tab.total)}` },
                                error:   { title: 'Payment failed' },
                              });
                              loadAll();
                            }}
                            className="flex-1 py-1.5 rounded-md border border-yellow-200 bg-yellow-50 text-yellow-900 text-xs font-semibold cursor-pointer hover:bg-yellow-100 transition-all">
                            Pay {fmt(tab.total)}
                          </button>
                        )}
                        {(tab.paymentSummary?.remainingBalance ?? 0) > 0 && (
                          <button
                            onClick={async e => {
                              e.stopPropagation();
                              await collectReservationBalance(tab._id);
                              sileo.success({ title: 'Balance collected', description: `${tab.guestName}` });
                              loadAll();
                            }}
                            className="flex-1 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 text-xs font-semibold cursor-pointer hover:bg-blue-100 transition-all">
                            Collect Balance
                          </button>
                        )}
                        <button
                          onClick={async e => {
                            e.stopPropagation();
                            if (!confirm(`Clear ${tab.guestName}'s tab?`)) return;
                            await clearReservationTab(tab._id);
                            sileo.success({ title: 'Tab cleared' });
                            loadAll();
                          }}
                          className="px-2.5 py-1.5 rounded-md border border-red-100 bg-red-50/60 text-red-400 text-xs cursor-pointer hover:bg-red-100 transition-all">
                          ✕
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* RIGHT: Same item sidebar, wired to active reservation tab */}
          <div className="w-full lg:w-auto bg-white border border-gray-200 rounded-xl overflow-hidden lg:sticky lg:top-4">
            <div className="px-4 py-3 border-b border-blue-100 bg-blue-50/40">
              <p className="text-[0.65rem] font-bold tracking-widest uppercase text-blue-400">
                {activeResTab
                  ? `Add to ${resTabs.find(t => t._id === activeResTab)?.guestName ?? '—'}`
                  : 'Select a reservation tab'}
              </p>
            </div>

            <div className="max-h-[60vh] lg:max-h-[calc(100vh-280px)] overflow-y-auto">
              {Object.entries(
                (['court fee', 'equipment', 'drinks', 'food', 'general']).reduce((acc, cat) => {
                  const catItems = items.filter(i => i.category === cat);
                  if (catItems.length > 0) acc[cat] = catItems;
                  return acc;
                }, {} as Record<string, CatalogItem[]>)
              ).map(([cat, catItems]) => (
                <div key={cat}>
                  <div className="px-4 py-1.5 bg-gray-50/60 border-b border-gray-100">
                    <span className="text-[0.62rem] font-bold tracking-widest uppercase text-gray-300">{cat}</span>
                  </div>
                  {catItems.map(item => {
                    const q = resQty[item._id] ?? 1;
                    return (
                      <div key={item._id}
                        className={`flex items-center px-3 py-2 gap-1.5 border-b border-gray-50 transition-colors ${activeResTab ? 'hover:bg-gray-50' : 'opacity-45'}`}>
                        <span className="flex-1 text-xs text-gray-600 truncate min-w-0">{item.name}</span>
                        <span className="text-[0.7rem] font-mono text-gray-400 shrink-0 min-w-[46px] text-right">
                          {fmt(item.price * q)}
                        </span>
                        {/* Qty stepper */}
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button disabled={!activeResTab}
                            onClick={e => { e.stopPropagation(); setResQty(q2 => ({ ...q2, [item._id]: Math.max(1, q - 1) })); }}
                            className="w-5 h-5 rounded border border-gray-200 bg-white text-gray-500 text-sm flex items-center justify-center disabled:cursor-not-allowed hover:border-gray-300">−</button>
                          <span className="font-mono text-xs min-w-[18px] text-center text-gray-800 font-semibold">{q}</span>
                          <button disabled={!activeResTab}
                            onClick={e => { e.stopPropagation(); setResQty(q2 => ({ ...q2, [item._id]: q + 1 })); }}
                            className="w-5 h-5 rounded border border-gray-200 bg-white text-gray-500 text-sm flex items-center justify-center disabled:cursor-not-allowed hover:border-gray-300">+</button>
                        </div>
                        {/* Add button */}
                        <button disabled={!activeResTab}
                          onClick={async () => {
                            if (!activeResTab) return;
                            setAddingResItem(item._id);
                            const resTab = resTabs.find(t => t._id === activeResTab);
                            await addItemToReservationTab(activeResTab, {
                              itemId: item._id, name: item.name, price: item.price, quantity: q,
                            });
                            sileo.success({ title: 'Added', description: `${item.name} ×${q} → ${resTab?.guestName}` });
                            setResQty(q2 => ({ ...q2, [item._id]: 1 }));
                            await loadAll();
                            setAddingResItem(null);
                          }}
                          className={`px-2 py-1 rounded text-[0.7rem] font-semibold shrink-0 border transition-all ${
                            !activeResTab
                              ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                              : 'bg-blue-50 border-blue-200 text-blue-700 cursor-pointer hover:bg-blue-100'
                          }`}>
                          {addingResItem === item._id ? '...' : 'Add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
              <p className="text-[0.65rem] text-gray-300">Reservation billing — no auto-split</p>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY VIEW ── */}
      {view === 'history' && (
        <div>

          {/* Controls row */}
          <div className="flex flex-wrap gap-2 mb-4 items-center">

            {/* Queue / Reservations sub-toggle */}
            <div className="flex gap-1">
              <button onClick={() => { setHistoryTab('queue'); setHistPage(1); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${historyTab === 'queue' ? 'bg-gray-900 border-gray-900 text-white' : 'bg-white border-gray-200 text-gray-500'}`}>
                Queue ({historyPaged?.pagination.total ?? 0})
              </button>
              <button onClick={() => { setHistoryTab('reservations'); setResHistPage(1); }}
                className={`px-3 py-1.5 rounded-md text-xs font-medium border transition-all ${historyTab === 'reservations' ? 'bg-blue-600 border-blue-600 text-white' : 'bg-white border-gray-200 text-gray-500'}`}>
                Reservations ({resHistory?.pagination.total ?? 0})
              </button>
            </div>

            {/* Status filter */}
            <div className="flex gap-1">
              {(['all', 'paid', 'unpaid'] as const).map(s => (
                <button key={s} onClick={() => { setHistStatus(s); setHistPage(1); setResHistPage(1); }}
                  className={`px-2.5 py-1.5 rounded-md text-xs font-medium border transition-all ${
                    histStatus === s
                      ? s === 'unpaid' ? 'bg-orange-500 border-orange-500 text-white'
                        : 'bg-gray-700 border-gray-700 text-white'
                      : 'bg-white border-gray-200 text-gray-400'
                  }`}>
                  {s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>

            {/* Date filter */}
            <div className="flex items-center gap-1.5">
              <input type="date" value={histDate} onChange={e => { setHistDate(e.target.value); setHistPage(1); setResHistPage(1); }}
                className="bg-white border border-gray-200 rounded-md px-3 py-1.5 text-xs text-gray-700 outline-none focus:border-green-400" />
              {histDate && (
                <button onClick={() => setHistDate('')} className="text-xs text-gray-400 hover:text-gray-600">Clear</button>
              )}
            </div>
          </div>

          {/* ── Queue History ── */}
          {historyTab === 'queue' && (
            <>
              <div className="hidden sm:block bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="grid px-5 py-2.5 border-b border-gray-100 bg-gray-50/60"
                  style={{ gridTemplateColumns: '1fr 140px 90px 80px 90px' }}>
                  {['Player', 'Items', 'Total', 'Status', 'Time'].map(h => (
                    <span key={h} className="text-[0.65rem] font-bold tracking-widest uppercase text-gray-300">{h}</span>
                  ))}
                </div>
                {loading ? (
                  <div className="p-12 text-center text-gray-400 text-sm">Loading...</div>
                ) : queueHistory.length === 0 ? (
                  <div className="p-12 text-center text-gray-400 text-sm">No records found.</div>
                ) : queueHistory.map((tab, i) => (
                  <div key={tab._id} className="grid px-5 py-3 items-center hover:bg-gray-50/50 transition-colors"
                    style={{ gridTemplateColumns: '1fr 140px 90px 80px 90px', borderBottom: i < queueHistory.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                    <div className="flex items-center gap-2 min-w-0">
                      <LevelBadge level={tab.player.level} />
                      <span className="text-sm font-medium text-gray-700 truncate">{tab.player.name}</span>
                    </div>
                    <div className="flex flex-wrap gap-1">
                      {tab.items.slice(0, 2).map((item, j) => (
                        <span key={j} className="text-[0.65rem] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-mono">
                          {item.name} ×{item.quantity}
                        </span>
                      ))}
                      {tab.items.length > 2 && <span className="text-[0.65rem] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">+{tab.items.length - 2}</span>}
                    </div>
                    <span className="font-mono text-sm font-semibold text-yellow-900">{fmt(tab.total)}</span>
                    <div>
                      {tab.status === 'unpaid' ? (
                        <button onClick={async () => {
                          await payUnpaid(tab._id);
                          sileo.success({ title: 'Marked as paid', description: tab.player.name });
                          loadHistory();
                        }} className="text-[0.65rem] font-semibold px-2 py-0.5 rounded-full border border-orange-300 bg-orange-50 text-orange-600 cursor-pointer hover:bg-orange-100 transition-all mr-4">
                          Collect Unpaid
                        </button>
                      ) : (
                        <span className="text-[0.65rem] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">Paid</span>
                      )}
                    </div>
                    <span className="font-mono text-[0.65rem] text-gray-400">
                      {new Date(tab.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                ))}
              </div>

              {/* Mobile cards */}
              <div className="sm:hidden flex flex-col gap-3">
                {history.length === 0 ? (
                  <div className="p-12 text-center text-gray-400 text-sm">No records found.</div>
                ) : history.map(tab => (
                  <div key={tab._id} className={`bg-white rounded-xl p-4 border ${tab.status === 'unpaid' ? 'border-orange-200' : 'border-gray-200'}`}>
                    <div className="flex items-center justify-between gap-3 mb-2">
                      <div className="flex items-center gap-2">
                        <LevelBadge level={tab.player.level} />
                        <span className="text-sm font-semibold text-gray-800">{tab.player.name}</span>
                      </div>
                      <div className="text-right">
                        <p className="font-mono text-sm font-semibold text-yellow-900">{fmt(tab.total)}</p>
                        {tab.status === 'unpaid' && (
                          <button onClick={async () => { await payUnpaid(tab._id); sileo.success({ title: 'Paid', description: tab.player.name }); loadHistory(); }}
                            className="text-[0.65rem] text-orange-600 underline cursor-pointer mt-0.5">Collect</button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {tab.items.map((item, j) => (
                        <span key={j} className="text-[0.65rem] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-mono">
                          {item.name} ×{item.quantity}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="font-mono text-[0.65rem] text-gray-400">{new Date(tab.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</p>
                      <span className={`text-[0.62rem] font-semibold px-1.5 py-0.5 rounded-full border ${tab.status === 'unpaid' ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-green-50 border-green-200 text-green-600'}`}>
                        {tab.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Queue Pagination */}
              {historyPaged && historyPaged.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-1">
                  <span className="text-xs text-gray-400 font-mono">
                    Page {historyPaged.pagination.page} of {historyPaged.pagination.totalPages} · {historyPaged.pagination.total} records
                  </span>
                  <div className="flex gap-1">
                    <button disabled={!historyPaged.pagination.hasPrev} onClick={() => setHistPage(p => p - 1)}
                      className="px-3 py-1.5 rounded-md border text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed bg-white border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
                      ← Prev
                    </button>
                    <button disabled={!historyPaged.pagination.hasNext} onClick={() => setHistPage(p => p + 1)}
                      className="px-3 py-1.5 rounded-md border text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed bg-white border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {/* ── Reservation History ── */}
          {historyTab === 'reservations' && (
            <>
              <div className="hidden sm:block bg-white border border-blue-100 rounded-xl overflow-hidden">
                <div className="grid px-5 py-2.5 border-b border-blue-50 bg-blue-50/40"
                  style={{ gridTemplateColumns: '1fr 70px 140px 90px 80px 90px' }}>
                  {['Guest', 'Court', 'Items', 'Total', 'Status', 'Date'].map(h => (
                    <span key={h} className="text-[0.65rem] font-bold tracking-widest uppercase text-blue-300">{h}</span>
                  ))}
                </div>
                {(resHistory?.tabs ?? []).length === 0 ? (
                  <div className="p-12 text-center text-gray-400 text-sm">No records found.</div>
                ) : (resHistory?.tabs ?? []).map((tab, i) => (
                  <div key={tab._id} className="grid px-5 py-3 items-center hover:bg-blue-50/30 transition-colors"
                    style={{ gridTemplateColumns: '1fr 70px 140px 90px 80px 90px', borderBottom: i < (resHistory?.tabs.length ?? 0) - 1 ? '1px solid #f0f4ff' : 'none' }}>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-700 truncate">{tab.guestName}</p>
                      <p className="text-[0.65rem] text-gray-400 font-mono">{tab.timeSlot} · {tab.duration}h</p>
                    </div>
                    <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded w-fit">C{tab.court}</span>
                    <div className="flex flex-wrap gap-1">
                      {tab.items.slice(0, 2).map((item, j) => (
                        <span key={j} className="text-[0.65rem] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-mono">
                          {item.name} ×{item.quantity}
                        </span>
                      ))}
                      {tab.items.length > 2 && <span className="text-[0.65rem] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">+{tab.items.length - 2}</span>}
                      {tab.items.length === 0 && <span className="text-[0.65rem] text-gray-300">—</span>}
                    </div>
                    <span className="font-mono text-sm font-semibold text-yellow-900">{fmt(tab.total)}</span>
                    <div>
                      {tab.status === 'unpaid' ? (
                        <button onClick={async () => {
                          await payReservationUnpaid(tab._id);
                          sileo.success({ title: 'Paid', description: tab.guestName });
                          loadHistory();
                        }} className="text-[0.65rem] font-semibold px-2 py-0.5 rounded-full border border-orange-300 bg-orange-50 text-orange-600 cursor-pointer hover:bg-orange-100">
                          Unpaid — Collect
                        </button>
                      ) : (
                        <span className="text-[0.65rem] font-semibold text-green-600 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">Paid</span>
                      )}
                    </div>
                    <span className="font-mono text-[0.65rem] text-gray-400">{tab.date}</span>
                  </div>
                ))}
              </div>

              {/* Mobile */}
              <div className="sm:hidden flex flex-col gap-3">
                {(resHistory?.tabs ?? []).length === 0 ? (
                  <div className="p-12 text-center text-gray-400 text-sm">No records found.</div>
                ) : (resHistory?.tabs ?? []).map(tab => (
                  <div key={tab._id} className={`bg-white rounded-xl p-4 border ${tab.status === 'unpaid' ? 'border-orange-200' : 'border-blue-100'}`}>
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <div>
                        <p className="text-sm font-semibold text-gray-800">{tab.guestName}</p>
                        <p className="text-[0.65rem] text-gray-400 font-mono">{tab.timeSlot} · {tab.duration}h</p>
                      </div>
                      <div className="text-right">
                        <span className="text-xs font-bold text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded block mb-1">Court {tab.court}</span>
                        <span className="font-mono text-sm font-semibold text-yellow-900">{fmt(tab.total)}</span>
                        {tab.status === 'unpaid' && (
                          <button onClick={async () => { await payReservationUnpaid(tab._id); sileo.success({ title: 'Paid', description: tab.guestName }); loadHistory(); }}
                            className="block text-[0.65rem] text-orange-600 underline cursor-pointer mt-0.5">Collect</button>
                        )}
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-1.5">
                      {tab.items.length === 0
                        ? <span className="text-xs text-gray-300">No items charged</span>
                        : tab.items.map((item, j) => (
                          <span key={j} className="text-[0.65rem] bg-blue-50 text-blue-700 border border-blue-200 rounded px-1.5 py-0.5 font-mono">
                            {item.name} ×{item.quantity}
                          </span>
                        ))}
                    </div>
                    <div className="flex items-center justify-between">
                      <p className="text-xs text-gray-400 font-mono">{tab.date}</p>
                      <span className={`text-[0.62rem] font-semibold px-1.5 py-0.5 rounded-full border ${tab.status === 'unpaid' ? 'bg-orange-50 border-orange-200 text-orange-600' : 'bg-green-50 border-green-200 text-green-600'}`}>
                        {tab.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              {/* Reservation Pagination */}
              {resHistory && resHistory.pagination.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 px-1">
                  <span className="text-xs text-gray-400 font-mono">
                    Page {resHistory.pagination.page} of {resHistory.pagination.totalPages} · {resHistory.pagination.total} records
                  </span>
                  <div className="flex gap-1">
                    <button disabled={!resHistory.pagination.hasPrev} onClick={() => setResHistPage(p => p - 1)}
                      className="px-3 py-1.5 rounded-md border text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed bg-white border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
                      ← Prev
                    </button>
                    <button disabled={!resHistory.pagination.hasNext} onClick={() => setResHistPage(p => p + 1)}
                      className="px-3 py-1.5 rounded-md border text-xs font-medium disabled:opacity-30 disabled:cursor-not-allowed bg-white border-gray-200 text-gray-600 hover:border-gray-300 transition-all">
                      Next →
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}