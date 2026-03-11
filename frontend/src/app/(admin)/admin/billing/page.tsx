'use client';
import { useState, useEffect, useCallback } from 'react';
import { sileo } from 'sileo';
import {
  getPlayers, getItems, getOpenTabs, getTabHistory,
  openTab, addItemToTab, removeItemFromTab, payTab, closeTab, splitItem,
} from '@/lib/api';
import type { Player, CatalogItem, Tab } from '@/lib/api';

const LEVEL_COLOR: Record<string, string> = {
  A: '#d97706', B: '#16a34a', C: '#0891b2', D: '#7c3aed',
};

const fmt = (n: number) => `₱${n.toFixed(2)}`;

function LevelBadge({ level }: { level: string }) {
  const color = LEVEL_COLOR[level] ?? '#6b7280';
  return (
    <span className="font-mono text-[0.65rem] font-bold px-1.5 py-0.5 rounded shrink-0"
      style={{ background: `${color}18`, color }}>
      {level}
    </span>
  );
}

const Btn = ({
  v = 'ghost', children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { v?: 'primary' | 'ghost' | 'danger' | 'gold' }) => {
  const cls = {
    primary: 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100',
    ghost:   'bg-white border border-gray-200 text-gray-500 hover:border-gray-300',
    danger:  'bg-red-50 border border-red-100 text-red-400 hover:bg-red-100',
    gold:    'bg-yellow-50 border border-yellow-200 text-yellow-900 hover:bg-yellow-100',
  };
  return (
    <button {...props}
      className={`${cls[v]} px-3 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-40 ${props.className ?? ''}`}>
      {children}
    </button>
  );
};

// ── Split Modal ───────────────────────────────────────────────────────────────
function SplitModal({ item, openTabs, onClose, onDone }: {
  item: CatalogItem; openTabs: Tab[]; onClose: () => void; onDone: () => void;
}) {
  const [selected, setSelected] = useState<string[]>([]);
  const [loading,  setLoading]  = useState(false);

  const toggle = (id: string) =>
    setSelected(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id]);

  const splitPrice = selected.length > 0
    ? Math.round((item.price / selected.length) * 100) / 100 : 0;

  const handle = async () => {
    if (selected.length < 2) return;
    setLoading(true);
    await sileo.promise(
      splitItem({ itemId: item._id, name: item.name, price: item.price, playerIds: selected }),
      {
        loading: { title: 'Splitting charge...' },
        success: { title: 'Split complete!', description: `${fmt(item.price)} split ${selected.length} ways (${fmt(splitPrice)} each).` },
        error:   { title: 'Split failed' },
      }
    );
    setLoading(false);
    onDone();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}>
      <div className="absolute inset-0 bg-black/15 backdrop-blur-sm" />
      <div className="relative bg-white rounded-xl border border-gray-200 shadow-xl w-full max-w-[400px]"
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100">
          <p className="text-[0.65rem] font-bold tracking-widest uppercase text-gray-400 mb-1">Split Charge</p>
          <p className="text-base font-semibold text-gray-900">{item.name}</p>
          <p className="text-xs text-gray-500 mt-0.5">
            {fmt(item.price)} total
            {selected.length >= 2 && (
              <span className="text-green-600 ml-2">→ {fmt(splitPrice)} / player</span>
            )}
          </p>
        </div>

        {/* Player list */}
        <div className="px-6 py-4">
          <p className="text-[0.68rem] font-semibold tracking-widest uppercase text-gray-400 mb-3">
            Select players ({selected.length} selected, min 2)
          </p>
          <div className="flex flex-col gap-1.5 max-h-60 overflow-y-auto">
            {openTabs.length === 0 && (
              <p className="text-sm text-gray-400 text-center py-4">No open tabs. Open tabs first.</p>
            )}
            {openTabs.map(tab => {
              const checked = selected.includes(tab.player._id);
              return (
                <button key={tab._id} onClick={() => toggle(tab.player._id)}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer text-left transition-all duration-150 ${
                    checked ? 'bg-green-50 border-green-200' : 'bg-white border-gray-200 hover:border-gray-300'
                  }`}>
                  <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border-2 transition-all ${
                    checked ? 'bg-green-600 border-green-600' : 'bg-white border-gray-300'
                  }`}>
                    {checked && <span className="text-white text-[10px] leading-none">✓</span>}
                  </div>
                  <LevelBadge level={tab.player.level} />
                  <span className="flex-1 text-sm font-medium text-gray-700">{tab.player.name}</span>
                  <span className="text-xs text-gray-400 font-mono">{fmt(tab.total)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2 justify-end">
          <Btn v="ghost" onClick={onClose}>Cancel</Btn>
          <button onClick={handle} disabled={selected.length < 2 || loading}
            className={`px-5 py-1.5 rounded-md text-xs font-semibold border transition-all duration-150 ${
              selected.length < 2
                ? 'bg-gray-100 border-gray-200 text-gray-400 cursor-not-allowed'
                : 'bg-green-50 border-green-200 text-green-700 hover:bg-green-100 cursor-pointer'
            }`}>
            {loading ? 'Splitting...' : `Split ${selected.length >= 2 ? fmt(item.price) : ''}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Tab Card ──────────────────────────────────────────────────────────────────
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
    setPaying(false);
    onUpdate();
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
      className="bg-white rounded-xl overflow-hidden cursor-pointer transition-all duration-150"
      style={{
        border: `2px solid ${isActive ? '#16a34a' : '#e5e7eb'}`,
        boxShadow: isActive ? '0 0 0 3px rgba(22,163,74,0.1)' : 'none',
      }}>

      {/* Player row */}
      <div className={`px-4 py-3 flex items-center gap-2 ${tab.items.length > 0 ? 'border-b border-gray-100' : ''}`}>
        <LevelBadge level={tab.player.level} />
        <span className="flex-1 text-sm font-semibold text-gray-900 truncate">{tab.player.name}</span>
        <span className={`font-mono text-sm font-semibold shrink-0 ${tab.total > 0 ? 'text-yellow-900' : 'text-gray-300'}`}>
          {fmt(tab.total)}
        </span>
      </div>

      {/* Items */}
      {tab.items.length > 0 && (
        <div className="px-4 py-1.5">
          {tab.items.map((item, i) => (
            <div key={i} className={`flex items-center gap-2 py-1.5 ${i < tab.items.length - 1 ? 'border-b border-gray-50' : ''}`}>
              <span className="flex-1 text-xs text-gray-600">{item.name}</span>
              <span className="text-[0.7rem] text-gray-400 font-mono">×{item.quantity}</span>
              <span className="text-xs text-gray-600 font-mono min-w-[44px] text-right">
                {fmt(item.price * item.quantity)}
              </span>
              <button onClick={e => handleRemove(e, i)}
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
          <button onClick={handlePay} disabled={paying}
            className="flex-1 py-1.5 rounded-md border border-yellow-200 bg-yellow-50 text-yellow-900 text-xs font-semibold cursor-pointer hover:bg-yellow-100 transition-all duration-150 disabled:opacity-40">
            {paying ? '...' : `Pay ${fmt(tab.total)}`}
          </button>
        )}
        <button onClick={handleClose}
          className="px-2.5 py-1.5 rounded-md border border-red-100 bg-red-50/60 text-red-400 text-xs cursor-pointer hover:bg-red-100 transition-all duration-150">
          ✕
        </button>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function BillingPage() {
  const [players,    setPlayers]    = useState<Player[]>([]);
  const [items,      setItems]      = useState<CatalogItem[]>([]);
  const [openTabs,   setOpenTabs]   = useState<Tab[]>([]);
  const [history,    setHistory]    = useState<Tab[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [activeTab,  setActiveTab]  = useState<string | null>(null);
  const [view,       setView]       = useState<'active' | 'history'>('active');
  const [openingFor, setOpeningFor] = useState('');
  const [search,     setSearch]     = useState('');
  const [splitItem_, setSplitItem]  = useState<CatalogItem | null>(null);
  const [addingItem, setAddingItem] = useState<string | null>(null);
  const [qty,        setQty]        = useState<Record<string, number>>({});

  const loadAll = useCallback(async () => {
    const [p, i, t, h] = await Promise.all([getPlayers(), getItems(), getOpenTabs(), getTabHistory()]);
    setPlayers(p); setItems(i); setOpenTabs(t); setHistory(h); setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  const playersWithTab   = new Set(openTabs.map(t => t.player._id));
  const availablePlayers = players.filter(p => !playersWithTab.has(p._id));
  const grandTotal       = openTabs.reduce((s, t) => s + t.total, 0);
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
      setOpeningFor('');
      await loadAll();
    } catch { /* handled by sileo */ }
  };

  const handleQuickAdd = async (item: CatalogItem) => {
    if (!activeTab) return;
    if (item.isSplittable) { setSplitItem(item); return; }
    const quantity = getQty(item._id);
    setAddingItem(item._id);
    await addItemToTab(activeTab, { itemId: item._id, name: item.name, price: item.price, quantity });
    sileo.success({ title: 'Added', description: `${item.name} ×${quantity} → ${activeTabObj?.player.name}` });
    setItemQty(item._id, 1);
    await loadAll();
    setAddingItem(null);
  };

  const CATEGORY_ORDER = ['court fee', 'equipment', 'drinks', 'food', 'general'];
  const grouped = CATEGORY_ORDER.reduce((acc, cat) => {
    const catItems = items.filter(i => i.category === cat);
    if (catItems.length > 0) acc[cat] = catItems;
    return acc;
  }, {} as Record<string, CatalogItem[]>);

  const filteredHistory = history.filter(t =>
    t.player.name.toLowerCase().includes(search.toLowerCase())
  );

  const inputCls = "bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 outline-none focus:border-green-400 transition-colors duration-150";

  return (
    <div className="w-full font-sans">
      {splitItem_ && (
        <SplitModal
          item={splitItem_}
          openTabs={openTabs}
          onClose={() => setSplitItem(null)}
          onDone={loadAll}
        />
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
      <div className="flex gap-1.5 mb-5">
        {(['active', 'history'] as const).map(v => (
          <button key={v} onClick={() => setView(v)}
            className={`px-4 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-all duration-150 ${
              view === v
                ? 'bg-gray-900 border-gray-900 text-white'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            }`}>
            {v === 'active' ? `Active (${openTabs.length})` : `History (${history.length})`}
          </button>
        ))}
      </div>

      {/* ── ACTIVE VIEW ── */}
      {view === 'active' && (
        <div className="grid gap-6 items-start" style={{ gridTemplateColumns: '1fr 280px' }}>

          {/* LEFT: Tabs */}
          <div>
            {/* Open tab bar */}
            <div className="bg-white border border-gray-200 rounded-lg px-4 py-3 mb-4 flex gap-2 items-center flex-wrap">
              <select value={openingFor} onChange={e => setOpeningFor(e.target.value)}
                className={`flex-1 min-w-[160px] ${inputCls} ${openingFor ? 'text-gray-900' : 'text-gray-400'}`}>
                <option value="">Open tab for player...</option>
                {availablePlayers.map(p => (
                  <option key={p._id} value={p._id}>{p.name} — {p.level}</option>
                ))}
              </select>
              <button onClick={handleOpenTab} disabled={!openingFor}
                className={`px-4 py-2 rounded-md text-xs font-semibold border transition-all duration-150 ${
                  openingFor
                    ? 'bg-green-50 border-green-200 text-green-700 cursor-pointer hover:bg-green-100'
                    : 'bg-gray-50 border-gray-200 text-gray-400 cursor-not-allowed'
                }`}>
                Open Tab
              </button>
              {activeTab && (
                <span className="text-xs text-gray-400">
                  Selected: <strong className="text-gray-600">{activeTabObj?.player.name}</strong>
                </span>
              )}
            </div>

            {/* Hint */}
            {!activeTab && openTabs.length > 0 && (
              <div className="bg-yellow-50 border border-yellow-200 rounded-md px-4 py-2.5 mb-3.5 text-xs text-yellow-800">
                Click a player card to select it, then use the item panel on the right to add charges.
              </div>
            )}

            {/* Cards grid */}
            {loading ? (
              <div className="p-12 text-center text-gray-400 text-sm">Loading...</div>
            ) : openTabs.length === 0 ? (
              <div className="p-12 text-center bg-white border border-dashed border-gray-200 rounded-xl">
                <p className="text-sm text-gray-400">No open tabs. Select a player above to open one.</p>
              </div>
            ) : (
              <div className="grid gap-3" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))' }}>
                {openTabs.map(tab => (
                  <TabCard
                    key={tab._id}
                    tab={tab}
                    isActive={activeTab === tab._id}
                    onClick={() => setActiveTab(t => t === tab._id ? null : tab._id)}
                    onUpdate={loadAll}
                  />
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Item sidebar */}
          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden sticky top-4">
            <div className="px-4 py-3 border-b border-gray-100 bg-gray-50/60">
              <p className="text-[0.65rem] font-bold tracking-widest uppercase text-gray-400">
                {activeTab ? `Add to ${activeTabObj?.player.name}` : 'Select a player first'}
              </p>
            </div>

            <div style={{ maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
              {Object.entries(grouped).map(([cat, catItems]) => (
                <div key={cat}>
                  {/* Category sub-header */}
                  <div className="px-4 py-1.5 bg-gray-50/60 border-b border-gray-100">
                    <span className="text-[0.62rem] font-bold tracking-widest uppercase text-gray-300">{cat}</span>
                  </div>

                  {catItems.map(item => (
                    <div key={item._id}
                      className={`flex items-center px-3 py-2 gap-1.5 border-b border-gray-50 transition-colors duration-100 ${activeTab ? 'hover:bg-gray-50' : 'opacity-45'}`}>

                      {/* Splittable badge */}
                      {item.isSplittable && (
                        <span className="text-[0.6rem] font-bold px-1 py-0.5 rounded shrink-0 bg-blue-50 border border-blue-200 text-blue-500">÷</span>
                      )}

                      {/* Name */}
                      <span className="flex-1 text-xs text-gray-600 truncate min-w-0">{item.name}</span>

                      {/* Price × qty */}
                      <span className="text-[0.7rem] font-mono text-gray-400 shrink-0 min-w-[46px] text-right">
                        {fmt(item.price * getQty(item._id))}
                      </span>

                      {/* Qty stepper (non-splittable) */}
                      {!item.isSplittable && (
                        <div className="flex items-center gap-0.5 shrink-0">
                          <button disabled={!activeTab}
                            onClick={e => { e.stopPropagation(); setItemQty(item._id, getQty(item._id) - 1); }}
                            className="w-5 h-5 rounded border border-gray-200 bg-white text-gray-500 text-sm flex items-center justify-center disabled:cursor-not-allowed hover:border-gray-300 transition-colors">
                            −
                          </button>
                          <span className="font-mono text-xs min-w-[18px] text-center text-gray-800 font-semibold">
                            {getQty(item._id)}
                          </span>
                          <button disabled={!activeTab}
                            onClick={e => { e.stopPropagation(); setItemQty(item._id, getQty(item._id) + 1); }}
                            className="w-5 h-5 rounded border border-gray-200 bg-white text-gray-500 text-sm flex items-center justify-center disabled:cursor-not-allowed hover:border-gray-300 transition-colors">
                            +
                          </button>
                        </div>
                      )}

                      {/* Add / Split button */}
                      <button disabled={!activeTab} onClick={() => handleQuickAdd(item)}
                        className={`px-2 py-1 rounded text-[0.7rem] font-semibold shrink-0 border transition-all duration-150 ${
                          !activeTab
                            ? 'bg-gray-50 border-gray-200 text-gray-300 cursor-not-allowed'
                            : item.isSplittable
                              ? 'bg-blue-50 border-blue-200 text-blue-600 cursor-pointer hover:bg-blue-100'
                              : 'bg-green-50 border-green-200 text-green-700 cursor-pointer hover:bg-green-100'
                        }`}>
                        {addingItem === item._id ? '...' : item.isSplittable ? 'Split' : 'Add'}
                      </button>
                    </div>
                  ))}
                </div>
              ))}

              {items.length === 0 && (
                <p className="p-8 text-center text-gray-400 text-xs">
                  No items in catalog. Add items in the Items section.
                </p>
              )}
            </div>

            <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/60">
              <p className="text-[0.65rem] text-gray-300 leading-relaxed">
                <span className="text-blue-400 font-semibold">÷</span> items split across multiple players
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORY VIEW ── */}
      {view === 'history' && (
        <div>
          <div className="flex gap-3 mb-4 items-center">
            <input className={`${inputCls} w-56`} placeholder="Search player..."
              value={search} onChange={e => setSearch(e.target.value)} />
            <span className="font-mono text-xs text-gray-400">{filteredHistory.length} records</span>
          </div>

          <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
            <div className="grid px-5 py-2.5 border-b border-gray-100 bg-gray-50/60"
              style={{ gridTemplateColumns: '1fr 160px 100px 80px' }}>
              {['Player', 'Items', 'Total', 'Time'].map(h => (
                <span key={h} className="text-[0.65rem] font-bold tracking-widest uppercase text-gray-300">{h}</span>
              ))}
            </div>

            {loading ? (
              <div className="p-12 text-center text-gray-400 text-sm">Loading...</div>
            ) : filteredHistory.length === 0 ? (
              <div className="p-12 text-center text-gray-400 text-sm">No paid tabs yet.</div>
            ) : filteredHistory.map((tab, i) => (
              <div key={tab._id}
                className="grid px-5 py-3.5 items-center hover:bg-gray-50/50 transition-colors"
                style={{
                  gridTemplateColumns: '1fr 160px 100px 80px',
                  borderBottom: i < filteredHistory.length - 1 ? '1px solid #f9fafb' : 'none',
                }}>
                <div className="flex items-center gap-2">
                  <LevelBadge level={tab.player.level} />
                  <span className="text-sm font-medium text-gray-700">{tab.player.name}</span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {tab.items.slice(0, 2).map((item, j) => (
                    <span key={j} className="text-[0.65rem] bg-green-50 text-green-700 border border-green-200 rounded px-1.5 py-0.5 font-mono">
                      {item.name} ×{item.quantity}
                    </span>
                  ))}
                  {tab.items.length > 2 && (
                    <span className="text-[0.65rem] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">
                      +{tab.items.length - 2}
                    </span>
                  )}
                </div>
                <span className="font-mono text-sm font-semibold text-yellow-900">{fmt(tab.total)}</span>
                <span className="font-mono text-[0.65rem] text-gray-400">
                  {new Date(tab.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}