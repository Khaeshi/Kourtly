'use client';
import { useState, useEffect, useCallback } from 'react';
import { sileo } from 'sileo';
import { getPlayers, createPlayer, updatePlayer, deletePlayer, OfflineUnavailableError } from '@/lib/api';
import type { Player, Level, Gender } from '@/lib/api';
import { Button } from '@/app/components/ui/Button';
import { useSocketEvent } from '@/hooks/useSocketEvent';
import { useConnectivity } from '@/lib/connectivity';

interface PlayerForm { name: string; level: Level; gender: Gender; age: string; }
const empty: PlayerForm = { name: '', level: 'B', gender: 'Male', age: '' };

const LEVELS: Level[] = ['A', 'B', 'C', 'D'];
const COLS = '2fr 1fr 1fr 1fr 190px';
const matchesLabel = (n: number) => `${n} match${n !== 1 ? 'es' : ''}`;

export default function PlayersPage() {
  const [players,  setPlayers]  = useState<Player[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [loadError, setLoadError] = useState('');
  const { status } = useConnectivity();
  const offline = status !== 'online';
  const offlineTitle = offline ? 'Reconnect to make changes' : undefined;
  const [saving,   setSaving]   = useState(false);
  const [editId,   setEditId]   = useState<string | null>(null);
  const [search,   setSearch]   = useState('');
  const [fLevel,   setFLevel]   = useState<Level | 'ALL'>('ALL');
  const [fGender,  setFGender]  = useState<Gender | 'ALL'>('ALL');
  const [form,     setForm]     = useState<PlayerForm>(empty);
  const [editForm, setEditForm] = useState<PlayerForm>(empty);
  const [showAdd,  setShowAdd]  = useState(false);
  const [touched,  setTouched]  = useState({ name: false, age: false });

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      setPlayers(await getPlayers());
    } catch (error) {
      setPlayers([]);
      setLoadError(error instanceof OfflineUnavailableError
        ? 'Not cached yet. Open this page once while online.'
        : 'Could not load players.');
      if (!(error instanceof OfflineUnavailableError)) console.error('Could not load players.', error);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);
  useSocketEvent('players:updated', useCallback(() => { load(); }, [load]));

  // Inline validation (UI only): show the message after the field is left, clear it once fixed.
  const nameError = touched.name && !form.name.trim() ? 'Enter the player’s name.' : '';
  const ageError  = touched.age  && !form.age ? 'Enter the player’s age.' : '';

  const handleAdd = async () => {
    if (!form.name.trim() || !form.age) {
      setTouched({ name: true, age: true });
      return;
    }
    setSaving(true);
    await sileo.promise(
      createPlayer({ name: form.name.trim(), level: form.level, gender: form.gender, age: Number(form.age) }),
      {
        loading: { title: 'Adding player...' },
        success: { title: 'Player added!', description: `${form.name.trim()} has been registered.` },
        error:   { title: 'Failed to add player', description: 'Please try again.' },
      }
    );
    setForm(empty); setTouched({ name: false, age: false }); setShowAdd(false); await load(); setSaving(false);
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

  const startEdit = (p: Player) => {
    setEditId(p._id);
    setEditForm({ name: p.name, level: p.level, gender: p.gender, age: String(p.age) });
  };

  const filtered = players.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase()) &&
    (fLevel  === 'ALL' || p.level  === fLevel) &&
    (fGender === 'ALL' || p.gender === fGender)
  );

  const EmptyState = () => (
    <div className="py-14 text-center">
      {players.length === 0 ? (
        <>
          <p className="font-bold text-[#0E2420]">No players yet.</p>
          <p className="ad-muted text-sm mt-1 mb-4">Add your regulars so the queue can pair them.</p>
          <Button v="primary" onClick={() => setShowAdd(true)}>Add player</Button>
        </>
      ) : (
        <>
          <p className="font-bold text-[#0E2420]">No players match these filters.</p>
          <p className="ad-muted text-sm mt-1">Clear the search or pick All levels.</p>
        </>
      )}
    </div>
  );

  return (
    <div className="w-full">

      {/* Header */}
      <div className="mb-6 flex items-end justify-between gap-4 flex-wrap">
        <div>
          <p className="ad-eyebrow">Management</p>
          <h1 className="ad-h1">Players</h1>
        </div>
        <Button v="primary" onClick={() => setShowAdd(!showAdd)}>
          {showAdd ? 'Cancel' : 'Add player'}
        </Button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="mb-6 border-t-2 border-[#0E2420] pt-5">
          <p className="ad-eyebrow mb-4">New player</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
            <div>
              <label htmlFor="pl-name" className="ad-label">Full name</label>
              <input id="pl-name" className={`ad-input${nameError ? ' is-invalid' : ''}`} placeholder="Player name"
                aria-invalid={!!nameError} aria-describedby={nameError ? 'pl-name-err' : undefined}
                value={form.name} onChange={e => setForm({ ...form, name: e.target.value })}
                onBlur={() => setTouched(t => ({ ...t, name: true }))} />
              {nameError && <p id="pl-name-err" className="ad-error">{nameError}</p>}
            </div>
            <div>
              <label htmlFor="pl-age" className="ad-label">Age</label>
              <input id="pl-age" className={`ad-input${ageError ? ' is-invalid' : ''}`} type="number" inputMode="numeric" placeholder="Age"
                aria-invalid={!!ageError} aria-describedby={ageError ? 'pl-age-err' : undefined}
                value={form.age} onChange={e => setForm({ ...form, age: e.target.value })}
                onBlur={() => setTouched(t => ({ ...t, age: true }))} />
              {ageError && <p id="pl-age-err" className="ad-error">{ageError}</p>}
            </div>
            <div>
              <label htmlFor="pl-level" className="ad-label">Level</label>
              <select id="pl-level" className="ad-input" value={form.level} onChange={e => setForm({ ...form, level: e.target.value as Level })}>
                {LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pl-gender" className="ad-label">Gender</label>
              <select id="pl-gender" className="ad-input" value={form.gender} onChange={e => setForm({ ...form, gender: e.target.value as Gender })}>
                <option value="Male">Male</option>
                <option value="Female">Female</option>
              </select>
            </div>
          </div>
          <Button v="primary" onClick={handleAdd} loading={saving} disabled={offline} title={offlineTitle}>Add player</Button>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3 mb-5 flex-wrap items-start sm:items-end">
        <div className="w-full sm:w-56">
          <label htmlFor="pl-search" className="ad-label">Search players</label>
          <input id="pl-search" className="ad-input" placeholder="Name"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['ALL', ...LEVELS] as const).map(l => (
            <button key={l} type="button" aria-pressed={fLevel === l}
              className={`filter-btn${fLevel === l ? ' active' : ''}`} onClick={() => setFLevel(l)}>
              {l === 'ALL' ? 'All levels' : `Lvl ${l}`}
            </button>
          ))}
        </div>
        <div className="flex gap-2 flex-wrap">
          {(['ALL', 'Male', 'Female'] as const).map(g => (
            <button key={g} type="button" aria-pressed={fGender === g}
              className={`filter-btn${fGender === g ? ' active' : ''}`} onClick={() => setFGender(g)}>
              {g === 'ALL' ? 'All' : g}
            </button>
          ))}
        </div>
        <span className="ad-mono ad-muted text-xs sm:ml-auto">
          {loadError ? '— of —' : `${filtered.length} of ${players.length} players`}
        </span>
      </div>

      {/* Table — desktop */}
      <div className="hidden sm:block">
        <div className="grid items-center border-b-2 border-[#0E2420] py-2" style={{ gridTemplateColumns: COLS }}>
          {['Name', 'Level', 'Gender', 'Age', ''].map((h, i) => (
            <span key={i} className="ad-eyebrow">{h}</span>
          ))}
        </div>

        {loading ? (
          <div className="py-14 text-center ad-muted text-sm">Loading...</div>
        ) : loadError ? (
          <div className="py-14 text-center text-amber-900 text-sm">{loadError}</div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : filtered.map(p => (
          <div key={p._id} className="border-b border-[#E1DBCB]">
            {editId === p._id ? (
              <div className="grid gap-3 py-3 items-center" style={{ gridTemplateColumns: COLS }}>
                <input className="ad-input" aria-label="Full name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                <select className="ad-input" aria-label="Level" value={editForm.level} onChange={e => setEditForm({ ...editForm, level: e.target.value as Level })}>
                  {LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
                </select>
                <select className="ad-input" aria-label="Gender" value={editForm.gender} onChange={e => setEditForm({ ...editForm, gender: e.target.value as Gender })}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <input className="ad-input" aria-label="Age" type="number" inputMode="numeric" value={editForm.age} onChange={e => setEditForm({ ...editForm, age: e.target.value })} />
                <div className="flex gap-2 justify-end">
                  <Button v="primary" size="sm" onClick={() => handleSave(p._id)} disabled={offline} title={offlineTitle}>Save</Button>
                  <Button v="ghost"   size="sm" onClick={() => setEditId(null)}>Cancel</Button>
                </div>
              </div>
            ) : (
              <div className="grid items-center py-3.5 hover:bg-[#EDE8D8]/50 transition-colors" style={{ gridTemplateColumns: COLS }}>
                <div>
                  <div className="text-[15px] font-bold text-[#0E2420]">{p.name}</div>
                  <div className="ad-mono ad-muted text-xs mt-0.5">{matchesLabel(p.matchCount)}</div>
                </div>
                <span className="ad-mono text-sm font-bold">Lvl {p.level}</span>
                <span className="text-sm">{p.gender}</span>
                <span className="ad-mono text-sm">{p.age}</span>
                <div className="flex gap-2 justify-end">
                  <Button v="ghost" size="sm" onClick={() => startEdit(p)} disabled={offline} title={offlineTitle}>Edit</Button>
                  <Button v="danger" size="sm" onClick={() => handleDelete(p._id)} disabled={offline} title={offlineTitle}>Remove…</Button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* List — phone */}
      <div className="sm:hidden">
        {loading ? (
          <div className="py-14 text-center ad-muted text-sm">Loading...</div>
        ) : loadError ? (
          <div className="py-14 text-center text-amber-900 text-sm">{loadError}</div>
        ) : filtered.length === 0 ? (
          <EmptyState />
        ) : filtered.map(p => (
          <div key={p._id} className="border-b border-[#E1DBCB] py-4">
            {editId === p._id ? (
              <div className="space-y-3">
                <input className="ad-input" aria-label="Full name" value={editForm.name} onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
                <div className="grid grid-cols-2 gap-3">
                  <input className="ad-input" aria-label="Age" type="number" inputMode="numeric" placeholder="Age" value={editForm.age} onChange={e => setEditForm({ ...editForm, age: e.target.value })} />
                  <select className="ad-input" aria-label="Level" value={editForm.level} onChange={e => setEditForm({ ...editForm, level: e.target.value as Level })}>
                    {LEVELS.map(l => <option key={l} value={l}>Level {l}</option>)}
                  </select>
                </div>
                <select className="ad-input" aria-label="Gender" value={editForm.gender} onChange={e => setEditForm({ ...editForm, gender: e.target.value as Gender })}>
                  <option value="Male">Male</option>
                  <option value="Female">Female</option>
                </select>
                <div className="flex gap-2">
                  <Button v="primary" onClick={() => handleSave(p._id)} disabled={offline} title={offlineTitle} className="flex-1">Save</Button>
                  <Button v="ghost"   onClick={() => setEditId(null)} className="flex-1">Cancel</Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div>
                    <p className="text-[15px] font-bold text-[#0E2420]">{p.name}</p>
                    <p className="ad-mono ad-muted text-xs mt-0.5">{matchesLabel(p.matchCount)}</p>
                  </div>
                  <span className="ad-mono text-sm font-bold shrink-0">Lvl {p.level}</span>
                </div>
                <p className="ad-muted text-sm mb-3">{p.gender} · Age {p.age}</p>
                <div className="flex gap-2">
                  <Button v="ghost" className="flex-1" onClick={() => startEdit(p)} disabled={offline} title={offlineTitle}>Edit</Button>
                  <Button v="danger" className="flex-1" onClick={() => handleDelete(p._id)} disabled={offline} title={offlineTitle}>Remove…</Button>
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
