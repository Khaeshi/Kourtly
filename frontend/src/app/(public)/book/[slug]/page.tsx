'use client';
import { useState, useEffect, useCallback, use } from 'react';
import { addDays, format, getDay, parseISO } from 'date-fns';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import PublicNav from '@/app/components/public/PublicNav';
import PublicFooter from '@/app/components/public/PublicFooter';
import {
  InlineNotice,
  KeyValueSummary,
  PublicBadge,
  PublicButton,
  PublicField,
  PublicInput,
  PublicSelect,
  PublicStepper,
  PublicTextarea,
} from '@/app/components/public/ui';

// ── Helpers ───────────────────────────────────────────────────────────────────

const ALL_SLOTS = [
  '09:00-10:00','10:00-11:00','11:00-12:00','12:00-13:00',
  '13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00',
  '17:00-18:00','18:00-19:00','19:00-20:00','20:00-21:00',
  '21:00-22:00','22:00-23:00',
];

function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }
function bookingMaxDateStr() { return format(addDays(new Date(), 13), 'yyyy-MM-dd'); }
function toMinutes(t: string) { const [h,m] = t.split(':').map(Number); return h*60+m; }
function fmtMins(m: number) {
  const h = Math.floor(m/60), min = m%60, ampm = h>=12?'PM':'AM';
  return `${h>12?h-12:h===0?12:h}:${String(min).padStart(2,'0')} ${ampm}`;
}
function fmtSlotRange(slot: string, dur: number) {
  const s = toMinutes(slot.split('-')[0]);
  return `${fmtMins(s)} – ${fmtMins(s + dur*60)}`;
}
function fmtDateLong(d: string)  { return format(parseISO(d), 'EEEE, MMMM d, yyyy'); }
function fmtDateShort(d: string) { return format(parseISO(d), 'MMM d, yyyy'); }

