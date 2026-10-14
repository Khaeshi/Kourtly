import Link from 'next/link';

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[15px] h-[15px]">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

function ShuttleIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-full h-full">
      <path d="M12 2L9 9L2 12L9 15L12 22L15 15L22 12L15 9L12 2Z" fill="var(--accent)" />
    </svg>
  );
}

/**
 * The text column is a fixed width: 40% of the hero (the narrowest a side ever gets) minus both paddings.
 * Because that width never changes, the copy never re-wraps and the box never changes height while the
 * columns expand and shrink. Only the panels, the divider and the shuttle move.
 */
const COPY = 'flex flex-col gap-4 min-[800px]:w-[calc(40cqw-2*clamp(2rem,4vw,2.8rem))]';

export default function SplitHero() {
  return (
    <div className="max-w-[1180px] mx-auto mt-[2.6rem] px-[clamp(1rem,4vw,2rem)] max-[480px]:mt-8 max-[480px]:px-[0.9rem]">
      <div
        className="relative grid grid-cols-1 overflow-hidden border border-[var(--divider)]
          [--split:50%]
          min-[800px]:[container-type:inline-size]
          min-[800px]:grid-cols-[1fr_1fr]
          min-[800px]:transition-[grid-template-columns] min-[800px]:duration-[450ms] min-[800px]:ease-[cubic-bezier(.23,1,.32,1)]
          min-[800px]:has-[.side-player:hover]:grid-cols-[1.2fr_.8fr] min-[800px]:has-[.side-player:hover]:[--split:60%]
          min-[800px]:has-[.side-owner:hover]:grid-cols-[.8fr_1.2fr] min-[800px]:has-[.side-owner:hover]:[--split:40%]"
        style={{ borderRadius: 'var(--r-block)' }}
      >
        {/* Net divider */}
        <div
          className="hidden min-[800px]:block absolute top-0 bottom-0 left-[var(--split)] w-[2px] -translate-x-1/2 z-[5]
          transition-[left] duration-[450ms] ease-[cubic-bezier(.23,1,.32,1)]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, color-mix(in srgb, var(--line) 50%, transparent) 0, color-mix(in srgb, var(--line) 50%, transparent) 8px, transparent 8px, transparent 16px)',
          }}
          aria-hidden="true"
        />
        {/* Shuttlecock */}
        <div
          className="hidden min-[800px]:block absolute top-0 left-[var(--split)] w-4 h-4 -translate-x-1/2 -translate-y-1/2 z-[6] shuttle-animate
          transition-[left] duration-[850ms] ease-[cubic-bezier(.23,1,.32,1)]"
          style={{ filter: 'drop-shadow(0 0 6px color-mix(in srgb, var(--accent) 60%, transparent))' }}
          aria-hidden="true"
        >
          <ShuttleIcon />
        </div>

        {/* Player side */}
        <div
          className="side-player relative p-[clamp(2rem,4vw,2.8rem)] max-[480px]:p-[1.6rem_1.4rem]"
          style={{ background: 'linear-gradient(160deg, var(--surface-raised), var(--surface))' }}
        >
          <div className={COPY}>
            <span className="text-[0.85rem] font-bold text-[var(--success)]">For Players</span>
            <h2 className="font-display t-h3 text-[var(--line)]">
              Find courts near you.<br />Book now.
            </h2>
            <p className="text-[var(--line-dim)] t-body">
              Check real-time availability and reserve your slot in under 2 minutes. No app needed.
            </p>
            <Link href="/usercourts" className="pub-cta pub-cta-primary mt-1">
              Find a court
              <ArrowIcon />
            </Link>
            <p className="text-[0.85rem] text-[var(--line-dim)] mt-1">
              Real-time slots · Badminton, pickleball, tennis · Instant booking
            </p>
          </div>
        </div>

        {/* Owner side (paper) */}
        <div className="side-owner public-paper relative p-[clamp(2rem,4vw,2.8rem)] max-[480px]:p-[1.6rem_1.4rem]">
          <div className={COPY}>
            <span className="text-[0.85rem] font-bold text-[var(--accent)]">For Court Owners</span>
            <h2 className="font-display t-h3 text-[var(--line)]">
              Run your court.<br />Online.
            </h2>
            <p className="text-[var(--line-dim)] t-body">
              Bookings, queues, billing, and analytics in one place. Start with a 14-day free trial, no credit card needed.
            </p>
            <Link href="/for-courts" className="pub-cta pub-cta-ink mt-1">
              List your court
              <ArrowIcon />
            </Link>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
              <span className="font-display text-[2.2rem] text-[var(--line)]">₱2,000</span>
              <span className="text-[0.85rem] text-[var(--line-dim)]">per month, Basic plan</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}