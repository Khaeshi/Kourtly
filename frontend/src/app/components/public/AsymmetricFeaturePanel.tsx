import PricingCard from './PricingCard';

export interface FeatureRow {
  title: string;
  description: string;
}

interface AsymmetricFeaturePanelProps {
  pricing: {
    badge?: string;
    planName: string;
    description: string;
    price: string;
    interval?: string;
    features: string[];
    ctaLabel: string;
    ctaHref: string;
  };
  features: FeatureRow[];
}

export default function AsymmetricFeaturePanel({ pricing, features }: AsymmetricFeaturePanelProps) {
  return (
    <div className="feature-grid">
      <PricingCard {...pricing} />
      <div className="flex flex-col">
        {features.map((row) => (
          <div key={row.title} className="feature-row">
            <h5 className="text-base font-bold mb-1.5 text-[var(--line)]">{row.title}</h5>
            <p className="text-[var(--line-dim)] text-[0.9rem]">{row.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
