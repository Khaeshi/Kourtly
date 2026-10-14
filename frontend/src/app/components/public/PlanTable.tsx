import Link from 'next/link';
import { PLANS, PLAN_MATRIX, TRIAL_NOTE, REGISTER_HREF, includes } from '@/lib/plans';
import CountUp from './CountUp';
import Reveal from './Reveal';

/** Owners pricing: one comparison table on desktop, stacked cards on phones. Both read from lib/plans.ts. */
export default function PlanTable() {
  return (
    <>
      {/* Desktop table */}
      <Reveal className="hidden md:block mt-8">
        <div className="border border-[var(--divider)] bg-[var(--surface)] overflow-hidden" style={{ borderRadius: 'var(--r-block)' }}>
          <div className="grid grid-cols-[1.7fr_repeat(4,1fr)] gap-2 items-end px-6 py-7">
            <div />
            {PLANS.map((p, i) => (
              <div key={p.id} className="text-center">
                {i === 0 && <p className="font-mono-data text-[0.7rem] tracking-[0.08em] uppercase text-[var(--amber)] mb-1.5">{p.eyebrow}</p>}
                <h3 className={`font-display text-[1.75rem] text-[var(--line)] ${i === 0 ? '' : 'mt-6'}`}>{p.name}</h3>
                <p className="font-display text-[2.125rem] text-[var(--line)] my-1.5 mb-3.5"><CountUp value={p.price} /></p>
                <Link href={REGISTER_HREF} className={`pub-cta ${i === 0 ? 'pub-cta-primary' : 'pub-cta-ghost'} text-[0.82rem] !px-4 !py-2.5`}>
                  {i === 0 ? 'Start free trial' : `Ask about ${p.name}`}
                </Link>
              </div>
            ))}
          </div>
          {PLAN_MATRIX.map((row) => (
            <div key={row.label} className="grid grid-cols-[1.7fr_repeat(4,1fr)] gap-2 items-center px-6 py-4 border-t border-[var(--divider)] text-[0.92rem]">
              <span className="font-semibold text-[var(--line)]">{row.label}</span>
              {PLANS.map((p) => (
                <span key={p.id} className="text-center font-extrabold">
                  {includes(p.id, row.from) ? (
                    <span className="text-[var(--success)]" aria-label="Included">✓</span>
                  ) : (
                    <span className="text-[var(--line-faint)]" aria-label="Not included">–</span>
                  )}
                </span>
              ))}
            </div>
          ))}
        </div>
      </Reveal>

      {/* Phone cards */}
      <div className="md:hidden mt-8 flex flex-col gap-4">
        {PLANS.map((p, i) => (
          <Reveal key={p.id} delay={i * 60}>
            <div className={`p-6 border ${i === 0 ? 'border-[var(--accent-border)] bg-[var(--surface-raised)]' : 'border-[var(--divider)] bg-[var(--surface)]'}`} style={{ borderRadius: 'var(--r-block)' }}>
              <p className="font-mono-data text-[0.7rem] tracking-[0.08em] uppercase text-[var(--amber)] mb-1.5">{p.eyebrow}</p>
              <h3 className="font-display text-[1.7rem] text-[var(--line)]">{p.name}</h3>
              <p className="font-display text-[2rem] text-[var(--line)] my-1.5"><CountUp value={p.price} /><span className="font-sans normal-case text-[0.75rem] text-[var(--line-dim)] ml-1.5">/ month</span></p>
              <ul className="list-none m-0 mt-4 mb-5 p-0 flex flex-col gap-2.5 border-t border-[var(--divider)] pt-4">
                {p.highlights.map((h) => (
                  <li key={h} className="flex gap-2.5 text-[0.88rem] text-[var(--line-dim)]"><span className="text-[var(--success)]" aria-hidden="true">✓</span>{h}</li>
                ))}
              </ul>
              <Link href={REGISTER_HREF} className={`pub-cta ${i === 0 ? 'pub-cta-primary' : 'pub-cta-ghost'} w-full justify-center`}>
                {i === 0 ? 'Start free trial' : `Ask about ${p.name}`}
              </Link>
            </div>
          </Reveal>
        ))}
      </div>

      <p className="text-[0.78rem] text-[var(--line-dim)] mt-4">{TRIAL_NOTE}</p>
    </>
  );
}
