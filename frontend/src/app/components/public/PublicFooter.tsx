import Link from 'next/link';
import { BUSINESS_INFO, LEGAL_LINKS } from '@/lib/business-info';

interface PublicFooterProps {
  /** Tighter footer for content-heavy pages (courts directory, etc.) */
  compact?: boolean;
}

const DETAILS = [
  { label: 'Registered name', value: BUSINESS_INFO.registeredName },
  { label: 'Trade name', value: BUSINESS_INFO.tradeName },
  { label: 'Registration', value: `${BUSINESS_INFO.registration} · ${BUSINESS_INFO.birTin}` },
  { label: 'Address and contact', value: `${BUSINESS_INFO.address} · ${BUSINESS_INFO.phone} · ${BUSINESS_INFO.email}` },
];

export default function PublicFooter({ compact = false }: PublicFooterProps) {
  return (
    <footer className="px-[clamp(1.25rem,5vw,3rem)] pt-4">
      {!compact && (
        <div className="max-w-[1180px] mx-auto pt-[clamp(2.75rem,6vw,4rem)] pb-[clamp(2rem,4vw,2.75rem)] flex justify-between items-start flex-wrap gap-10">
          <div className="max-w-[420px]">
            <img src="/brand/logo/kourtly-logo-on-dark.svg" alt="Kourtly" width={160} height={60} className="w-[160px] h-auto object-contain mb-7" />
            <p className="font-display t-h2 text-[var(--line)]">
              More bookings.
              <br />
              Manage less.
            </p>
            <p className="mt-4 max-w-[320px] text-[0.82rem] leading-[1.6] text-[var(--line-faint)]">
              Court management made simpler for badminton, tennis, and pickleball communities.
            </p>
          </div>

          <nav aria-label="Footer navigation" className="flex gap-12 text-[0.8rem] max-[480px]:gap-8">
            <div className="flex flex-col gap-3">
              <span className="text-[0.68rem] uppercase tracking-[0.14em] text-[var(--line-faint)]">Players</span>
              <Link href="/courts" className="text-[var(--line-dim)] transition-colors hover:text-[var(--line)]">Find Courts</Link>
              <Link href="/auth/signin" className="text-[var(--line-dim)] transition-colors hover:text-[var(--line)]">Sign in</Link>
            </div>
            <div className="flex flex-col gap-3">
              <span className="text-[0.68rem] uppercase tracking-[0.14em] text-[var(--line-faint)]">Owners</span>
              <Link href="/for-courts" className="text-[var(--line-dim)] transition-colors hover:text-[var(--line)]">Court Owners</Link>
              <Link href="/for-courts#plans" className="text-[var(--line-dim)] transition-colors hover:text-[var(--line)]">Plans</Link>
            </div>
          </nav>
        </div>
      )}

      {!compact && (
        <div className="max-w-[1180px] mx-auto border-t border-[var(--divider)] pt-6 pb-2">
          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-[var(--line-faint)] mb-3">Business information</p>
          <dl className="grid gap-x-8 gap-y-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 text-[0.78rem] leading-[1.6] text-[var(--line-dim)]">
            {DETAILS.map((d) => (
              <div key={d.label}>
                <dt className="font-bold text-[var(--line)]">{d.label}</dt>
                <dd className="m-0">{d.value}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      <div
        className={`max-w-[1180px] mx-auto border-t border-[var(--divider)] flex justify-between items-center flex-wrap text-[var(--line-dim)] max-[480px]:flex-col max-[480px]:items-start ${
          compact ? 'py-2 gap-1.5 text-[0.72rem] max-[480px]:gap-0.5' : 'py-5 gap-3 text-[0.78rem] max-[480px]:gap-1'
        }`}
      >
        <div>
          &copy; {new Date().getFullYear()} {BUSINESS_INFO.registeredName}
        </div>
        <nav aria-label="Legal" className="flex flex-wrap gap-x-4 gap-y-1">
          {LEGAL_LINKS.map((l) => (
            <Link key={l.href} href={l.href} className="hover:text-[var(--line)] transition-colors">
              {l.label}
            </Link>
          ))}
          <span className={compact ? 'text-[var(--line-faint)]' : undefined}>Philippines</span>
        </nav>
      </div>
    </footer>
  );
}
