'use client';
import { useState, useEffect } from 'react';
import { sileo } from 'sileo';
import { getAllItems, createItem, updateItem, deleteItem } from '@/lib/api';
import type { CatalogItem } from '@/lib/api';

const CATEGORIES = ['general', 'drinks', 'equipment', 'food', 'court fee'];

const CATEGORY_COLOR: Record<string, { bg: string; color: string }> = {
  general:     { bg: '#f3f4f6', color: '#6b7280' },
  drinks:      { bg: '#eff6ff', color: '#3b82f6' },
  equipment:   { bg: '#fefce8', color: '#ca8a04' },
  food:        { bg: '#fff7ed', color: '#ea580c' },
  'court fee': { bg: '#f0fdf4', color: '#16a34a' },
};

interface ItemForm { name: string; price: string; category: string; isSplittable: boolean; }
const emptyForm: ItemForm = { name: '', price: '', category: 'general', isSplittable: false };

const Btn = ({
  v = 'ghost', children, ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { v?: 'primary' | 'ghost' | 'danger' }) => {
  const cls = {
    primary: 'bg-green-50 border border-green-200 text-green-700 hover:bg-green-100',
    ghost:   'bg-white border border-gray-200 text-gray-500 hover:border-gray-300',
    danger:  'bg-red-50 border border-red-200 text-red-500 hover:bg-red-100',
  };
  return (
    <button {...props}
      className={`${cls[v]} px-3.5 py-1.5 rounded-md text-xs font-medium cursor-pointer transition-all duration-150 disabled:opacity-40 ${props.className ?? ''}`}>
      {children}
    </button>
  );
};

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <div className="flex items-center gap-2 cursor-pointer select-none" onClick={() => onChange(!checked)}>
      <div className="relative w-8 h-[18px] rounded-full shrink-0 transition-colors duration-150"
        style={{ background: checked ? '#16a34a' : '#d1d5db' }}>
        <div className="absolute top-[2px] w-3.5 h-3.5 rounded-full bg-white shadow-sm transition-all duration-150"
          style={{ left: checked ? '16px' : '2px' }} />
      </div>
      <span className={`text-xs transition-colors duration-150 ${checked ? 'text-green-700' : 'text-gray-500'}`}>
        {label}
      </span>
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const cc = CATEGORY_COLOR[category] ?? { bg: '#f3f4f6', color: '#6b7280' };
  return (
    <span className="text-[0.65rem] font-bold tracking-widest uppercase px-1.5 py-0.5 rounded"
      style={{ background: cc.bg, color: cc.color }}>
      {category}
    </span>
  );
}

