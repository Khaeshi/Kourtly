'use client';
import { useState, useEffect, useCallback } from 'react';

interface Court {
  _id: string; name: string; slug: string; adminEmail: string;
  sports: string[]; courtCount: number; isPublic: boolean; isActive: boolean;
  createdAt: string;
  location: { address: string; city: string; province: string; country: string; };
  contact:  { phone: string; email: string; facebook: string; instagram: string; website: string; };
  subscription: {
    status: string; plan: string; amount: number;
    trialEnds: string; startDate: string | null; nextBilling: string | null;
  };
}

const STATUS_STYLES: Record<string, string> = {
  active:    'text-green-700 bg-green-50 border-green-200',
  trial:     'text-amber-700 bg-amber-50 border-amber-200',
  expired:   'text-red-600 bg-red-50 border-red-200',
  suspended: 'text-gray-500 bg-gray-100 border-gray-200',
};

const SPORT_COLORS: Record<string, string> = {
  badminton:  'text-green-700 bg-green-50 border-green-200',
  pickleball: 'text-yellow-700 bg-yellow-50 border-yellow-200',
  tennis:     'text-blue-700 bg-blue-50 border-blue-200',
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[0.62rem] font-semibold tracking-[0.08em] uppercase text-gray-400">{label}</span>
      <span className="text-[0.82rem] text-gray-700">{value}</span>
    </div>
  );
}

function ActionBtn({ label, color, loading, onClick }: {
  label: string; color: 'green' | 'red' | 'amber' | 'gray';
  loading: boolean; onClick: () => void;
}) {
  const styles = {
    green: 'border-green-200 bg-green-50 text-green-700 hover:bg-green-100',
    red:   'border-red-200 bg-red-50 text-red-600 hover:bg-red-100',
    amber: 'border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100',
    gray:  'border-gray-200 bg-white text-gray-500 hover:bg-gray-50',
  };
  return (
    <button onClick={onClick} disabled={loading}
      className={`px-3 py-1.5 rounded-md text-[0.72rem] font-medium border cursor-pointer transition-all disabled:opacity-50 ${styles[color]}`}>
      {loading ? '...' : label}
    </button>
  );
}

