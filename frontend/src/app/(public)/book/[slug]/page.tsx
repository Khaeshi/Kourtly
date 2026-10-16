'use client';
import { useState, useEffect, useCallback, useMemo, use, type ReactNode } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PublicFooter from '@/app/components/public/PublicFooter';
import { InlineNotice, KeyValueSummary } from '@/app/components/public/ui';
import BookingNav from '@/app/components/public/booking/BookingNav';
import BookingStepper from '@/app/components/public/booking/BookingStepper';
import BookingCalendar from '@/app/components/public/booking/BookingCalendar';
import BookingSummary, { SummaryLine } from '@/app/components/public/booking/BookingSummary';
import JoyCompanion, { type JoyState } from '@/app/components/public/booking/JoyCompanion';
import {
  type Court, type ScheduleRule, type CourtAvailability,
  MAX_PLAYERS, todayStr, bookingMaxDateStr, toMinutes, fmtMins, fmtSlotRange,
  fmtDateLong, fmtDateShort, fmtDateChip, peso, validSlotsForSchedule,
  validateName, validatePhone, validateEmail, validateNotes, suggestEmail,
} from '@/app/components/public/booking/booking-utils';

const STEP_LABELS = ['Date', 'Court', 'Duration', 'Time', 'Details'];
const JOY_HINTS = [
  'Pick a day. I will check if we are open.',
  'Which court do you want?',
  'How long are we playing?',
  'Greyed slots are already taken.',
  'Almost done! Check your number.',
];

type JoyNote = { state: JoyState; message: string } | null;

const h2 = 'm-0 mb-1 text-[clamp(1.35rem,2.6vw,1.7rem)] font-extrabold text-[var(--line)]';
const sub = 'mb-5 mt-0 text-[0.95rem] text-[var(--line-dim)]';
const hintCls = 'mt-3 text-[0.88rem] text-[var(--danger)]';

// ── Duration step ─────────────────────────────────────────────────────────────

function DurationStep({ duration, setDuration, date, courtNum, slug, schedule, rate, onJoy, onNext }: {
  duration: number; setDuration: (d: number) => void;
  date: string; courtNum: number; slug: string; schedule: ScheduleRule[]; rate: number;
  onJoy: (n: JoyNote) => void; onNext: () => void;
}) {
  const [availMap, setAvailMap] = useState<Record<number, string[]>>({});
  const [loading, setLoading] = useState(true);
  const [hint, setHint] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([1, 2, 3, 4].map(async (d) => {
      const res = await fetch(`/api/public/courts/${slug}/availability?date=${date}&duration=${d}`);
      const data = await res.json();
      const c = (data.courts ?? []).find((x: CourtAvailability) => x.court === courtNum);
      return { d, available: (c?.availableSlots ?? []) as string[] };
    }))
      .then((results) => { if (!cancelled) setAvailMap(Object.fromEntries(results.map((r) => [r.d, r.available]))); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [date, courtNum, slug]);

  const countFor = (h: number) => (availMap[h] ?? []).filter((s) => validSlotsForSchedule(h, date, schedule).includes(s)).length;
  const hasSlots = countFor(duration) > 0;

  useEffect(() => {
    if (!loading && !hasSlots) onJoy({ state: 'noSlots', message: `No slots for ${duration}h. Try a shorter time.` });
    else onJoy(null);
  }, [loading, hasSlots, duration, onJoy]);

  const next = () => {
    if (!loading && !hasSlots) { setHint('No slots for this duration. Try a shorter one or another date.'); return; }
    onNext();
  };

  return (
    <div>
      <h2 className={h2}>How long do you want to play?</h2>
      <p className={sub}>{fmtDateChip(date)} · Court {courtNum}</p>
      <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[1, 2, 3, 4].map((h) => {
          const n = countFor(h);
          const none = !loading && n === 0;
          const on = duration === h;
          return (
            <button
              key={h}
              type="button"
              disabled={none}
              aria-pressed={on}
              onClick={() => { setDuration(h); setHint(''); }}
              className="cursor-pointer rounded-[18px] border p-4 text-left disabled:cursor-not-allowed disabled:opacity-40 sm:p-5"
              style={on ? { background: 'var(--amber)', color: 'var(--ink)', borderColor: 'var(--amber)' } : { background: 'var(--surface)', color: 'var(--line)', borderColor: 'var(--divider-strong)' }}
            >
              <span className="font-display block text-[2.4rem]">{h}</span>
              <span className="mb-3 block text-[0.9rem] font-bold">{h === 1 ? 'hour' : 'hours'}</span>
              <span className="font-mono-data block text-[0.9rem] font-bold">{peso(rate * h)}</span>
              <span className={`mt-1.5 block text-[0.8rem] ${on ? '' : 'text-[var(--line-dim)]'}`}>
                {loading ? 'Checking…' : none ? 'No slots' : `${n} start time${n === 1 ? '' : 's'}`}
              </span>
            </button>
          );
        })}
      </div>
      <p className="mb-6 mt-0 text-[0.85rem] text-[var(--line-dim)]">Longer sessions have fewer start times because the court must be free for the whole session.</p>
      {hint && <p role="alert" className={hintCls}>{hint}</p>}
      <button type="button" onClick={next} className="pub-cta pub-cta-primary">Choose a time →</button>
    </div>
  );
}