function validSlotsForDuration(dur: number, date?: string) {
  const isToday = date === todayStr();
  const nowMins = isToday ? new Date().getHours()*60 + new Date().getMinutes() : 0;
  return ALL_SLOTS.filter(slot => {
    const s = toMinutes(slot.split('-')[0]);
    if (s + dur*60 > 23*60) return false;
    if (isToday && s+60 <= nowMins) return false;
    return true;
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface Court {
  _id: string; name: string; slug: string;
  sports: string[]; courtCount: number;
  description: string; logoUrl: string; amenities: string[];
  location: { city: string; province: string; };
  contact:  { phone: string; email: string; facebook: string; };
  settings: { reservationFee?: number; hourlyRate?: number; };
}

interface ScheduleRule {
  dayOfWeek: number; dayName: string;
  isClosed: boolean; openTime: string; closeTime: string;
}

interface CourtAvailability {
  court: number;
  isFullyClosed: boolean;
  availableSlots: string[];
  blockedSlots: string[];
}

// ── Duration Step ─────────────────────────────────────────────────────────────

function DurationStep({ duration, setDuration, date, courtNum, slug, schedule, onBack, onNext }: {
  duration: number; setDuration: (d: number) => void;
  date: string; courtNum: number; slug: string;
  schedule: ScheduleRule[];
  onBack: () => void; onNext: () => void;
}) {
  const [availMap, setAvailMap] = useState<Record<number, string[]>>({});
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    Promise.all([1,2,3,4].map(async d => {
      const res = await fetch(`/api/public/courts/${slug}/availability?date=${date}&duration=${d}`);
      const data = await res.json();
      const c = (data.courts ?? []).find((x: CourtAvailability) => x.court === courtNum);
      return { d, available: c?.availableSlots ?? [] };
    }))
    .then(results => setAvailMap(Object.fromEntries(results.map(r => [r.d, r.available]))))
    .finally(() => setLoading(false));
  }, [date, courtNum, slug]);

  const selectedAvail = (availMap[duration] ?? []).filter(s => validSlotsForSchedule(duration, date, schedule).includes(s));
  const hasSlots = selectedAvail.length > 0;

  return (
    <div className="booking-anim">
      <p className="section-head eyebrow mb-1">Select Duration</p>
      <p className="text-[var(--line-faint)] text-xs mb-6 font-mono-data">{fmtDateShort(date)} · Court {courtNum}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[1,2,3,4].map(h => {
          const avail   = availMap[h] ?? [];
          const validAvail = avail.filter(s => validSlotsForSchedule(h, date, schedule).includes(s));
          const noSlots = !loading && validAvail.length === 0;
          return (
            <button key={h} disabled={noSlots}
              className={`duration-btn ${duration===h ? 'selected' : ''} ${noSlots ? 'unavailable' : ''}`}
              onClick={() => setDuration(h)}>
              <span className="font-display text-2xl block mb-1">{h}</span>
              <span className="font-mono-data text-[0.65rem] tracking-widest uppercase opacity-60 block mb-2">{h===1?'hour':'hours'}</span>
              {loading ? <span className="block w-12 h-3 mx-auto rounded bg-[var(--public-surface-strong)] animate-pulse"/> :
               noSlots ? <span className="font-mono-data text-[0.6rem] tracking-widest uppercase text-red-400/60">No slots</span> :
               <span className={`font-mono-data text-[0.6rem] tracking-widest uppercase ${duration===h?'text-[var(--amber)]/75':'text-[var(--line-faint)]'}`}>{validAvail.length} slot{validAvail.length!==1?'s':''}</span>}
            </button>
          );
        })}
      </div>
      {!loading && hasSlots && (
        <div className="mb-6 public-card p-4">
          <p className="font-mono-data text-[0.6rem] tracking-widest uppercase text-[var(--line-faint)] mb-3">Available times for {duration}h</p>
          <div className="flex flex-wrap gap-2">
            {selectedAvail.map(slot => (
              <PublicBadge key={slot} className="text-[var(--amber)] border-[rgba(232,163,61,0.35)] bg-[rgba(232,163,61,0.1)]">
                {fmtSlotRange(slot, duration)}
              </PublicBadge>
            ))}
          </div>
        </div>
      )}
      {!loading && !hasSlots && (
        <InlineNotice variant="error" className="mb-6">
          <p className="text-sm font-medium mb-1">No available slots for {duration}h</p>
          <p className="text-xs opacity-80">Try a shorter duration or different date.</p>
        </InlineNotice>
      )}
      <div className="flex gap-3">
        <PublicButton variant="ghost" onClick={onBack}>← Back</PublicButton>
        <PublicButton variant="secondary" disabled={!hasSlots && !loading} onClick={onNext}>Continue →</PublicButton>
      </div>
    </div>
  );
}

// ── Time Step ─────────────────────────────────────────────────────────────────

