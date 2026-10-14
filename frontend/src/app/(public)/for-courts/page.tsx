import Link from 'next/link';
import PublicNav from '@/app/components/public/PublicNav';
import SectionHead from '@/app/components/public/SectionHead';
import Timeline from '@/app/components/public/Timeline';
import PublicFooter from '@/app/components/public/PublicFooter';
import LiveCourtBoard from '@/app/components/public/LiveCourtBoard';
import OwnerFeatureList from '@/app/components/public/OwnerFeatureList';
import PlanTable from '@/app/components/public/PlanTable';
import Reveal from '@/app/components/public/Reveal';
import { REGISTER_HREF } from '@/lib/plans';

const ONBOARDING_STEPS = [
  { title: 'Register your court', description: 'Add your court name, location, and sport. Takes under 3 minutes.' },
  { title: 'Set up your schedule', description: 'Configure open hours, court count, and pricing.' },
  { title: 'Go live', description: 'Your court appears in the Kourtly directory and bookings start coming in.' },
];

const MODULES = [
  { tier: 'Basic', title: 'Reservations and schedule', text: 'Put your court online with a public listing, online reservations, and schedule blocking for maintenance or private events.' },
  { tier: 'Standard', title: 'Queue and matches', text: 'A player directory and a fair, visible walk-in queue. Players are paired by skill tier and play count, with live updates.' },
  { tier: 'Premium', title: 'Items and billing', text: 'Track shuttlecocks, drinks and rentals per player. Clear tabs at the end of a session and keep billing history. Works offline.' },
];

const FAQ = [
  { q: 'What if the wifi drops mid-session?', a: 'Queue, billing and receipts keep working, then sync once the connection is back.' },
  { q: "Is my court's data separate from others?", a: "Yes. Each court's data, queue and staff stay fully isolated." },
  { q: 'Do I need a card for the trial?', a: 'No. Every new court starts with a 14-day Basic trial, no credit card required.' },
];

export default function ForCourtsPage() {
  return (
    <div className="type-proto">
      <PublicNav alwaysVisible />

      <header className="pt-[calc(64px+clamp(2rem,5vw,3rem))] pb-[clamp(3rem,6vw,5rem)] max-[480px]:pt-[calc(56px+1.6rem)]">
        <div className="public-wrap grid grid-cols-1 md:grid-cols-[1fr_1.05fr] gap-[clamp(1.5rem,5vw,4rem)] items-center">
          <div>
            <p className="text-[var(--line-dim)] mb-3 t-eyebrow">Court management for the Philippines</p>
            <h1 className="font-display t-display text-[var(--line)] mb-4 max-w-[14ch]">
              Run the front desk from <span className="text-[var(--amber)]">one screen.</span>
            </h1>
            <p className="text-[var(--line-dim)] t-lead max-w-[520px] mb-8">
              Start with the operation you need today, then add the next layer as your court gets busier.
            </p>
            <div className="flex gap-3.5 flex-wrap items-center">
              <Link href={REGISTER_HREF} className="pub-cta pub-cta-primary">
                Start free trial
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[15px] h-[15px]"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
              </Link>
              <Link href="#plans" className="pub-cta pub-cta-ghost">See plans</Link>
            </div>
            <p className="text-[0.85rem] text-[var(--line-dim)] mt-5">14 days free · No credit card · Registration takes under 3 minutes</p>
          </div>
          <LiveCourtBoard />
        </div>
      </header>

      <section className="public-paper py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap">
          <SectionHead eyebrow="Built for the owner's side" title="Everything the front desk used to track on paper" />
          <div className="grid gap-6 md:grid-cols-3 mt-2">
            {MODULES.map((m, i) => (
              <Reveal key={m.tier} delay={i * 80}>
                <div className="border-t-[3px] border-[var(--line)] pt-5">
                  <p className="text-[0.78rem] font-bold uppercase tracking-[0.1em] text-[var(--accent)] mb-2.5">{m.tier}</p>
                  <h3 className="text-[1.3rem] font-extrabold text-[var(--line)] mb-2">{m.title}</h3>
                  <p className="text-[var(--line-dim)] leading-[1.55] m-0">{m.text}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap">
          <SectionHead
            eyebrow="Everything in your dashboard"
            title="Every feature, one expandable list"
            description="Open a feature to see how it looks. Each plan adds layers as your court gets busier."
          />
          <OwnerFeatureList />
        </div>
      </section>

      <section id="plans" className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem] scroll-mt-20">
        <div className="public-wrap">
          <SectionHead
            eyebrow="Choose your setup"
            title="The right tools for the way your court runs"
            description="Every plan includes the dashboard. Your plan decides which operational tools appear for your team."
          />
          <PlanTable />
        </div>
      </section>

      <section className="public-paper py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap grid gap-[clamp(2rem,6vw,5rem)] md:grid-cols-2">
          <div>
            <SectionHead eyebrow="Getting started" title="Up and running in minutes" description="Three steps from registration to your first booking." />
            <Timeline steps={ONBOARDING_STEPS} />
          </div>
          <div>
            <SectionHead eyebrow="Questions owners ask" title="Good to know" />
            <dl className="m-0 border-t border-[var(--divider)]">
              {FAQ.map((f) => (
                <div key={f.q} className="py-[18px] border-b border-[var(--divider)]">
                  <dt className="font-extrabold text-[var(--line)] mb-1.5">{f.q}</dt>
                  <dd className="m-0 text-[var(--line-dim)] leading-[1.55]">{f.a}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      <div className="text-center py-[clamp(3.5rem,8vw,5.5rem)] px-6 max-[480px]:py-[2.6rem] max-[480px]:px-[1.1rem]">
        <h3 className="font-display t-cta mb-3 text-[var(--line)]">Ready to go live?</h3>
        <p className="text-[var(--line-dim)] max-w-[480px] mx-auto mb-7 t-body">
          Register your court today and have your booking system live within minutes. Free for the first 14 days.
        </p>
        <div className="final-ctas flex gap-3.5 justify-center flex-wrap">
          <Link href={REGISTER_HREF} className="pub-cta pub-cta-primary">Start free trial</Link>
          <Link href="/courts" className="pub-cta pub-cta-ghost">Find Courts</Link>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
