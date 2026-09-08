'use client';
import Link from 'next/link';
import PublicNav from '@/app/components/public/PublicNav';
import SectionHead from '@/app/components/public/SectionHead';
import Timeline from '@/app/components/public/Timeline';
import AsymmetricFeaturePanel from '@/app/components/public/AsymmetricFeaturePanel';
import FactRow from '@/app/components/public/FactRow';
import PublicFooter from '@/app/components/public/PublicFooter';

const ONBOARDING_STEPS = [
  {
    title: 'Register your court',
    description: 'Fill in your court name, location, and sport type. Takes under 3 minutes.',
  },
  {
    title: 'Set up your schedule',
    description: 'Configure open hours, court count, and pricing per your needs.',
  },
  {
    title: 'Go live',
    description: 'Your court appears on the Kourtly directory. Bookings start coming in.',
  },
];

const SIDE_FEATURES = [
  {
    title: 'Smart queue system',
    description: 'Algorithm pairs players by skill tier. Everyone gets fair court time with zero paperwork.',
  },
  {
    title: 'Integrated billing',
    description: 'Track drinks, shuttlecocks, and fees per player. Clear tabs paid at end of session.',
  },
  {
    title: 'Analytics dashboard',
    description: 'Revenue charts, court utilization, peak hours, and top-selling items at a glance.',
  },
];

const FACTS = [
  {
    label: 'Pricing',
    description: '₱2,000 per month after a 14-day free trial. No credit card required to start.',
  },
  {
    label: 'Sports',
    description: 'Badminton, pickleball, and tennis supported on one platform.',
  },
  {
    label: 'Support',
    description: 'Onboarding wizard walks you through court setup, staff, and pricing in one session.',
  },
];

export default function ForCourtsPage() {
  return (
    <>
      <PublicNav alwaysVisible />

      {/* Left-aligned hero (one per page, not centered) */}
      <header className="pt-[calc(64px+clamp(2rem,5vw,3rem))] pb-0 max-[480px]:pt-[calc(56px+1.6rem)]">
        <div className="public-wrap">
          <p className="text-[0.95rem] text-[var(--line-dim)] mb-3 max-[480px]:text-[0.85rem]">
            Court management for the Philippines
          </p>
          <h1 className="font-display text-[clamp(2rem,5vw,3.5rem)] text-[var(--line)] mb-4 max-w-[16ch]">
            Run your court online
          </h1>
          <p className="text-[var(--line-dim)] text-[clamp(0.98rem,1.5vw,1.08rem)] max-w-[480px] mb-8">
            Kourtly gives your court an online presence, booking, queue management, and billing on one flat rate.
          </p>
          <Link href="/register-court" className="pub-cta pub-cta-primary">
            Start with Kourtly
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[15px] h-[15px]">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </header>

      {/* Timeline (onboarding sequence) */}
      <section className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap">
          <SectionHead
            eyebrow="Getting started"
            title="Up and running in minutes"
            description="Three steps from registration to your first booking."
          />
          <Timeline steps={ONBOARDING_STEPS} />
        </div>
      </section>

      {/* Asymmetric pricing panel */}
      <section className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap">
          <AsymmetricFeaturePanel
            pricing={{
              planName: 'Court Owner Plan',
              description: 'Everything your court needs to run online, on one flat rate.',
              price: '₱2,000',
              features: [
                'Unlimited bookings and walk-in queue',
                'Billing, tabs, and receipts',
                'Analytics dashboard',
                'Public court listing',
                '14-day free trial, no credit card',
              ],
              ctaLabel: 'Start with Kourtly',
              ctaHref: '/register-court',
            }}
            features={SIDE_FEATURES}
          />
        </div>
      </section>

      {/* Fact rows */}
      <section className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap">
          <FactRow facts={FACTS} />
        </div>
      </section>

      {/* Final CTA */}
      <div className="text-center py-[clamp(3.5rem,8vw,5.5rem)] px-6 max-[480px]:py-[2.6rem] max-[480px]:px-[1.1rem]">
        <h3 className="font-display text-[clamp(1.8rem,4vw,2.7rem)] mb-3 text-[var(--line)]">Ready to go live?</h3>
        <p className="text-[var(--line-dim)] max-w-[440px] mx-auto mb-7 text-[0.95rem]">
          Register your court today and have your booking system live within minutes. Free for the first 14 days.
        </p>
        <div className="final-ctas flex gap-3.5 justify-center flex-wrap">
          <Link href="/register-court" className="pub-cta pub-cta-primary">Start with Kourtly</Link>
          <Link href="/courts" className="pub-cta pub-cta-ghost">Find Courts</Link>
        </div>
      </div>

      <PublicFooter />
    </>
  );
}
