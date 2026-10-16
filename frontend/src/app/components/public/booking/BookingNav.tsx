'use client';
import Link from 'next/link';
import Image from 'next/image';

interface BookingNavProps {
  /** Name of the previous step, e.g. "Duration". Omit on the first step. */
  backLabel?: string;
  onBack?: () => void;
  allCourtsHref?: string;
}

/**
 * Floating bubble nav for the booking flow. Replaces PublicNav on booking pages:
 * logo, "All courts", and a Return button that goes back one step and keeps every answer.
 * Uses the nav surface tokens so the existing logo stays readable.
 */
export default function BookingNav({ backLabel, onBack, allCourtsHref = '/usercourts' }: BookingNavProps) {
  return (
    <div className="sticky top-3 z-50 flex justify-center px-3 pt-3 sm:top-4 sm:pt-4">
      <nav
        aria-label="Booking navigation"
        className="flex items-center gap-1 rounded-full border p-1.5 pl-4 sm:pl-5"
        style={{ background: 'var(--nav-bg)', borderColor: 'var(--nav-border)', boxShadow: '0 8px 24px rgba(0,0,0,0.25)' }}
      >
        <Link href="/" aria-label="Kourtly home" className="flex items-center shrink-0">
          <Image
            src="/brand/logo/kourtly-logo.svg"
            alt="Kourtly"
            width={160}
            height={60}
            priority
            style={{ width: 96, height: 'auto' }}
          />
        </Link>
        <span className="mx-1.5 h-7 w-px shrink-0 sm:mx-2" style={{ background: 'var(--nav-border)' }} aria-hidden="true" />
        <Link
          href={allCourtsHref}
          className="rounded-full px-3.5 py-2.5 text-[0.88rem] font-bold no-underline transition-colors hover:bg-black/5 sm:px-4"
          style={{ color: 'var(--nav-text)' }}
        >
          ← <span className="hidden min-[400px]:inline">All courts</span><span className="min-[400px]:hidden">Courts</span>
        </Link>
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="cursor-pointer rounded-full border-none px-3.5 py-2.5 text-[0.88rem] font-bold sm:px-4"
            style={{ background: 'var(--page-bg)', color: 'var(--line)' }}
          >
            ↶ Return{backLabel && <span className="hidden sm:inline"> · {backLabel}</span>}
          </button>
        )}
      </nav>
    </div>
  );
}
