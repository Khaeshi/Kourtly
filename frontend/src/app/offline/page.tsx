import Link from 'next/link';

export default function OfflinePage() {
  return (
    <div className="public-root min-h-screen flex items-center justify-center p-6">
      <div className="public-card max-w-md w-full p-8 text-center">
        <h1 className="text-2xl font-semibold text-white mb-3">You are offline</h1>
        <p className="text-sm text-white/60 mb-6">
          Cached pages are still available. Reconnect to continue live booking and availability checks.
        </p>
        <Link href="/" className="inline-block px-5 py-2.5 rounded-lg bg-[var(--public-accent)] text-[#0b1120] no-underline font-semibold">
          Back to Home
        </Link>
      </div>
    </div>
  );
}