export default function ItemsPage() {
  const [items,    setItems]    = useState<CatalogItem[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ItemForm>(emptyForm);
  const [form,     setForm]     = useState<ItemForm>(emptyForm);
  const [showAdd,  setShowAdd]  = useState(false);
  const [filter,   setFilter]   = useState('all');

  useEffect(() => { load(); }, []);

  const load = async () => { setLoading(true); setItems(await getAllItems()); setLoading(false); };

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

  const inputCls = "w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-sm text-gray-900 outline-none focus:border-green-400 transition-colors duration-150";
  const labelCls = "block text-[0.65rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5";

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
          <Btn v="primary" onClick={() => setShowAdd(!showAdd)}>
            {showAdd ? 'Cancel' : '+ Add Item'}
          </Btn>
        </div>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-lg p-5 mb-5">
          <p className={labelCls}>New Item</p>
          <div className="grid gap-4 mb-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
            <div style={{ gridColumn: 'span 2' }}>
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
          <div className="flex items-center justify-between flex-wrap gap-3">
            <Toggle
              checked={form.isSplittable}
              onChange={v => setForm({ ...form, isSplittable: v })}
              label="Splittable (÷ across players at queue time)"
            />
            <Btn v="primary" onClick={handleAdd} disabled={saving}>
              {saving ? 'Saving...' : 'Add Item'}
            </Btn>
          </div>
          {form.isSplittable && (
            <p className="text-xs text-green-600 mt-2">
              This item will appear in the queue shuttlecock picker and can be auto-split across all 4 players.
            </p>
          )}
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-1.5 mb-4 flex-wrap">
        {['all', ...CATEGORIES].map(cat => (
          <button key={cat} onClick={() => setFilter(cat)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium border cursor-pointer transition-all duration-150 ${
              filter === cat
                ? 'bg-green-50 border-green-200 text-green-700'
                : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
            }`}>
            {cat === 'all' ? 'All' : cat.charAt(0).toUpperCase() + cat.slice(1)}
          </button>
        ))}
      </div>

      {/* Items grouped by category */}
      {loading ? (
        <div className="p-12 text-center text-gray-400 text-sm">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white border border-gray-200 rounded-lg text-gray-400 text-sm">
          No items yet.
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {Object.entries(grouped).map(([category, catItems]) => (
            <div key={category} className="bg-white border border-gray-200 rounded-lg overflow-hidden">

              {/* Category header */}
              <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50/60 flex items-center gap-2">
                <CategoryBadge category={category} />
                <span className="text-[0.65rem] text-gray-400 font-mono">{catItems.length}</span>
              </div>

              {/* Table header */}
              <div className="grid px-5 py-2 border-b border-gray-50 bg-gray-50/40"
                style={{ gridTemplateColumns: '1fr 90px 120px 80px 80px 148px' }}>
                {['Name', 'Price', 'Category', 'Split', 'Status', ''].map(h => (
                  <span key={h} className="text-[0.62rem] font-bold tracking-widest uppercase text-gray-300">{h}</span>
                ))}
              </div>

              {catItems.map((item, i) => (
                <div key={item._id}
                  className={item.isActive ? '' : 'opacity-50'}
                  style={{ borderBottom: i < catItems.length - 1 ? '1px solid #f9fafb' : 'none' }}>

                  {editId === item._id ? (
                    /* ── Edit row ── */
                    <div className="px-5 py-3 flex flex-col gap-3">
                      <div className="grid gap-3"
                        style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                        <input className={inputCls} value={editForm.name}
                          onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                        <input className={inputCls} type="number" value={editForm.price}
                          onChange={e => setEditForm({ ...editForm, price: e.target.value })} />
                        <select className={inputCls} value={editForm.category}
                          onChange={e => setEditForm({ ...editForm, category: e.target.value })}>
                          {CATEGORIES.map(c => (
                            <option key={c} value={c}>{c.charAt(0).toUpperCase() + c.slice(1)}</option>
                          ))}
                        </select>
                      </div>
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <Toggle
                          checked={editForm.isSplittable}
                          onChange={v => setEditForm({ ...editForm, isSplittable: v })}
                          label="Splittable"
                        />
                        <div className="flex gap-1.5">
                          <Btn v="primary" onClick={() => handleSave(item._id)}>Save</Btn>
                          <Btn v="ghost" onClick={() => setEditId(null)}>Cancel</Btn>
                        </div>
                      </div>
                    </div>
                  ) : (
                    /* ── Display row ── */
                    <div className="grid px-5 py-3 items-center"
                      style={{ gridTemplateColumns: '1fr 90px 120px 80px 80px 148px' }}>
                      <span className="text-sm font-medium text-gray-700">{item.name}</span>
                      <span className="font-mono text-sm text-gray-800">₱{item.price.toFixed(2)}</span>
                      <CategoryBadge category={item.category} />
                      <span className={`text-xs font-semibold ${item.isSplittable ? 'text-blue-500' : 'text-gray-200'}`}>
                        {item.isSplittable ? '÷ Yes' : '—'}
                      </span>
                      <span className={`text-xs font-semibold ${item.isActive ? 'text-green-600' : 'text-gray-400'}`}>
                        {item.isActive ? 'Active' : 'Hidden'}
                      </span>
                      <div className="flex gap-1.5 justify-end">
                        <Btn v="ghost" onClick={() => {
                          setEditId(item._id);
                          setEditForm({ name: item.name, price: String(item.price), category: item.category, isSplittable: item.isSplittable ?? false });
                        }}>Edit</Btn>
                        <Btn v="ghost" onClick={() => handleToggleActive(item)}>
                          {item.isActive ? 'Hide' : 'Show'}
                        </Btn>
                        <Btn v="danger" onClick={() => handleDelete(item)}>Del</Btn>
                      </div>
                    </div>
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