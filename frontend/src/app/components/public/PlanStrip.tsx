import Link from 'next/link';
import { PLANS } from '@/lib/plans';
import CountUp from './CountUp';
import Reveal from './Reveal';

/** Landing page plans overview. Cards slide in from the right, one after another. */
export default function PlanStrip() {
  return (
    <>
      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mt-8">
        {PLANS.map((plan, i) => (
          <Reveal key={plan.id} dir="right" delay={i * 70} className="h-full">
            <div
              className={`h-full flex flex-col gap-3 p-6 border ${
                i === 0 ? 'border-[var(--accent-border)] bg-[var(--surface-raised)]' : 'border-[var(--divider)] bg-[var(--surface)]'
              }`}
              style={{ borderRadius: 'var(--r-block)' }}
            >
              <span className={`font-mono-data text-[0.7rem] tracking-[0.08em] uppercase ${i === 0 ? 'text-[var(--amber)]' : 'text-[var(--success)]'}`}>
                {plan.eyebrow}
              </span>
              <h3 className="font-display t-tier text-[var(--line)]">{plan.name}</h3>
              <p className="font-display t-price text-[var(--line)]">
                <CountUp value={plan.price} />
                <span className="font-sans normal-case text-[0.75rem] text-[var(--line-dim)] ml-1.5">/ month</span>
              </p>
              <p className="t-small text-[var(--line-dim)]">{plan.blurb}</p>
            </div>
          </Reveal>
        ))}
      </div>
      <Link href={`/for-courts#plans`} className="inline-block mt-7 font-extrabold text-[var(--line)] underline underline-offset-4">
        Compare plans →
      </Link>
    </>
  );
}
