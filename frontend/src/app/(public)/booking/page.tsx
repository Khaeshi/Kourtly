'use client';
import { useState, useEffect, useCallback } from 'react';
import { format, parseISO } from 'date-fns';
import { createReservation } from '@/lib/api';
import { API_BASE } from '@/lib/config';

// ── Constants ─────────────────────────────────────────────────────────────────

const COURTS = [1, 2, 3, 4];

const ALL_SLOTS = [
  '09:00-10:00','10:00-11:00','11:00-12:00','12:00-13:00',
  '13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00',
  '17:00-18:00','18:00-19:00','19:00-20:00','20:00-21:00',
  '21:00-22:00','22:00-23:00',
];

// Last valid start slot per duration (can't start so late the booking runs past 23:00)
const LAST_START_HOUR = 23;

// ── Pure helpers ──────────────────────────────────────────────────────────────

function todayStr() {
  // format today as YYYY-MM-DD in local time (avoids UTC offset issues)
  return format(new Date(), 'yyyy-MM-dd');
}

function toMinutes(timeStr: string) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function fmtMins(totalMins: number) {
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const display = h > 12 ? h - 12 : h === 0 ? 12 : h;
  return `${display}:${String(m).padStart(2, '0')} ${ampm}`;
}

/** Format a slot's start time as "10:00 AM" */
function fmtSlotStart(slot: string) {
  return fmtMins(toMinutes(slot.split('-')[0]));
}

/** Format a slot as "10:00 AM – 12:00 PM" given a chosen duration */
function fmtSlotRange(slot: string, durationHours: number) {
  const startMins = toMinutes(slot.split('-')[0]);
  const endMins   = startMins + durationHours * 60;
  return `${fmtMins(startMins)} – ${fmtMins(endMins)}`;
}

function fmtDateLong(d: string) {
  // parseISO treats YYYY-MM-DD as local date, avoiding TZ shift to previous day
  return format(parseISO(d), 'EEEE, MMMM d, yyyy');
}

function fmtDateShort(d: string) {
  return format(parseISO(d), 'MMM d, yyyy');
}

