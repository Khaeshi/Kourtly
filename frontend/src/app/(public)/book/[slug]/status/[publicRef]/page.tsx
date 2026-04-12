'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';

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
  xenditInvoiceUrl: string;
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

  if (loading) return <div className="min-h-screen bg-[#080c04] text-white/60 p-8">Loading reservation status...</div>;
  if (error || !data) return <div className="min-h-screen bg-[#080c04] text-red-400 p-8">{error || 'Not found'}</div>;

  const showPay = data.status === 'approved_waiting_payment' && data.paymentStatus === 'awaiting_payment' && !!data.xenditInvoiceUrl;

  return (
    <div className="min-h-screen bg-[#080c04] text-white p-6">
      <div className="max-w-xl mx-auto border border-white/10 rounded-xl bg-white/5 p-6">
        <p className="text-xs text-white/40 mb-2">Reservation Ref: {data.publicRef}</p>
        <h1 className="text-2xl mb-2">Reservation Status</h1>
        <p className="text-white/70 mb-4">Court {data.court} · {data.date} · {data.timeSlot}</p>

        <div className="space-y-1 text-sm mb-5">
          <p>Status: <span className="text-[#60a5fa]">{data.status}</span></p>
          <p>Payment: <span className="text-[#60a5fa]">{data.paymentStatus}</span></p>
          <p>Reservation Fee: ₱{Number(data.reservationFeeAmount || 0).toFixed(2)}</p>
          <p>Paid Online: ₱{Number(data.amountPaidOnline || 0).toFixed(2)}</p>
          <p>Remaining Balance: ₱{Number(data.remainingBalanceAmount || 0).toFixed(2)}</p>
        </div>

        {showPay && (
          <a
            href={data.xenditInvoiceUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block px-4 py-2 rounded bg-blue-500 text-black font-semibold no-underline"
          >
            Open Payment QR
          </a>
        )}

        {(data.status === 'cancelled' || data.status === 'expired') && (
          <div className="mt-4 flex gap-2">
            <Link href={`/book/${slug}`} className="px-4 py-2 rounded border border-white/20 text-white no-underline">Book again</Link>
            <Link href="/" className="px-4 py-2 rounded border border-white/20 text-white no-underline">OK</Link>
          </div>
        )}
      </div>
    </div>
  );
}