// ── Time step ─────────────────────────────────────────────────────────────────

const PERIODS = [
  { label: 'Morning', test: (m: number) => m < 12 * 60 },
  { label: 'Afternoon', test: (m: number) => m >= 12 * 60 && m < 17 * 60 },
  { label: 'Evening', test: (m: number) => m >= 17 * 60 },
];

function TimeStep({ date, courtNum, duration, slug, schedule, timeSlot, setTimeSlot, takenMessage, onNext }: {
  date: string; courtNum: number; duration: number; slug: string; schedule: ScheduleRule[];
  timeSlot: string; setTimeSlot: (s: string) => void; takenMessage: string; onNext: () => void;
}) {
  const [availability, setAvailability] = useState<CourtAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await fetch(`/api/public/courts/${slug}/availability?date=${date}&duration=${duration}`);
      const data = await res.json();
      const c = (data.courts ?? []).find((x: CourtAvailability) => x.court === courtNum);
      setAvailability(c ?? null);
    } catch { setError('Failed to load availability.'); }
    finally { setLoading(false); }
  }, [slug, date, duration, courtNum]);

  useEffect(() => { load(); }, [load]);

  const slots = validSlotsForSchedule(duration, date, schedule);
  const blockedSlots = availability?.blockedSlots ?? [];
  const availableSlots = new Set(availability?.availableSlots ?? []);

  const next = () => {
    if (!timeSlot) { setHint('Pick a start time to continue.'); return; }
    onNext();
  };

  return (
    <div>
      <h2 className={h2}>Choose a start time</h2>
      <p className={sub}>{fmtDateChip(date)} · Court {courtNum} · {duration} hour{duration > 1 ? 's' : ''}</p>

      {takenMessage && <InlineNotice variant="error" className="mb-4"><p className="text-sm font-medium">{takenMessage}</p></InlineNotice>}

      {loading ? (
        <div className="mb-6 space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="h-14 animate-pulse rounded-[var(--r-block)] bg-[var(--public-surface)]" />)}</div>
      ) : error ? (
        <InlineNotice variant="error" className="mb-6">
          <p className="text-sm">{error}</p>
          <button type="button" onClick={load} className="mt-2 text-[0.8rem] opacity-80 transition-opacity hover:opacity-100">Try again →</button>
        </InlineNotice>
      ) : slots.length === 0 ? (
        <InlineNotice variant="error" className="mb-6"><p className="text-sm">No start times for this duration. Go back and try a shorter one.</p></InlineNotice>
      ) : (
        <div className="mb-5 max-h-[340px] overflow-y-auto overscroll-contain border-t border-[var(--divider)] pr-2">
          {PERIODS.map((p) => {
            const list = slots.filter((s) => p.test(toMinutes(s.split('-')[0])));
            if (list.length === 0) return null;
            return (
              <div key={p.label}>
                <p className="mb-2.5 mt-4 text-[0.75rem] font-bold uppercase tracking-[0.08em] text-[var(--line-dim)]">{p.label}</p>
                <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                  {list.map((slot) => {
                    const start = toMinutes(slot.split('-')[0]);
                    const blocked = !availableSlots.has(slot) || blockedSlots.includes(slot);
                    const on = timeSlot === slot;
                    return (
                      <button
                        key={slot}
                        type="button"
                        disabled={blocked}
                        aria-pressed={on}
                        onClick={() => { setTimeSlot(slot); setHint(''); }}
                        className="cursor-pointer rounded-xl border px-2 py-3 text-center disabled:cursor-not-allowed disabled:opacity-45"
                        style={on ? { background: 'var(--amber)', color: 'var(--ink)', borderColor: 'var(--amber)' } : { background: 'var(--page-bg)', color: 'var(--line)', borderColor: 'var(--divider-strong)' }}
                      >
                        <span className={`font-mono-data block text-[0.95rem] font-bold ${blocked ? 'line-through' : ''}`}>{fmtMins(start)}</span>
                        <span className={`mt-0.5 block text-[0.72rem] ${on ? '' : 'text-[var(--line-dim)]'}`}>{blocked ? 'Booked' : `to ${fmtMins(start + duration * 60)}${on ? ' ✓' : ''}`}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {hint && <p role="alert" className={hintCls}>{hint}</p>}
      <button type="button" onClick={next} className="pub-cta pub-cta-primary mt-1">Continue →</button>
    </div>
  );
}

// ── Field wrapper ─────────────────────────────────────────────────────────────

function Field({ id, label, optional, error, hint, children }: { id: string; label: string; optional?: boolean; error?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-[0.9rem] font-bold">
        {label}{optional && <span className="font-medium text-[var(--line-dim)]"> (optional)</span>}
      </label>
      {children}
      {error ? <p id={`${id}-msg`} role="alert" className="mb-0 mt-1.5 text-[0.82rem] text-[var(--danger)]">{error}</p>
        : hint ? <p id={`${id}-msg`} className="mb-0 mt-1.5 text-[0.82rem] text-[var(--line-dim)]">{hint}</p> : null}
    </div>
  );
}

const inputStyle = (error: string) => (error ? { borderColor: 'var(--danger)' } : undefined);

// ── Main page ─────────────────────────────────────────────────────────────────

export default function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  const [court, setCourt] = useState<Court | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [step, setStep] = useState(1);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [date, setDate] = useState('');
  const [courtNum, setCourtNum] = useState<number | null>(null);
  const [duration, setDuration] = useState(1);
  const [timeSlot, setTimeSlot] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);
  const [closedDay, setClosedDay] = useState(false);
  const [checkingSched, setCheckingSched] = useState(false);
  const [hint, setHint] = useState('');
  const [joyNote, setJoyNote] = useState<JoyNote>(null);
  const [submitError, setSubmitError] = useState('');
  const [takenMessage, setTakenMessage] = useState('');

  const [form, setForm] = useState({ name: '', phone: '', email: '', playerCount: '2', notes: '' });
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [attempted, setAttempted] = useState(false);

  // Load court + schedule
  useEffect(() => {
    Promise.all([
      fetch(`/api/public/courts/${slug}`).then((r) => r.json()),
      fetch(`/api/public/courts/${slug}/schedule`).then((r) => r.json()),
    ]).then(([c, s]) => {
      if (c.error) { setNotFound(true); return; }
      setCourt(c);
      setSchedule(Array.isArray(s) ? s : []);
    }).catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [slug]);

  // Check if the selected date is closed
  useEffect(() => {
    if (!date || !slug) return;
    setCheckingSched(true); setClosedDay(false);
    fetch(`/api/public/courts/${slug}/availability?date=${date}&duration=1`)
      .then((r) => r.json())
      .then((data) => setClosedDay(data.isFullyClosed ?? false))
      .finally(() => setCheckingSched(false));
  }, [date, slug]);

  useEffect(() => { setTimeSlot(''); }, [duration]);

  // Step changes: scroll to top, clear stale hints
  useEffect(() => {
    window.scrollTo({ top: 0 });
    setHint('');
    setJoyNote((n) => (n?.state === 'taken' ? n : null));
  }, [step]);

  const go = useCallback((n: number) => {
    setDir(n > step ? 'fwd' : 'back');
    setStep(n);
  }, [step]);

  const errors = useMemo(() => ({
    name: validateName(form.name),
    phone: validatePhone(form.phone),
    email: validateEmail(form.email),
    notes: validateNotes(form.notes),
  }), [form]);
  const visibleError = (k: keyof typeof errors) => (touched[k] || attempted ? errors[k] : '');
  const firstVisibleError = (['name', 'phone', 'email', 'notes'] as const).map(visibleError).find(Boolean) ?? '';
  const emailSuggestion = touched.email ? suggestEmail(form.email) : null;

  const hourlyRate = court?.settings?.hourlyRate ?? court?.settings?.reservationFee ?? 210;
  const totalFee = hourlyRate * duration;
  const courtList = court ? Array.from({ length: court.courtCount }, (_, i) => i + 1) : [];
  const closedDow = useCallback((dow: number) => schedule.find((r) => r.dayOfWeek === dow)?.isClosed === true, [schedule]);

  const touch = (k: string) => setTouched((t) => ({ ...t, [k]: true }));

  const handleSubmit = async (paymentOption: 'downpayment' | 'full') => {
    if (submitting) return;
    setAttempted(true);
    setSubmitError('');
    const order = [['name', 'bk-name'], ['phone', 'bk-phone'], ['email', 'bk-email'], ['notes', 'bk-notes']] as const;
    const bad = order.find(([k]) => errors[k]);
    if (bad) { document.getElementById(bad[1])?.focus(); return; }
    if (!date || !courtNum || !timeSlot) return;
    if (!navigator.onLine) { setSubmitError('You are offline. Reconnect to submit a booking request.'); return; }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/courts/${slug}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courtNum, date, timeSlot, duration, paymentOption,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim(),
          playerCount: Number(form.playerCount),
          notes: form.notes.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = data.error || 'Booking failed. Please try again.';
        if (res.status === 409 || /already|taken|booked|unavailable/i.test(msg)) {
          // The slot was taken while the form was open: back to the Time step with fresh availability
          setTimeSlot('');
          setTakenMessage('Someone just booked that slot. Pick another time.');
          setJoyNote({ state: 'taken', message: 'Someone just booked that slot.' });
          go(4);
          return;
        }
        throw new Error(msg);
      }
      setSuccess(true);
      if (data.publicRef) router.push(`/book/${slug}/status/${data.publicRef}`);
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Booking failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setSuccess(false); setStep(1); setDate(''); setCourtNum(null);
    setDuration(1); setTimeSlot(''); setTouched({}); setAttempted(false); setTakenMessage('');
    setForm({ name: '', phone: '', email: '', playerCount: '2', notes: '' });
  };

  // ── Joy ──
  let joy: { state: JoyState; message: string } = { state: 'idle', message: JOY_HINTS[step - 1] };
  if (success) joy = { state: 'done', message: 'You are booked!' };
  else if (submitting) joy = { state: 'working', message: 'Holding your time for 10 minutes.' };
  else if (step === 5 && firstVisibleError) joy = { state: 'invalid', message: firstVisibleError };
  else if (joyNote) joy = joyNote;
  else if (step === 1 && date && !checkingSched && closedDay) joy = { state: 'closed', message: 'We are closed that day. Pick another date.' };

  // ── Summary values ──
  const summaryRows = [
    { label: 'Date', value: date ? fmtDateChip(date) : null },
    { label: 'Court', value: courtNum ? `Court ${courtNum}` : null },
    { label: 'Duration', value: step >= 3 ? `${duration} hour${duration > 1 ? 's' : ''}` : null },
    { label: 'Time', value: timeSlot && step >= 4 ? fmtSlotRange(timeSlot, duration) : null },
    { label: 'Rate / hr', value: peso(hourlyRate) },
  ];
  const summaryTotal = step >= 3 ? totalFee : null;

  // ── Loading ──
  if (loading) return (
    <>
      <BookingNav />
      <div className="flex min-h-[50vh] flex-1 items-center justify-center">
        <p className="text-sm text-[var(--line-faint)]">Loading…</p>
      </div>
    </>
  );

  // ── Not found ──
  if (notFound) return (
    <>
      <BookingNav />
      <div className="flex min-h-[50vh] flex-1 flex-col items-center justify-center gap-4">
        <p className="text-sm text-[var(--line-dim)]">Court not found.</p>
        <Link href="/usercourts" className="pub-cta pub-cta-ghost">← Find courts</Link>
      </div>
      <PublicFooter compact />
    </>
  );

  // ── Success (shown briefly before the status page opens) ──
  if (success) return (
    <>
      <BookingNav />
      <div className="flex flex-1 items-center justify-center p-4 sm:p-6">
        <div className="w-full max-w-sm text-center">
          <h2 className="font-display t-h3 mb-3 text-[var(--line)]">Booking Received</h2>
          <p className="mb-2 text-sm text-[var(--line-dim)]">at <span className="text-[var(--line)]">{court?.name}</span></p>
          <p className="mb-6 px-2 text-sm text-[var(--line-faint)] sm:mb-8">Complete payment to secure your reservation. The court owner can cancel it if needed.</p>
          <KeyValueSummary
            className="mb-6 text-left sm:mb-8"
            rows={([
              ['Court', `Court ${courtNum}`],
              ['Date', fmtDateShort(date)],
              ['Time', fmtSlotRange(timeSlot, duration)],
              ['Duration', `${duration}h`],
              ['Name', form.name],
              ['Phone', form.phone],
            ] as [string, string][])}
          />
          <button type="button" onClick={resetAll} className="cursor-pointer border-none bg-transparent text-sm text-[var(--amber)] transition-all hover:brightness-110">← Book another slot</button>
        </div>
      </div>
      <PublicFooter compact />
    </>
  );

  // ── Main ──
  const prevLabel = step > 1 ? STEP_LABELS[step - 2] : undefined;
  const stepAnim = dir === 'fwd' ? 'step-fwd' : 'step-back';

  return (
    <>
      <BookingNav backLabel={prevLabel} onBack={step > 1 ? () => go(step - 1) : undefined} />

      <div className="flex-1">
        <div className="mx-auto max-w-[1080px] px-[clamp(1.25rem,5vw,3rem)] pb-16" style={{ paddingBottom: 'max(4rem, env(safe-area-inset-bottom))' }}>
          <header className="pb-7 pt-8">
            <p className="t-eyebrow mb-2 text-[var(--success)]">
              {(court?.sports ?? []).join(' · ')}{court?.sports?.length ? ' · ' : ''}{court?.courtCount} court{court?.courtCount !== 1 ? 's' : ''}
            </p>
            <h1 className="font-display m-0 text-[clamp(1.9rem,4vw,3rem)] text-[var(--line)]">{court?.name}</h1>
            {court?.location?.city && <p className="mb-0 mt-1.5 text-[0.95rem] text-[var(--line-dim)]">{court.location.city}{court.location.province ? `, ${court.location.province}` : ''}</p>}
          </header>

          <BookingStepper labels={STEP_LABELS} step={step} onStepClick={go} />

          <div className="grid items-start gap-10 md:grid-cols-[1fr_300px] lg:grid-cols-[1fr_340px]">
            <div key={step} className={stepAnim}>
              {step >= 2 && (
                <div className="mb-5 md:hidden">
                  <SummaryLine parts={[date ? fmtDateChip(date) : null, courtNum ? `Court ${courtNum}` : null, step >= 3 ? `${duration}h` : null, timeSlot && step >= 4 ? fmtSlotRange(timeSlot, duration) : null]} total={summaryTotal} />
                </div>
              )}

              {/* Step 1: Date */}
              {step === 1 && (
                <div>
                  <h2 className={h2}>Pick a date</h2>
                  <p className={sub}>Choose a day to see open courts and times.</p>
                  <BookingCalendar value={date} onChange={(d) => { setDate(d); setHint(''); }} min={todayStr()} max={bookingMaxDateStr()} closedDow={closedDow} />
                  <p className="mb-0 mt-3 text-[0.82rem] text-[var(--line-dim)]">Bookings open up to 14 days ahead.</p>
                  {date && checkingSched && <InlineNotice className="mt-4"><p className="text-xs">Checking schedule…</p></InlineNotice>}
                  {date && !checkingSched && closedDay && (
                    <InlineNotice variant="error" className="mt-4">
                      <p className="text-sm font-medium">Venue closed on this date</p>
                      <p className="mt-1 text-xs opacity-80">Please choose a different date.</p>
                    </InlineNotice>
                  )}
                  {date && !checkingSched && !closedDay && <InlineNotice variant="success" className="mt-4"><p className="text-sm">{fmtDateLong(date)}</p></InlineNotice>}
                  {hint && <p role="alert" className={hintCls}>{hint}</p>}
                  <button
                    type="button"
                    className="pub-cta pub-cta-primary mt-5"
                    onClick={() => {
                      if (!date) { setHint('Pick a date to continue.'); return; }
                      if (checkingSched) return;
                      if (closedDay) { setHint('The venue is closed on that date. Pick another day.'); return; }
                      go(2);
                    }}
                  >
                    Continue →
                  </button>
                </div>
              )}

              {/* Step 2: Court */}
              {step === 2 && (
                <div>
                  <h2 className={h2}>Choose a court</h2>
                  <p className={sub}>{fmtDateChip(date)} · {court?.courtCount} court{court?.courtCount !== 1 ? 's' : ''} · {peso(hourlyRate)} / hr each</p>
                  <div className="mb-5 grid grid-cols-2 gap-3.5">
                    {courtList.map((c) => {
                      const on = courtNum === c;
                      return (
                        <button
                          key={c}
                          type="button"
                          aria-pressed={on}
                          onClick={() => { setCourtNum(c); setTimeSlot(''); setHint(''); }}
                          className="flex min-h-[84px] cursor-pointer items-center justify-between rounded-[18px] border px-6 py-5 text-left"
                          style={on ? { background: 'var(--amber)', color: 'var(--ink)', borderColor: 'var(--amber)' } : { background: 'var(--surface)', color: 'var(--line)', borderColor: 'var(--divider-strong)' }}
                        >
                          <span className="font-display text-[2rem] sm:text-[2.2rem]">Court {c}</span>
                          {on && <b className="text-[0.85rem]">Selected ✓</b>}
                        </button>
                      );
                    })}
                  </div>
                  {hint && <p role="alert" className={hintCls}>{hint}</p>}
                  <button type="button" className="pub-cta pub-cta-primary" onClick={() => (courtNum ? go(3) : setHint('Pick a court to continue.'))}>Continue →</button>
                </div>
              )}

              {/* Step 3: Duration */}
              {step === 3 && courtNum && (
                <DurationStep
                  duration={duration} setDuration={setDuration}
                  date={date} courtNum={courtNum} slug={slug} schedule={schedule} rate={hourlyRate}
                  onJoy={setJoyNote} onNext={() => go(4)}
                />
              )}

              {/* Step 4: Time */}
              {step === 4 && courtNum && (
                <TimeStep
                  date={date} courtNum={courtNum} duration={duration} slug={slug} schedule={schedule}
                  timeSlot={timeSlot} setTimeSlot={(s) => { setTimeSlot(s); setTakenMessage(''); setJoyNote(null); }}
                  takenMessage={takenMessage} onNext={() => go(5)}
                />
              )}

              {/* Step 5: Details */}
              {step === 5 && (
                <div>
                  <h2 className={h2}>Your details</h2>
                  <p className={sub}>Court {courtNum} · {fmtDateChip(date)} · {fmtSlotRange(timeSlot, duration)}</p>

                  <div className="mb-6 grid gap-5">
                    <div className="grid gap-5 sm:grid-cols-2">
                      <Field id="bk-name" label="Full name" error={visibleError('name')}>
                        <input
                          id="bk-name" className="public-input" placeholder="Juan dela Cruz" autoComplete="name" maxLength={80}
                          value={form.name} aria-invalid={!!visibleError('name')} aria-describedby={visibleError('name') ? 'bk-name-msg' : undefined} style={inputStyle(visibleError('name'))}
                          onChange={(e) => setForm({ ...form, name: e.target.value })} onBlur={() => touch('name')}
                        />
                      </Field>
                      <Field id="bk-phone" label="Mobile number" error={visibleError('phone')}>
                        <input
                          id="bk-phone" className="public-input" placeholder="0917 123 4567" type="tel" inputMode="tel" autoComplete="tel"
                          value={form.phone} aria-invalid={!!visibleError('phone')} aria-describedby={visibleError('phone') ? 'bk-phone-msg' : undefined} style={inputStyle(visibleError('phone'))}
                          onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={() => touch('phone')}
                        />
                      </Field>
                    </div>

                    <Field
                      id="bk-email" label="Email" optional error={visibleError('email')}
                      hint={emailSuggestion && !visibleError('email') ? (
                        <>Did you mean <b className="text-[var(--amber)]">{emailSuggestion}</b>?{' '}
                          <button type="button" className="cursor-pointer border-none bg-transparent p-0 font-bold text-[var(--amber)]" onClick={() => setForm({ ...form, email: emailSuggestion })}>Use this</button></>
                      ) : undefined}
                    >
                      <input
                        id="bk-email" className="public-input" placeholder="juan@email.com" type="email" autoComplete="email"
                        value={form.email} aria-invalid={!!visibleError('email')} aria-describedby={visibleError('email') || emailSuggestion ? 'bk-email-msg' : undefined} style={inputStyle(visibleError('email'))}
                        onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => touch('email')}
                      />
                    </Field>

                    <div>
                      <span id="bk-players-label" className="mb-1.5 block text-[0.9rem] font-bold">Players</span>
                      <div className="flex items-center gap-3.5" role="group" aria-labelledby="bk-players-label">
                        <button type="button" aria-label="Fewer players" onClick={() => setForm({ ...form, playerCount: String(Math.max(1, Number(form.playerCount) - 1)) })} className="h-[50px] w-[50px] cursor-pointer rounded-xl border border-[var(--divider-strong)] bg-transparent text-[1.4rem] text-[var(--line)]">−</button>
                        <span className="w-9 text-center text-[1.4rem] font-extrabold" aria-live="polite">{form.playerCount}</span>
                        <button type="button" aria-label="More players" onClick={() => setForm({ ...form, playerCount: String(Math.min(MAX_PLAYERS, Number(form.playerCount) + 1)) })} className="h-[50px] w-[50px] cursor-pointer rounded-xl border border-[var(--divider-strong)] bg-transparent text-[1.4rem] text-[var(--line)]">+</button>
                        <span className="text-[0.82rem] text-[var(--line-dim)]">Up to {MAX_PLAYERS} players per court</span>
                      </div>
                    </div>

                    <Field id="bk-notes" label="Notes" optional error={visibleError('notes')}>
                      <textarea
                        id="bk-notes" rows={3} className="public-input resize-none" placeholder="Anything the court should know?"
                        value={form.notes} aria-invalid={!!visibleError('notes')} aria-describedby={visibleError('notes') ? 'bk-notes-msg' : undefined} style={inputStyle(visibleError('notes'))}
                        onChange={(e) => setForm({ ...form, notes: e.target.value })} onBlur={() => touch('notes')}
                      />
                      <p className="mb-0 mt-1 text-right text-[0.78rem] text-[var(--line-dim)]">{form.notes.length} / 200</p>
                    </Field>
                  </div>

                  <div className="mb-7 md:hidden">
                    <BookingSummary rows={summaryRows} total={summaryTotal} venue={court?.name} />
                  </div>

                  {submitError && <InlineNotice variant="error" className="mb-4"><p className="text-sm">{submitError}</p></InlineNotice>}

                  <div className="flex max-w-[460px] flex-col gap-3">
                    <button type="button" aria-busy={submitting} className="pub-cta pub-cta-primary w-full justify-center" onClick={() => handleSubmit('downpayment')}>
                      {submitting ? 'Submitting…' : `Pay 50% now (₱${(totalFee * 0.5).toFixed(2)}) + fee`}
                    </button>
                    <button type="button" aria-busy={submitting} className="pub-cta pub-cta-ghost w-full justify-center" onClick={() => handleSubmit('full')}>
                      {submitting ? 'Submitting…' : `Pay full amount (₱${totalFee.toFixed(2)}) + fee`}
                    </button>
                  </div>
                  <p className="mb-0 mt-4 text-[0.8rem] text-[var(--line-dim)]">Payment opens next. Your time is held for 10 minutes.</p>
                </div>
              )}
            </div>

            {/* Summary (plain text) with Joy under it. Desktop and tablet only. */}
            <aside className="hidden md:sticky md:top-24 md:block" aria-label="Booking summary">
              <BookingSummary rows={summaryRows} total={summaryTotal} venue={step === 5 ? court?.name : undefined} />
              <JoyCompanion state={joy.state} message={joy.message} />
            </aside>
          </div>
        </div>
      </div>

      <PublicFooter compact />
    </>
  );
}
