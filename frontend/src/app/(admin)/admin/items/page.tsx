'use client';
import { useState, useEffect, useCallback } from 'react';
import { sileo } from 'sileo';
import { getAllItems, createItem, updateItem, deleteItem } from '@/lib/api';
import type { CatalogItem } from '@/lib/api';
import { Button } from '@/app/components/ui/Button';
import { useSocketEvent } from '@/hooks/useSocketEvent';

// ── Constants (unchanged) ─────────────────────────────────────────────────────
const CATEGORIES = ['general', 'drinks', 'equipment', 'food', 'court fee'];

const CATEGORY_CLS: Record<string, string> = {
  general:     'bg-gray-100 text-gray-500',
  drinks:      'bg-blue-50 text-blue-600',
  equipment:   'bg-yellow-50 text-yellow-700',
  food:        'bg-orange-50 text-orange-600',
  'court fee': 'bg-green-50 text-green-700',
};

const inputCls = 'w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-800 outline-none focus:border-green-400 transition-colors';
const labelCls = 'block text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5';

interface ItemForm { name: string; price: string; category: string; isSplittable: boolean; }
const emptyForm: ItemForm = { name: '', price: '', category: 'general', isSplittable: false };

// ── Toggle (same logic, Tailwind only) ────────────────────────────────────────
function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => onChange(!checked)}>
      <div className={`relative w-8 h-[18px] rounded-full transition-colors shrink-0 ${checked ? 'bg-green-500' : 'bg-gray-300'}`}>
        <div className={`absolute top-[2px] w-3.5 h-3.5 bg-white rounded-full shadow transition-all duration-150 ${checked ? 'left-[18px]' : 'left-[2px]'}`} />
      </div>
      <span className={`text-xs select-none ${checked ? 'text-green-700' : 'text-gray-500'}`}>{label}</span>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  return (
    <span className={`text-[0.65rem] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded whitespace-nowrap ${CATEGORY_CLS[category] ?? 'bg-gray-100 text-gray-500'}`}>
      {category}
    </span>
  );
}

