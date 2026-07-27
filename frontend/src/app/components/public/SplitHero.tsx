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
      <path d="M12 2L9 9L2 12L9 15L12 22L15 15L22 12L15 9L12 2Z" fill="#E8A33D" />
    </svg>
  );
}

export default function SplitHero() {
  return (
    <div className="max-w-[1180px] mx-auto mt-[2.6rem] px-[clamp(1rem,4vw,2rem)] max-[480px]:mt-8 max-[480px]:px-[0.9rem]">
      <div
        className="relative grid grid-cols-1 min-[800px]:grid-cols-2 overflow-hidden border border-[var(--divider)]"
        style={{ borderRadius: 'var(--r-block)' }}
      >
        {/* Net divider */}
        <div
          className="hidden min-[800px]:block absolute top-0 bottom-0 left-1/2 w-[2px] -translate-x-1/2 z-[5]"
          style={{
            backgroundImage:
              'repeating-linear-gradient(to bottom, rgba(245,241,232,0.5) 0, rgba(245,241,232,0.5) 8px, transparent 8px, transparent 16px)',
          }}
          aria-hidden="true"
        />
        {/* Shuttlecock */}
        <div
          className="hidden min-[800px]:block absolute top-0 left-1/2 w-4 h-4 -translate-x-1/2 -translate-y-1/2 z-[6] shuttle-animate"
          style={{ filter: 'drop-shadow(0 0 6px rgba(232,163,61,0.6))' }}
          aria-hidden="true"
        >
          <ShuttleIcon />
        </div>

        {/* Player side */}
        <div
          className="relative flex flex-col gap-4 p-[clamp(2rem,4vw,2.8rem)] max-[480px]:p-[1.6rem_1.4rem]"
          style={{ background: 'linear-gradient(160deg, var(--teal-light), var(--teal-mid))' }}
        >
          <span className="text-[0.85rem] font-bold text-[var(--line-dim)]">For Players</span>
          <h2 className="font-display text-[clamp(1.5rem,3vw,1.95rem)] text-[var(--line)]">
            Find courts near you.<br />Book now.
          </h2>
          <p className="text-[var(--line-dim)] text-[0.95rem] max-w-[36ch] max-[480px]:max-w-none">
            Browse courts, check real-time availability, and reserve your slot in under 2 minutes. No app needed.
          </p>
          <Link href="/usercourts" className="pub-cta pub-cta-primary mt-1">
            Let&apos;s get started
            <ArrowIcon />
          </Link>
          <div className="flex gap-5 flex-wrap mt-1 max-[480px]:gap-4">
            <div className="text-[0.78rem] text-[var(--line-dim)]">
              <strong className="block text-[var(--line)] text-base">Real-time</strong>slots
            </div>
            <div className="text-[0.78rem] text-[var(--line-dim)]">
              <strong className="block text-[var(--line)] text-base">Multiple</strong>sports
            </div>
            <div className="text-[0.78rem] text-[var(--line-dim)]">
              <strong className="block text-[var(--line)] text-base">Instant</strong>booking
            </div>
          </div>
        </div>

        {/* Owner side */}
        <div
          className="relative flex flex-col gap-4 p-[clamp(2rem,4vw,2.8rem)] max-[480px]:p-[1.6rem_1.4rem]"
          style={{ background: 'linear-gradient(160deg, #14201d, #0d1613)' }}
        >
          <span className="text-[0.85rem] font-bold text-[var(--line-dim)]">For Court Owners</span>
          <h2 className="font-display text-[clamp(1.5rem,3vw,1.95rem)] text-[var(--line)]">
            Run your court.<br />Online.
          </h2>
          <p className="text-[var(--line-dim)] text-[0.95rem] max-w-[36ch] max-[480px]:max-w-none">
            Manage bookings, queues, billing, and analytics. Start with a 14-day free trial, no credit card needed.
          </p>
          <Link href="/for-courts" className="pub-cta pub-cta-ghost mt-1">
            Start with Playkou
            <ArrowIcon />
          </Link>
          <div className="flex gap-5 flex-wrap mt-1 max-[480px]:gap-4">
            <div className="text-[0.78rem] text-[var(--line-dim)]">
              <strong className="block text-[var(--line)] text-base">₱2,000</strong>per month
            </div>
            <div className="text-[0.78rem] text-[var(--line-dim)]">
              <strong className="block text-[var(--line)] text-base">14-day</strong>free trial
            </div>
            <div className="text-[0.78rem] text-[var(--line-dim)]">
              <strong className="block text-[var(--line)] text-base">Queue +</strong>billing
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
