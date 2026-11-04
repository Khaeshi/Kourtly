'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/app/components/ui/Button';
import { AdminHeader } from '@/app/components/ui/AdminHeader';

interface PendingCourt {
  _id: string;
  name: string;
  slug: string;
  registeredBy?: { email?: string } | null;
  contactPerson?: { name?: string; phone?: string };
  location?: { city?: string };
}

export default function PendingCourtsPage() {
  const [courts, setCourts] = useState<PendingCourt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [acting, setActing] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/proxy/superadmin/courts/pending');
      if (!response.ok) throw new Error('Failed to load pending registrations.');
      const data: unknown = await response.json();
      if (!Array.isArray(data)) throw new Error('Unexpected pending court response.');
      setCourts(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load pending registrations.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const actOnCourt = async (courtId: string, action: 'approve' | 'reject') => {
    setActing(courtId);
    setError(null);
    try {
      const response = await fetch(`/api/proxy/superadmin/courts/${courtId}/${action}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        ...(action === 'reject' ? { body: JSON.stringify({ reason: reason.trim() }) } : {}),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error || `Failed to ${action} court.`);
      }
      setCourts(current => current.filter(court => court._id !== courtId));
      setRejecting(null);
      setReason('');
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to ${action} court.`);
    } finally {
      setActing(null);
    }
  };

  return (
    <div className="max-w-[1100px]">
      <AdminHeader eyebrow="Platform" title="Pending courts" right={
        <div className="flex items-center gap-3">
          <span className="ad-mono ad-muted text-xs">{courts.length} pending</span>
          <Button v="ghost" onClick={() => void load()} disabled={loading}>Refresh</Button>
        </div>
      } />

      {error && (
        <div role="alert" className="mb-4 flex items-center justify-between gap-3 border-l-4 border-[#C4401F] bg-[#F3E3DC] px-4 py-3 text-sm">
          <span>{error}</span>
          <Button v="ghost" size="sm" onClick={() => void load()}>Try again</Button>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center ad-muted text-sm">Loading pending registrations...</p>
      ) : courts.length === 0 ? (
        <div className="py-14">
          <p className="font-bold">No courts are waiting for approval.</p>
          <p className="ad-muted text-sm mt-1">New registrations appear here.</p>
        </div>
      ) : (
        <div className="border-t-2 border-[#0E2420]">
          {courts.map(court => (
            <section key={court._id} className="border-b border-[#E1DBCB] py-5">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Info label="Court" value={court.name} />
                  <Info label="Slug" value={court.slug} mono />
                  <Info label="City" value={court.location?.city} />
                  <Info label="Contact person" value={court.contactPerson?.name} />
                  <Info label="Contact phone" value={court.contactPerson?.phone} mono />
                  <Info label="Registered by" value={court.registeredBy?.email} />
                </div>
                <div className="flex shrink-0 gap-2 flex-wrap">
                  <Button v="primary" onClick={() => void actOnCourt(court._id, 'approve')} disabled={acting !== null}
                    loading={acting === court._id}>
                    {acting === court._id ? 'Working...' : 'Approve'}
                  </Button>
                  <Button v="danger" disabled={acting !== null}
                    onClick={() => {
                      setRejecting(current => current === court._id ? null : court._id);
                      setReason('');
                      setError(null);
                    }}>
                    Reject…
                  </Button>
                </div>
              </div>
              {rejecting === court._id && (
                <form
                  className="mt-4 flex flex-col gap-3 border-t border-[#E1DBCB] pt-4 sm:flex-row sm:items-end"
                  onSubmit={event => {
                    event.preventDefault();
                    void actOnCourt(court._id, 'reject');
                  }}
                >
                  <div className="min-w-0 flex-1">
                    <label htmlFor={`rj-${court._id}`} className="ad-label">Reason for rejection (the owner will see this)</label>
                    <input
                      id={`rj-${court._id}`}
                      autoFocus
                      value={reason}
                      onChange={event => setReason(event.target.value)}
                      placeholder="The phone number could not be reached."
                      className="ad-input"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button v="dark" type="submit" className="!bg-[#B8431F] !border-[#B8431F]"
                      disabled={acting !== null || !reason.trim()} loading={acting === court._id}>
                      {acting === court._id ? 'Rejecting...' : 'Confirm reject'}
                    </Button>
                    <Button v="ghost" type="button" disabled={acting !== null}
                      onClick={() => { setRejecting(null); setReason(''); }}>
                      Cancel
                    </Button>
                  </div>
                </form>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="ad-eyebrow">{label}</span>
      <span className={`break-words text-sm ${mono ? 'ad-mono' : ''}`}>{value || '—'}</span>
    </div>
  );
}