// ── Main (all logic identical) ────────────────────────────────────────────────
export default function ItemsPage() {
  const [items,    setItems]    = useState<CatalogItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(emptyForm);
  const [form,     setForm]     = useState<ItemForm>(emptyForm);
  const [showAdd,  setShowAdd]  = useState(false);
  const [filter,   setFilter]   = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setItems(await getAllItems());
    setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent('items:updated', useCallback(() => { load(); }, [load]));

  const handleAdd = async () => {
    if (!form.name.trim() || !form.price) return;
    setSaving(true);
    await sileo.promise(
      createItem({ name: form.name.trim(), price: Number(form.price), category: form.category, isActive: true, isSplittable: form.isSplittable }),
      { loading: { title: 'Adding item...' }, success: { title: 'Item added!', description: form.name.trim() }, error: { title: 'Failed' } }
    );
    setForm(emptyForm); setShowAdd(false); await load(); setSaving(false);
  };

  const handleSave = async (id: string) => {
    await updateItem(id, { name: editForm.name, price: Number(editForm.price), category: editForm.category, isSplittable: editForm.isSplittable });
    sileo.success({ title: 'Updated', description: editForm.name });
    setEditId(null); await load();
  };

  const handleToggleActive = async (item: CatalogItem) => {
    await updateItem(item._id, { isActive: !item.isActive });
    await load();
  };

  const handleDelete = async (item: CatalogItem) => {
    if (!confirm(`Delete "${item.name}"?`)) return;
    await deleteItem(item._id);
    sileo.success({ title: 'Deleted', description: item.name });
    await load();
  };

  const filtered = items.filter(i => filter === 'all' || i.category === filter);
  const grouped  = CATEGORIES.reduce((acc, cat) => {
    const c = filtered.filter(i => i.category === cat);
    if (c.length > 0) acc[cat] = c;
    return acc;
  }, {} as Record<string, CatalogItem[]>);

  return (
    <div className="w-full font-sans">

      {/* Header */}
      <div className="mb-6 pb-5 border-b border-gray-100 flex items-end justify-between flex-wrap gap-4">
        <div>
          <p className="text-[0.72rem] font-medium tracking-wide uppercase text-gray-400 mb-1.5">Management</p>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Item Catalog</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400">Active</div>
            <div className="font-mono text-xl text-green-700 font-semibold">{items.filter(i => i.isActive).length}</div>
          </div>
          <Button v="primary" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add Item'}
          </Button>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 sm:p-5 mb-5">
          <p className={labelCls}>New Item</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Name</label>
              <input className={inputCls} placeholder="e.g. Yonex AS-50"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Price (₱)</label>
              <input className={inputCls} type="number" placeholder="0.00"
                value={form.price} onChange={e => setForm({ ...form, price: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Category</label>
              <select className={inputCls} value={form.category} onChange={e => setForm({ ...form, category: e.target.value })}>
                {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
              </select>
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Toggle checked={form.isSplittable} onChange={v => setForm({ ...form, isSplittable: v })} label="Splittable (÷ across players at queue time)" />
            <Button v="primary" onClick={handleAdd} loading={saving}>Add Item</Button>
          </div>
          {form.isSplittable && (
            <p className="text-xs text-green-600 mt-2">This item will appear in the queue shuttlecock picker and can be auto-split across all 4 players.</p>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 flex-wrap mb-4">
        {['all', ...CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-all ${
              filter === cat
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            }`}>
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Items */}
      {loading ? (
        <div className="p-16 text-center text-gray-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="p-16 text-center bg-white border border-gray-200 rounded-xl text-gray-400 text-sm">No items yet.</div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(grouped).map(([category, catItems]) => (
            <div key={category} className="bg-white border border-gray-200 rounded-xl overflow-hidden">

              {/* Category header */}
              <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
                <CategoryBadge category={category} />
                <span className="text-[0.65rem] text-gray-400 font-mono">{catItems.length}</span>
              </div>

              {/* Desktop table header */}
              <div className="hidden sm:grid px-5 py-2 border-b border-gray-50 bg-gray-50/40"
                style={{ gridTemplateColumns: '1fr 90px 120px 80px 80px 160px' }}>
                {['Name', 'Price', 'Category', 'Split', 'Status', ''].map(h => (
                  <span key={h} className="text-[0.62rem] font-bold tracking-widest uppercase text-gray-300">{h}</span>
                ))}
              </div>

              {catItems.map((item, i) => (
                <div key={item._id}
                  className={item.isActive ? '' : 'opacity-50'}
                  style={{ borderBottom: i < catItems.length - 1 ? '1px solid #f9fafb' : 'none' }}>

                  {editId === item._id ? (
                    /* Edit row */
                    <div className="px-4 sm:px-5 py-3 space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <input className={inputCls} value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                        <input className={inputCls} type="number" value={editForm.price}
                          onChange={e => setEditForm({ ...editForm, price: e.target.value })} />
                        <select className={inputCls} value={editForm.category}
                          onChange={e => setEditForm({ ...editForm, category: e.target.value })}>
                          {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>)}
                        </select>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <Toggle checked={editForm.isSplittable} onChange={v => setEditForm({ ...editForm, isSplittable: v })} label="Splittable" />
                        <div className="flex gap-1.5">
                          <Button v="primary" size="sm" onClick={() => handleSave(item._id)}>Save</Button>
                          <Button v="ghost"   size="sm" onClick={() => setEditId(null)}>Cancel</Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <>
                      {/* Desktop row */}
                      <div className="hidden sm:grid px-5 py-3 items-center"
                        style={{ gridTemplateColumns: '1fr 90px 120px 80px 80px 160px' }}>
                        <span className="text-sm font-medium text-gray-700 truncate pr-2">{item.name}</span>
                        <span className="font-mono text-sm text-gray-800">₱{item.price.toFixed(2)}</span>
                        <CategoryBadge category={item.category} />
                        <span className={`text-xs font-semibold ${item.isSplittable ? 'text-blue-500' : 'text-gray-300'}`}>
                          {item.isSplittable ? '÷ Yes' : '—'}
                        </span>
                        <span className={`text-xs font-semibold ${item.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                          {item.isActive ? 'Active' : 'Hidden'}
                        </span>
                        <div className="flex gap-1.5 justify-end">
                          <Button v="ghost" size="sm" onClick={() => { setEditId(item._id); setEditForm({ name: item.name, price: String(item.price), category: item.category, isSplittable: item.isSplittable ?? false }); }}>Edit</Button>
                          <Button v="ghost" size="sm" onClick={() => handleToggleActive(item)}>{item.isActive ? 'Hide' : 'Show'}</Button>
                          <Button v="danger" size="sm" onClick={() => handleDelete(item)}>Del</Button>
                        </div>
                      </div>

                      {/* Mobile card */}
                      <div className="sm:hidden px-4 py-3.5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-700 truncate">{item.name}</p>
                            <p className="font-mono text-sm text-gray-500 mt-0.5">₱{item.price.toFixed(2)}</p>
                          </div>
                          <CategoryBadge category={item.category} />
                        </div>
                        <div className="flex items-center gap-3 text-xs">
                          <span className={item.isSplittable ? 'text-blue-500 font-semibold' : 'text-gray-300'}>
                            {item.isSplittable ? '÷ Splittable' : 'Not splittable'}
                          </span>
                          <span className="text-gray-300">·</span>
                          <span className={item.isActive ? 'text-green-600 font-semibold' : 'text-gray-400'}>
                            {item.isActive ? 'Active' : 'Hidden'}
                          </span>
                        </div>
                        <div className="flex gap-1.5 pt-1">
                          <Button v="ghost" size="sm" onClick={() => { setEditId(item._id); setEditForm({ name: item.name, price: String(item.price), category: item.category, isSplittable: item.isSplittable ?? false }); }}>Edit</Button>
                          <Button v="ghost" size="sm" onClick={() => handleToggleActive(item)}>{item.isActive ? 'Hide' : 'Show'}</Button>
                          <Button v="danger" size="sm" onClick={() => handleDelete(item)}>Del</Button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}