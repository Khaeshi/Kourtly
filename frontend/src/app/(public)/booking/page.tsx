'use client';
import { useState, useEffect } from 'react';
import { getAvailability, createReservation } from '@/lib/api';

// ── Constants ─────────────────────────────────────────────────────────────────

const COURTS = [1, 2, 3, 4];

const TIME_SLOTS = [
  '09:00-10:00',
  '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00',
  '14:00-15:00', '15:00-16:00', '16:00-17:00', '17:00-18:00',
  '18:00-19:00', '19:00-20:00', '20:00-21:00', '21:00-22:00',
  '22:00-23:00'
];

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function fmtSlot(slot: string) {
  const [start] = slot.split('-');
  const [h] = start.split(':');
  const hour = parseInt(h);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const display = hour > 12 ? hour - 12 : hour === 0 ? 12 : hour;
  return `${display}:00 ${ampm}`;
}

function fmtDateLong(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  });
}

function fmtDateShort(d: string) {
  return new Date(d + 'T00:00:00').toLocaleDateString('en-PH', {
    month: 'short', day: 'numeric', year: 'numeric',
  });
}

// ── Step Indicator ────────────────────────────────────────────────────────────

function StepIndicator({ step }: { step: number }) {
  const steps = ['Date', 'Court', 'Time', 'Details'];
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
              {/* Hide label on mobile for middle steps to save space */}
              <span className={`text-[0.6rem] sm:text-xs font-medium transition-colors duration-300 ${
                active ? 'text-[#c8f56a]' : done ? 'text-white/50' : 'text-white/20'
              } ${!active && !done ? 'hidden sm:inline' : ''}`}>{label}</span>
            </div>
            {i < steps.length - 1 && (
              <div className={`w-4 sm:w-8 h-px transition-colors duration-300 ${done ? 'bg-[#c8f56a]/30' : 'bg-white/10'}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function BookingPage() {
  const [step,       setStep]       = useState(1);
  const [date,       setDate]       = useState('');
  const [court,      setCourt]      = useState<number | null>(null);
  const [timeSlot,   setTimeSlot]   = useState('');
  const [booked,     setBooked]     = useState<{ court: number; timeSlot: string }[]>([]);
  const [loadingAv,  setLoadingAv]  = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [success,    setSuccess]    = useState(false);

  const [form, setForm] = useState({
    name: '', phone: '', email: '',
    playerCount: '2', duration: '1', notes: '',
  });

  useEffect(() => {
    if (!date) return;
    setLoadingAv(true);
    getAvailability(date).then(data => {
      setBooked(data);
      setLoadingAv(false);
    });
  }, [date]);

  const isBooked = (c: number, slot: string) =>
    booked.some(b => b.court === c && b.timeSlot === slot);

  const handleSubmit = async () => {
    if (!date || !court || !timeSlot || !form.name || !form.phone) return;
    setSubmitting(true);
    try {
      await createReservation({
        name: form.name, phone: form.phone, email: form.email,
        court, date, timeSlot,
        duration: Number(form.duration),
        playerCount: Number(form.playerCount),
        notes: form.notes,
      });
      setSuccess(true);
    } catch (err: any) {
      alert(err.message || 'Booking failed. Please try again.');
    }
    setSubmitting(false);
  };

  const resetAll = () => {
    setSuccess(false); setStep(1); setDate(''); setCourt(null); setTimeSlot('');
    setForm({ name:'', phone:'', email:'', playerCount:'2', duration:'1', notes:'' });
  };

  // ── Success ─────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <div className="min-h-screen bg-[#080c04] flex items-center justify-center p-4 sm:p-6">
        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@300;400;500&display=swap');
          .booking-font { font-family: 'DM Mono', monospace; }
          .booking-display { font-family: 'DM Serif Display', serif; }
          @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
          .fade-up  { animation: fadeUp 0.6s ease forwards; }
          .fade-up-2 { animation: fadeUp 0.6s 0.15s ease both; }
          .fade-up-3 { animation: fadeUp 0.6s 0.3s ease both; }
        `}</style>
        <div className="text-center booking-font w-full max-w-sm">
          <div className="fade-up w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-[#c8f56a]/10 border border-[#c8f56a]/30 flex items-center justify-center mx-auto mb-6 sm:mb-8">
            <span className="text-[#c8f56a] text-2xl sm:text-3xl">✓</span>
          </div>
          <h2 className="fade-up-2 booking-display text-3xl sm:text-4xl text-white mb-3">Booking Received</h2>
          <p className="fade-up-2 text-white/40 text-sm mb-6 sm:mb-8 px-2">
            We'll confirm your reservation shortly. Check your phone for updates.
          </p>
          <div className="fade-up-3 bg-white/5 border border-white/10 rounded-2xl p-5 text-left mb-6 sm:mb-8">
            <div className="space-y-3">
              {[
                ['Name',  form.name],
                ['Court', `Court ${court}`],
                ['Date',  fmtDateShort(date)],
                ['Time',  fmtSlot(timeSlot)],
                ['Phone', form.phone],
              ].map(([label, value]) => (
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
      <style>{`
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

        .slot-btn {
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          color: rgba(255,255,255,0.5);
          transition: all 0.15s ease;
          border-radius: 8px;
          padding: 10px 4px;
          font-size: 0.72rem;
          font-family: 'DM Mono', monospace;
          cursor: pointer;
          width: 100%;
        }
        .slot-btn:hover:not(:disabled) {
          background: rgba(200,245,106,0.08);
          border-color: rgba(200,245,106,0.25);
          color: #c8f56a;
        }
        .slot-btn.selected {
          background: rgba(200,245,106,0.12);
          border-color: rgba(200,245,106,0.4);
          color: #c8f56a;
        }
        .slot-btn:disabled {
          opacity: 0.25;
          cursor: not-allowed;
          text-decoration: line-through;
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
        .court-btn:disabled { opacity: 0.3; cursor: not-allowed; }

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

        /* Mobile: make date input full width */
        input[type="date"].field { color-scheme: dark; }

        /* Safe area for notched phones */
        .safe-bottom { padding-bottom: max(1.5rem, env(safe-area-inset-bottom)); }
      `}</style>

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

          {/* Step indicator */}
          <StepIndicator step={step} />

          {/* ── STEP 1: Date ── */}
          {step === 1 && (
            <div className="anim">
              <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-4">Select Date</p>
              <input
                type="date"
                min={todayStr()}
                className="field mb-4"
                value={date}
                onChange={e => setDate(e.target.value)}
              />
              {date && (
                <div className="mb-6 p-4 bg-white/3 border border-white/6 rounded-xl">
                  <p className="text-[#c8f56a]/70 text-sm">{fmtDateLong(date)}</p>
                </div>
              )}
              <button className="proceed-btn w-full sm:w-auto" disabled={!date} onClick={() => setStep(2)}>
                Continue →
              </button>
            </div>
          )}

          {/* ── STEP 2: Court ── */}
          {step === 2 && (
            <div className="anim">
              <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-1">Select Court</p>
              <p className="text-white/20 text-xs mb-5">{fmtDateLong(date)}</p>

              {loadingAv ? (
                <p className="text-white/20 text-sm mb-6">Loading availability...</p>
              ) : (
                <div className="grid grid-cols-2 gap-3 mb-6">
                  {COURTS.map(c => {
                    const bookedSlots = booked.filter(b => b.court === c).length;
                    const allBooked   = bookedSlots >= TIME_SLOTS.length;
                    return (
                      <button key={c}
                        className={`court-btn ${court === c ? 'selected' : ''}`}
                        disabled={allBooked}
                        onClick={() => { setCourt(c); setTimeSlot(''); }}>
                        <div className="text-[0.55rem] tracking-widest uppercase text-white/30 mb-1">Court</div>
                        <div className="booking-display text-3xl sm:text-4xl text-white/80 mb-2">{c}</div>
                        <div className="text-[0.6rem] text-white/25">
                          {allBooked ? 'Fully booked' : `${TIME_SLOTS.length - bookedSlots} slots open`}
                        </div>
                        {court === c && (
                          <div className="mt-2 text-[0.55rem] text-[#c8f56a] tracking-widest uppercase">Selected ✓</div>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex gap-3">
                <button className="proceed-btn ghost" onClick={() => setStep(1)}>← Back</button>
                <button className="proceed-btn flex-1 sm:flex-none" disabled={!court} onClick={() => setStep(3)}>
                  Continue →
                </button>
              </div>
            </div>
          )}

          {/* ── STEP 3: Time Slot ── */}
          {step === 3 && (
            <div className="anim">
              <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-1">Select Time</p>
              <p className="text-white/20 text-xs mb-5">{fmtDateShort(date)} · Court {court}</p>

              {/* 3 cols on mobile, 4 on desktop */}
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 mb-6">
                {TIME_SLOTS.map(slot => {
                  const taken = isBooked(court!, slot);
                  return (
                    <button key={slot}
                      disabled={taken}
                      className={`slot-btn ${timeSlot === slot ? 'selected' : ''}`}
                      onClick={() => setTimeSlot(slot)}>
                      {fmtSlot(slot)}
                    </button>
                  );
                })}
              </div>

              <div className="flex gap-3 mb-3">
                <button className="proceed-btn ghost" onClick={() => setStep(2)}>← Back</button>
                <button className="proceed-btn flex-1 sm:flex-none" disabled={!timeSlot} onClick={() => setStep(4)}>
                  Continue →
                </button>
              </div>
              <p className="text-[0.65rem] text-white/15">Greyed out slots are already booked.</p>
            </div>
          )}

          {/* ── STEP 4: Details ── */}
          {step === 4 && (
            <div className="anim">
              <p className="text-[0.65rem] tracking-widest uppercase text-white/30 mb-1">Your Details</p>
              {/* Condensed summary on one line for mobile */}
              <p className="text-white/20 text-xs mb-6">
                Court {court} · {fmtDateShort(date)} · {fmtSlot(timeSlot)}
              </p>

              <div className="space-y-4 mb-6">
                {/* Name + Phone: stacked on mobile, side by side on sm+ */}
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
                  <label className="block text-[0.6rem] tracking-widest uppercase text-white/25 mb-2">Email (optional)</label>
                  <input className="field" type="email" placeholder="juan@email.com"
                    value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
                </div>

                {/* Players + Duration: always side by side, compact on mobile */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[0.6rem] tracking-widest uppercase text-white/25 mb-2">Players</label>
                    <select className="field" value={form.playerCount} onChange={e => setForm({ ...form, playerCount: e.target.value })}>
                      {[1,2,3,4,5,6].map(n => <option key={n} value={n}>{n} player{n > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[0.6rem] tracking-widest uppercase text-white/25 mb-2">Duration</label>
                    <select className="field" value={form.duration} onChange={e => setForm({ ...form, duration: e.target.value })}>
                      {[1,2,3,4,5,6,7,8].map(h => <option key={h} value={h}>{h} hr{h > 1 ? 's' : ''}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[0.6rem] tracking-widest uppercase text-white/25 mb-2">Notes (optional)</label>
                  <textarea className="field resize-none" rows={3}
                    placeholder="Any special requests..."
                    value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
                </div>
              </div>

              {/* Summary */}
              <div className="bg-white/3 border border-white/6 rounded-xl p-4 sm:p-5 mb-6">
                <p className="text-[0.6rem] tracking-widest uppercase text-white/20 mb-3">Booking Summary</p>
                <div className="space-y-2">
                  {[
                    ['Court',    `Court ${court}`],
                    ['Date',     fmtDateShort(date)],
                    ['Time',     fmtSlot(timeSlot)],
                    ['Duration', `${form.duration} hr${Number(form.duration) > 1 ? 's' : ''}`],
                    ['Players',  `${form.playerCount} pax`],
                  ].map(([label, value]) => (
                    <div key={label} className="flex justify-between items-center gap-4">
                      <span className="text-[0.6rem] tracking-widest uppercase text-white/25 shrink-0">{label}</span>
                      <span className="text-sm text-white/60 text-right">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions: stacked on mobile */}
              <div className="flex flex-col sm:flex-row gap-3">
                <button className="proceed-btn ghost order-2 sm:order-1" onClick={() => setStep(3)}>← Back</button>
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