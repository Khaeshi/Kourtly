'use client';

import Link from 'next/link';
import { use, useCallback, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import PublicFooter from '@/app/components/public/PublicFooter';
import { InlineNotice } from '@/app/components/public/ui';
import BookingNav from '@/app/components/public/booking/BookingNav';
import JoyCompanion, { type JoyState } from '@/app/components/public/booking/JoyCompanion';
import { fmtDateChip, fmtMins, toMinutes } from '@/app/components/public/booking/booking-utils';

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
  mockPaymentAvailable: boolean;
};

const STATUS_LABEL: Record<string, string> = {
  confirmed: 'Confirmed',
  approved_waiting_payment: 'Waiting for payment',
  pending_admin: 'Waiting for approval',
  cancelled: 'Cancelled',
  expired: 'Expired',
};
const PAYMENT_LABEL: Record<string, string> = { paid: 'Paid', awaiting_payment: 'Awaiting payment' };
const human = (map: Record<string, string>, v: string) => map[v] ?? v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
const peso2 = (n: number) => `₱${Number(n || 0).toFixed(2)}`;

function fmtRange(slot: string) {
  const m = slot.match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
  return m ? `${fmtMins(toMinutes(m[1]))} – ${fmtMins(toMinutes(m[2]))}` : slot;
}
function fmtDate(d: string) {
  try { return /^\d{4}-\d{2}-\d{2}$/.test(d) ? fmtDateChip(d) : d; } catch { return d; }
}

export default function ReservationStatusPage({
  params,
}: {
  params: Promise<{ slug: string; publicRef: string }>;
}) {
  const { slug, publicRef } = use(params);
  const [data, setData] = useState<StatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mockPaying, setMockPaying] = useState(false);

  // `silent` reloads (socket updates, after a test payment) keep the page on screen instead of flashing "Loading"
  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
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
    const onUpdate = () => load(true);
    const socket = io(process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000', {
      auth: { publicRef },
      transports: ['websocket'],
    });
    socket.on('reservation:updated', onUpdate);
    return () => {
      socket.off('reservation:updated', onUpdate);
      socket.disconnect();
    };
  }, [load, publicRef]);

  if (loading) {
    return (
      <>
        <BookingNav />
        <div className="flex min-h-[50vh] flex-1 items-center justify-center">
          <p className="text-[var(--line-faint)]">Loading reservation status…</p>
        </div>
      </>
    );
  }

  if (error || !data) {
    return (
      <>
        <BookingNav />
        <div className="flex min-h-[50vh] flex-1 items-center justify-center p-8">
          <InlineNotice variant="error">{error || 'Not found'}</InlineNotice>
        </div>
        <PublicFooter compact />
      </>
    );
  }

  const awaitingPayment = ['approved_waiting_payment', 'pending_admin'].includes(data.status) && data.paymentStatus === 'awaiting_payment';
  const showPay = awaitingPayment && !data.mockPaymentAvailable && !!data.paymentUrl;
  const showMockPay = data.mockPaymentAvailable && awaitingPayment;
  const paid = data.status === 'confirmed' && data.paymentStatus === 'paid';
  const ended = data.status === 'cancelled' || data.status === 'expired';

  let joy: { state: JoyState; message: string } = { state: 'idle', message: 'I will update this page when something changes.' };
  if (paid) joy = { state: 'done', message: 'You are booked!' };
  else if (ended) joy = { state: 'noSlots', message: 'This reservation is no longer active.' };
  else if (awaitingPayment) joy = { state: 'idle', message: 'Pay soon to keep your slot.' };

  const expires = awaitingPayment && data.paymentExpiresAt ? new Date(data.paymentExpiresAt) : null;
  const rows: [string, string][] = [
    ['Status', human(STATUS_LABEL, data.status)],
    ['Payment', human(PAYMENT_LABEL, data.paymentStatus)],
    ['Reservation fee', peso2(data.reservationFeeAmount)],
    ['Paid online', peso2(data.amountPaidOnline)],
    ['Remaining balance', peso2(data.remainingBalanceAmount)],
  ];

  const simulatePayment = async () => {
    setMockPaying(true);
    try {
      const res = await fetch(`/api/public/courts/${slug}/reservations/${publicRef}/mock-pay`, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload.error || 'Simulation failed');
      await load(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Simulation failed');
    } finally {
      setMockPaying(false);
    }
  };

  return (
    <>
      <BookingNav />

      <div className="flex-1">
        <div className="mx-auto max-w-[900px] px-[clamp(1.25rem,5vw,3rem)] pb-16 pt-8" style={{ paddingBottom: 'max(4rem, env(safe-area-inset-bottom))' }}>
          <p className="t-eyebrow mb-2 text-[var(--success)]">Reservation ref · {data.publicRef}</p>
          <h1 className="font-display m-0 mb-2 text-[clamp(1.9rem,4vw,3rem)] text-[var(--line)]">
            {paid ? 'Booking Received' : 'Reservation Status'}
          </h1>
          <p className="mb-8 mt-0 text-[0.95rem] text-[var(--line-dim)]">
            Court {data.court} · {fmtDate(data.date)} · {fmtRange(data.timeSlot)}
          </p>

          <div className="grid items-start gap-10 md:grid-cols-[1fr_300px]">
            <div>
              <dl className="m-0 mb-6 flex flex-col">
                {rows.map(([label, value]) => (
                  <div key={label} className="flex justify-between gap-4 border-b border-[var(--divider)] py-3 text-[0.95rem]">
                    <dt className="text-[var(--line-dim)]">{label}</dt>
                    <dd className="m-0 text-right font-semibold text-[var(--line)]">{value}</dd>
                  </div>
                ))}
              </dl>

              {expires && <p className="mb-5 mt-0 text-[0.9rem] text-[var(--line-dim)]">Pay before {expires.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })} to keep your slot.</p>}

              {showPay && (
                <a href={data.paymentUrl} target="_blank" rel="noreferrer" className="pub-cta pub-cta-primary mb-6 no-underline">
                  Open payment QR
                </a>
              )}

              {showMockPay && (
                <button type="button" onClick={simulatePayment} disabled={mockPaying} className="pub-cta pub-cta-primary mb-6 no-underline">
                  {mockPaying ? 'Processing test payment…' : 'Simulate payment (test)'}
                </button>
              )}

              {ended && (
                <div className="flex flex-wrap gap-3">
                  <Link href={`/book/${slug}`} className="pub-cta pub-cta-primary no-underline">Book again</Link>
                  <Link href="/usercourts" className="pub-cta pub-cta-ghost no-underline">Find courts</Link>
                </div>
              )}
            </div>

            <aside className="hidden md:block" aria-hidden="true">
              <JoyCompanion state={joy.state} message={joy.message} />
            </aside>
          </div>
        </div>
      </div>

      <PublicFooter compact />
    </>
  );
}
