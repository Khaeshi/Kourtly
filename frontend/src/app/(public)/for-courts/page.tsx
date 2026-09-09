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
    description: 'Start with Booking at ₱2,000 per month after a 14-day free trial. Queue and Item Tabs are available as upgrades.',
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

const TIERS = [
  {
    name: 'Basic',
    eyebrow: 'Start here',
    price: '₱2,000',
    interval: '/ month',
    description: 'Put your court online with reservations and schedule blocking.',
    features: ['Public court listing', 'Online reservations', 'Court schedule blocking', 'Admin dashboard'],
    tone: 'border-[var(--amber)]/60 bg-[rgba(232,163,61,0.08)]',
  },
  {
    name: 'Standard',
    eyebrow: 'For busy courts',
    price: 'Custom',
    interval: 'tailored pricing',
    description: 'Add player registration and a fair, visible queue for walk-ins.',
    features: ['Everything in Basic', 'Player directory', 'Queue and match generation', 'Live queue updates'],
    tone: 'border-[var(--divider)] bg-[rgba(255,255,255,0.025)]',
  },
  {
    name: 'Premium',
    eyebrow: 'For full operations',
    price: 'Custom',
    interval: 'tailored pricing',
    description: 'Run items and player tabs alongside court activity.',
    features: ['Everything in Standard', 'Item catalog', 'Player and reservation tabs', 'Billing history'],
    tone: 'border-[var(--divider)] bg-[rgba(255,255,255,0.025)]',
  },
  {
    name: 'Elite',
    eyebrow: 'For growing venues',
    price: '₱7,500',
    interval: '/ month',
    description: 'Everything in Premium, plus priority support and future advanced capabilities.',
    features: ['Everything in Premium', 'Priority support', 'Early access to new modules', 'Advanced operations roadmap'],
    tone: 'border-[var(--divider)] bg-[rgba(255,255,255,0.025)]',
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
            Start with the operation you need today, then add the next layer as your court gets busier.
          </p>
          <Link href="/register-court" className="pub-cta pub-cta-primary">
            Start with Kourtly
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[15px] h-[15px]">
              <path d="M5 12h14M13 6l6 6-6 6" />
            </svg>
          </Link>
        </div>
      </header>

      {/* Tier guide */}
      <section className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap">
          <SectionHead
            eyebrow="Choose your setup"
            title="The right tools for the way your court runs"
            description="Every tier keeps the dashboard accessible. Your subscription decides which operational tools appear for your team."
          />
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8 items-stretch">
            {TIERS.map((tier, index) => (
              <div
                key={tier.name}
                className={`flex flex-col gap-6 p-6 border ${tier.tone} ${index === 0 ? 'shadow-[0_12px_30px_rgba(0,0,0,0.14)]' : ''}`}
                style={{ borderRadius: 'var(--r-block)' }}
              >
                <div>
                  <span className="inline-block font-mono-data text-[0.68rem] tracking-[0.08em] uppercase text-[var(--amber)] border border-[rgba(232,163,61,0.35)] px-2.5 py-1 mb-4" style={{ borderRadius: 'var(--r-pill)' }}>
                    {tier.eyebrow}
                  </span>
                  <h2 className="font-display text-[1.8rem] text-[var(--line)] mb-2">{tier.name}</h2>
                  <p className="text-[var(--line-dim)] text-[0.9rem] min-h-[4.2rem]">{tier.description}</p>
                  <div className="flex items-baseline gap-2 mt-5">
                    <span className="font-display text-[2rem] text-[var(--line)]">{tier.price}</span>
                    <span className="text-[var(--line-dim)] text-[0.75rem]">{tier.interval}</span>
                  </div>
                </div>
                <ul className="flex flex-col gap-3 list-none border-t border-[var(--divider)] pt-5">
                  {tier.features.map(feature => (
                    <li key={feature} className="flex items-start gap-2.5 text-[0.88rem] text-[var(--line-dim)]">
                      <span className="text-[var(--amber)]" aria-hidden="true">✓</span>
                      {feature}
                    </li>
                  ))}
                </ul>
                <Link href="/register-court" className={`pub-cta ${index === 0 ? 'pub-cta-primary' : 'pub-cta-ghost'} mt-auto justify-center`}>
                  {index === 0 ? 'Start free trial' : 'Talk through your setup'}
                </Link>
              </div>
            ))}
          </div>
          <p className="text-[0.78rem] text-[var(--line-dim)] mt-4">All new courts start with a 14-day Basic trial. No credit card required.</p>
        </div>
      </section>

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
              planName: 'Basic tier',
              description: 'The essential foundation for putting your court online.',
              price: '₱2,000',
              features: [
                'Online reservations and public listing',
                'Schedule blocking for court owners',
                'Dashboard and court settings',
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