function TimeStep({ date, courtNum, duration, slug, schedule, timeSlot, setTimeSlot, onBack, onNext }: {
  date: string; courtNum: number; duration: number; slug: string;
  schedule: ScheduleRule[];
  timeSlot: string; setTimeSlot: (s: string) => void;
  onBack: () => void; onNext: () => void;
}) {
  const [availability, setAvailability] = useState<CourtAvailability | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res  = await fetch(`/api/public/courts/${slug}/availability?date=${date}&duration=${duration}`);
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

  return (
    <div className="booking-anim">
      <p className="section-head eyebrow mb-1">Select Start Time</p>
      <p className="text-[var(--line-faint)] text-xs mb-2 font-mono-data">{fmtDateShort(date)} · Court {courtNum} · {duration}h session</p>
      <div className="mb-5 flex items-center gap-2">
        <span className="font-mono-data text-[0.6rem] tracking-widest uppercase text-[var(--line-faint)]">Your session is</span>
        <PublicBadge className="text-[var(--amber)] border-[rgba(232,163,61,0.35)] bg-[rgba(232,163,61,0.1)]">{duration} hour{duration>1?'s':''}</PublicBadge>
      </div>
      {loading ? (
        <div className="space-y-2 mb-6">{[...Array(6)].map((_,i) => <div key={i} className="h-14 rounded-[var(--r-block)] bg-[var(--public-surface)] animate-pulse"/>)}</div>
      ) : error ? (
        <InlineNotice variant="error" className="mb-6">
          <p className="text-sm">{error}</p>
          <button onClick={load} className="font-mono-data text-[0.7rem] opacity-80 hover:opacity-100 mt-2 transition-opacity">Try again →</button>
        </InlineNotice>
      ) : (
        <div className="space-y-2 mb-6">
          {slots.map(slot => {
            const blocked  = !availableSlots.has(slot) || blockedSlots.includes(slot);
            const sel      = timeSlot === slot;
            return (
              <button key={slot} disabled={blocked}
                className={`time-range-btn ${sel?'selected':''} ${blocked?'blocked':''}`}
                onClick={() => setTimeSlot(slot)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${sel?'text-[var(--amber)]':blocked?'text-[var(--line-faint)]':'text-[var(--line-dim)]'}`}>
                      {fmtSlotRange(slot, duration)}
                    </span>
                    <span className={`font-mono-data text-[0.6rem] tracking-widest uppercase ${sel?'text-[var(--amber)]/60':blocked?'text-[var(--line-faint)]':'text-[var(--line-faint)]'}`}>{duration}h</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {blocked && <PublicBadge className="opacity-60">Booked</PublicBadge>}
                    {sel && <PublicBadge className="text-[var(--amber)] border-[rgba(232,163,61,0.35)] bg-[rgba(232,163,61,0.12)]">Selected ✓</PublicBadge>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-3 mb-3">
        <PublicButton variant="ghost" onClick={onBack}>← Back</PublicButton>
        <PublicButton variant="secondary" className="flex-1 sm:flex-none" disabled={!timeSlot} onClick={onNext}>Continue →</PublicButton>
      </div>
      <p className="font-mono-data text-[0.65rem] text-[var(--line-faint)]">Greyed slots are unavailable for your chosen duration.</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);
  const router = useRouter();

  const [court,    setCourt]    = useState<Court | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRule[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [notFound, setNotFound] = useState(false);

  const [step,       setStep]       = useState(1);
  const [date,       setDate]       = useState('');
  const [courtNum,   setCourtNum]   = useState<number | null>(null);
  const [duration,   setDuration]   = useState(1);
  const [timeSlot,   setTimeSlot]   = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState(false);
  const [closedDay,  setClosedDay]  = useState(false);
  const [checkingSched, setCheckingSched] = useState(false);

  const [form, setForm] = useState({ name:'', phone:'', email:'', playerCount:'2', notes:'' });

  // Load court + schedule
  useEffect(() => {
    Promise.all([
      fetch(`/api/public/courts/${slug}`).then(r => r.json()),
      fetch(`/api/public/courts/${slug}/schedule`).then(r => r.json()),
    ]).then(([c, s]) => {
      if (c.error) { setNotFound(true); return; }
      setCourt(c);
      setSchedule(Array.isArray(s) ? s : []);
    }).catch(() => setNotFound(true))
    .finally(() => setLoading(false));
  }, [slug]);

  // Check if date is closed
  useEffect(() => {
    if (!date || !slug) return;
    setCheckingSched(true); setClosedDay(false);
    fetch(`/api/public/courts/${slug}/availability?date=${date}&duration=1`)
      .then(r => r.json())
      .then(data => setClosedDay(data.isFullyClosed ?? false))
      .finally(() => setCheckingSched(false));
  }, [date, slug]);

  useEffect(() => { setTimeSlot(''); }, [duration]);

  const courtList = court ? Array.from({ length: court.courtCount }, (_, i) => i+1) : [];
  const hourlyRate = court?.settings?.hourlyRate ?? court?.settings?.reservationFee ?? 210;
  const totalFee = hourlyRate * duration;

  const handleSubmit = async (paymentOption: 'downpayment' | 'full') => {
    if (!date || !courtNum || !timeSlot || !form.name || !form.phone) return;
    if (!navigator.onLine) {
      alert('You are offline. Reconnect to submit a booking request.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/public/courts/${slug}/reserve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          courtNum, date, timeSlot, duration,
          paymentOption,
          name:        form.name,
          phone:       form.phone,
          email:       form.email,
          playerCount: Number(form.playerCount),
          notes:       form.notes,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');
      setSuccess(true);
      if (data.publicRef) {
        router.push(`/book/${slug}/status/${data.publicRef}`);
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Booking failed. Please try again.';
      alert(message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setSuccess(false); setStep(1); setDate(''); setCourtNum(null);
    setDuration(1); setTimeSlot('');
    setForm({ name:'', phone:'', email:'', playerCount:'2', notes:'' });
  };

  // ── Loading ──
  if (loading) return (
    <>
      <PublicNav />
      <div className="flex-1 flex items-center justify-center booking-grid-bg min-h-[50vh]">
        <p className="font-mono-data text-[var(--line-faint)] text-sm">Loading...</p>
      </div>
    </>
  );

  // ── Not found ──
  if (notFound) return (
    <>
      <PublicNav />
      <div className="flex-1 flex flex-col items-center justify-center gap-4 booking-grid-bg min-h-[50vh]">
        <p className="font-mono-data text-[var(--line-dim)] text-sm">Court not found.</p>
        <Link href="/usercourts" className="pub-cta pub-cta-ghost">← Find courts</Link>
      </div>
      <PublicFooter compact />
    </>
  );

  // ── Success ──
  if (success) return (
    <>
      <PublicNav />
      <div className="flex-1 flex items-center justify-center p-4 sm:p-6 booking-grid-bg">
        <div className="text-center w-full max-w-sm">
          <div className="booking-fade-up w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[rgba(232,163,61,0.12)] border border-[rgba(232,163,61,0.35)] flex items-center justify-center mx-auto mb-6 sm:mb-8">
            <span className="text-[var(--amber)] text-2xl sm:text-3xl">✓</span>
          </div>
          <h2 className="booking-fade-up-2 font-display text-3xl sm:text-4xl text-[var(--line)] mb-3">Booking Received</h2>
          <p className="booking-fade-up-2 text-[var(--line-dim)] text-sm mb-2">at <span className="text-[var(--line)]">{court?.name}</span></p>
          <p className="booking-fade-up-2 text-[var(--line-faint)] text-sm mb-6 sm:mb-8 px-2">
            Complete payment to secure your reservation. The court owner can cancel it if needed.
          </p>
          <KeyValueSummary
            className="booking-fade-up-3 mb-6 sm:mb-8 text-left"
            rows={([
              ['Court',    `Court ${courtNum}`],
              ['Date',     fmtDateShort(date)],
              ['Time',     fmtSlotRange(timeSlot, duration)],
              ['Duration', `${duration}h`],
              ['Name',     form.name],
              ['Phone',    form.phone],
            ] as [string,string][])}
          />
          <button onClick={resetAll} className="booking-fade-up-3 text-[var(--amber)] hover:brightness-110 text-sm transition-all">
            ← Book another slot
          </button>
        </div>
      </div>
      <PublicFooter compact />
    </>
  );

  // ── Main ──
  return (
    <>
      <PublicNav />

      <div className="booking-grid-bg flex-1">
        <div className="max-w-2xl mx-auto px-[clamp(1.25rem,5vw,3rem)] py-10 sm:py-16 booking-safe-bottom">

          {/* Header */}
          <div className="mb-10 sm:mb-16 booking-anim">
            <Link href="/usercourts" className="inline-flex items-center gap-1.5 text-[0.82rem] text-[var(--line-faint)] no-underline hover:text-[var(--amber)] transition-colors mb-6">
              ← All courts
            </Link>
            <div className="inline-flex items-center gap-2.5 mb-5 public-chip">
              {court?.logoUrl ? (
                <img src={court.logoUrl} alt={court.name} className="w-6 h-6 rounded object-cover" />
              ) : (
                <div className="w-6 h-6 rounded bg-[rgba(232,163,61,0.14)] flex items-center justify-center">
                  <div className="w-2.5 h-2.5 bg-[var(--amber)] rounded-sm" />
                </div>
              )}
              <span className="text-sm sm:text-base text-[var(--amber)] font-semibold tracking-wide">
                {court?.name ?? 'Court'}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-6 sm:mb-8 flex-wrap">
              <span className="section-head eyebrow mb-0">Court Booking</span>
              {court?.sports?.map(s => (
                <PublicBadge key={s} className="capitalize">{s}</PublicBadge>
              ))}
            </div>
            <h1 className="font-display text-[clamp(2rem,5vw,3.2rem)] text-[var(--line)] leading-tight mb-3">
              Reserve at <span className="text-[var(--amber)]">{court?.name ?? 'Court'}</span>
            </h1>
            <p className="text-[var(--line-dim)] text-sm">
              {court?.location?.city && `${court.location.city} · `}
              {court?.courtCount} court{court?.courtCount !== 1 ? 's' : ''} available
            </p>
          </div>

          <PublicStepper labels={['Date', 'Court', 'Duration', 'Time', 'Details']} step={step} />

          {/* Step 1 — Date */}
          {step === 1 && (
            <div className="booking-anim">
              <p className="section-head eyebrow mb-4">Select Date</p>
              <PublicInput type="date" min={todayStr()} max={bookingMaxDateStr()} className="mb-4" value={date}
                onChange={e => {
                  const selectedDate = e.target.value;
                  if (selectedDate >= todayStr() && selectedDate <= bookingMaxDateStr()) setDate(selectedDate);
                }}/>
              {date && checkingSched && (
                <InlineNotice className="mb-4">
                  <p className="text-xs">Checking schedule...</p>
                </InlineNotice>
              )}
              {date && !checkingSched && closedDay && (
                <InlineNotice variant="error" className="mb-4">
                  <p className="text-sm font-medium">Venue closed on this date</p>
                  <p className="text-xs mt-1 opacity-80">Please choose a different date.</p>
                </InlineNotice>
              )}
              {date && !checkingSched && !closedDay && (
                <InlineNotice variant="success" className="mb-6">
                  <p className="text-sm">{fmtDateLong(date)}</p>
                </InlineNotice>
              )}
              <PublicButton variant="secondary" className="w-full sm:w-auto" disabled={!date || checkingSched || closedDay}
                onClick={() => setStep(2)}>Continue →</PublicButton>
            </div>
          )}

          {/* Step 2 — Court */}
          {step === 2 && (
            <div className="booking-anim">
              <p className="section-head eyebrow mb-1">Select Court</p>
              <p className="text-[var(--line-faint)] text-xs mb-5 font-mono-data">{fmtDateLong(date)}</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {courtList.map(c => (
                  <button key={c} className={`court-btn ${courtNum===c?'selected':''}`}
                    onClick={() => { setCourtNum(c); setTimeSlot(''); }}>
                    <div className="font-mono-data text-[0.55rem] tracking-widest uppercase text-[var(--line-faint)] mb-1">Court</div>
                    <div className="font-display text-3xl sm:text-4xl text-[var(--line)] mb-2">{c}</div>
                    {courtNum===c && <div className="font-mono-data text-[0.55rem] text-[var(--amber)] tracking-widest uppercase">Selected ✓</div>}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <PublicButton variant="ghost" onClick={() => setStep(1)}>← Back</PublicButton>
                <PublicButton variant="secondary" className="flex-1 sm:flex-none" disabled={!courtNum} onClick={() => setStep(3)}>Continue →</PublicButton>
              </div>
            </div>
          )}

          {/* Step 3 — Duration */}
          {step === 3 && courtNum && (
            <DurationStep
              duration={duration} setDuration={setDuration}
              date={date} courtNum={courtNum} slug={slug} schedule={schedule}
              onBack={() => setStep(2)} onNext={() => setStep(4)}
            />
          )}

          {/* Step 4 — Time */}
          {step === 4 && courtNum && (
            <TimeStep
              date={date} courtNum={courtNum} duration={duration} slug={slug} schedule={schedule}
              timeSlot={timeSlot} setTimeSlot={setTimeSlot}
              onBack={() => setStep(3)} onNext={() => setStep(5)}
            />
          )}

          {/* Step 5 — Details */}
          {step === 5 && (
            <div className="booking-anim">
              <p className="section-head eyebrow mb-1">Your Details</p>
              <p className="text-[var(--line-faint)] text-xs mb-6 font-mono-data">Court {courtNum} · {fmtDateShort(date)} · {fmtSlotRange(timeSlot, duration)}</p>
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <PublicField label="Full Name *">
                    <PublicInput placeholder="Juan dela Cruz" value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}/>
                  </PublicField>
                  <PublicField label="Phone *">
                    <PublicInput placeholder="09XX XXX XXXX" type="tel" value={form.phone}
                      onChange={e => setForm({...form, phone: e.target.value})}/>
                  </PublicField>
                </div>
                <PublicField label="Email (optional)">
                  <PublicInput type="email" placeholder="juan@email.com" value={form.email}
                    onChange={e => setForm({...form, email: e.target.value})}/>
                </PublicField>
                <PublicField label="Players">
                  <PublicSelect value={form.playerCount}
                    onChange={e => setForm({...form, playerCount: e.target.value})}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} player{n>1?'s':''}</option>)}
                  </PublicSelect>
                </PublicField>
                <PublicField label="Notes (optional)">
                  <PublicTextarea rows={3} placeholder="Any special requests..."
                    value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}/>
                </PublicField>
              </div>

              <KeyValueSummary
                className="mb-6"
                title="Booking Summary"
                rows={[
                  ['Venue', court?.name ?? ''],
                  ['Court', `Court ${courtNum}`],
                  ['Date', fmtDateShort(date)],
                  ['Time', fmtSlotRange(timeSlot, duration)],
                  ['Duration', `${duration}h`],
                  ['Rate/hr', `₱${hourlyRate}`],
                  ['Total', `₱${totalFee}`],
                ]}
              />

              <div className="flex flex-col gap-3">
                <PublicButton variant="ghost" className="order-2 sm:order-1" onClick={() => setStep(4)}>← Back</PublicButton>
                <PublicButton variant="primary" className="order-1 sm:order-2 w-full"
                  disabled={!form.name || !form.phone || submitting} onClick={() => handleSubmit('downpayment')}>
                  {submitting ? 'Submitting...' : `Pay 50% Now (₱${(totalFee * 0.5).toFixed(2)}) + Fee`}
                </PublicButton>
                <PublicButton variant="primary" className="order-1 sm:order-2 w-full"
                  disabled={!form.name || !form.phone || submitting} onClick={() => handleSubmit('full')}>
                  {submitting ? 'Submitting...' : `Pay Full Amount (₱${totalFee.toFixed(2)}) + Fee`}
                </PublicButton>
              </div>
              <p className="font-mono-data text-[0.65rem] text-[var(--line-faint)] mt-4">Payment opens next. Your time is held for 10 minutes.</p>
            </div>
          )}
        </div>
      </div>

      <PublicFooter compact />
    </>
  );
}

function validSlotsForSchedule(dur: number, date: string, rules: ScheduleRule[]) {
  const rule = rules.find(r => r.dayOfWeek === getDay(parseISO(date)));
  if (!rule || rule.isClosed) return [];
  const openMins = toMinutes(rule.openTime);
  const closeMins = toMinutes(rule.closeTime);
  return validSlotsForDuration(dur, date).filter(slot => {
    const start = toMinutes(slot.split('-')[0]);
    return start >= openMins && start + dur * 60 <= closeMins;
  });
}