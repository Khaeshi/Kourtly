'use client';
import { useEffect, useRef, useState } from 'react';
import { peso } from './booking-utils';

/** Tweens to a new value in 400ms when it changes (instant with reduced motion). */
export function AnimatedNumber({ value, className = '' }: { value: number; className?: string }) {
  const [n, setN] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || from.current === value) {
      from.current = value;
      setN(value);
      return;
    }
    const start = from.current;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / 400);
      const v = Math.round(start + (value - start) * (1 - Math.pow(1 - p, 3)));
      from.current = v;
      setN(v);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <span className={`tabular-nums ${className}`}>{peso(n)}</span>;
}

export interface SummaryRow { label: string; value: string | null }

/** Plain-text booking summary. No box, border or background. A null value shows a muted dash. */
export default function BookingSummary({ rows, total, venue }: { rows: SummaryRow[]; total: number | null; venue?: string }) {
  const all: SummaryRow[] = venue ? [{ label: 'Venue', value: venue }, ...rows] : rows;
  return (
    <div className="px-1.5">
      <h2 className="mb-2 mt-0 text-[1.1rem] font-extrabold">Booking summary</h2>
      <dl className="m-0 flex flex-col">
        {all.map((r) => (
          <div key={r.label} className="flex justify-between gap-4 py-1.5 text-[0.95rem]">
            <dt className="text-[var(--line-dim)]">{r.label}</dt>
            <dd className={`m-0 text-right ${r.value ? 'text-[var(--line)]' : 'text-[var(--line-faint)]'}`}>{r.value ?? '—'}</dd>
          </div>
        ))}
      </dl>
      <div className="flex items-baseline justify-between pt-3">
        <span className="font-bold">Total</span>
        <AnimatedNumber value={total ?? 0} className={`font-display text-[2.25rem] ${total == null ? 'text-[var(--line-faint)]' : 'text-[var(--amber)]'}`} />
      </div>
    </div>
  );
}

/** One-line version for phones, where the summary column is hidden. */
export function SummaryLine({ parts, total }: { parts: (string | null)[]; total: number | null }) {
  const text = parts.filter(Boolean).join(' · ');
  return (
    <p className="m-0 flex flex-wrap items-baseline gap-x-3 text-[0.9rem] text-[var(--line-dim)]">
      <span>{text}</span>
      {total != null && <b className="font-extrabold text-[var(--amber)]">{peso(total)}</b>}
    </p>
  );
}
