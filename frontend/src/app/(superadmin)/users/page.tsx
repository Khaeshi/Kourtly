'use client';
import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/config'
import Image from 'next/image';


interface AppUser {
  _id: string; name: string; email: string;
  image: string; role: 'user' | 'admin';
  provider: string; createdAt: string;
}

export default function UsersPage() {
  const [users,    setUsers]    = useState<AppUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [toggling, setToggling] = useState<string | null>(null);
  const [search,   setSearch]   = useState('');

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE}/users`);
      if (!res.ok) throw new Error(`Server returned ${res.status}`);
      const data = await res.json();
      setUsers(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const handleToggleRole = async (user: AppUser) => {
    const newRole = user.role === 'admin' ? 'user' : 'admin';
    if (!confirm(`Set ${user.name || user.email} as ${newRole}?`)) return;
    setToggling(user._id);
    try {
      await fetch(`${API_BASE}/users/${user._id}/role`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      await load();
    } finally {
      setToggling(null);
    }
  };

  const handleDelete = async (user: AppUser) => {
    if (!confirm(`Remove ${user.name || user.email} from the system?`)) return;
    try {
      await fetch(`${API_BASE}/users/${user._id}`, { method: 'DELETE' });
      await load();
    } catch {
      alert('Failed to delete user');
    }
  };

  const q = search.toLowerCase();
  const filtered = users.filter(u =>
    (u.name ?? '').toLowerCase().includes(q) ||
    (u.email ?? '').toLowerCase().includes(q)
  );

  const admins  = filtered.filter(u => u.role === 'admin');
  const regular = filtered.filter(u => u.role === 'user');

  return (
    <div className="max-w-[900px] font-sans">

      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 mb-6 pb-5 border-b border-gray-100">
        <div>
          <p className="text-[0.72rem] font-medium tracking-[0.05em] uppercase text-gray-400 mb-1">Management</p>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Users</h1>
        </div>
        <div className="flex flex-wrap items-center gap-4 sm:gap-6 w-full sm:w-auto justify-between sm:justify-end">
          <div className="flex gap-6">
            <div className="text-right">
              <div className="text-[0.65rem] font-semibold tracking-[0.1em] uppercase text-gray-400">Total</div>
              <div className="font-mono text-xl text-gray-900 font-semibold">{users.length}</div>
            </div>
            <div className="text-right">
              <div className="text-[0.65rem] font-semibold tracking-[0.1em] uppercase text-gray-400">Admins</div>
              <div className="font-mono text-xl text-green-700 font-semibold">{users.filter(u => u.role === 'admin').length}</div>
            </div>
          </div>
          <button onClick={load} className="text-[0.72rem] text-gray-400 border border-gray-200 rounded-md px-3 py-1.5 hover:border-gray-300 hover:text-gray-600 transition-colors bg-white cursor-pointer shrink-0">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Search */}
      <input
        className="w-full max-w-full sm:max-w-[280px] bg-white border border-gray-200 rounded-md px-3 py-2 text-[0.82rem] text-gray-900 outline-none focus:border-green-400 mb-5 transition-colors"
        placeholder="Search by name or email..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      {/* Error state */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700 flex items-center justify-between">
          <span>⚠ {error}</span>
          <button onClick={load} className="text-red-600 underline text-xs cursor-pointer bg-transparent border-none">Retry</button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center text-gray-400 text-sm">Loading users...</div>
      ) : (
        <div className="flex flex-col gap-5">
          {admins.length > 0 && (
            <UserGroup title="Admins" users={admins} toggling={toggling} onToggle={handleToggleRole} onDelete={handleDelete} />
          )}
          <UserGroup title="Users" users={regular} toggling={toggling} onToggle={handleToggleRole} onDelete={handleDelete} />
          {filtered.length === 0 && !error && (
            <div className="py-12 text-center text-gray-400 text-sm bg-white border border-gray-200 rounded-lg">
              No users found.
            </div>
          )}
        </div>
      )}

      {/* First-time setup hint */}
      <div className="mt-6 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 text-[0.78rem] text-amber-800 leading-relaxed">
        <strong>First-time setup:</strong> Sign in with Google first, then find your email here and click <strong>Make Admin</strong>. You only need to do this once.
      </div>
    </div>
  );
}

// ── User group ────────────────────────────────────────────────────────────────
function UserGroup({ title, users, toggling, onToggle, onDelete }: {
  title: string;
  users: AppUser[];
  toggling: string | null;
  onToggle: (u: AppUser) => void;
  onDelete: (u: AppUser) => void;
}) {
  const isAdminGroup = title === 'Admins';

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">

      {/* Group header */}
      <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
        <span className={`text-[0.65rem] font-bold tracking-[0.1em] uppercase px-2 py-0.5 rounded-[3px] border ${
          isAdminGroup
            ? 'text-green-700 bg-green-50 border-green-200'
            : 'text-gray-500 bg-gray-100 border-gray-200'
        }`}>
          {title}
        </span>
        <span className="text-[0.65rem] text-gray-400 font-mono">{users.length}</span>
      </div>

      {users.length === 0 ? (
        <p className="py-6 text-center text-gray-400 text-sm">None yet.</p>
      ) : (
        users.map((user, i) => (
          <div
            key={user._id}
            className="flex flex-col gap-3 min-[420px]:grid min-[420px]:grid-cols-[1fr_auto] min-[420px]:gap-4 px-5 py-3 transition-colors hover:bg-gray-50"
            style={{ borderBottom: i < users.length - 1 ? '1px solid #f9fafb' : 'none' }}
          >
            {/* User info */}
            <div className="flex items-center gap-3 min-w-0">
              {user.image ? (
                <Image src={user.image} alt={user.name ?? ''} width={32} height={32} className="rounded-full shrink-0" />
              ) : (
                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                  <span className="text-[0.78rem] font-semibold text-gray-500">
                    {(user.name || user.email)?.[0]?.toUpperCase()}
                  </span>
                </div>
              )}
              <div className="min-w-0">
                <div className="text-[0.85rem] font-medium text-gray-900 truncate">{user.name || '—'}</div>
                <div className="text-[0.72rem] text-gray-400 truncate">{user.email}</div>
              </div>
              <span className="text-[0.62rem] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded font-mono shrink-0 hidden sm:inline">
                {user.provider}
              </span>
              <span className="text-[0.62rem] text-gray-300 shrink-0 hidden md:inline">
                {new Date(user.createdAt).toLocaleDateString()}
              </span>
            </div>

            {/* Actions */}
            <div className="flex gap-1.5 shrink-0 min-[420px]:justify-end">
              <button
                onClick={() => onToggle(user)}
                disabled={toggling === user._id}
                className={`px-2.5 py-1 rounded-md text-[0.72rem] font-medium cursor-pointer transition-all border ${
                  user.role === 'admin'
                    ? 'border-red-200 bg-red-50 text-red-600 hover:bg-red-100'
                    : 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100'
                } disabled:opacity-50`}
              >
                {toggling === user._id ? '...' : user.role === 'admin' ? 'Revoke Admin' : 'Make Admin'}
              </button>
              <button
                onClick={() => onDelete(user)}
                className="px-2 py-1 rounded-md text-[0.72rem] border border-gray-200 bg-white text-gray-400 cursor-pointer transition-all hover:border-red-200 hover:text-red-500"
              >
                ✕
              </button>
            </div>
          </div>
        ))
      )}
    </div>
  );
}