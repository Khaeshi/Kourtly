'use client';

import { useCallback, useEffect, useState } from 'react';

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
    <div className="max-w-[1100px] space-y-6 font-sans">
      <div className="flex items-end justify-between gap-4 border-b border-gray-100 pb-5">
        <div>
          <p className="mb-1 text-[0.72rem] font-medium uppercase tracking-[0.05em] text-gray-400">Platform</p>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Pending Courts</h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-mono text-[0.72rem] text-gray-400">{courts.length} pending</span>
          <button
            type="button"
            onClick={() => void load()}
            disabled={loading}
            className="cursor-pointer rounded-md border border-gray-200 bg-white px-3 py-1.5 text-[0.72rem] text-gray-500 transition-colors hover:border-gray-300 hover:text-gray-700 disabled:opacity-50"
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="flex justify-between rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <span>{error}</span>
          <button type="button" onClick={() => void load()} className="cursor-pointer border-0 bg-transparent text-xs text-red-600 underline">
            Retry
          </button>
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center text-sm text-gray-400">Loading pending registrations...</p>
      ) : courts.length === 0 ? (
        <div className="rounded-lg border border-gray-200 bg-white py-10 text-center text-sm text-gray-400">
          No pending registrations
        </div>
      ) : (
        <div className="space-y-3">
          {courts.map(court => (
            <section key={court._id} className="rounded-lg border border-gray-200 bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-5">
                <div className="grid min-w-0 flex-1 grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
                  <Info label="Court" value={court.name} />
                  <Info label="Slug" value={court.slug} />
                  <Info label="City" value={court.location?.city} />
                  <Info label="Contact person" value={court.contactPerson?.name} />
                  <Info label="Contact phone" value={court.contactPerson?.phone} />
                  <Info label="Registered by" value={court.registeredBy?.email} />
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() => void actOnCourt(court._id, 'approve')}
                    disabled={acting !== null}
                    className="cursor-pointer rounded-md border border-green-200 bg-green-50 px-3 py-1.5 text-[0.75rem] font-medium text-green-700 transition-colors hover:bg-green-100 disabled:opacity-50"
                  >
                    {acting === court._id ? 'Working...' : 'Approve'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRejecting(current => current === court._id ? null : court._id);
                      setReason('');
                      setError(null);
                    }}
                    disabled={acting !== null}
                    className="cursor-pointer rounded-md border border-red-200 bg-red-50 px-3 py-1.5 text-[0.75rem] font-medium text-red-600 transition-colors hover:bg-red-100 disabled:opacity-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
              {rejecting === court._id && (
                <form
                  className="mt-4 flex flex-col gap-2 border-t border-gray-100 pt-4 sm:flex-row"
                  onSubmit={event => {
                    event.preventDefault();
                    void actOnCourt(court._id, 'reject');
                  }}
                >
                  <input
                    aria-label={`Rejection reason for ${court.name}`}
                    value={reason}
                    onChange={event => setReason(event.target.value)}
                    placeholder="Reason for rejection"
                    className="min-w-0 flex-1 rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-red-300"
                  />
                  <button
                    type="submit"
                    disabled={acting !== null || !reason.trim()}
                    className="cursor-pointer rounded-md bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                  >
                    {acting === court._id ? 'Rejecting...' : 'Confirm reject'}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setRejecting(null); setReason(''); }}
                    disabled={acting !== null}
                    className="cursor-pointer rounded-md border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 transition-colors hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </form>
              )}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function Info({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[0.62rem] font-semibold uppercase tracking-[0.08em] text-gray-400">{label}</span>
      <span className="break-words text-[0.82rem] text-gray-700">{value || '—'}</span>
    </div>
  );
}
