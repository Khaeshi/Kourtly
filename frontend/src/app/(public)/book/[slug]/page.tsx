'use client';
import { useState, useEffect, useCallback, use } from 'react';
import { format, parseISO } from 'date-fns';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import {
  InlineNotice,
  KeyValueSummary,
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

// ── CSS ───────────────────────────────────────────────────────────────────────

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&display=swap');
  .booking-display { font-family: 'DM Serif Display', serif; }
  .grid-bg {
    background-image:
      radial-gradient(ellipse 65% 45% at 50% -10%, rgba(59,130,246,0.2) 0%, transparent 65%),
      radial-gradient(ellipse 50% 40% at 82% 22%, rgba(16,185,129,0.1) 0%, transparent 70%),
      linear-gradient(rgba(59,130,246,0.05) 1px, transparent 1px),
      linear-gradient(90deg, rgba(59,130,246,0.05) 1px, transparent 1px);
    background-size: auto, auto, 48px 48px, 48px 48px;
  }
  @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
  .anim { animation: fadeIn 0.4s ease forwards; }

  .duration-btn {
    background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.07);
    color: rgba(255,255,255,0.5); border-radius: 12px; padding: 20px 12px;
    cursor: pointer; transition: all 0.15s ease; font-family: 'DM Mono', monospace; text-align: center;
  }
  .duration-btn:hover { background: rgba(59,130,246,0.1); border-color: rgba(59,130,246,0.28); color: #60a5fa; }
  .duration-btn.selected { background: rgba(59,130,246,0.14); border-color: rgba(59,130,246,0.42); color: #60a5fa; }
  .duration-btn.unavailable { opacity: 0.3; cursor: not-allowed; }

  .time-range-btn {
    background: rgba(255,255,255,0.02); border: 1px solid rgba(255,255,255,0.06);
    border-radius: 10px; padding: 14px 16px; cursor: pointer;
    transition: all 0.15s ease; font-family: 'DM Mono', monospace; text-align: left; width: 100%;
  }
  .time-range-btn:hover:not(:disabled):not(.selected) { background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.22); }
  .time-range-btn.selected { background: rgba(59,130,246,0.12); border-color: rgba(59,130,246,0.36); }
  .time-range-btn.blocked { opacity: 0.35; cursor: not-allowed; }

  .court-btn {
    background: linear-gradient(160deg, rgba(59,130,246,0.08) 0%, rgba(255,255,255,0.03) 55%, rgba(255,255,255,0.02) 100%);
    border: 1px solid rgba(59,130,246,0.22);
    transition: all 0.2s ease; border-radius: 12px; padding: 16px;
    text-align: left; cursor: pointer; width: 100%;
  }
  .court-btn:hover { background: rgba(59,130,246,0.08); border-color: rgba(59,130,246,0.22); }
  .court-btn.selected { background: rgba(59,130,246,0.12); border-color: rgba(59,130,246,0.36); }

  .field {
    width: 100%; background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
    border-radius: 10px; padding: 12px 14px; color: rgba(255,255,255,0.8);
    font-size: 0.875rem; font-family: 'DM Mono', monospace; outline: none;
    transition: border-color 0.15s ease; -webkit-appearance: none; appearance: none;
  }
  .field::placeholder { color: rgba(255,255,255,0.2); }
  .field:focus { border-color: rgba(59,130,246,0.4); }
  .field option { background: #111; }

  .proceed-btn {
    background: rgba(59,130,246,0.14); border: 1px solid rgba(59,130,246,0.34);
    color: #60a5fa; font-family: 'DM Mono', monospace; font-size: 0.8rem;
    padding: 12px 24px; border-radius: 10px; cursor: pointer;
    transition: all 0.2s ease; letter-spacing: 0.05em; white-space: nowrap;
  }
  .proceed-btn:hover:not(:disabled) { background: rgba(59,130,246,0.24); border-color: rgba(59,130,246,0.52); }
  .proceed-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .proceed-btn.ghost { background: transparent; color: rgba(255,255,255,0.3); border-color: transparent; }
  .proceed-btn.submit { background: #60a5fa; border-color: #60a5fa; color: #0a0f05; font-weight: 600; }
  .proceed-btn.submit:hover:not(:disabled) { background: #93c5fd; }

  input[type="date"].field { color-scheme: dark; }
  .safe-bottom { padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); }

  @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
  .fade-up   { animation: fadeUp 0.6s ease forwards; }
  .fade-up-2 { animation: fadeUp 0.6s 0.15s ease both; }
  .fade-up-3 { animation: fadeUp 0.6s 0.3s ease both; }
`;

// ── Duration Step ─────────────────────────────────────────────────────────────

function DurationStep({ duration, setDuration, date, courtNum, slug, onBack, onNext }: {
  duration: number; setDuration: (d: number) => void;
  date: string; courtNum: number; slug: string;
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

  const selectedAvail = (availMap[duration] ?? []).filter(s => validSlotsForDuration(duration, date).includes(s));
  const hasSlots = selectedAvail.length > 0;

  return (
    <div className="anim">
      <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-1">Select Duration</p>
      <p className="text-white/20 text-xs mb-6">{fmtDateShort(date)} · Court {courtNum}</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[1,2,3,4].map(h => {
          const avail   = availMap[h] ?? [];
          const noSlots = !loading && avail.length === 0;
          return (
            <button key={h} disabled={noSlots}
              className={`duration-btn ${duration===h ? 'selected' : ''} ${noSlots ? 'unavailable' : ''}`}
              onClick={() => setDuration(h)}>
              <span className="text-2xl font-bold block mb-1" style={{ fontFamily:"'DM Serif Display',serif" }}>{h}</span>
              <span className="text-[0.65rem] tracking-widest uppercase opacity-60 block mb-2">{h===1?'hour':'hours'}</span>
              {loading ? <span className="block w-12 h-3 mx-auto rounded bg-white/10 animate-pulse"/> :
               noSlots ? <span className="text-[0.6rem] tracking-widest uppercase text-red-400/60">No slots</span> :
               <span className={`text-[0.6rem] tracking-widest uppercase ${duration===h?'text-[#60a5fa]/75':'text-white/25'}`}>{avail.length} slot{avail.length!==1?'s':''}</span>}
            </button>
          );
        })}
      </div>
      {!loading && hasSlots && (
        <div className="mb-6 p-4 bg-white/3 border border-white/6 rounded-xl">
          <p className="text-[0.6rem] tracking-widest uppercase text-white/20 mb-3">Available times for {duration}h</p>
          <div className="flex flex-wrap gap-2">
            {selectedAvail.map(slot => (
              <span key={slot} className="text-[0.7rem] text-[#60a5fa]/75 bg-[#60a5fa]/10 border border-[#60a5fa]/20 px-2.5 py-1 rounded-full font-mono">
                {fmtSlotRange(slot, duration)}
              </span>
            ))}
          </div>
        </div>
      )}
      {!loading && !hasSlots && (
        <div className="mb-6 p-4 bg-red-500/8 border border-red-500/15 rounded-xl">
          <p className="text-red-400/80 text-sm font-medium mb-1">No available slots for {duration}h</p>
          <p className="text-red-400/50 text-xs">Try a shorter duration or different date.</p>
        </div>
      )}
      <div className="flex gap-3">
        <PublicButton variant="ghost" className="proceed-btn ghost" onClick={onBack}>← Back</PublicButton>
        <PublicButton className="proceed-btn" disabled={!hasSlots && !loading} onClick={onNext}>Continue →</PublicButton>
      </div>
    </div>
  );
}

// ── Time Step ─────────────────────────────────────────────────────────────────

function TimeStep({ date, courtNum, duration, slug, timeSlot, setTimeSlot, onBack, onNext }: {
  date: string; courtNum: number; duration: number; slug: string;
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

  const slots = validSlotsForDuration(duration, date);
  const blockedSlots = availability?.blockedSlots ?? [];

  return (
    <div className="anim">
      <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-1">Select Start Time</p>
      <p className="text-white/20 text-xs mb-2">{fmtDateShort(date)} · Court {courtNum} · {duration}h session</p>
      <div className="mb-5 flex items-center gap-2">
        <span className="text-[0.6rem] tracking-widest uppercase text-white/20">Your session is</span>
        <span className="text-xs text-[#60a5fa]/75 bg-[#60a5fa]/10 border border-[#60a5fa]/20 px-2 py-0.5 rounded-full">{duration} hour{duration>1?'s':''}</span>
      </div>
      {loading ? (
        <div className="space-y-2 mb-6">{[...Array(6)].map((_,i) => <div key={i} className="h-14 rounded-lg bg-white/3 animate-pulse"/>)}</div>
      ) : error ? (
        <InlineNotice variant="error" className="mb-6">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={load} className="text-[0.7rem] text-red-400/70 hover:text-red-400 mt-2 transition-colors">Try again →</button>
        </InlineNotice>
      ) : (
        <div className="space-y-2 mb-6">
          {slots.map(slot => {
            const blocked  = blockedSlots.includes(slot);
            const sel      = timeSlot === slot;
            return (
              <button key={slot} disabled={blocked}
                className={`time-range-btn ${sel?'selected':''} ${blocked?'blocked':''}`}
                onClick={() => setTimeSlot(slot)}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className={`text-sm font-medium ${sel?'text-[#60a5fa]':blocked?'text-white/20':'text-white/70'}`}>
                      {fmtSlotRange(slot, duration)}
                    </span>
                    <span className={`text-[0.6rem] tracking-widest uppercase ${sel?'text-[#60a5fa]/60':blocked?'text-white/15':'text-white/20'}`}>{duration}h</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {blocked && <span className="text-[0.6rem] tracking-widest uppercase text-white/20 bg-white/5 px-2 py-0.5 rounded-full">Booked</span>}
                    {sel && <span className="text-[0.6rem] tracking-widest uppercase text-[#60a5fa] bg-[#60a5fa]/12 px-2 py-0.5 rounded-full">Selected ✓</span>}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
      <div className="flex gap-3 mb-3">
        <PublicButton variant="ghost" className="proceed-btn ghost" onClick={onBack}>← Back</PublicButton>
        <PublicButton className="proceed-btn flex-1 sm:flex-none" disabled={!timeSlot} onClick={onNext}>Continue →</PublicButton>
      </div>
      <p className="text-[0.65rem] text-white/15">Greyed slots are unavailable for your chosen duration.</p>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function BookingPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = use(params);

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

  const handleSubmit = async () => {
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
    <div className="min-h-screen bg-[#080c04] flex items-center justify-center">
      <style>{CSS}</style>
      <p className="text-white/30 text-sm font-mono">Loading...</p>
    </div>
  );

  // ── Not found ──
  if (notFound) return (
    <div className="min-h-screen bg-[#080c04] flex flex-col items-center justify-center gap-4">
      <style>{CSS}</style>
      <p className="text-white/40 text-sm font-mono">Court not found.</p>
      <Link href="/" className="text-[#60a5fa]/70 text-sm no-underline hover:text-[#60a5fa]">← Back to home</Link>
    </div>
  );

  // ── Success ──
  if (success) return (
    <div className="min-h-screen bg-[#080c04] flex items-center justify-center p-4 sm:p-6">
      <style>{CSS}</style>
      <div className="text-center w-full max-w-sm" style={{ fontFamily:"'DM Mono',monospace" }}>
        <div className="fade-up w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#60a5fa]/12 border border-[#60a5fa]/30 flex items-center justify-center mx-auto mb-6 sm:mb-8">
          <span className="text-[#60a5fa] text-2xl sm:text-3xl">✓</span>
        </div>
        <h2 className="fade-up-2 booking-display text-3xl sm:text-4xl text-white mb-3">Booking Received</h2>
        <p className="fade-up-2 text-white/40 text-sm mb-2">at <span className="text-white/60">{court?.name}</span></p>
        <p className="fade-up-2 text-white/30 text-sm mb-6 sm:mb-8 px-2">
          We&apos;ll confirm your reservation shortly.{form.email ? ' A confirmation email will be sent once approved.' : ''}
        </p>
        <div className="fade-up-3 bg-white/5 border border-white/10 rounded-2xl p-5 text-left mb-6 sm:mb-8">
          {([
            ['Court',    `Court ${courtNum}`],
            ['Date',     fmtDateShort(date)],
            ['Time',     fmtSlotRange(timeSlot, duration)],
            ['Duration', `${duration}h`],
            ['Name',     form.name],
            ['Phone',    form.phone],
          ] as [string,string][]).map(([label, value]) => (
            <div key={label} className="flex justify-between items-center gap-4 mb-2 last:mb-0">
              <span className="text-[0.6rem] tracking-widest uppercase text-white/30 shrink-0">{label}</span>
              <span className="text-sm text-white/70 text-right">{value}</span>
            </div>
          ))}
        </div>
        <button onClick={resetAll} className="fade-up-3 text-[#60a5fa]/70 hover:text-[#60a5fa] text-sm transition-colors">
          ← Book another slot
        </button>
      </div>
    </div>
  );

  // ── Main ──
  return (
    <div className="min-h-screen bg-[#080c04]" style={{ fontFamily:"'DM Mono',monospace" }}>
      <style>{CSS}</style>

      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[420px] sm:w-[680px] h-[220px] sm:h-[340px] rounded-full opacity-20 pointer-events-none"
        style={{ background:'radial-gradient(ellipse, rgba(59,130,246,0.85) 0%, rgba(16,185,129,0.45) 38%, transparent 72%)', filter:'blur(70px)' }}/>

      {/* Navbar */}
      <nav className="relative z-10 flex items-center gap-4 px-6 py-4 border-b border-white/[0.06]">
        <Link href="/" className="text-white/30 hover:text-white/60 no-underline flex items-center gap-1.5 text-sm transition-colors">
          <ChevronLeft size={14}/> Home
        </Link>
        <div className="h-4 w-px bg-white/10"/>
        {court?.logoUrl ? (
          <img src={court.logoUrl} alt={court.name} className="w-6 h-6 rounded object-cover"/>
        ) : (
          <div className="w-6 h-6 rounded bg-[#60a5fa]/20 flex items-center justify-center">
            <div className="w-2.5 h-2.5 bg-[#60a5fa] rounded-sm"/>
          </div>
        )}
        <span className="text-white/60 text-sm">{court?.name}</span>
      </nav>

      <div className="grid-bg min-h-screen">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-16 safe-bottom">

          {/* Header */}
          <div className="mb-10 sm:mb-16 anim">
            <div className="inline-flex items-center gap-2.5 mb-5 px-3 py-2 rounded-full border border-white/10 bg-white/5">
              {court?.logoUrl ? (
                <img
                  src={court.logoUrl}
                  alt={court.name}
                  className="w-6 h-6 rounded object-cover"
                />
              ) : (
                <div className="w-6 h-6 rounded bg-[#60a5fa]/20 flex items-center justify-center">
                  <div className="w-2.5 h-2.5 bg-[#60a5fa] rounded-sm" />
                </div>
              )}
              <span className="text-sm sm:text-base text-[#60a5fa] font-medium tracking-wide">
                {court?.name ?? 'Court'}
              </span>
            </div>
            <div className="flex items-center gap-3 mb-6 sm:mb-8">
              <span className="text-white/40 text-xs tracking-widest uppercase">Court Booking</span>
              {court?.sports?.map(s => (
                <span key={s} className="text-[0.6rem] text-[#60a5fa]/60 bg-[#60a5fa]/10 border border-[#60a5fa]/20 px-2 py-0.5 rounded-full capitalize">{s}</span>
              ))}
            </div>
            <h1 className="booking-display text-4xl sm:text-5xl text-white leading-tight mb-3">
              Reserve Your<br /><em className="text-[#60a5fa]">{court?.name ?? 'Court'}</em>
            </h1>
            <p className="text-white/30 text-sm">
              {court?.location?.city && `${court.location.city} · `}
              {court?.courtCount} court{court?.courtCount !== 1 ? 's' : ''} available
            </p>
          </div>

          <PublicStepper labels={['Date', 'Court', 'Duration', 'Time', 'Details']} step={step} />

          {/* Step 1 — Date */}
          {step === 1 && (
            <div className="anim">
              <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-4">Select Date</p>
              <input type="date" min={todayStr()} className="field mb-4" value={date}
                onChange={e => setDate(e.target.value)}/>
              {date && checkingSched && (
                <InlineNotice className="mb-4">
                  <p className="text-white/30 text-xs">Checking schedule...</p>
                </InlineNotice>
              )}
              {date && !checkingSched && closedDay && (
                <InlineNotice variant="error" className="mb-4">
                  <p className="text-red-400 text-sm font-medium">Venue closed on this date</p>
                  <p className="text-red-400/60 text-xs mt-1">Please choose a different date.</p>
                </InlineNotice>
              )}
              {date && !checkingSched && !closedDay && (
                <InlineNotice className="mb-6">
                  <p className="text-[#60a5fa]/75 text-sm">{fmtDateLong(date)}</p>
                </InlineNotice>
              )}
              <PublicButton className="proceed-btn w-full sm:w-auto" disabled={!date || checkingSched || closedDay}
                onClick={() => setStep(2)}>Continue →</PublicButton>
            </div>
          )}

          {/* Step 2 — Court */}
          {step === 2 && (
            <div className="anim">
              <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-1">Select Court</p>
              <p className="text-white/20 text-xs mb-5">{fmtDateLong(date)}</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {courtList.map(c => (
                  <button key={c} className={`court-btn ${courtNum===c?'selected':''}`}
                    onClick={() => { setCourtNum(c); setTimeSlot(''); }}>
                    <div className="text-[0.55rem] tracking-widest uppercase text-white/30 mb-1">Court</div>
                    <div className="booking-display text-3xl sm:text-4xl text-white/80 mb-2">{c}</div>
                    {courtNum===c && <div className="text-[0.55rem] text-[#60a5fa] tracking-widest uppercase">Selected ✓</div>}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <PublicButton variant="ghost" className="proceed-btn ghost" onClick={() => setStep(1)}>← Back</PublicButton>
                <PublicButton className="proceed-btn flex-1 sm:flex-none" disabled={!courtNum} onClick={() => setStep(3)}>Continue →</PublicButton>
              </div>
            </div>
          )}

          {/* Step 3 — Duration */}
          {step === 3 && courtNum && (
            <DurationStep
              duration={duration} setDuration={setDuration}
              date={date} courtNum={courtNum} slug={slug}
              onBack={() => setStep(2)} onNext={() => setStep(4)}
            />
          )}

          {/* Step 4 — Time */}
          {step === 4 && courtNum && (
            <TimeStep
              date={date} courtNum={courtNum} duration={duration} slug={slug}
              timeSlot={timeSlot} setTimeSlot={setTimeSlot}
              onBack={() => setStep(3)} onNext={() => setStep(5)}
            />
          )}

          {/* Step 5 — Details */}
          {step === 5 && (
            <div className="anim">
              <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-1">Your Details</p>
              <p className="text-white/20 text-xs mb-6">Court {courtNum} · {fmtDateShort(date)} · {fmtSlotRange(timeSlot, duration)}</p>
              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <PublicField label="Full Name *">
                    <PublicInput className="field" placeholder="Juan dela Cruz" value={form.name}
                      onChange={e => setForm({...form, name: e.target.value})}/>
                  </PublicField>
                  <PublicField label="Phone *">
                    <PublicInput className="field" placeholder="09XX XXX XXXX" type="tel" value={form.phone}
                      onChange={e => setForm({...form, phone: e.target.value})}/>
                  </PublicField>
                </div>
                <PublicField label="Email (optional)">
                  <PublicInput className="field" type="email" placeholder="juan@email.com" value={form.email}
                    onChange={e => setForm({...form, email: e.target.value})}/>
                </PublicField>
                <PublicField label="Players">
                  <PublicSelect className="field" value={form.playerCount}
                    onChange={e => setForm({...form, playerCount: e.target.value})}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} player{n>1?'s':''}</option>)}
                  </PublicSelect>
                </PublicField>
                <PublicField label="Notes (optional)">
                  <PublicTextarea className="field" rows={3} placeholder="Any special requests..."
                    value={form.notes} onChange={e => setForm({...form, notes: e.target.value})}/>
                </PublicField>
              </div>

              {/* Summary */}
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

              <div className="flex flex-col sm:flex-row gap-3">
                <PublicButton variant="ghost" className="proceed-btn ghost order-2 sm:order-1" onClick={() => setStep(4)}>← Back</PublicButton>
                <PublicButton variant="primary" className="proceed-btn submit order-1 sm:order-2 w-full sm:w-auto"
                  disabled={!form.name || !form.phone || submitting} onClick={handleSubmit}>
                  {submitting ? 'Submitting...' : `Confirm Booking · ₱${totalFee}`}
                </PublicButton>
              </div>
              <p className="text-[0.65rem] text-white/15 mt-4">Your booking will be reviewed by admin before confirmation.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}