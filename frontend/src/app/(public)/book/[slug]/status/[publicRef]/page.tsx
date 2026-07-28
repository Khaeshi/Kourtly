'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import PublicNav from '@/app/components/public/PublicNav';
import PublicFooter from '@/app/components/public/PublicFooter';
import { InlineNotice, KeyValueSummary } from '@/app/components/public/ui';

type StatusData = {
  publicRef: string;
  status: string;
  paymentStatus: string;
  court: number;
  date: string;
  timeSlot: string;
  paymentOption: 'downpayment' | 'full';
  reservationFeeAmount: number;
  downpaymentAmount: number;
  maintenanceFeeAmount: number;
  amountPaidOnline: number;
  remainingBalanceAmount: number;
  paymentUrl: string;
  paymentExpiresAt: string | null;
};

export default function ReservationStatusPage({
  params,
}: {
  params: Promise<{ slug: string; publicRef: string }>;
}) {
  const { slug, publicRef } = use(params);
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/public/courts/${slug}/reservations/${publicRef}`);
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Failed to load reservation status');
      setData(payload);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load reservation status');
    } finally {
      setLoading(false);
    }
  }, [slug, publicRef]);

  useEffect(() => {
    load();
    const id = setInterval(load, 10000);
    return () => clearInterval(id);
  }, [load]);

  if (loading) {
    return (
      <>
        <PublicNav />
        <div className="flex-1 booking-grid-bg flex items-center justify-center min-h-[50vh]">
          <p className="font-mono-data text-[var(--line-faint)]">Loading reservation status...</p>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <PublicNav />
        <div className="flex-1 booking-grid-bg flex items-center justify-center min-h-[50vh] p-8">
          <InlineNotice variant="error">{error || 'Not found'}</InlineNotice>
        </div>
        <PublicFooter compact />
      </>
    );
  }

  const showPay = data.status === 'approved_waiting_payment' && data.paymentStatus === 'awaiting_payment' && !!data.paymentUrl;

  return (
    <>
      <PublicNav />

      <div className="flex-1 booking-grid-bg">
        <div className="max-w-xl mx-auto px-[clamp(1.25rem,5vw,3rem)] py-10 sm:py-16 booking-safe-bottom">
          <p className="section-head eyebrow mb-2">Reservation Ref: {data.publicRef}</p>
          <h1 className="font-display text-[clamp(1.8rem,4vw,2.4rem)] text-[var(--line)] mb-2">Reservation Status</h1>
          <p className="text-[var(--line-dim)] mb-6 font-mono-data text-sm">
            Court {data.court} · {data.date} · {data.timeSlot}
          </p>

          <KeyValueSummary
            className="mb-6"
            rows={[
              ['Status', data.status],
              ['Payment', data.paymentStatus],
              ['Reservation Fee', `₱${Number(data.reservationFeeAmount || 0).toFixed(2)}`],
              ['Paid Online', `₱${Number(data.amountPaidOnline || 0).toFixed(2)}`],
              ['Remaining Balance', `₱${Number(data.remainingBalanceAmount || 0).toFixed(2)}`],
            ]}
          />

          {showPay && (
            <a
              href={data.paymentUrl}
              target="_blank"
              rel="noreferrer"
              className="pub-cta pub-cta-primary no-underline mb-6"
            >
              Open Payment QR
            </a>
          )}

          {(data.status === 'cancelled' || data.status === 'expired') && (
            <div className="flex flex-wrap gap-3">
              <Link href={`/book/${slug}`} className="pub-cta pub-cta-primary no-underline">Book again</Link>
              <Link href="/usercourts" className="pub-cta pub-cta-ghost no-underline">Find courts</Link>
            </div>
          )}
        </div>
      </div>

      <PublicFooter compact />
    </>
  );
}
