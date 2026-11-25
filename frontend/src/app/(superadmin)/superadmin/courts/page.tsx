'use client';
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/app/components/ui/Button';
import { StatusDot, type StatusTone } from '@/app/components/ui/StatusDot';
import { AdminHeader } from '@/app/components/ui/AdminHeader';

interface Court {
  _id: string; name: string; slug: string; adminEmail: string;
  sports: string[]; courtCount: number; isPublic: boolean; isActive: boolean;
  createdAt: string;
  location: { address: string; city: string; province: string; country: string; };
  contact:  { phone: string; email: string; facebook: string; instagram: string; website: string; };
  subscription: {
    status: string; plan: string; amount: number; tier?: string;
    modules?: { key: string; enabled: boolean; source: string; expiresAt?: string | null }[];
    trialEnds: string; startDate: string | null; nextBilling: string | null;
  };
  capabilities?: { tier: string; modules: Record<string, boolean> };
}

const TONE: Record<string, StatusTone> = {
  active: 'ok', trial: 'wait', expired: 'bad', suspended: 'off',
};

const TIER_LABELS: Record<string, string> = {
  basic: 'Basic', standard: 'Standard', premium: 'Premium', elite: 'Elite',
};

function InfoRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="ad-eyebrow">{label}</span>
      <span className="text-sm break-words">{value}</span>
    </div>
  );
}

