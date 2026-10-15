import Link from 'next/link';
import PublicNav from '../components/public/PublicNav';
import SplitHero from '../components/public/SplitHero';
import SectionHead from '../components/public/SectionHead';
import Timeline from '../components/public/Timeline';
import FactRow from '../components/public/FactRow';
import PublicFooter from '../components/public/PublicFooter';
import ProblemSection from '../components/public/ProblemSection';
import OfferBand from '../components/public/OfferBand';
import PhonePreview from '../components/public/PhonePreview';
import PlanStrip from '../components/public/PlanStrip';
import ReviewsCarousel from '../components/public/ReviewsCarousel';
import Reveal from '../components/public/Reveal';

const BOOKING_STEPS = [
  { title: 'Search', description: 'Browse courts near you and check real-time availability before you leave the house.' },
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
  { title: 'Play', description: "Your court status updates live, even if the venue's wifi drops mid-session." },
];

const FACTS = [
  { label: 'Architecture', description: "Multi-tenant from the ground up. Each court's data, queue, and staff stay fully isolated." },
  { label: 'Matchmaking', description: 'Fairness comes from play-count rotation across skill tiers, not a competitive rating system.' },
  { label: 'Currently', description: 'Piloting at a live court to shape the product before a wider rollout in the Philippines.' },
];

export default function SplashPage() {
  return (
    <div className="public-root type-proto min-h-screen">
      <PublicNav />

      <section className="pt-[clamp(2rem,5vw,4rem)] max-[480px]:pt-[1.6rem]">
        <div className="public-wrap">
          <p className="text-[var(--line-dim)] mb-3.5 t-eyebrow">
            Court booking and queueing · Philippines
          </p>
          <h1 className="font-display t-display text-[var(--line)] max-w-[18ch]">
            What brings <span className="text-[var(--amber)]">you</span> here?
          </h1>
          <p className="max-w-[480px] mt-5 text-[var(--line-dim)] t-lead">
            Choose your path, and we will take you to the right place.
          </p>
        </div>
        <SplitHero />
      </section>

      <div className="mt-[clamp(2.5rem,5vw,4rem)]">
        <OfferBand />
      </div>

      <ProblemSection />

      <section className="public-paper py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap grid gap-12 md:grid-cols-[1fr_340px] items-center">
          <div>
            <SectionHead
              eyebrow="How a game gets played"
              title="From open app to on court"
              description="Three steps, the same as walking up to any court in person, minus the standing around."
            />
            <Timeline steps={BOOKING_STEPS} />
          </div>
          <Reveal dir="right">
            <PhonePreview />
          </Reveal>
        </div>
      </section>

      <section id="plans" className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap">
          <SectionHead
            eyebrow="For court owners"
            title="Start small. Add layers as your court gets busier."
            description="Every plan includes the dashboard. 14-day Basic trial, no credit card."
          />
          <PlanStrip />
        </div>
      </section>

      <section className="public-paper py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap grid gap-10 md:grid-cols-[300px_1fr] items-start">
          <div>
            <span className="eyebrow text-[0.78rem] uppercase tracking-[0.1em] font-bold text-[var(--accent)] block mb-2.5">Reviews</span>
            <h2 className="font-display t-h2 text-[var(--line)]">What players say</h2>
          </div>
          <ReviewsCarousel />
        </div>
      </section>

      <section className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
        <div className="public-wrap">
          <FactRow facts={FACTS} />
        </div>
      </section>

      <div className="text-center py-[clamp(3.5rem,8vw,5.5rem)] px-6 max-[480px]:py-[2.6rem] max-[480px]:px-[1.1rem]">
        <h3 className="font-display t-cta mb-3 text-[var(--line)]">Choose your path.</h3>
        <p className="text-[var(--line-dim)] max-w-[480px] mx-auto mb-7 t-body">
          Whichever side of the court you&apos;re on, Kourtly takes you to the right place.
        </p>
        <div className="final-ctas flex gap-3.5 justify-center flex-wrap">
          <Link href="/usercourts" className="pub-cta pub-cta-primary">Find a court</Link>
          <Link href="/for-courts" className="pub-cta pub-cta-ghost">List your court</Link>
        </div>
      </div>

      <PublicFooter />
    </div>
  );
}
