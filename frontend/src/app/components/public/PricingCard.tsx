import React from 'react';
import Link from 'next/link';

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 shrink-0 mt-0.5 text-[var(--amber)]">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[15px] h-[15px]">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

interface PricingCardProps {
  badge?: string;
  planName: string;
  description: string;
  price: string;
  interval?: string;
  features: string[];
  ctaLabel: string;
  ctaHref: string;
  icon?: React.ReactNode;
}

export default function PricingCard({
  badge = 'Only plan, no tiers to compare',
  planName,
  description,
  price,
  interval = '/ month',
  features,
  ctaLabel,
  ctaHref,
  icon,
}: PricingCardProps) {
  return (
    <div
      className="flex flex-col justify-between gap-6 p-[clamp(1.8rem,3vw,2.4rem)] max-[480px]:p-6 border border-[var(--divider)]"
      style={{
        borderRadius: 'var(--r-block)',
        background: 'linear-gradient(180deg, rgba(255,255,255,0.035), rgba(255,255,255,0))',
      }}
    >
      <div>
        {icon ?? (
          <div
            className="w-[42px] h-[42px] flex items-center justify-center mb-4 text-[var(--amber)]"
            style={{ borderRadius: 'var(--r-pill)', background: 'rgba(232,163,61,0.14)' }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" className="w-5 h-5">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M3 9h18M8 4v2M16 4v2" />
            </svg>
          </div>
        )}
        <span
          className="inline-block font-mono-data text-[0.7rem] tracking-[0.06em] uppercase text-[var(--amber)] border border-[rgba(232,163,61,0.35)] px-[0.7rem] py-[0.28rem] mb-3.5"
          style={{ borderRadius: 'var(--r-pill)' }}
        >
          {badge}
        </span>
        <h4 className="text-[1.3rem] font-bold mb-2 text-[var(--line)]">{planName}</h4>
        <p className="text-[var(--line-dim)] text-[0.94rem] max-w-[42ch]">{description}</p>
        <div className="flex items-baseline gap-1.5 mt-4">
          <span className="font-display text-[2.4rem] text-[var(--line)] max-[480px]:text-[2rem]">{price}</span>
          <span className="text-[var(--line-dim)] text-[0.9rem]">{interval}</span>
        </div>
      </div>

      <ul className="flex flex-col gap-2.5 list-none">
        {features.map((feature) => (
          <li key={feature} className="flex items-start gap-2.5 text-[0.9rem] text-[var(--line-dim)]">
            <CheckIcon />
            {feature}
          </li>
        ))}
      </ul>

      <Link href={ctaHref} className="pub-cta pub-cta-primary self-start max-[480px]:w-full max-[480px]:justify-center">
        {ctaLabel}
        <ArrowIcon />
      </Link>
    </div>
  );
}
