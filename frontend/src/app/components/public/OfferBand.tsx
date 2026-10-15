import Link from 'next/link';

export default function OfferBand() {
  return (
    <section className="bg-[var(--promo)] text-[var(--ink)]">
      <div className="public-wrap flex items-center justify-between gap-x-6 gap-y-4 py-12">
        <p className="font-extrabold text-[clamp(1rem,2vw,1.25rem)] text-left">
          14 days free. No credit card. Live in minutes.
        </p>
        <Link href="/for-courts#plans" className="font-extrabold text-[0.95rem] underline underline-offset-4 shrink-0">
          See plans →
        </Link>
      </div>
    </section>
  );
}
