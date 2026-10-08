interface PublicFooterProps {
  /** Tighter footer for content-heavy pages (courts directory, etc.) */
  compact?: boolean;
}

export default function PublicFooter({ compact = false }: PublicFooterProps) {
  return (
    <footer className="px-[clamp(1.25rem,5vw,3rem)] pt-4">
      {!compact && (
        <div className="max-w-[1180px] mx-auto pt-[clamp(2.75rem,6vw,4rem)] pb-[clamp(2.25rem,5vw,3.25rem)] flex justify-between items-start flex-wrap gap-10">
          
          {/* Brand */}
          <div className="max-w-[420px]">
            <img
              src="/brand/logo/kourtly-logo.png"
              alt="Kourtly"
              width={160}
              height={60}
              className="w-[160px] h-auto object-contain mb-7"
            />

            <p className="font-display text-[clamp(1.5rem,3.4vw,2.3rem)] text-[var(--line)] leading-[0.95]">
              More bookings.
              <br />
              Manage less.
            </p>

            <p className="mt-4 max-w-[320px] text-[0.82rem] leading-[1.6] text-[var(--line-faint)]">
              Court management made simpler for badminton, tennis, and pickleball communities.
            </p>
          </div>

          {/* Navigation */}
          <nav
            aria-label="Footer navigation"
            className="flex gap-12 text-[0.8rem] max-[480px]:gap-8"
          >
            <div className="flex flex-col gap-3">
              <span className="text-[0.68rem] uppercase tracking-[0.14em] text-[var(--line-faint)]">
                Explore
              </span>

              <a
                href="/for-courts"
                className="text-[var(--line-dim)] transition-colors hover:text-[var(--line)]"
              >
                Find Courts
              </a>

              <a
                href="/for-court-owners"
                className="text-[var(--line-dim)] transition-colors hover:text-[var(--line)]"
              >
                Court Owners
              </a>
            </div>

            <div className="flex flex-col gap-3">
              <span className="text-[0.68rem] uppercase tracking-[0.14em] text-[var(--line-faint)]">
                Account
              </span>

              <a
                href="/sign-in"
                className="text-[var(--line-dim)] transition-colors hover:text-[var(--line)]"
              >
                Sign in
              </a>
            </div>
          </nav>
        </div>
      )}

      <div
        className={`max-w-[1180px] mx-auto border-t border-[var(--divider)] flex justify-between items-center flex-wrap text-[var(--line-dim)] max-[480px]:flex-col max-[480px]:items-start ${
          compact
            ? 'py-2 gap-1.5 text-[0.72rem] max-[480px]:gap-0.5'
            : 'py-5 gap-3 text-[0.78rem] max-[480px]:gap-1'
        }`}
      >
        <div>
          &copy; {new Date().getFullYear()} Kourtly, built for court management.
        </div>

        <div className={compact ? 'text-[var(--line-faint)]' : undefined}>
          Philippines
        </div>
      </div>
    </footer>
  );
}