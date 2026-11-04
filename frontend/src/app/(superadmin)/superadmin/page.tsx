'use client';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/app/components/ui/Button';
import { Modal } from '@/app/components/ui/Modal';
import { StatusDot, type StatusTone } from '@/app/components/ui/StatusDot';
import { AdminHeader } from '@/app/components/ui/AdminHeader';

interface Stats {
  total: number; active: number; trials: number;
  expired: number; suspended: number; mrr: number; arr: number;
}

interface Court {
  _id: string; name: string; slug: string; adminEmail: string;
  sports: string[]; courtCount: number; isActive: boolean;
  createdAt: string;
  subscription: { status: string; plan: string; amount: number; trialEnds: string; };
}

const TONE: Record<string, StatusTone> = {
  active: 'ok', trial: 'wait', expired: 'bad', suspended: 'off',
};

const COLS = '1.4fr 1.2fr 150px 70px 280px';

export default function SuperAdminDashboard() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [courts,  setCourts]  = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [notice,  setNotice]  = useState<string | null>(null);
  const [acting,  setActing]  = useState<string | null>(null);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all');
  const [showForm,    setShowForm]    = useState(false);
  const [formData,    setFormData]    = useState({ name: '', slug: '', adminEmail: '', courtCount: '4', sports: 'badminton' });
  const [formLoading, setFormLoading] = useState(false);
  const [formError,   setFormError]   = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [cr, sr] = await Promise.all([
        fetch('/api/proxy/superadmin/courts'),
        fetch('/api/proxy/superadmin/stats'),
      ]);
      if (!cr.ok) throw new Error('Failed to load');
      setCourts(await cr.json());
      setStats(await sr.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const expiringTrials = courts.filter(c => {
    if (c.subscription.status !== 'trial') return false;
    const daysLeft = Math.ceil((new Date(c.subscription.trialEnds).getTime() - Date.now()) / 86400000);
    return daysLeft <= 7 && daysLeft >= 0;
  });

  const recentSignups = [...courts]
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, 5);

  const updateSubscription = async (courtId: string, body: object) => {
    setActing(courtId);
    try {
      const res = await fetch(`/api/proxy/superadmin/courts/${courtId}/subscription`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error('Failed');
      await load();
    } catch { setNotice('Action failed'); }
    finally { setActing(null); }
  };

  const handleCreateCourt = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormLoading(true); setFormError(null);
    try {
      const res = await fetch('/api/proxy/superadmin/courts', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...formData, courtCount: Number(formData.courtCount), sports: [formData.sports] }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error || 'Failed'); }
      setShowForm(false);
      setFormData({ name: '', slug: '', adminEmail: '', courtCount: '4', sports: 'badminton' });
      await load();
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Failed'); }
    finally { setFormLoading(false); }
  };

  const filtered = courts.filter(c => {
    const q = search.toLowerCase();
    const matchSearch = c.name.toLowerCase().includes(q) || c.adminEmail.toLowerCase().includes(q) || c.slug.toLowerCase().includes(q);
    const matchFilter = filter === 'all' || c.subscription.status === filter;
    return matchSearch && matchFilter;
  });

  const rowActions = (court: Court) => (
    <>
      {court.subscription.status === 'trial' && (
        <>
          <Button v="primary" size="sm" loading={acting === court._id}
            onClick={() => { if(confirm(`Activate ${court.name}?`)) updateSubscription(court._id, { status: 'active', plan: court.subscription.plan }); }}>Activate…</Button>
          <Button v="ghost" size="sm" loading={acting === court._id}
            onClick={() => updateSubscription(court._id, { extendTrialDays: 7 })}>Extend 7 days</Button>
        </>
      )}
      {court.subscription.status === 'active' && (
        <Button v="danger" size="sm" loading={acting === court._id}
          onClick={() => { if(confirm(`Suspend ${court.name}?`)) updateSubscription(court._id, { status: 'suspended' }); }}>Suspend…</Button>
      )}
      {(court.subscription.status === 'suspended' || court.subscription.status === 'expired') && (
        <Button v="primary" size="sm" loading={acting === court._id}
          onClick={() => { if(confirm(`Reactivate ${court.name}?`)) updateSubscription(court._id, { status: 'active', plan: court.subscription.plan }); }}>Reactivate…</Button>
      )}
    </>
  );

  return (
    <div className="max-w-[1100px]">

      <AdminHeader eyebrow="Platform" title="Dashboard" right={
        <div className="flex gap-2 flex-wrap">
          <Button v="primary" onClick={() => setShowForm(true)}>Onboard a court</Button>
          <Button v="ghost" onClick={load}>Refresh</Button>
        </div>
      } />

      {/* Key figures */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-px bg-[#C9C3B3] border-y border-[#C9C3B3]">
          {[
            { label: 'Courts',    value: String(stats.total),                tone: '' },
            { label: 'Active',    value: String(stats.active),               tone: 'text-[#1F8A7A]' },
            { label: 'Trials',    value: String(stats.trials),               tone: '' },
            { label: 'Expired',   value: String(stats.expired),              tone: '' },
            { label: 'Suspended', value: String(stats.suspended),            tone: '' },
            { label: 'MRR',       value: `₱${stats.mrr.toLocaleString()}`,   tone: '' },
            { label: 'ARR',       value: `₱${stats.arr.toLocaleString()}`,   tone: '' },
          ].map(s => (
            <div key={s.label} className="bg-[#F4F0E6] px-4 py-3 min-w-0">
              <p className="ad-eyebrow mb-1">{s.label}</p>
              <p className={`ad-mono text-[clamp(1.2rem,2.4vw,1.75rem)] font-bold leading-none break-words ${s.tone}`}>{s.value}</p>
            </div>
          ))}
        </div>
      )}

      {notice && (
        <p role="alert" className="mt-4 flex items-center justify-between gap-3 border-l-4 border-[#C4401F] bg-[#F3E3DC] px-4 py-3 text-sm">
          <span>{notice}</span>
          <Button v="ghost" size="sm" onClick={() => setNotice(null)}>Dismiss</Button>
        </p>
      )}

      {/* Needs attention + recent signups */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 mt-10">
        <section>
          <p className="ad-eyebrow">Right now</p>
          <h2 className="font-display text-[1.6rem] mt-1 mb-3">Trials ending soon</h2>
          {expiringTrials.length === 0 ? (
            <p><StatusDot tone="ok">No trials end in the next 7 days.</StatusDot></p>
          ) : expiringTrials.map(court => {
            const daysLeft = Math.ceil((new Date(court.subscription.trialEnds).getTime() - Date.now()) / 86400000);
            return (
              <div key={court._id} className="flex items-center justify-between gap-3 flex-wrap py-3 border-b border-[#E1DBCB]">
                <div className="min-w-0">
                  <p className="font-bold text-[15px]">{court.name}</p>
                  <p className="ad-muted text-sm break-all">{court.adminEmail}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`ad-mono text-sm font-bold ${daysLeft <= 2 ? 'text-[#B8431F]' : 'text-[#B8821A]'}`}>{daysLeft}d left</span>
                  <Button v="ghost" size="sm" loading={acting === court._id}
                    onClick={() => updateSubscription(court._id, { extendTrialDays: 7 })}>Extend 7 days</Button>
                </div>
              </div>
            );
          })}
        </section>

        <section>
          <p className="ad-eyebrow">Latest</p>
          <h2 className="font-display text-[1.6rem] mt-1 mb-3">Recent signups</h2>
          {recentSignups.length === 0 && !loading && <p className="ad-muted text-sm">No courts yet.</p>}
          {recentSignups.map(court => (
            <div key={court._id} className="flex items-center justify-between gap-3 py-3 border-b border-[#E1DBCB]">
              <div className="min-w-0">
                <p className="font-bold text-[15px] truncate">{court.name}</p>
                <p className="ad-mono ad-muted text-xs">{new Date(court.createdAt).toLocaleDateString()}</p>
              </div>
              <StatusDot tone={TONE[court.subscription.status] ?? 'off'}><span className="capitalize">{court.subscription.status}</span></StatusDot>
            </div>
          ))}
        </section>
      </div>

      {/* All courts */}
      <section className="mt-12 border-t border-[#C9C3B3] pt-6">
        <h2 className="font-display text-[1.6rem] mb-4">All courts</h2>
        <div className="flex gap-3 flex-wrap items-end mb-4">
          <div className="w-full sm:w-64">
            <label htmlFor="sd-search" className="ad-label">Search courts</label>
            <input id="sd-search" className="ad-input" placeholder="Name, email, slug"
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="flex gap-2 flex-wrap">
            {['all','active','trial','expired','suspended'].map(f => (
              <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
                className={`filter-btn capitalize${filter === f ? ' active' : ''}`}>{f}</button>
            ))}
          </div>
        </div>

        {error && (
          <div role="alert" className="mb-4 flex items-center justify-between gap-3 border-l-4 border-[#C4401F] bg-[#F3E3DC] px-4 py-3 text-sm">
            <span>{error}</span>
            <Button v="ghost" size="sm" onClick={load}>Try again</Button>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center ad-muted text-sm">Loading courts...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <p className="font-bold">No courts found.</p>
            <p className="ad-muted text-sm mt-1">Clear the search or pick All.</p>
          </div>
        ) : (
          <>
            {/* Desktop table */}
            <div className="hidden lg:block">
              <div className="grid gap-4 border-b-2 border-[#0E2420] py-2" style={{ gridTemplateColumns: COLS }}>
                {['Court', 'Admin', 'Plan', 'Courts', ''].map((h, i) => <span key={i} className="ad-eyebrow">{h}</span>)}
              </div>
              {filtered.map(court => (
                <div key={court._id} className="grid items-center gap-4 py-3.5 border-b border-[#E1DBCB] hover:bg-[#EDE8D8]/50 transition-colors" style={{ gridTemplateColumns: COLS }}>
                  <div className="min-w-0">
                    <p className="font-bold text-[15px] truncate">{court.name}</p>
                    <p className="ad-mono ad-muted text-xs">/{court.slug}</p>
                  </div>
                  <p className="ad-muted text-sm truncate" title={court.adminEmail}>{court.adminEmail}</p>
                  <div>
                    <StatusDot tone={TONE[court.subscription.status] ?? 'off'}><span className="capitalize">{court.subscription.status}</span></StatusDot>
                    <p className="ad-mono ad-muted text-xs">₱{court.subscription.amount.toLocaleString()}/{court.subscription.plan === 'annual' ? 'yr' : 'mo'}</p>
                  </div>
                  <p className="ad-mono text-sm">{court.courtCount}</p>
                  <div className="flex gap-2 flex-wrap justify-end">{rowActions(court)}</div>
                </div>
              ))}
            </div>

            {/* Phone and tablet list */}
            <div className="lg:hidden">
              {filtered.map(court => (
                <div key={court._id} className="py-4 border-b border-[#E1DBCB]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-[15px]">{court.name}</p>
                      <p className="ad-mono ad-muted text-xs">/{court.slug} · {court.courtCount} court{court.courtCount !== 1 ? 's' : ''}</p>
                    </div>
                    <StatusDot tone={TONE[court.subscription.status] ?? 'off'}><span className="capitalize">{court.subscription.status}</span></StatusDot>
                  </div>
                  <p className="ad-muted text-sm break-all mt-1">{court.adminEmail}</p>
                  <p className="ad-mono ad-muted text-xs mt-0.5">₱{court.subscription.amount.toLocaleString()}/{court.subscription.plan === 'annual' ? 'yr' : 'mo'}</p>
                  <div className="flex gap-2 flex-wrap mt-3">{rowActions(court)}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* Onboard modal */}
      {showForm && (
        <Modal onClose={() => setShowForm(false)} width="max-w-[460px]" label="Onboard a new court" dismissOnBackdrop={false}>
          <div className="px-6 py-4 border-b border-[#E1DBCB] flex items-center justify-between gap-3">
            <h2 className="text-lg font-bold">Onboard a new court</h2>
            <Button v="ghost" size="sm" onClick={() => setShowForm(false)}>Close</Button>
          </div>
          <form onSubmit={handleCreateCourt} className="px-6 py-5 flex flex-col gap-4">
            {formError && <p role="alert" className="border-l-4 border-[#C4401F] bg-[#F3E3DC] px-3 py-2 text-sm">{formError}</p>}
            {[
              { label: 'Court name',  key: 'name',       placeholder: 'South City Badminton' },
              { label: 'Slug',        key: 'slug',       placeholder: 'south-city-bc' },
              { label: 'Admin email', key: 'adminEmail', placeholder: 'admin@court.com' },
              { label: 'Court count', key: 'courtCount', placeholder: '4' },
            ].map(f => (
              <div key={f.key}>
                <label htmlFor={`oc-${f.key}`} className="ad-label">{f.label}</label>
                <input id={`oc-${f.key}`} required value={formData[f.key as keyof typeof formData]}
                  onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                  placeholder={f.placeholder} className="ad-input" />
              </div>
            ))}
            <div>
              <label htmlFor="oc-sport" className="ad-label">Sport</label>
              <select id="oc-sport" value={formData.sports} onChange={e => setFormData(p => ({ ...p, sports: e.target.value }))} className="ad-input">
                <option value="badminton">Badminton</option>
                <option value="pickleball">Pickleball</option>
                <option value="tennis">Tennis</option>
              </select>
            </div>
            <div className="flex gap-3 pt-1">
              <Button v="ghost" type="button" className="flex-1" onClick={() => setShowForm(false)}>Cancel</Button>
              <Button v="primary" type="submit" className="flex-1" loading={formLoading}>{formLoading ? 'Creating...' : 'Create court'}</Button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
