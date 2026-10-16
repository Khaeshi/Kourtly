'use client';
import { useState } from 'react';
import { addDays, addMonths, endOfMonth, format, getDay, parseISO, startOfMonth, subMonths } from 'date-fns';

interface BookingCalendarProps {
  value: string; // yyyy-MM-dd or ''
  onChange: (d: string) => void;
  min: string; // first bookable day
  max: string; // last bookable day
  closedDow: (dow: number) => boolean; // weekdays the venue is closed (from the schedule rules)
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export default function BookingCalendar({ value, onChange, min, max, closedDow }: BookingCalendarProps) {
  const minD = parseISO(min);
  const maxD = parseISO(max);
  const [month, setMonth] = useState(() => startOfMonth(value ? parseISO(value) : minD));

  const first = startOfMonth(month);
  const lead = getDay(first);
  const count = endOfMonth(month).getDate();
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: count }, (_, i) => format(addDays(first, i), 'yyyy-MM-dd')),
  ];
  const canPrev = first > startOfMonth(minD);
  const canNext = first < startOfMonth(maxD);
  const unavailable = (d: string) => d < min || d > max || closedDow(getDay(parseISO(d)));

  // Quick picks: today, tomorrow and the next Saturday inside the window
  const tomorrow = format(addDays(minD, 1), 'yyyy-MM-dd');
  let saturday = '';
  for (let i = 0; i <= 13; i++) {
    const d = format(addDays(minD, i), 'yyyy-MM-dd');
    if (d <= max && getDay(parseISO(d)) === 6) { saturday = d; break; }
  }
  const quick = [
    { label: 'Today', d: min },
    { label: 'Tomorrow', d: tomorrow },
    ...(saturday && saturday !== min && saturday !== tomorrow ? [{ label: format(parseISO(saturday), 'EEE, MMM d'), d: saturday }] : []),
  ];

  const pick = (d: string) => {
    onChange(d);
    setMonth(startOfMonth(parseISO(d)));
  };

  return (
    <div>
      <div className="mb-5 flex flex-wrap gap-2.5">
        {quick.map((q) => {
          const off = q.d > max || unavailable(q.d);
          const on = value === q.d;
          return (
            <button
              key={q.label}
              type="button"
              disabled={off}
              aria-pressed={on}
              onClick={() => pick(q.d)}
              className="cursor-pointer rounded-full border px-4 py-2.5 text-[0.88rem] font-bold disabled:cursor-not-allowed disabled:opacity-40"
              style={on ? { background: 'var(--amber)', color: 'var(--ink)', borderColor: 'var(--amber)' } : { background: 'transparent', color: 'var(--line)', borderColor: 'var(--divider-strong)' }}
            >
              {q.label}
            </button>
          );
        })}
      </div>

      <div className="rounded-[var(--r-block)] border border-[var(--divider)] bg-[var(--surface)] p-4 sm:p-5">
        <div className="mb-3 flex items-center justify-between">
          <span className="text-[1.05rem] font-extrabold" aria-live="polite">{format(month, 'MMMM yyyy')}</span>
          <div className="flex gap-1.5">
            <button type="button" aria-label="Previous month" disabled={!canPrev} onClick={() => setMonth(subMonths(month, 1))} className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-[var(--divider-strong)] bg-transparent text-[var(--line)] disabled:cursor-not-allowed disabled:opacity-30">‹</button>
            <button type="button" aria-label="Next month" disabled={!canNext} onClick={() => setMonth(addMonths(month, 1))} className="grid h-10 w-10 cursor-pointer place-items-center rounded-full border border-[var(--divider-strong)] bg-transparent text-[var(--line)] disabled:cursor-not-allowed disabled:opacity-30">›</button>
          </div>
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {WEEKDAYS.map((w) => (
            <div key={w} className="pb-1.5 text-center text-[0.7rem] font-bold uppercase tracking-[0.08em] text-[var(--line-dim)]">{w}</div>
          ))}
          {cells.map((d, i) => {
            if (!d) return <div key={`b${i}`} />;
            const off = unavailable(d);
            const on = value === d;
            const today = d === min;
            return (
              <button
                key={d}
                type="button"
                disabled={off}
                aria-pressed={on}
                aria-label={format(parseISO(d), 'EEEE, MMMM d')}
                onClick={() => pick(d)}
                className="h-11 cursor-pointer rounded-xl border-none text-[0.95rem] font-bold disabled:cursor-not-allowed sm:h-12"
                style={{
                  background: on ? 'var(--amber)' : 'transparent',
                  color: on ? 'var(--ink)' : off ? 'var(--line-faint)' : 'var(--line)',
                  opacity: off && !on ? 0.5 : 1,
                  outline: today && !on ? '1.5px solid var(--success)' : undefined,
                  outlineOffset: -1.5,
                }}
              >
                {parseInt(d.slice(8), 10)}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
