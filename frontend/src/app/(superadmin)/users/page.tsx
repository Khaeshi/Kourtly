'use client';
import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/config'
import Image from 'next/image';
import { Button } from '@/app/components/ui/Button';
import { AdminHeader } from '@/app/components/ui/AdminHeader';


interface AppUser {
  _id: string; name: string; email: string;
  image: string; role: 'user' | 'admin';
  provider: string; createdAt: string;
}

export default function UsersPage() {
  const [users,    setUsers]    = useState<AppUser[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [notice,   setNotice]   = useState<string | null>(null);
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
      setNotice('Failed to delete user');
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
    <div className="max-w-[900px]">

      <AdminHeader eyebrow="Management" title="Users" right={
        <div className="flex gap-6 items-center flex-wrap">
          <div className="text-right">
            <div className="ad-eyebrow">Total</div>
            <div className="ad-mono text-2xl font-bold">{users.length}</div>
          </div>
          <div className="text-right">
            <div className="ad-eyebrow">Admins</div>
            <div className="ad-mono text-2xl font-bold text-[#1F8A7A]">{users.filter(u => u.role === 'admin').length}</div>
          </div>
          <Button v="ghost" onClick={load}>Refresh</Button>
        </div>
      } />

      {/* Search */}
      <div className="w-full max-w-xs mb-6">
        <label htmlFor="su-search" className="ad-label">Search users</label>
        <input id="su-search" className="ad-input" placeholder="Name or email"
          value={search} onChange={e => setSearch(e.target.value)} />
      </div>

      {notice && (
        <p role="alert" className="mb-4 flex items-center justify-between gap-3 border-l-4 border-[#C4401F] bg-[#F3E3DC] px-4 py-3 text-sm">
          <span>{notice}</span>
          <Button v="ghost" size="sm" onClick={() => setNotice(null)}>Dismiss</Button>
        </p>
      )}

      {/* Error state */}
      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 border-l-4 border-[#C4401F] bg-[#F3E3DC] px-4 py-3 text-sm">
          <span>{error}</span>
          <Button v="ghost" size="sm" onClick={load}>Try again</Button>
        </div>
      )}

      {loading ? (
        <div className="py-12 text-center ad-muted text-sm">Loading users...</div>
      ) : (
        <div className="flex flex-col gap-10">
          {admins.length > 0 && (
            <UserGroup title="Admins" users={admins} toggling={toggling} onToggle={handleToggleRole} onDelete={handleDelete} />
          )}
          <UserGroup title="Users" users={regular} toggling={toggling} onToggle={handleToggleRole} onDelete={handleDelete} />
          {filtered.length === 0 && !error && (
            <div className="py-6">
              <p className="font-bold">No users found.</p>
              <p className="ad-muted text-sm mt-1">Clear the search to see everyone.</p>
            </div>
          )}
        </div>
      )}

      {/* First-time setup hint */}
      <p className="ad-muted text-sm mt-10 max-w-xl">
        <b className="text-[#0E2420]">First-time setup.</b> Sign in with Google first, then find your email here and choose <b className="text-[#0E2420]">Make admin</b>. You only need to do this once.
      </p>
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
  return (
    <section>
      <h2 className="font-display text-[1.6rem] mb-3">
        {title} <span className="ad-mono ad-muted text-sm normal-case">· {users.length}</span>
      </h2>

      {users.length === 0 ? (
        <p className="py-4 ad-muted text-sm">None yet.</p>
      ) : (
        <div className="border-t-2 border-[#0E2420]">
          {users.map(user => (
            <div key={user._id} className="flex items-center justify-between gap-x-4 gap-y-3 flex-wrap py-3 border-b border-[#E1DBCB]">
              {/* User info */}
              <div className="flex items-center gap-3 min-w-0 flex-1 basis-[260px]">
                {user.image ? (
                  <Image src={user.image} alt="" width={36} height={36} className="rounded-full shrink-0" />
                ) : (
                  <div className="w-9 h-9 rounded-full bg-[#E1DBCB] flex items-center justify-center shrink-0">
                    <span className="text-sm font-bold text-[#5B6B66]">
                      {(user.name || user.email)?.[0]?.toUpperCase()}
                    </span>
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-[15px] font-bold truncate">{user.name || '—'}</p>
                  <p className="ad-muted text-sm truncate">{user.email}</p>
                  <p className="ad-mono ad-muted text-xs">{user.provider} · {new Date(user.createdAt).toLocaleDateString()}</p>
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2 shrink-0 flex-wrap">
                <Button v={user.role === 'admin' ? 'danger' : 'ghost'} size="sm"
                  loading={toggling === user._id} onClick={() => onToggle(user)}>
                  {user.role === 'admin' ? 'Revoke admin…' : 'Make admin…'}
                </Button>
                <Button v="danger" size="sm" onClick={() => onDelete(user)}>Remove user…</Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
