'use client';
import { useState, useEffect } from 'react';
import { sileo } from 'sileo';
import { getPlayers, createPlayer, updatePlayer, deletePlayer } from '@/lib/api';
import type { Player, Level, Gender } from '@/lib/api';

const LEVEL_COLOR: Record<Level, string> = { A: '#e8c84a', B: '#8BC34A', C: '#4db8a0', D: '#7a9cbf' };
const LEVEL_BG:    Record<Level, string> = { A: 'rgba(232,200,74,0.1)', B: 'rgba(139,195,74,0.1)', C: 'rgba(77,184,160,0.1)', D: 'rgba(122,156,191,0.1)' };

interface PlayerForm { name: string; level: Level; gender: Gender; age: string; }
const empty: PlayerForm = { name: '', level: 'B', gender: 'Male', age: '' };

const inputCls = "w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm outline-none transition-colors duration-150 focus:border-green-400";
const labelCls = "block text-[0.68rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5";

const Btn = ({ variant = 'primary', children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary'|'ghost'|'danger' }) => {
  const cls = {
    primary: 'bg-green-100/60 border border-green-300/50 text-green-700',
    ghost:   'bg-white border border-gray-300 text-gray-500',
    danger:  'bg-red-50 border border-red-200/60 text-red-300',
  };
  return (
    <button {...props} className={`${cls[variant]} px-4 py-1.5 rounded-md text-xs font-medium cursor-pointer tracking-wide transition-all duration-150 ${props.className ?? ''}`}>
      {children}
    </button>
  );
};

export default function PlayersPage() {
  const [players,  setPlayers]  = useState<Player[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [search,   setSearch]   = useState('');
  const [fLevel,   setFLevel]   = useState<Level | 'ALL'>('ALL');
  const [fGender,  setFGender]  = useState<Gender | 'ALL'>('ALL');
  const [form,     setForm]     = useState<PlayerForm>(empty);
  const [editForm, setEditForm] = useState<PlayerForm>(empty);
  const [showAdd,  setShowAdd]  = useState(false);

  useEffect(() => { load(); }, []);
  const load = async () => { setLoading(true); setPlayers(await getPlayers()); setLoading(false); };

  const handleAdd = async () => {
    if (!form.name.trim() || !form.age) return;
    setSaving(true);
    await sileo.promise(
      createPlayer({ name: form.name.trim(), level: form.level, gender: form.gender, age: Number(form.age) }),
      {
        loading: { title: 'Adding player...' },
        success: { title: 'Player added!', description: `${form.name.trim()} has been registered.` },
        error:   { title: 'Failed to add player', description: 'Please try again.' },
      }
    );
    setForm(empty); setShowAdd(false); await load(); setSaving(false);
  };

  const handleSave = async (id: string) => {
    await updatePlayer(id, { ...editForm, age: Number(editForm.age) });
    sileo.success({ title: 'Player updated', description: `${editForm.name} has been saved.` });
    setEditId(null); await load();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Remove this player?')) return;
    const player = players.find(p => p._id === id);
    await deletePlayer(id);
    sileo.success({ title: 'Player removed', description: `${player?.name} has been removed.` });
    await load();
  };

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    (fLevel  === 'ALL' || p.level  === fLevel) &&
    (fGender === 'ALL' || p.gender === fGender)
  );

  return (
    <div className="w-full font-sans">

      {/* Header */}
      <div className="mb-8 pb-6 border-b border-gray-100 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[0.72rem] font-medium tracking-wide uppercase text-gray-400 mb-1.5">Management</p>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Players</h1>
        </div>
        <Btn variant="primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Player'}
        </Btn>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-lg p-6 mb-6">
          <p className="text-[0.72rem] font-semibold tracking-widest uppercase text-gray-400 mb-5">New Player</p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-4 mb-5">
            {(['name', 'age'] as const).map(field => (
              <div key={field}>
                <label className={labelCls}>{field === 'name' ? 'Full Name' : 'Age'}</label>
                <input className={inputCls} type={field === 'age' ? 'number' : 'text'}
                  placeholder={field === 'name' ? 'Player name' : '—'}
                  value={form[field]} onChange={e => setForm({ ...form, [field]: e.target.value })} />
              </div>
            ))}
            <div>
              <label className={labelCls}>Level</label>
              <select className={inputCls} value={form.level} onChange={e => setForm({ ...form, level: e.target.value as Level })}>
                {(['A','B','C','D'] as Level[]).map(l => <option key={l} value={l}>Level {l}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Gender</label>
              <select className={inputCls} value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as Gender })}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>
          <Btn variant="primary" onClick={handleAdd} disabled={saving} style={{ opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving...' : 'Add Player'}
          </Btn>
        </div>
      )}

      {/* Filters */}
      <div className="flex gap-2 mb-5 flex-wrap items-center">
        <input className={`${inputCls} w-48 flex-none`} placeholder="Search players..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-1 flex-wrap">
          {(['ALL','A','B','C','D'] as const).map(l => (
            <button key={l} className={`filter-btn${fLevel === l ? ' active' : ''}`} onClick={() => setFLevel(l)}>
              {l === 'ALL' ? 'All' : l}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {(['ALL','Male','Female'] as const).map(g => (
            <button key={g} className={`filter-btn${fGender === g ? ' active' : ''}`} onClick={() => setFGender(g)}>
              {g === 'ALL' ? 'All' : g}
            </button>
          ))}
        </div>
        <span className="text-xs text-gray-400 ml-auto font-mono">{filtered.length} / {players.length}</span>
      </div>

      {/* Table */}
      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="players-table-header grid gap-0 px-5 py-2.5 border-b border-gray-100 bg-white" style={{ gridTemplateColumns: '2fr 60px 80px 70px 1fr' }}>
          {['Name','Level','Gender','Age',''].map(h => (
            <span key={h} className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-300">{h}</span>
          ))}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-300 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-300 text-sm">
            {players.length === 0 ? 'No players yet. Add your first player above.' : 'No players match your filters.'}
          </div>
        ) : filtered.map((p, i) => (
          <div key={p._id} className="player-row" style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
            {editId === p._id ? (
              <div className="px-5 py-3 grid gap-3 items-center" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))' }}>
                <input className={inputCls} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                <input className={inputCls} type="number" value={editForm.age} onChange={e => setEditForm({ ...editForm, age: e.target.value })} />
                <select className={inputCls} value={editForm.level} onChange={e => setEditForm({ ...editForm, level: e.target.value as Level })}>
                  {(['A','B','C','D'] as Level[]).map(l => <option key={l} value={l}>Level {l}</option>)}
                </select>
                <select className={inputCls} value={editForm.gender} onChange={e => setEditForm({ ...editForm, gender: e.target.value as Gender })}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <div className="flex gap-1.5">
                  <Btn variant="primary" onClick={() => handleSave(p._id)}>Save</Btn>
                  <Btn variant="ghost" onClick={() => setEditId(null)}>Cancel</Btn>
                </div>
              </div>
            ) : (
              <div className="grid gap-0 px-5 py-3.5 items-center" style={{ gridTemplateColumns: '2fr 60px 80px 70px 1fr' }}>
                <div>
                  <div className="text-sm font-medium text-gray-700">{p.name}</div>
                  <div className="text-[0.72rem] text-gray-400 mt-0.5 font-mono">{p.matchCount} match{p.matchCount !== 1 ? 'es' : ''}</div>
                </div>
                <div className="player-cell-level">
                  <span className="text-[0.72rem] font-semibold px-2 py-0.5 rounded font-mono tracking-wide" style={{ color: LEVEL_COLOR[p.level], background: LEVEL_BG[p.level] }}>{p.level}</span>
                </div>
                <div className="player-cell-gender text-xs text-gray-500">{p.gender}</div>
                <div className="player-cell-age text-xs text-gray-500 font-mono">{p.age}</div>
                <div className="flex gap-1.5 justify-end">
                  <Btn variant="ghost" onClick={() => { setEditId(p._id); setEditForm({ name: p.name, level: p.level, gender: p.gender, age: String(p.age) }); }}>Edit</Btn>
                  <Btn variant="danger" onClick={() => handleDelete(p._id)}>Remove</Btn>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}