export default function CourtsPage() {
  const [courts,  setCourts]  = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [search,  setSearch]  = useState('');
  const [filter,  setFilter]  = useState('all');
  const [acting,  setActing]  = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [editingEmail, setEditingEmail] = useState<string | null>(null);
  const [newEmail,     setNewEmail]     = useState('');
  const [emailLoading, setEmailLoading] = useState(false);


  const handleEmailUpdate = async (courtId: string) => {
    if (!newEmail.trim()) return;
    setEmailLoading(true);
    try {
      const res = await fetch(`/api/proxy/superadmin/courts/${courtId}`, {
        method:  'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ adminEmail: newEmail.trim() }),
      });
      if (!res.ok) { const e = await res.json(); throw new Error(e.error); }
      setEditingEmail(null);
      setNewEmail('');
      await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to update email');
    } finally {
      setEmailLoading(false);
    }
  };

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const res = await fetch('/api/proxy/superadmin/courts');
      if (!res.ok) throw new Error('Failed to load courts');
      setCourts(await res.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

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

  const filtered = courts.filter(c => {
    const q = search.toLowerCase();
    const matchSearch =
      c.name.toLowerCase().includes(q) ||
      c.adminEmail.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.location.city.toLowerCase().includes(q);
    const matchFilter = filter === 'all' || c.subscription.status === filter;
    return matchSearch && matchFilter;
  });

  return (
    <div className="max-w-[1100px] font-sans space-y-6">

      {/* Header */}
      <div className="flex items-end justify-between flex-wrap gap-4 pb-5 border-b border-gray-100">
        <div>
          <p className="text-[0.72rem] font-medium tracking-[0.05em] uppercase text-gray-400 mb-1">Platform</p>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Courts</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[0.72rem] text-gray-400 font-mono">{courts.length} total</span>
          <button onClick={load}
            className="text-[0.72rem] text-gray-400 border border-gray-200 rounded-md px-3 py-1.5 hover:border-gray-300 hover:text-gray-600 transition-colors bg-white cursor-pointer">
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-3 flex-wrap">
        <input
          className="bg-white border border-gray-200 rounded-md px-3 py-2 text-[0.82rem] text-gray-900 outline-none focus:border-green-400 transition-colors w-[240px]"
          placeholder="Search by name, email, city..."
          value={search} onChange={e => setSearch(e.target.value)}
        />
        <div className="flex gap-1.5">
          {['all', 'active', 'trial', 'expired', 'suspended'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-md text-[0.72rem] font-medium border transition-colors cursor-pointer capitalize ${
                filter === f
                  ? 'bg-gray-900 text-white border-gray-900'
                  : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
              }`}>{f}</button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700 flex justify-between">
          <span>⚠ {error}</span>
          <button onClick={load} className="text-red-600 underline text-xs cursor-pointer bg-transparent border-none">Retry</button>
        </div>
      )}

      {/* Courts list */}
      {loading ? (
        <div className="py-16 text-center text-gray-400 text-sm">Loading courts...</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-gray-400 text-sm bg-white border border-gray-200 rounded-lg">
          No courts found.
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map(court => {
            const isExpanded = expanded === court._id;
            const daysUntilTrialEnd = court.subscription.status === 'trial'
              ? Math.ceil((new Date(court.subscription.trialEnds).getTime() - Date.now()) / 86400000)
              : null;

            return (
              <div key={court._id}
                className="bg-white border border-gray-200 rounded-lg overflow-hidden transition-shadow hover:shadow-sm">

                {/* Court row — always visible */}
                <div className="overflow-x-auto">
                  <div
                    className="grid items-center gap-4 px-5 py-4 cursor-pointer min-w-[760px]"
                    style={{ gridTemplateColumns: '1fr 160px 120px 120px auto' }}
                    onClick={() => setExpanded(isExpanded ? null : court._id)}
                  >

                  {/* Name + slug */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[0.9rem] font-semibold text-gray-900">{court.name}</span>
                      {!court.isActive && (
                        <span className="text-[0.6rem] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200">inactive</span>
                      )}
                      {!court.isPublic && (
                        <span className="text-[0.6rem] bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded border border-gray-200">unlisted</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[0.7rem] text-gray-400 font-mono">/{court.slug}</span>
                      {court.location.city && (
                        <>
                          <span className="text-gray-200">·</span>
                          <span className="text-[0.7rem] text-gray-400">{court.location.city}{court.location.province ? `, ${court.location.province}` : ''}</span>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Admin email */}
                  <div className="text-[0.72rem] text-gray-500 truncate" title={court.adminEmail}>
                    {court.adminEmail}
                  </div>

                  {/* Subscription status */}
                  <div className="flex flex-col gap-1">
                    <span className={`text-[0.62rem] font-semibold tracking-[0.06em] uppercase px-2 py-0.5 rounded-[3px] border w-fit ${STATUS_STYLES[court.subscription.status]}`}>
                      {court.subscription.status}
                    </span>
                    {daysUntilTrialEnd !== null && (
                      <span className={`text-[0.65rem] font-mono ${daysUntilTrialEnd <= 2 ? 'text-red-500' : 'text-amber-600'}`}>
                        {daysUntilTrialEnd}d remaining
                      </span>
                    )}
                    {court.subscription.status === 'active' && court.subscription.nextBilling && (
                      <span className="text-[0.65rem] text-gray-400 font-mono">
                        renews {new Date(court.subscription.nextBilling).toLocaleDateString()}
                      </span>
                    )}
                  </div>

                  {/* Plan + amount */}
                  <div className="text-[0.75rem] text-gray-600 font-mono">
                    ₱{court.subscription.amount.toLocaleString()}/{court.subscription.plan === 'annual' ? 'yr' : 'mo'}
                  </div>

                  {/* Expand toggle */}
                  <div className="flex items-center">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
                      className="text-gray-400 transition-transform duration-200"
                      style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                      <path d="M6 9l6 6 6-6"/>
                    </svg>
                  </div>
                </div>
                </div>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="border-t border-gray-100 px-5 py-5 bg-gray-50 flex flex-col gap-5">

                    {/* Sports */}
                    <div className="flex gap-2 flex-wrap">
                      {court.sports.map(s => (
                        <span key={s} className={`text-[0.65rem] font-semibold tracking-[0.06em] uppercase px-2.5 py-1 rounded-[3px] border ${SPORT_COLORS[s] ?? 'text-gray-500 bg-gray-100 border-gray-200'}`}>
                          {s}
                        </span>
                      ))}
                      <span className="text-[0.65rem] text-gray-500 bg-white border border-gray-200 px-2.5 py-1 rounded-[3px]">
                        {court.courtCount} physical court{court.courtCount !== 1 ? 's' : ''}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">

                      {/* Location */}
                      <div className="flex flex-col gap-2.5">
                        <p className="text-[0.65rem] font-bold tracking-[0.1em] uppercase text-gray-400">Location</p>
                        <InfoRow label="Address"  value={court.location.address} />
                        <InfoRow label="City"     value={court.location.city} />
                        <InfoRow label="Province" value={court.location.province} />
                        <InfoRow label="Country"  value={court.location.country} />
                      </div>

                      {/* Contact */}
                      <div className="flex flex-col gap-2.5">
                        <p className="text-[0.65rem] font-bold tracking-[0.1em] uppercase text-gray-400">Contact</p>
                        <InfoRow label="Phone"     value={court.contact.phone} />
                        <InfoRow label="Email"     value={court.contact.email} />
                        <InfoRow label="Facebook"  value={court.contact.facebook} />
                        <InfoRow label="Instagram" value={court.contact.instagram} />
                        <InfoRow label="Website"   value={court.contact.website} />
                      </div>

                      {/* Subscription */}
                      <div className="flex flex-col gap-2.5">
                        <p className="text-[0.65rem] font-bold tracking-[0.1em] uppercase text-gray-400">Subscription</p>
                        <InfoRow label="Status"      value={court.subscription.status} />
                        <InfoRow label="Plan"        value={court.subscription.plan} />
                        <InfoRow label="Amount"      value={`₱${court.subscription.amount.toLocaleString()}`} />
                        <InfoRow label="Trial ends"  value={court.subscription.trialEnds ? new Date(court.subscription.trialEnds).toLocaleDateString() : null} />
                        <InfoRow label="Start date"  value={court.subscription.startDate ? new Date(court.subscription.startDate).toLocaleDateString() : null} />
                        <InfoRow label="Next billing" value={court.subscription.nextBilling ? new Date(court.subscription.nextBilling).toLocaleDateString() : null} />
                      </div>

                      {/* Meta */}
                      <div className="flex flex-col gap-2.5">
                        <p className="text-[0.65rem] font-bold tracking-[0.1em] uppercase text-gray-400">Meta</p>
                        <InfoRow label="Registered" value={new Date(court.createdAt).toLocaleDateString()} />
                        <InfoRow label="Public"     value={court.isPublic ? 'Yes — listed on landing page' : 'No — unlisted'} />
                        <InfoRow label="Active"     value={court.isActive ? 'Yes' : 'No — suspended'} />
                        {/* Admin email — editable */}
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[0.62rem] font-semibold tracking-[0.08em] uppercase text-gray-400">Admin</span>
                          {editingEmail === court._id ? (
                            <div className="flex gap-2 items-center mt-0.5">
                              <input
                                autoFocus
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleEmailUpdate(court._id);
                                  if (e.key === 'Escape') { setEditingEmail(null); setNewEmail(''); }
                                }}
                                placeholder={court.adminEmail}
                                className="bg-white border border-gray-300 rounded px-2 py-1 text-[0.78rem] text-gray-900 outline-none focus:border-green-400 transition-colors w-[200px]"
                              />
                              <button
                                onClick={() => handleEmailUpdate(court._id)}
                                disabled={emailLoading}
                                className="text-[0.68rem] px-2.5 py-1 bg-gray-900 text-white rounded cursor-pointer hover:bg-gray-700 disabled:opacity-50 transition-colors border-none">
                                {emailLoading ? '...' : 'Save'}
                              </button>
                              <button
                                onClick={() => { setEditingEmail(null); setNewEmail(''); }}
                                className="text-[0.68rem] px-2 py-1 text-gray-400 cursor-pointer hover:text-gray-600 bg-transparent border-none">
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-[0.82rem] text-gray-700">{court.adminEmail}</span>
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setEditingEmail(court._id);
                                  setNewEmail(court.adminEmail);
                                }}
                                className="text-[0.65rem] text-gray-400 hover:text-gray-600 underline cursor-pointer bg-transparent border-none">
                                edit
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-2 flex-wrap pt-2 border-t border-gray-200">
                      <p className="text-[0.65rem] font-semibold tracking-[0.08em] uppercase text-gray-400 self-center mr-2">
                        Subscription actions
                      </p>
                      {court.subscription.status === 'trial' && (
                        <>
                          <ActionBtn label="Activate" color="green" loading={acting === court._id}
                            onClick={() => { if (confirm(`Activate ${court.name}?`)) updateSubscription(court._id, { status: 'active', plan: court.subscription.plan }); }} />
                          <ActionBtn label="+7 days trial" color="amber" loading={acting === court._id}
                            onClick={() => updateSubscription(court._id, { extendTrialDays: 7 })} />
                        </>
                      )}
                      {court.subscription.status === 'active' && (
                        <>
                          <ActionBtn label="Suspend" color="red" loading={acting === court._id}
                            onClick={() => { if (confirm(`Suspend ${court.name}? They lose access immediately.`)) updateSubscription(court._id, { status: 'suspended' }); }} />
                          {court.subscription.plan === 'monthly' && (
                            <ActionBtn label="Upgrade to Annual" color="gray" loading={acting === court._id}
                              onClick={() => { if (confirm(`Switch ${court.name} to annual plan?`)) updateSubscription(court._id, { plan: 'annual', amount: 20000 }); }} />
                          )}
                        </>
                      )}
                      {(court.subscription.status === 'suspended' || court.subscription.status === 'expired') && (
                        <ActionBtn label="Reactivate" color="green" loading={acting === court._id}
                          onClick={() => { if (confirm(`Reactivate ${court.name}?`)) updateSubscription(court._id, { status: 'active', plan: court.subscription.plan }); }} />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}