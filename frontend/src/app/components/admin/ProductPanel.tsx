'use client';
import { useEffect, useState } from 'react';
import type { CatalogItem } from '@/lib/api';
import { Button } from '@/app/components/ui/Button';
import { Stepper } from '@/app/components/ui/Stepper';
import { Portal } from '@/app/components/ui/Modal';

const fmt = (n: number) => `₱${n.toFixed(2)}`;
const CATEGORY_ORDER = ['court fee', 'equipment', 'drinks', 'food', 'general'];

interface Props {
  items: CatalogItem[];
  targetName: string | null;           // name of the selected tab / reservation, null = none selected
  qty: Record<string, number>;
  onQty: (id: string, value: number) => void;
  onAdd: (item: CatalogItem) => void | Promise<void>;
  addingId: string | null;
  offline: boolean;
  offlineTitle?: string;
  allowSplit?: boolean;                // queue tabs split ÷ items, reservation tabs do not
  total?: number | null;               // running total of the selected tab
  footnote?: string;
}

function ItemRow({ item, qty, onQty, onAdd, addingId, ready, offline, offlineTitle, allowSplit }: {
  item: CatalogItem; qty: number; onQty: (v: number) => void; onAdd: () => void; addingId: string | null;
  ready: boolean; offline: boolean; offlineTitle?: string; allowSplit: boolean;
}) {
  const isSplit = allowSplit && !!item.isSplittable;
  return (
    <div className={`flex items-center gap-3 py-2 border-b border-[#E1DBCB] ${ready ? '' : 'opacity-50'}`}>
      <div className="flex-1 min-w-0">
        <p className="text-[15px] font-bold truncate">{item.name}</p>
        <p className="ad-mono ad-muted text-xs">{fmt(item.price * qty)}{isSplit ? ' · split' : ''}</p>
      </div>
      {!isSplit && <Stepper value={qty} onChange={onQty} disabled={!ready} label={item.name} />}
      <Button v={"ghost"} size="sm" disabled={!ready || offline} title={offlineTitle} onClick={onAdd}>
        {addingId === item._id ? '...' : isSplit ? 'Charge' : 'Add'}
      </Button>
    </div>
  );
}

export default function ProductPanel({
  items, targetName, qty, onQty, onAdd, addingId, offline, offlineTitle, allowSplit = false, total = null, footnote,
}: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [cat, setCat] = useState('all');
  const ready = !!targetName;

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const byCat = CATEGORY_ORDER
    .map(c => [c, items.filter(i => i.category === c)] as const)
    .filter(([, list]) => list.length > 0);
  const quick = items.filter(i => i.category !== 'court fee').slice(0, 5);
  const q = query.trim().toLowerCase();
  const shown = byCat
    .filter(([c]) => cat === 'all' || c === cat)
    .map(([c, list]) => [c, list.filter(i => !q || i.name.toLowerCase().includes(q))] as const)
    .filter(([, list]) => list.length > 0);

  const row = (item: CatalogItem) => (
    <ItemRow key={item._id} item={item} qty={qty[item._id] ?? 1} onQty={v => onQty(item._id, v)}
      onAdd={() => onAdd(item)} addingId={addingId} ready={ready} offline={offline}
      offlineTitle={offlineTitle} allowSplit={allowSplit} />
  );

  return (
    <aside className="w-full lg:border-l lg:border-[#C9C3B3] lg:pl-6">
      <p className="ad-eyebrow">{ready ? `Charging ${targetName}` : 'Select a tab first'}</p>
      <h2 className="text-[17px] font-bold mt-3 mb-1">Quick add</h2>
      {items.length === 0
        ? <p className="ad-muted text-sm py-6">No items in the catalog yet.</p>
        : quick.map(row)}
      <Button v="primary" className="w-full mt-4" onClick={() => setOpen(true)}>Browse all products</Button>
      {footnote && <p className="ad-muted text-xs mt-3">{footnote}</p>}

      <Portal>
        <div aria-hidden="true" onClick={() => setOpen(false)}
          className={`fixed inset-0 z-40 bg-[#0E2420]/40 transition-opacity duration-300 motion-reduce:transition-none ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`} />
        <section role="dialog" aria-modal={open} aria-label="All products" inert={!open}
          className={`fixed right-0 bottom-0 top-0 max-[900px]:top-16 z-40 w-full min-[901px]:w-[min(860px,calc(100vw-200px))] flex flex-col bg-[#F4F0E6] border-l-2 border-[#0E2420] text-[#0E2420] shadow-[-22px_0_50px_rgba(14,36,32,.32)] transition-transform duration-[400ms] ease-[cubic-bezier(.77,0,.175,1)] motion-reduce:transition-none ${open ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="flex-1 overflow-y-auto px-6 py-6">
            <div className="flex items-start justify-between gap-4 mb-5">
              <div>
                <p className="ad-eyebrow">Products</p>
                <h2 className="ad-h1" style={{ fontSize: 'clamp(1.5rem,3vw,2rem)' }}>{ready ? `Add to ${targetName}` : 'Select a tab first'}</h2>
              </div>
              <Button v="ghost" onClick={() => setOpen(false)}>Close</Button>
            </div>
            <div className="flex flex-wrap gap-3 items-end mb-5">
              <div className="w-full sm:w-72">
                <label htmlFor="pp-search" className="ad-label">Search products</label>
                <input id="pp-search" className="ad-input" placeholder="Name" value={query} onChange={e => setQuery(e.target.value)} />
              </div>
              <div className="flex gap-2 flex-wrap">
                {['all', ...byCat.map(([c]) => c)].map(c => (
                  <button key={c} type="button" aria-pressed={cat === c}
                    className={`filter-btn${cat === c ? ' active' : ''}`} onClick={() => setCat(c)}>
                    {c === 'all' ? 'All' : c.charAt(0).toUpperCase() + c.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            {shown.length === 0
              ? <p className="ad-muted text-sm py-8 text-center">No products match.</p>
              : shown.map(([c, list]) => (
                <div key={c} className="mb-5">
                  <p className="ad-eyebrow border-b-2 border-[#0E2420] pb-1.5">{c}</p>
                  {list.map(row)}
                </div>
              ))}
          </div>
          <div className="border-t-2 border-[#0E2420] px-6 py-4 flex items-center justify-between gap-4 shadow-[0_-10px_24px_rgba(14,36,32,.1)]">
            <span className="text-sm">
              {ready ? <>{targetName}’s tab <b className="ad-mono">{total !== null ? fmt(total) : ''}</b></> : <span className="ad-muted">Select a tab to add charges.</span>}
            </span>
            <Button v="primary" onClick={() => setOpen(false)}>Done</Button>
          </div>
        </section>
      </Portal>
    </aside>
  );
}