export default function CourtsPage() {
  const [courts,  setCourts]  = useState<Court[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [notice,  setNotice]  = useState<string | null>(null);
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
      setNotice(err instanceof Error ? err.message : 'Failed to update email');
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
    } catch { setNotice('Action failed'); }
    finally { setActing(null); }
  };

  const updateTier = async (courtId: string, tier: string) => {
    setActing(courtId);
    try {
      const res = await fetch(`/api/proxy/superadmin/courts/${courtId}/entitlements`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tier, overrides: [] }),
      });
      if (!res.ok) throw new Error('Failed');
      await load();
    } catch { setNotice('Tier update failed'); }
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
    <div className="max-w-[1100px]">

      <AdminHeader eyebrow="Platform" title="Courts" right={
        <div className="flex items-center gap-3">
          <span className="ad-mono ad-muted text-xs">{courts.length} total</span>
          <Button v="ghost" onClick={load}>Refresh</Button>
        </div>
      } />

      {/* Filters */}
      <div className="flex gap-3 flex-wrap items-end mb-5">
        <div className="w-full sm:w-72">
          <label htmlFor="sc-search" className="ad-label">Search courts</label>
          <input id="sc-search" className="ad-input" placeholder="Name, email, city"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <div className="flex gap-2 flex-wrap">
          {['all', 'active', 'trial', 'expired', 'suspended'].map(f => (
            <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
              className={`filter-btn capitalize${filter === f ? ' active' : ''}`}>{f}</button>
          ))}
        </div>
      </div>

      {notice && (
        <p role="alert" className="mb-4 flex items-center justify-between gap-3 border-l-4 border-[#C4401F] bg-[#F3E3DC] px-4 py-3 text-sm">
          <span>{notice}</span>
          <Button v="ghost" size="sm" onClick={() => setNotice(null)}>Dismiss</Button>
        </p>
      )}

      {/* Error */}
      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 border-l-4 border-[#C4401F] bg-[#F3E3DC] px-4 py-3 text-sm">
          <span>{error}</span>
          <Button v="ghost" size="sm" onClick={load}>Try again</Button>
        </div>
      )}

      {/* Courts list */}
      {loading ? (
        <div className="py-16 text-center ad-muted text-sm">Loading courts...</div>
      ) : filtered.length === 0 ? (
        <div className="py-14 text-center">
          <p className="font-bold">No courts found.</p>
          <p className="ad-muted text-sm mt-1">Clear the search or pick All.</p>
        </div>
      ) : (
        <div className="border-t-2 border-[#0E2420]">
          {filtered.map(court => {
            const isExpanded = expanded === court._id;
            const daysUntilTrialEnd = court.subscription.status === 'trial'
              ? Math.ceil((new Date(court.subscription.trialEnds).getTime() - Date.now()) / 86400000)
              : null;
            const tierKey = court.capabilities?.tier ?? court.subscription.tier ?? 'basic';

            return (
              <div key={court._id} className="border-b border-[#E1DBCB]">

                {/* Court row — always visible */}
                <button type="button" aria-expanded={isExpanded}
                  onClick={() => setExpanded(isExpanded ? null : court._id)}
                  className="w-full text-left grid items-center gap-x-4 gap-y-2 px-1 py-4 cursor-pointer hover:bg-[#EDE8D8]/50 transition-colors grid-cols-[minmax(0,1fr)_auto] lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1.3fr)_150px_90px_120px_20px]">

                  {/* Name + slug */}
                  <span className="min-w-0">
                    <span className="flex items-center gap-2 flex-wrap">
                      <b className="text-[15px]">{court.name}</b>
                      {!court.isActive && <span className="ad-mono ad-muted text-xs">inactive</span>}
                      {!court.isPublic && <span className="ad-mono ad-muted text-xs">unlisted</span>}
                    </span>
                    <span className="ad-mono ad-muted text-xs block mt-0.5">
                      /{court.slug}{court.location.city ? ` · ${court.location.city}${court.location.province ? `, ${court.location.province}` : ''}` : ''}
                    </span>
                  </span>

                  {/* Chevron: right of the name on phones, last column on desktop */}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"
                    className="text-[#5B6B66] transition-transform duration-200 motion-reduce:transition-none lg:order-last"
                    style={{ transform: isExpanded ? 'rotate(180deg)' : 'none' }}>
                    <path d="M6 9l6 6 6-6" />
                  </svg>

                  {/* Meta: second line on phones, columns on desktop */}
                  <span className="col-span-2 lg:contents flex flex-wrap items-center gap-x-5 gap-y-1">
                    <span className="text-sm ad-muted truncate max-w-full" title={court.adminEmail}>{court.adminEmail}</span>
                    <span>
                      <StatusDot tone={TONE[court.subscription.status] ?? 'off'}><span className="capitalize">{court.subscription.status}</span></StatusDot>
                      {daysUntilTrialEnd !== null && (
                        <span className={`ad-mono text-xs block ${daysUntilTrialEnd <= 2 ? 'text-[#B8431F] font-bold' : 'text-[#B8821A]'}`}>{daysUntilTrialEnd}d remaining</span>
                      )}
                      {court.subscription.status === 'active' && court.subscription.nextBilling && (
                        <span className="ad-mono ad-muted text-xs block">renews {new Date(court.subscription.nextBilling).toLocaleDateString()}</span>
                      )}
                    </span>
                    <span className="ad-mono text-xs uppercase tracking-wide">{TIER_LABELS[tierKey] ?? 'Basic'}</span>
                    <span className="ad-mono text-sm">₱{court.subscription.amount.toLocaleString()}/{court.subscription.plan === 'annual' ? 'yr' : 'mo'}</span>
                  </span>
                </button>

                {/* Expanded detail */}
                {isExpanded && (
                  <div className="bg-[#EDE8D8]/50 px-4 py-5 flex flex-col gap-6">

                    <p className="text-sm">
                      <span className="capitalize">{court.sports.join(' · ')}</span>
                      <span className="ad-muted"> · {court.courtCount} physical court{court.courtCount !== 1 ? 's' : ''}</span>
                    </p>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">

                      {/* Location */}
                      <div className="flex flex-col gap-3 min-w-0">
                        <p className="font-bold text-sm">Location</p>
                        <InfoRow label="Address"  value={court.location.address} />
                        <InfoRow label="City"     value={court.location.city} />
                        <InfoRow label="Province" value={court.location.province} />
                        <InfoRow label="Country"  value={court.location.country} />
                      </div>

                      {/* Contact */}
                      <div className="flex flex-col gap-3 min-w-0">
                        <p className="font-bold text-sm">Contact</p>
                        <InfoRow label="Phone"     value={court.contact.phone} />
                        <InfoRow label="Email"     value={court.contact.email} />
                        <InfoRow label="Facebook"  value={court.contact.facebook} />
                        <InfoRow label="Instagram" value={court.contact.instagram} />
                        <InfoRow label="Website"   value={court.contact.website} />
                      </div>

                      {/* Subscription */}
                      <div className="flex flex-col gap-3 min-w-0">
                        <p className="font-bold text-sm">Subscription</p>
                        <InfoRow label="Status"       value={court.subscription.status} />
                        <InfoRow label="Plan"         value={court.subscription.plan} />
                        <InfoRow label="Tier"         value={TIER_LABELS[tierKey] ?? 'Basic'} />
                        <InfoRow label="Amount"       value={`₱${court.subscription.amount.toLocaleString()}`} />
                        <InfoRow label="Trial ends"   value={court.subscription.trialEnds ? new Date(court.subscription.trialEnds).toLocaleDateString() : null} />
                        <InfoRow label="Start date"   value={court.subscription.startDate ? new Date(court.subscription.startDate).toLocaleDateString() : null} />
                        <InfoRow label="Next billing" value={court.subscription.nextBilling ? new Date(court.subscription.nextBilling).toLocaleDateString() : null} />
                      </div>

                      {/* Meta */}
                      <div className="flex flex-col gap-3 min-w-0">
                        <p className="font-bold text-sm">Meta</p>
                        <InfoRow label="Registered" value={new Date(court.createdAt).toLocaleDateString()} />
                        <InfoRow label="Public"     value={court.isPublic ? 'Yes, listed on the landing page' : 'No, unlisted'} />
                        <InfoRow label="Active"     value={court.isActive ? 'Yes' : 'No, suspended'} />
                        {/* Admin email — editable */}
                        <div className="flex flex-col gap-1 min-w-0">
                          <span className="ad-eyebrow">Admin</span>
                          {editingEmail === court._id ? (
                            <div className="flex flex-col gap-2">
                              <input
                                autoFocus
                                aria-label="New admin email"
                                value={newEmail}
                                onChange={e => setNewEmail(e.target.value)}
                                onKeyDown={e => {
                                  if (e.key === 'Enter') handleEmailUpdate(court._id);
                                  if (e.key === 'Escape') { setEditingEmail(null); setNewEmail(''); }
                                }}
                                placeholder={court.adminEmail}
                                className="ad-input"
                              />
                              <div className="flex gap-2">
                                <Button v="primary" size="sm" onClick={() => handleEmailUpdate(court._id)} loading={emailLoading}>Save</Button>
                                <Button v="ghost" size="sm" onClick={() => { setEditingEmail(null); setNewEmail(''); }}>Cancel</Button>
                              </div>
                            </div>
                          ) : (
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm break-all">{court.adminEmail}</span>
                              <Button v="ghost" size="sm" onClick={() => { setEditingEmail(court._id); setNewEmail(court.adminEmail); }}>Change email</Button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Product tier */}
                    <div className="pt-4 border-t border-[#C9C3B3]">
                      <p className="ad-label">Product tier</p>
                      <div className="flex gap-2 flex-wrap">
                        {[
                          ['basic', 'Basic'],
                          ['standard', 'Standard'],
                          ['premium', 'Premium'],
                          ['elite', 'Elite'],
                        ].map(([tier, label]) => {
                          const current = (court.capabilities?.tier ?? court.subscription.tier ?? 'booking') === tier;
                          return (
                            <button key={tier} type="button" aria-pressed={current} disabled={acting === court._id}
                              className={`filter-btn${current ? ' active' : ''}`}
                              onClick={() => {
                                if (!current && confirm(`Set ${court.name} to the ${label} tier?`)) {
                                  updateTier(court._id, tier);
                                }
                              }}>
                              {label}
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="pt-4 border-t border-[#C9C3B3]">
                      <p className="ad-label">Subscription actions</p>
                      <div className="flex gap-2 flex-wrap">
                        {court.subscription.status === 'trial' && (
                          <>
                            <Button v="primary" loading={acting === court._id}
                              onClick={() => { if (confirm(`Activate ${court.name}?`)) updateSubscription(court._id, { status: 'active', plan: court.subscription.plan }); }}>Activate…</Button>
                            <Button v="ghost" loading={acting === court._id}
                              onClick={() => updateSubscription(court._id, { extendTrialDays: 7 })}>Extend trial 7 days</Button>
                          </>
                        )}
                        {court.subscription.status === 'active' && (
                          <>
                            <Button v="danger" loading={acting === court._id}
                              onClick={() => { if (confirm(`Suspend ${court.name}? They lose access immediately.`)) updateSubscription(court._id, { status: 'suspended' }); }}>Suspend…</Button>
                            {court.subscription.plan === 'monthly' && (
                              <Button v="ghost" loading={acting === court._id}
                                onClick={() => { if (confirm(`Switch ${court.name} to annual plan?`)) updateSubscription(court._id, { plan: 'annual', amount: 20000 }); }}>Switch to annual plan…</Button>
                            )}
                          </>
                        )}
                        {(court.subscription.status === 'suspended' || court.subscription.status === 'expired') && (
                          <Button v="primary" loading={acting === court._id}
                            onClick={() => { if (confirm(`Reactivate ${court.name}?`)) updateSubscription(court._id, { status: 'active', plan: court.subscription.plan }); }}>Reactivate…</Button>
                        )}
                      </div>
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