/** Slots valid for a duration — must not overflow 23:00 AND not be fully in the past */
function validSlotsForDuration(durationHours: number, date?: string) {
  const todayStr = format(new Date(), 'yyyy-MM-dd');
  const isToday  = date ? date === todayStr : false;
  // Only block slots whose 1-hour window has completely ended
  // e.g. at 9:30 PM, the 9PM slot (9PM–10PM) is still in progress → keep it
  // at 10:05 PM, the 9PM slot has ended → block it
  const nowMins  = isToday
    ? new Date().getHours() * 60 + new Date().getMinutes()
    : 0;

  return ALL_SLOTS.filter(slot => {
    const startMins = toMinutes(slot.split('-')[0]);
    // Must not overflow past 23:00
    if (startMins + durationHours * 60 > LAST_START_HOUR * 60) return false;
    // For today, block only if the slot's base 1hr window has fully ended
    if (isToday && startMins + 60 <= nowMins) return false;
    return true;
  });
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface CourtAvailability {
  court: number;
  blockedSlots: string[]; // blocked START slots for the chosen duration
}

// ── API ───────────────────────────────────────────────────────────────────────


async function fetchAvailability(date: string, duration: number): Promise<CourtAvailability[]> {
  const res = await fetch(`${API_BASE}/api/reservations/availability?date=${date}&duration=${duration}`);
  if (!res.ok) throw new Error('Failed to fetch availability');
  return res.json();
}

async function fetchSchedule(date: string): Promise<{ isFullyClosed: boolean; openTime?: string; closeTime?: string }> {
  const res = await fetch(`${API_BASE}/api/schedule/resolve?date=${date}`);
  if (!res.ok) return { isFullyClosed: false };
  return res.json();
}

/** Fetch availability for ALL durations 1–4 in parallel for a given court */
async function fetchAllDurationAvailability(
  date: string,
  court: number
): Promise<Record<number, string[]>> {
  const results = await Promise.all(
    [1, 2, 3, 4].map(async d => {
      const res = await fetch(`${API_BASE}/api/reservations/availability?date=${date}&duration=${d}`);
      if (!res.ok) return { duration: d, available: [] };
      const data: CourtAvailability[] = await res.json();
      const courtData = data.find(a => a.court === court);
      // available = valid slots that are NOT blocked
      const valid = validSlotsForDuration(d);
      const blocked = courtData?.blockedSlots ?? [];
      const available = valid.filter(s => !blocked.includes(s));
      return { duration: d, available };
    })
  );
  return Object.fromEntries(results.map(r => [r.duration, r.available]));
}

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const steps = ['Date', 'Court', 'Duration', 'Time', 'Details'];
  return (
    <div className="flex items-center gap-0 mb-10">
      {steps.map((label, i) => {
        const idx    = i + 1;
        const active = idx === step;
        const done   = idx < step;
        return (
          <div key={label} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full transition-all duration-300 ${
              active ? 'bg-[#c8f56a]/15 border border-[#c8f56a]/30' : 'border border-transparent'
            }`}>
              <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[0.55rem] font-bold transition-all duration-300 ${
                done   ? 'bg-[#c8f56a] text-[#0a0f05]' :
                active ? 'bg-[#c8f56a]/20 border border-[#c8f56a]/50 text-[#c8f56a]' :
                         'bg-white/5 border border-white/10 text-white/30'
              }`}>
                {done ? '✓' : idx}
              </div>
              <span className={`text-[0.6rem] sm:text-xs font-medium transition-colors duration-300 ${
                active ? 'text-[#c8f56a]' : done ? 'text-white/50' : 'text-white/20'
              } ${!active && !done ? 'hidden sm:inline' : ''}`}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-3 sm:w-6 h-px transition-colors duration-300 ${done ? 'bg-[#c8f56a]/30' : 'bg-white/10'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Duration Picker ───────────────────────────────────────────────────────────

function DurationStep({
  duration, setDuration, date, court, onBack, onNext,
}: {
  duration: number;
  setDuration: (d: number) => void;
  date: string;
  court: number;
  onBack: () => void;
  onNext: () => void;
}) {
  const [availMap, setAvailMap] = useState<Record<number, string[]>>({});
  const [loading,  setLoading]  = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchAllDurationAvailability(date, court)
      .then(setAvailMap)
      .finally(() => setLoading(false));
  }, [date, court]);

  // Re-filter available slots against current time for today
  // (backend already does this, but double-check on frontend for display accuracy)
  const validForDuration = validSlotsForDuration(duration, date);
  const selectedAvail = (availMap[duration] ?? []).filter(s => validForDuration.includes(s));
  const hasSlots      = selectedAvail.length > 0;

  return (
    <div className="anim">
      <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-1">Select Duration</p>
      <p className="text-white/20 text-xs mb-6">{fmtDateShort(date)} · Court {court}</p>

      {/* Duration cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        {[1, 2, 3, 4].map(h => {
          const avail      = availMap[h] ?? [];
          const noSlots    = !loading && avail.length === 0;
          const isSelected = duration === h;

          return (
            <button
              key={h}
              disabled={noSlots}
              className={`duration-btn ${isSelected ? 'selected' : ''} ${noSlots ? 'unavailable' : ''}`}
              onClick={() => setDuration(h)}
            >
              <span className="text-2xl font-bold block mb-1"
                style={{ fontFamily: "'DM Serif Display', serif" }}>{h}</span>
              <span className="text-[0.65rem] tracking-widest uppercase opacity-60 block mb-2">
                {h === 1 ? 'hour' : 'hours'}
              </span>

              {/* Slot count badge */}
              {loading ? (
                <span className="block w-12 h-3 mx-auto rounded bg-white/10 animate-pulse" />
              ) : noSlots ? (
                <span className="text-[0.6rem] tracking-widest uppercase text-red-400/60">
                  No slots
                </span>
              ) : (
                <span className={`text-[0.6rem] tracking-widest uppercase ${
                  isSelected ? 'text-[#c8f56a]/70' : 'text-white/25'
                }`}>
                  {avail.length} slot{avail.length !== 1 ? 's' : ''}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Available slots preview for selected duration */}
      {!loading && hasSlots && (
        <div className="mb-6 p-4 bg-white/3 border border-white/6 rounded-xl">
          <p className="text-[0.6rem] tracking-widest uppercase text-white/20 mb-3">
            Available times for {duration}h
          </p>
          <div className="flex flex-wrap gap-2">
            {selectedAvail.map(slot => (
              <span key={slot}
                className="text-[0.7rem] text-[#c8f56a]/70 bg-[#c8f56a]/8 border border-[#c8f56a]/15 px-2.5 py-1 rounded-full font-mono">
                {fmtSlotRange(slot, duration)}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* No slots at all for selected duration */}
      {!loading && !hasSlots && (
        <div className="mb-6 p-4 bg-red-500/8 border border-red-500/15 rounded-xl">
          <p className="text-red-400/80 text-sm font-medium mb-1">
            No available slots for {duration} hour{duration > 1 ? 's' : ''}
          </p>
          <p className="text-red-400/50 text-xs">
            {(() => {
              const shorter = [1,2,3,4].filter(h => h < duration && (availMap[h]?.length ?? 0) > 0);
              if (shorter.length > 0) {
                return `Try ${shorter.join('h or ')}h — slots are available.`;
              }
              return 'No slots available for this court today. Try a different date or court.';
            })()}
          </p>
        </div>
      )}

      <div className="flex gap-3">
        <button className="proceed-btn ghost" onClick={onBack}>← Back</button>
        <button className="proceed-btn" disabled={!hasSlots && !loading} onClick={onNext}>
          Continue →
        </button>
      </div>
    </div>
  );
}

// ── Time Slot Step ────────────────────────────────────────────────────────────

function TimeStep({
  date, court, duration, timeSlot, setTimeSlot, onBack, onNext,
}: {
  date: string;
  court: number;
  duration: number;
  timeSlot: string;
  setTimeSlot: (s: string) => void;
  onBack: () => void;
  onNext: () => void;
}) {
  const [availability, setAvailability] = useState<CourtAvailability[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAvailability(date, duration);
      setAvailability(data);
    } catch {
      setError('Failed to load availability. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [date, duration]);

  useEffect(() => { load(); }, [load]);

  const courtData   = availability.find(a => a.court === court);
  const blockedSlots = courtData?.blockedSlots ?? [];
  const slots        = validSlotsForDuration(duration, date);

  return (
    <div className="anim">
      <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-1">Select Start Time</p>
      <p className="text-white/20 text-xs mb-2">{fmtDateShort(date)} · Court {court} · {duration}h session</p>

      {/* Duration reminder */}
      <div className="mb-5 flex items-center gap-2">
        <span className="text-[0.6rem] tracking-widest uppercase text-white/20">Your session is</span>
        <span className="text-xs text-[#c8f56a]/70 bg-[#c8f56a]/8 border border-[#c8f56a]/15 px-2 py-0.5 rounded-full">
          {duration} hour{duration > 1 ? 's' : ''}
        </span>
        <span className="text-[0.6rem] tracking-widest uppercase text-white/20">— end time shown on each slot</span>
      </div>

      {loading ? (
        <div className="space-y-2 mb-6">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-14 rounded-lg bg-white/3 animate-pulse" />
          ))}
        </div>
      ) : error ? (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
          <p className="text-red-400 text-sm">{error}</p>
          <button onClick={load} className="text-[0.7rem] text-red-400/70 hover:text-red-400 mt-2 transition-colors">
            Try again →
          </button>
        </div>
      ) : (
        <div className="space-y-2 mb-6">
          {slots.map(slot => {
            const blocked  = blockedSlots.includes(slot);
            const selected = timeSlot === slot;
            return (
              <button
                key={slot}
                disabled={blocked}
                className={`time-range-btn w-full ${selected ? 'selected' : ''} ${blocked ? 'blocked' : ''}`}
                onClick={() => setTimeSlot(slot)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    {/* Start → End */}
                    <span className={`text-sm font-medium ${selected ? 'text-[#c8f56a]' : blocked ? 'text-white/20' : 'text-white/70'}`}>
                      {fmtSlotRange(slot, duration)}
                    </span>
                    <span className={`text-[0.6rem] tracking-widest uppercase ${
                      selected ? 'text-[#c8f56a]/50' : blocked ? 'text-white/15' : 'text-white/20'
                    }`}>
                      {duration}h
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {blocked && (
                      <span className="text-[0.6rem] tracking-widest uppercase text-white/20 bg-white/5 px-2 py-0.5 rounded-full">
                        Booked
                      </span>
                    )}
                    {selected && (
                      <span className="text-[0.6rem] tracking-widest uppercase text-[#c8f56a] bg-[#c8f56a]/10 px-2 py-0.5 rounded-full">
                        Selected ✓
                      </span>
                    )}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <div className="flex gap-3 mb-3">
        <button className="proceed-btn ghost" onClick={onBack}>← Back</button>
        <button className="proceed-btn flex-1 sm:flex-none" disabled={!timeSlot} onClick={onNext}>
          Continue →
        </button>
      </div>
      <p className="text-[0.65rem] text-white/15">Greyed slots are unavailable for your chosen duration.</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function BookingPage() {
  const [step,       setStep]       = useState(1);
  const [date,       setDate]       = useState('');
  const [court,      setCourt]      = useState<number | null>(null);
  const [duration,   setDuration]   = useState(1);
  const [timeSlot,   setTimeSlot]   = useState('');
  const [submitting,    setSubmitting]    = useState(false);
  const [success,       setSuccess]       = useState(false);
  const [closedDay,     setClosedDay]     = useState(false);
  const [checkingSched, setCheckingSched] = useState(false);

  const [form, setForm] = useState({
    name: '', phone: '', email: '', playerCount: '2', notes: '',
  });

  // Reset time slot when duration changes so stale selection is cleared
  useEffect(() => { setTimeSlot(''); }, [duration]);

  // Check if selected date is closed when user picks a date
  useEffect(() => {
    if (!date) return;
    setCheckingSched(true);
    setClosedDay(false);
    fetchSchedule(date)
      .then(s => setClosedDay(s.isFullyClosed))
      .finally(() => setCheckingSched(false));
  }, [date]);

  const handleSubmit = async () => {
    if (!date || !court || !timeSlot || !form.name || !form.phone) return;
    setSubmitting(true);
    try {
      await createReservation({
        name: form.name, phone: form.phone, email: form.email,
        court, date, timeSlot, duration,
        playerCount: Number(form.playerCount),
        notes: form.notes,
      });
      setSuccess(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Booking failed. Please try again.';
      alert(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const resetAll = () => {
    setSuccess(false); setStep(1); setDate(''); setCourt(null);
    setDuration(1); setTimeSlot('');
    setForm({ name: '', phone: '', email: '', playerCount: '2', notes: '' });
  };

  // ── Styles ──────────────────────────────────────────────────────────────────
  const css = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&display=swap');
    .booking-display { font-family: 'DM Serif Display', serif; }

    .grid-bg {
      background-image:
        linear-gradient(rgba(200,245,106,0.03) 1px, transparent 1px),
        linear-gradient(90deg, rgba(200,245,106,0.03) 1px, transparent 1px);
      background-size: 48px 48px;
    }

    @keyframes fadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }
    .anim { animation: fadeIn 0.4s ease forwards; }

    /* Duration buttons */
    .duration-btn {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      color: rgba(255,255,255,0.5);
      border-radius: 12px;
      padding: 20px 12px;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: 'DM Mono', monospace;
      text-align: center;
    }
    .duration-btn:hover {
      background: rgba(200,245,106,0.08);
      border-color: rgba(200,245,106,0.25);
      color: #c8f56a;
    }
    .duration-btn.selected {
      background: rgba(200,245,106,0.12);
      border-color: rgba(200,245,106,0.4);
      color: #c8f56a;
    }

    /* Time range buttons — list style, not grid */
    .time-range-btn {
      background: rgba(255,255,255,0.02);
      border: 1px solid rgba(255,255,255,0.06);
      border-radius: 10px;
      padding: 14px 16px;
      cursor: pointer;
      transition: all 0.15s ease;
      font-family: 'DM Mono', monospace;
      text-align: left;
    }
    .time-range-btn:hover:not(:disabled):not(.selected) {
      background: rgba(200,245,106,0.06);
      border-color: rgba(200,245,106,0.2);
    }
    .time-range-btn.selected {
      background: rgba(200,245,106,0.10);
      border-color: rgba(200,245,106,0.35);
    }
    .time-range-btn.blocked {
      opacity: 0.35;
      cursor: not-allowed;
      text-decoration: none;
    }

    .court-btn {
      background: rgba(255,255,255,0.03);
      border: 1px solid rgba(255,255,255,0.07);
      transition: all 0.2s ease;
      border-radius: 12px;
      padding: 16px;
      text-align: left;
      cursor: pointer;
      width: 100%;
    }
    .court-btn:hover { background: rgba(200,245,106,0.06); border-color: rgba(200,245,106,0.2); }
    .court-btn.selected { background: rgba(200,245,106,0.1); border-color: rgba(200,245,106,0.35); }

    .field {
      width: 100%;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      padding: 12px 14px;
      color: rgba(255,255,255,0.8);
      font-size: 0.875rem;
      font-family: 'DM Mono', monospace;
      outline: none;
      transition: border-color 0.15s ease;
      -webkit-appearance: none;
      appearance: none;
    }
    .field::placeholder { color: rgba(255,255,255,0.2); }
    .field:focus { border-color: rgba(200,245,106,0.35); }
    .field option { background: #111; }

    .proceed-btn {
      background: rgba(200,245,106,0.12);
      border: 1px solid rgba(200,245,106,0.3);
      color: #c8f56a;
      font-family: 'DM Mono', monospace;
      font-size: 0.8rem;
      padding: 12px 24px;
      border-radius: 10px;
      cursor: pointer;
      transition: all 0.2s ease;
      letter-spacing: 0.05em;
      white-space: nowrap;
    }
    .proceed-btn:hover:not(:disabled) {
      background: rgba(200,245,106,0.2);
      border-color: rgba(200,245,106,0.5);
    }
    .proceed-btn:disabled { opacity: 0.4; cursor: not-allowed; }
    .proceed-btn.ghost { background: transparent; color: rgba(255,255,255,0.3); border-color: transparent; }
    .proceed-btn.submit {
      background: #c8f56a; border-color: #c8f56a;
      color: #0a0f05; font-weight: 600;
    }
    .proceed-btn.submit:hover:not(:disabled) { background: #d4f97c; }

    input[type="date"].field { color-scheme: dark; }
    .safe-bottom { padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); }

    @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
    .fade-up   { animation: fadeUp 0.6s ease forwards; }
    .fade-up-2 { animation: fadeUp 0.6s 0.15s ease both; }
    .fade-up-3 { animation: fadeUp 0.6s 0.3s ease both; }
  `;

  // ── Success screen ──────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-[#080c04] flex items-center justify-center p-4 sm:p-6">
        <style>{css}</style>
        <div className="text-center w-full max-w-sm" style={{ fontFamily: "'DM Mono', monospace" }}>
          <div className="fade-up w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#c8f56a]/10 border border-[#c8f56a]/30 flex items-center justify-center mx-auto mb-6 sm:mb-8">
            <span className="text-[#c8f56a] text-2xl sm:text-3xl">✓</span>
          </div>
          <h2 className="fade-up-2 booking-display text-3xl sm:text-4xl text-white mb-3">Booking Received</h2>
          <p className="fade-up-2 text-white/40 text-sm mb-6 sm:mb-8 px-2">
            We'll confirm your reservation shortly.{form.email ? ' A confirmation email will be sent once approved.' : ' Check your phone for updates.'}
          </p>
          <div className="fade-up-3 bg-white/5 border border-white/10 rounded-2xl p-5 text-left mb-6 sm:mb-8">
            <div className="space-y-3">
              {([
                ['Name',     form.name],
                ['Court',    `Court ${court}`],
                ['Date',     fmtDateShort(date)],
                ['Time',     fmtSlotRange(timeSlot, duration)],
                ['Duration', `${duration}h`],
                ['Phone',    form.phone],
              ] as [string, string][]).map(([label, value]) => (
                <div key={label} className="flex justify-between items-center gap-4">
                  <span className="text-[0.6rem] tracking-widest uppercase text-white/30 shrink-0">{label}</span>
                  <span className="text-sm text-white/70 text-right">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={resetAll} className="fade-up-3 text-[#c8f56a]/60 hover:text-[#c8f56a] text-sm transition-colors">
            ← Book another slot
          </button>
        </div>
      </div>
    );
  }

  // ── Main UI ─────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-[#080c04]" style={{ fontFamily: "'DM Mono', monospace" }}>
      <style>{css}</style>

      {/* Ambient glow */}
      <div className="fixed top-0 left-1/2 -translate-x-1/2 w-[400px] sm:w-[600px] h-[200px] sm:h-[300px] rounded-full opacity-10 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, #c8f56a 0%, transparent 70%)', filter: 'blur(60px)' }} />

      <div className="grid-bg min-h-screen">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 py-10 sm:py-16 safe-bottom">

          {/* Header */}
          <div className="mb-10 sm:mb-16 anim">
            <div className="flex items-center gap-3 mb-6 sm:mb-8">
              <span className="text-white/40 text-xs tracking-widest uppercase">Court Booking</span>
            </div>
            <h1 className="booking-display text-4xl sm:text-5xl text-white leading-tight mb-3">
              Reserve Your<br /><em className="text-[#c8f56a]">Court</em>
            </h1>
            <p className="text-white/30 text-sm">Pick a date, choose your court, and lock in your time.</p>
          </div>

          <StepIndicator step={step} />

          {/* ── STEP 1: Date ── */}
          {step === 1 && (
            <div className="anim">
              <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-4">Select Date</p>
              <input type="date" min={todayStr()} className="field mb-4" value={date}
                onChange={e => setDate(e.target.value)} />

              {/* Checking schedule */}
              {date && checkingSched && (
                <div className="mb-4 p-3 bg-white/3 border border-white/6 rounded-xl">
                  <p className="text-white/30 text-xs">Checking schedule...</p>
                </div>
              )}

              {/* Closed day warning */}
              {date && !checkingSched && closedDay && (
                <div className="mb-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl">
                  <p className="text-red-400 text-sm font-medium">Venue closed on this date</p>
                  <p className="text-red-400/60 text-xs mt-1">
                    No bookings are available. Please choose a different date.
                  </p>
                </div>
              )}

              {/* Open day confirmation */}
              {date && !checkingSched && !closedDay && (
                <div className="mb-6 p-4 bg-white/3 border border-white/6 rounded-xl">
                  <p className="text-[#c8f56a]/70 text-sm">{fmtDateLong(date)}</p>
                </div>
              )}

              <button
                className="proceed-btn w-full sm:w-auto"
                disabled={!date || checkingSched || closedDay}
                onClick={() => setStep(2)}>
                Continue →
              </button>
            </div>
          )}

          {/* ── STEP 2: Court ── */}
          {step === 2 && (
            <div className="anim">
              <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-1">Select Court</p>
              <p className="text-white/20 text-xs mb-5">{fmtDateLong(date)}</p>
              <div className="grid grid-cols-2 gap-3 mb-6">
                {COURTS.map(c => (
                  <button key={c}
                    className={`court-btn ${court === c ? 'selected' : ''}`}
                    onClick={() => { setCourt(c); setTimeSlot(''); }}>
                    <div className="text-[0.55rem] tracking-widest uppercase text-white/30 mb-1">Court</div>
                    <div className="booking-display text-3xl sm:text-4xl text-white/80 mb-2">{c}</div>
                    {court === c && (
                      <div className="text-[0.55rem] text-[#c8f56a] tracking-widest uppercase">Selected ✓</div>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex gap-3">
                <button className="proceed-btn ghost" onClick={() => setStep(1)}>← Back</button>
                <button className="proceed-btn flex-1 sm:flex-none" disabled={!court} onClick={() => setStep(3)}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Duration ── */}
          {step === 3 && court && (
            <DurationStep
              duration={duration}
              setDuration={setDuration}
              date={date}
              court={court}
              onBack={() => setStep(2)}
              onNext={() => setStep(4)}
            />
          )}

          {/* ── STEP 4: Time Slot ── */}
          {step === 4 && court && (
            <TimeStep
              date={date}
              court={court}
              duration={duration}
              timeSlot={timeSlot}
              setTimeSlot={setTimeSlot}
              onBack={() => setStep(3)}
              onNext={() => setStep(5)}
            />
          )}

          {/* ── STEP 5: Details ── */}
          {step === 5 && (
            <div className="anim">
              <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-1">Your Details</p>
              <p className="text-white/20 text-xs mb-6">
                Court {court} · {fmtDateShort(date)} · {fmtSlotRange(timeSlot, duration)}
              </p>

              <div className="space-y-4 mb-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[0.6rem] tracking-widest uppercase text-white/25 mb-2">Full Name *</label>
                    <input className="field" placeholder="Juan dela Cruz"
                      value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
                  </div>
                  <div>
                    <label className="block text-[0.6rem] tracking-widest uppercase text-white/25 mb-2">Phone *</label>
                    <input className="field" placeholder="09XX XXX XXXX" type="tel"
                      value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} />
                  </div>
                </div>

                <div>
                  <label className="block text-[0.6rem] tracking-widest uppercase text-white/25 mb-2">
                    Email <span className="text-white/15">(optional — for confirmation email)</span>
                  </label>
                  <input className="field" type="email" placeholder="juan@email.com"
                    value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>

                <div>
                  <label className="block text-[0.6rem] tracking-widest uppercase text-white/25 mb-2">Players</label>
                  <select className="field" value={form.playerCount}
                    onChange={e => setForm({ ...form, playerCount: e.target.value })}>
                    {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} player{n > 1 ? 's' : ''}</option>)}
                  </select>
                </div>

                <div>
                  <label className="block text-[0.6rem] tracking-widest uppercase text-white/25 mb-2">Notes (optional)</label>
                  <textarea className="field resize-none" rows={3} placeholder="Any special requests..."
                    value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white/3 border border-white/6 rounded-xl p-4 sm:p-5 mb-6">
                <p className="text-[0.6rem] tracking-widest uppercase text-white/20 mb-3">Booking Summary</p>
                <div className="space-y-2">
                  {([
                    ['Court',    `Court ${court}`],
                    ['Date',     fmtDateShort(date)],
                    ['Time',     fmtSlotRange(timeSlot, duration)],
                    ['Duration', `${duration} hr${duration > 1 ? 's' : ''}`],
                    ['Players',  `${form.playerCount} pax`],
                  ] as [string, string][]).map(([label, value]) => (
                    <div key={label} className="flex justify-between items-center gap-4">
                      <span className="text-[0.6rem] tracking-widest uppercase text-white/25 shrink-0">{label}</span>
                      <span className="text-sm text-white/60 text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <button className="proceed-btn ghost order-2 sm:order-1" onClick={() => setStep(4)}>← Back</button>
                <button
                  className="proceed-btn submit order-1 sm:order-2 w-full sm:w-auto"
                  disabled={!form.name || !form.phone || submitting}
                  onClick={handleSubmit}>
                  {submitting ? 'Submitting...' : 'Confirm Booking'}
                </button>
              </div>
              <p className="text-[0.65rem] text-white/15 mt-4">
                Your booking will be reviewed by admin before confirmation.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}