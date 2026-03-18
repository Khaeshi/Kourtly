'use client';
import { useState, useEffect } from 'react';
import { sileo } from 'sileo';
import { getPlayers, createPlayer, updatePlayer, deletePlayer } from '@/lib/api';
import type { Player, Level, Gender } from '@/lib/api';
import { Button } from '@/app/components/ui/Button';

const LEVEL_COLOR: Record<Level, string> = { A: '#e8c84a', B: '#8BC34A', C: '#4db8a0', D: '#7a9cbf' };
const LEVEL_BG:    Record<Level, string> = { A: 'rgba(232,200,74,0.1)', B: 'rgba(139,195,74,0.1)', C: 'rgba(77,184,160,0.1)', D: 'rgba(122,156,191,0.1)' };

interface PlayerForm { name: string; level: Level; gender: Gender; age: string; }
const empty: PlayerForm = { name: '', level: 'B', gender: 'Male', age: '' };

const inputCls = "w-full bg-white border border-gray-200 rounded-md px-3 py-2 text-gray-900 text-sm outline-none transition-colors duration-150 focus:border-green-400";
const labelCls = "block text-[0.68rem] font-semibold tracking-widest uppercase text-gray-400 mb-1.5";

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
      <div className="mb-6 pb-5 border-b border-gray-100 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="text-[0.72rem] font-medium tracking-wide uppercase text-gray-400 mb-1.5">Management</p>
          <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">Players</h1>
        </div>
        <Button v="primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : '+ Add Player'}
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6 mb-6">
          <p className="text-[0.72rem] font-semibold tracking-widest uppercase text-gray-400 mb-4">New Player</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
            <div>
              <label className={labelCls}>Full Name</label>
              <input className={inputCls} placeholder="Player name"
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <label className={labelCls}>Age</label>
              <input className={inputCls} type="number" placeholder="Age"
                value={form.age} onChange={e => setForm({ ...form, age: e.target.value })} />
            </div>
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
          <Button v="primary" onClick={handleAdd} loading={saving}>Add Player</Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-2 mb-5 flex-wrap items-start sm:items-center">
        <input className={`${inputCls} sm:w-48`} placeholder="Search players..."
          value={search} onChange={e => setSearch(e.target.value)} />
        <div className="flex gap-1 flex-wrap">
          {(['ALL','A','B','C','D'] as const).map(l => (
            <button key={l} className={`filter-btn${fLevel === l ? ' active' : ''}`} onClick={() => setFLevel(l)}>
              {l === 'ALL' ? 'All Levels' : `Lvl ${l}`}
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
        <span className="text-xs text-gray-400 sm:ml-auto font-mono">{filtered.length} / {players.length}</span>
      </div>

      {/* Table — desktop */}
      <div className="hidden sm:block bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="grid px-5 py-2.5 border-b border-gray-100 bg-white"
          style={{ gridTemplateColumns: '2fr 60px 80px 70px 1fr' }}>
          {['Name','Level','Gender','Age',''].map(h => (
            <span key={h} className="text-[0.65rem] font-semibold tracking-widest uppercase text-gray-300">{h}</span>
          ))}
        </div>

        {loading ? (
          <div className="p-12 text-center text-gray-300 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-300 text-sm">
            {players.length === 0 ? 'No players yet.' : 'No players match your filters.'}
          </div>
        ) : filtered.map((p, i) => (
          <div key={p._id} style={{ borderBottom: i < filtered.length - 1 ? '1px solid #f3f4f6' : 'none' }}>
            {editId === p._id ? (
              <div className="px-5 py-3 grid gap-3 sm:grid-cols-5 items-center">
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
                  <Button v="primary" size="sm" onClick={() => handleSave(p._id)}>Save</Button>
                  <Button v="ghost"   size="sm" onClick={() => setEditId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="grid px-5 py-3.5 items-center hover:bg-gray-50/40 transition-colors"
                style={{ gridTemplateColumns: '2fr 60px 80px 70px 1fr' }}>
                <div>
                  <div className="text-sm font-medium text-gray-700">{p.name}</div>
                  <div className="text-[0.72rem] text-gray-400 mt-0.5 font-mono">{p.matchCount} match{p.matchCount !== 1 ? 'es' : ''}</div>
                </div>
                <span className="text-[0.72rem] font-semibold px-2 py-0.5 rounded font-mono tracking-wide w-fit"
                  style={{ color: LEVEL_COLOR[p.level], background: LEVEL_BG[p.level] }}>{p.level}</span>
                <span className="text-xs text-gray-500">{p.gender}</span>
                <span className="text-xs text-gray-500 font-mono">{p.age}</span>
                <div className="flex gap-1.5 justify-end">
                  <Button v="ghost" size="sm" onClick={() => { setEditId(p._id); setEditForm({ name: p.name, level: p.level, gender: p.gender, age: String(p.age) }); }}>Edit</Button>
                  <Button v="danger" size="sm" onClick={() => handleDelete(p._id)}>Remove</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Cards — mobile */}
      <div className="sm:hidden flex flex-col gap-3">
        {loading ? (
          <div className="p-12 text-center text-gray-300 text-sm">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-300 text-sm">No players found.</div>
        ) : filtered.map(p => (
          <div key={p._id} className="bg-white border border-gray-200 rounded-xl p-4">
            {editId === p._id ? (
              <div className="space-y-3">
                <input className={inputCls} value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <input className={inputCls} type="number" placeholder="Age" value={editForm.age} onChange={e => setEditForm({ ...editForm, age: e.target.value })} />
                  <select className={inputCls} value={editForm.level} onChange={e => setEditForm({ ...editForm, level: e.target.value as Level })}>
                    {(['A','B','C','D'] as Level[]).map(l => <option key={l} value={l}>Level {l}</option>)}
                  </select>
                </div>
                <select className={inputCls} value={editForm.gender} onChange={e => setEditForm({ ...editForm, gender: e.target.value as Gender })}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <div className="flex gap-2">
                  <Button v="primary" size="sm" onClick={() => handleSave(p._id)} className="flex-1 justify-center">Save</Button>
                  <Button v="ghost"   size="sm" onClick={() => setEditId(null)}   className="flex-1 justify-center">Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">{p.name}</p>
                    <p className="text-xs text-gray-400 font-mono mt-0.5">{p.matchCount} match{p.matchCount !== 1 ? 'es' : ''}</p>
                  </div>
                  <span className="text-[0.72rem] font-bold px-2 py-0.5 rounded font-mono shrink-0"
                    style={{ color: LEVEL_COLOR[p.level], background: LEVEL_BG[p.level] }}>{p.level}</span>
                </div>
                <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                  <span>{p.gender}</span>
                  <span className="text-gray-300">·</span>
                  <span>Age {p.age}</span>
                </div>
                <div className="flex gap-2">
                  <Button v="ghost"  size="sm" className="flex-1 justify-center"
                    onClick={() => { setEditId(p._id); setEditForm({ name: p.name, level: p.level, gender: p.gender, age: String(p.age) }); }}>
                    Edit
                  </Button>
                  <Button v="danger" size="sm" className="flex-1 justify-center" onClick={() => handleDelete(p._id)}>
                    Remove
                  </Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}