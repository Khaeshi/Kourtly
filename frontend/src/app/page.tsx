import Link from 'next/link';
import PublicNav from './components/public/PublicNav';
import SplitHero from './components/public/SplitHero';
import SectionHead from './components/public/SectionHead';
import Timeline from './components/public/Timeline';
import AsymmetricFeaturePanel from './components/public/AsymmetricFeaturePanel';
import FactRow from './components/public/FactRow';
import PublicFooter from './components/public/PublicFooter';

const BOOKING_STEPS = [
  {
    title: 'Search',
    description: 'Browse courts near you and check real-time availability before you leave the house.',
  },
  {
    title: 'Queue',
    description: 'Get placed by skill tier and play-count fairness, not a win-rate leaderboard.',
    chips: [
      { letter: 'A', label: 'Advanced' },
      { letter: 'B', label: 'Intermediate' },
      { letter: 'C', label: 'Casual' },
      { letter: 'D', label: 'Beginner' },
    ],
  },
  {
    title: 'Play',
    description: "Your court status updates live, even if the venue's wifi drops mid-session.",
  },
];

const OWNER_FEATURES = [
  {
    title: 'Live scheduling',
    description: 'Every booking and walk-in queue across all your courts, updated in real time.',
  },
  {
    title: 'Works offline',
    description: "Queue, billing, and receipts keep working through a dropped connection, then sync once it's back.",
  },
  {
    title: 'Onboarding wizard',
    description: 'Add a new court, staff, and pricing in one guided setup.',
  },
];

const FACTS = [
  {
    label: 'Architecture',
    description: "Multi-tenant from the ground up. Each court's data, queue, and staff stay fully isolated.",
  },
  {
    label: 'Matchmaking',
    description: 'Fairness comes from play-count rotation across skill tiers, not a competitive rating system.',
  },
  {
    label: 'Currently',
    description: 'Piloting at a live court to shape the product before a wider rollout in the Philippines.',
  },
];

export default function SplashPage() {
  return (
    <div className="public-root min-h-screen overflow-x-hidden">
      <PublicNav />

      <section className="pt-[clamp(2rem,5vw,4rem)] max-[480px]:pt-[1.6rem]">
        <div className="public-wrap">
          <p className="text-[0.95rem] text-[var(--line-dim)] mb-3.5 max-[480px]:text-[0.85rem]">
            Court booking and queueing, built for badminton
          </p>
          <h1 className="font-display text-[clamp(2.3rem,6vw,4.2rem)] text-[var(--line)] max-w-[18ch]">
            What brings <span className="text-[var(--amber)]">you</span> here?
          </h1>
          <p className="max-w-[480px] mt-5 text-[var(--line-dim)] text-[clamp(0.98rem,1.5vw,1.08rem)]">
            Choose your path, and we will take you to the right place.
          </p>
        </div>

        <SplitHero />
      </section>

      <section className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap">
          <SectionHead
            eyebrow="How a game gets played"
            title="From open app to on court"
            description="Three steps, the same as walking up to any court in person, minus the standing around."
          />
          <Timeline steps={BOOKING_STEPS} />
        </div>
      </section>

      <section className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap">
          <SectionHead
            eyebrow="Built for the owner's side"
            title="Everything the front desk used to track on paper"
          />
          <AsymmetricFeaturePanel
            pricing={{
              planName: 'Court Owner Plan',
              description: 'Everything your court needs to run online, on one flat rate.',
              price: '₱2,000',
              features: [
                'Live scheduling and walk-in queue',
                'Billing and receipts, works offline',
                'Analytics across every court you run',
                '14-day free trial, no credit card',
              ],
              ctaLabel: 'Start with Playkou',
              ctaHref: '/for-courts',
            }}
            features={OWNER_FEATURES}
          />
        </div>
      </section>

      <section className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap">
          <FactRow facts={FACTS} />
        </div>
      </section>

      <div className="text-center py-[clamp(3.5rem,8vw,5.5rem)] px-6 max-[480px]:py-[2.6rem] max-[480px]:px-[1.1rem]">
        <h3 className="font-display text-[clamp(1.8rem,4vw,2.7rem)] mb-3 text-[var(--line)]">Choose your path.</h3>
        <p className="text-[var(--line-dim)] max-w-[440px] mx-auto mb-7 text-[0.95rem]">
          Whichever side of the court you&apos;re on, Playkou takes you to the right place.
        </p>
        <div className="final-ctas flex gap-3.5 justify-center flex-wrap">
          <Link href="/usercourts" className="pub-cta pub-cta-primary">Let&apos;s get started</Link>
          <Link href="/for-courts" className="pub-cta pub-cta-ghost">Start with Playkou</Link>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
