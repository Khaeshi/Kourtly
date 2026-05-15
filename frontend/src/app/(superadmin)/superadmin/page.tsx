'use client';
import { useState, useEffect, useCallback } from 'react';

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

const STATUS_STYLES: Record<string, string> = {
  active:    'text-green-700 bg-green-50 border-green-200',
  trial:     'text-amber-700 bg-amber-50 border-amber-200',
  expired:   'text-red-600 bg-red-50 border-red-200',
  suspended: 'text-gray-500 bg-gray-100 border-gray-200',
};

export default function SuperAdminDashboard() {
  const [stats,   setStats]   = useState<Stats | null>(null);
  const [courts,  setCourts]  = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [acting,  setActing]  = useState<string | null>(null);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all');
  const [showForm,    setShowForm]    = useState(false);
  const [formData,    setFormData]    = useState({ name: '', slug: '', adminEmail: '', courtCount: '4', sports: 'badminton' });
  const [formLoading, setFormLoading] = useState(false);
  const [formError,   setFormError]   = useState<string | null>(null);
  const [payoutTransfers, setPayoutTransfers] = useState<any[]>([]);
  const [payoutFilter, setPayoutFilter] = useState<'all' | 'queued' | 'succeeded' | 'failed'>('all');

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
  useEffect(() => {
    fetch(`/api/proxy/superadmin/payout-transfers?limit=20&status=${payoutFilter}`)
      .then(r => r.json())
      .then(setPayoutTransfers)
      .catch(() => setPayoutTransfers([]));
  }, [payoutFilter]);

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
    } catch { alert('Action failed'); }
    finally { setActing(null); }
  };

  const deleteCourtSubscription = async (courtId: string, courtName: string) => {
    if (!confirm(
      `End and remove ${courtName}'s subscription? This clears billing, unpublishes the court from the directory, and blocks admin tools until you reactivate.`
    )) return;
    setActing(courtId);
    try {
      const res = await fetch(`/api/proxy/superadmin/courts/${courtId}/subscription`, { method: 'DELETE' });
      if (!res.ok) {
        const j = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(j.error || 'Failed');
      }
      await load();
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(null);
    }
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

  return (
    <div className="max-w-[1100px] font-sans space-y-8">

      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 pb-5 border-b border-gray-100">
        <div>
          <p className="text-[0.72rem] font-medium tracking-[0.05em] uppercase text-gray-400 mb-1">Platform</p>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Dashboard</h1>
        </div>
        <div className="flex flex-wrap gap-2 sm:gap-3 w-full sm:w-auto">
          <button onClick={() => setShowForm(true)}
            className="text-[0.78rem] font-medium bg-gray-900 text-white px-3.5 py-1.5 rounded-md hover:bg-gray-700 transition-colors cursor-pointer grow sm:grow-0">
            + Onboard Court
          </button>
          <button onClick={load}
            className="text-[0.72rem] text-gray-400 border border-gray-200 rounded-md px-3 py-1.5 hover:border-gray-300 hover:text-gray-600 transition-colors bg-white cursor-pointer shrink-0">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Stats strip */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          {[
            { label: 'Total',     value: stats.total,                       color: ''      },
            { label: 'Active',    value: stats.active,                      color: 'green' },
            { label: 'Trials',    value: stats.trials,                      color: 'amber' },
            { label: 'Expired',   value: stats.expired,                     color: 'red'   },
            { label: 'Suspended', value: stats.suspended,                   color: ''      },
            { label: 'MRR',       value: `₱${stats.mrr.toLocaleString()}`,  color: 'green' },
            { label: 'ARR',       value: `₱${stats.arr.toLocaleString()}`,  color: 'green' },
          ].map(s => (
            <div key={s.label} className="bg-white border border-gray-200 rounded-lg px-3 py-2.5 text-center">
              <div className="text-[0.62rem] font-semibold tracking-[0.1em] uppercase text-gray-400">{s.label}</div>
              <div className={`font-mono text-lg font-semibold mt-0.5 ${
                s.color === 'green' ? 'text-green-700' :
                s.color === 'amber' ? 'text-amber-600' :
                s.color === 'red'   ? 'text-red-600'   : 'text-gray-900'
              }`}>{s.value}</div>
            </div>
          ))}
        </div>
      )}

      {/* Two-col: Expiring trials + Recent signups */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

        {/* Expiring trials */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-amber-50 flex items-center gap-2">
            <span className="text-[0.65rem] font-bold tracking-[0.1em] uppercase text-amber-700 bg-amber-100 border border-amber-200 px-2 py-0.5 rounded-[3px]">
              Expiring Soon
            </span>
            <span className="text-[0.65rem] text-gray-400 font-mono">{expiringTrials.length} within 7 days</span>
          </div>
          {expiringTrials.length === 0 ? (
            <p className="py-6 text-center text-gray-400 text-sm">No trials expiring soon.</p>
          ) : expiringTrials.map((court, i) => {
            const daysLeft = Math.ceil((new Date(court.subscription.trialEnds).getTime() - Date.now()) / 86400000);
            return (
              <div key={court._id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
                style={{ borderBottom: i < expiringTrials.length - 1 ? '1px solid #f9fafb' : 'none' }}>
                <div>
                  <div className="text-[0.82rem] font-medium text-gray-900">{court.name}</div>
                  <div className="text-[0.68rem] text-gray-400">{court.adminEmail}</div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[0.68rem] font-mono font-semibold ${daysLeft <= 2 ? 'text-red-600' : 'text-amber-600'}`}>
                    {daysLeft}d left
                  </span>
                  <button onClick={() => updateSubscription(court._id, { extendTrialDays: 7 })}
                    disabled={acting === court._id}
                    className="text-[0.65rem] px-2 py-0.5 rounded border border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 cursor-pointer disabled:opacity-50 transition-colors">
                    {acting === court._id ? '...' : '+7d'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Recent signups */}
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
            <span className="text-[0.65rem] font-bold tracking-[0.1em] uppercase text-gray-500 bg-gray-100 border border-gray-200 px-2 py-0.5 rounded-[3px]">
              Recent Signups
            </span>
            <span className="text-[0.65rem] text-gray-400 font-mono">last 5</span>
          </div>
          {recentSignups.map((court, i) => (
            <div key={court._id} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50 transition-colors"
              style={{ borderBottom: i < recentSignups.length - 1 ? '1px solid #f9fafb' : 'none' }}>
              <div>
                <div className="text-[0.82rem] font-medium text-gray-900">{court.name}</div>
                <div className="text-[0.68rem] text-gray-400">{new Date(court.createdAt).toLocaleDateString()}</div>
              </div>
              <span className={`text-[0.62rem] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-[3px] border ${STATUS_STYLES[court.subscription.status]}`}>
                {court.subscription.status}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Courts table */}
      <div>
        <div className="flex gap-3 flex-wrap mb-4 w-full">
          <input className="bg-white border border-gray-200 rounded-md px-3 py-2 text-[0.82rem] text-gray-900 outline-none focus:border-green-400 transition-colors w-full min-w-0 sm:w-[220px] sm:max-w-[280px]"
            placeholder="Search courts..." value={search} onChange={e => setSearch(e.target.value)} />
          <div className="flex gap-1.5 flex-wrap">
            {['all','active','trial','expired','suspended'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1.5 rounded-md text-[0.72rem] font-medium border transition-colors cursor-pointer capitalize ${
                  filter === f ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
                }`}>{f}</button>
            ))}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4 text-sm text-red-700 flex justify-between">
            <span>⚠ {error}</span>
            <button onClick={load} className="text-red-600 underline text-xs cursor-pointer bg-transparent border-none">Retry</button>
          </div>
        )}

        {loading ? (
          <div className="py-12 text-center text-gray-400 text-sm">Loading courts...</div>
        ) : (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <div className="min-w-[760px]">
                <div
                  className="grid px-5 py-2.5 border-b border-gray-100 bg-gray-50 text-[0.65rem] font-semibold tracking-[0.08em] uppercase text-gray-400"
                  style={{ gridTemplateColumns: '1fr 140px 110px 70px 220px' }}
                >
                  <span>Court</span><span>Admin</span><span>Plan</span><span>Courts</span><span>Actions</span>
                </div>
                {filtered.length === 0 ? (
                  <div className="py-12 text-center text-gray-400 text-sm">No courts found.</div>
                ) : filtered.map((court, i) => (
                  <div
                    key={court._id}
                    className="grid items-center gap-4 px-5 py-3.5 hover:bg-gray-50 transition-colors"
                    style={{
                      gridTemplateColumns: '1fr 140px 110px 70px 220px',
                      borderBottom: i < filtered.length - 1 ? '1px solid #f9fafb' : 'none',
                    }}
                  >
                    <div className="min-w-0">
                      <div className="text-[0.85rem] font-medium text-gray-900 truncate">{court.name}</div>
                      <div className="text-[0.68rem] text-gray-400 font-mono">/{court.slug}</div>
                    </div>
                    <div className="text-[0.72rem] text-gray-500 truncate">{court.adminEmail}</div>
                    <div className="flex flex-col gap-1">
                      <span className={`text-[0.62rem] font-semibold uppercase px-2 py-0.5 rounded-[3px] border w-fit ${STATUS_STYLES[court.subscription.status]}`}>
                        {court.subscription.status}
                      </span>
                      <span className="text-[0.65rem] text-gray-400 font-mono">₱{court.subscription.amount.toLocaleString()}/{court.subscription.plan === 'annual' ? 'yr' : 'mo'}</span>
                    </div>
                    <div className="text-[0.82rem] font-mono text-gray-700">{court.courtCount}</div>
                    <div className="flex gap-1.5 flex-wrap">
                      {court.subscription.status === 'trial' && (
                        <button onClick={() => { if(confirm(`Activate ${court.name}?`)) updateSubscription(court._id, { status: 'active', plan: court.subscription.plan }); }}
                          disabled={acting === court._id}
                          className="px-2.5 py-1 rounded-md text-[0.68rem] font-medium border cursor-pointer transition-all border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50">
                          {acting === court._id ? '...' : 'Activate'}
                        </button>
                      )}
                      {court.subscription.status === 'trial' && (
                        <button onClick={() => updateSubscription(court._id, { extendTrialDays: 7 })}
                          disabled={acting === court._id}
                          className="px-2.5 py-1 rounded-md text-[0.68rem] font-medium border cursor-pointer transition-all border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100 disabled:opacity-50">
                          {acting === court._id ? '...' : '+7 days'}
                        </button>
                      )}
                      {court.subscription.status === 'active' && (
                        <button onClick={() => { if(confirm(`Suspend ${court.name}?`)) updateSubscription(court._id, { status: 'suspended' }); }}
                          disabled={acting === court._id}
                          className="px-2.5 py-1 rounded-md text-[0.68rem] font-medium border cursor-pointer transition-all border-red-200 bg-red-50 text-red-600 hover:bg-red-100 disabled:opacity-50">
                          {acting === court._id ? '...' : 'Suspend'}
                        </button>
                      )}
                      {(court.subscription.status === 'suspended' || court.subscription.status === 'expired') && (
                        <button onClick={() => { if(confirm(`Reactivate ${court.name}?`)) updateSubscription(court._id, { status: 'active', plan: court.subscription.plan }); }}
                          disabled={acting === court._id}
                          className="px-2.5 py-1 rounded-md text-[0.68rem] font-medium border cursor-pointer transition-all border-green-200 bg-green-50 text-green-700 hover:bg-green-100 disabled:opacity-50">
                          {acting === court._id ? '...' : 'Reactivate'}
                        </button>
                      )}
                      {(court.subscription.status === 'trial' || court.subscription.status === 'active' || court.subscription.status === 'suspended') && (
                        <button
                          type="button"
                          onClick={() => deleteCourtSubscription(court._id, court.name)}
                          disabled={acting === court._id}
                          className="px-2.5 py-1 rounded-md text-[0.68rem] font-medium border cursor-pointer transition-all border-gray-300 bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                          title="Remove subscription and billing"
                        >
                          {acting === court._id ? '...' : 'End subscription'}
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        <div className="px-5 py-3 border-b border-gray-100 bg-gray-50 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <span className="text-[0.75rem] font-semibold tracking-[0.08em] uppercase text-gray-500">Recent Payout Transfers</span>
          <div className="flex items-center gap-2">
            <span className="text-[0.68rem] text-gray-400">{payoutTransfers.length} records</span>
            <select value={payoutFilter} onChange={e => setPayoutFilter(e.target.value as any)} className="text-xs border border-gray-200 rounded px-2 py-1">
              <option value="all">All</option>
              <option value="queued">Queued</option>
              <option value="succeeded">Succeeded</option>
              <option value="failed">Failed</option>
            </select>
          </div>
        </div>
        {payoutTransfers.length === 0 ? (
          <div className="py-10 text-center text-gray-400 text-sm">No payout transfers yet.</div>
        ) : (
          <div className="divide-y divide-gray-50">
            {payoutTransfers.slice(0, 20).map((t: any) => (
              <div
                key={t._id}
                className="px-5 py-3 text-xs flex flex-col gap-1.5 sm:flex-row sm:items-center sm:justify-between sm:gap-3"
              >
                <span className="text-gray-700 font-medium break-words">{t.courtId?.name || 'Unknown court'}</span>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.7rem] sm:justify-end sm:text-xs">
                  <span className="font-mono text-gray-500 whitespace-nowrap">{new Date(t.createdAt).toLocaleString()}</span>
                  <span className="font-mono text-gray-800 whitespace-nowrap">₱{Number(t.amount || 0).toFixed(2)}</span>
                  <span className={`font-semibold uppercase tracking-wide ${t.status === 'succeeded' ? 'text-green-600' : t.status === 'failed' ? 'text-red-600' : 'text-amber-600'}`}>
                    {t.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Onboard modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl border border-gray-200 w-full max-w-[460px] shadow-xl">
            <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
              <h2 className="text-[0.95rem] font-semibold text-gray-900">Onboard New Court</h2>
              <button onClick={() => setShowForm(false)} className="text-gray-400 hover:text-gray-600 cursor-pointer text-lg leading-none bg-transparent border-none">✕</button>
            </div>
            <form onSubmit={handleCreateCourt} className="px-6 py-5 flex flex-col gap-4">
              {formError && <div className="text-[0.78rem] text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">{formError}</div>}
              {[
                { label: 'Court Name',  key: 'name',       placeholder: 'South City Badminton' },
                { label: 'Slug',        key: 'slug',       placeholder: 'south-city-bc' },
                { label: 'Admin Email', key: 'adminEmail', placeholder: 'admin@court.com' },
                { label: 'Court Count', key: 'courtCount', placeholder: '4' },
              ].map(f => (
                <div key={f.key} className="flex flex-col gap-1.5">
                  <label className="text-[0.72rem] font-medium text-gray-600 uppercase tracking-[0.06em]">{f.label}</label>
                  <input required value={formData[f.key as keyof typeof formData]}
                    onChange={e => setFormData(p => ({ ...p, [f.key]: e.target.value }))}
                    placeholder={f.placeholder}
                    className="bg-white border border-gray-200 rounded-md px-3 py-2 text-[0.85rem] text-gray-900 outline-none focus:border-green-400 transition-colors" />
                </div>
              ))}
              <div className="flex flex-col gap-1.5">
                <label className="text-[0.72rem] font-medium text-gray-600 uppercase tracking-[0.06em]">Sport</label>
                <select value={formData.sports} onChange={e => setFormData(p => ({ ...p, sports: e.target.value }))}
                  className="bg-white border border-gray-200 rounded-md px-3 py-2 text-[0.85rem] text-gray-900 outline-none focus:border-green-400 transition-colors">
                  <option value="badminton">Badminton</option>
                  <option value="pickleball">Pickleball</option>
                  <option value="tennis">Tennis</option>
                </select>
              </div>
              <div className="flex gap-3 pt-1">
                <button type="button" onClick={() => setShowForm(false)}
                  className="flex-1 px-4 py-2 rounded-md text-[0.82rem] border border-gray-200 text-gray-600 hover:bg-gray-50 cursor-pointer transition-colors">Cancel</button>
                <button type="submit" disabled={formLoading}
                  className="flex-1 px-4 py-2 rounded-md text-[0.82rem] bg-gray-900 text-white hover:bg-gray-700 cursor-pointer transition-colors disabled:opacity-50">
                  {formLoading ? 'Creating...' : 'Create Court'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}