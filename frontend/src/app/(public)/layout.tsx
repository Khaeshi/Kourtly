import { PublicPricingProvider } from '@/app/components/public/PublicPricingProvider';

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <PublicPricingProvider>
      <div className="public-root min-h-screen flex flex-col">{children}</div>
    </PublicPricingProvider>
  );
}
