'use client';
import Link from 'next/link';
import { X, MapPin } from 'lucide-react';

export interface CourtMapItem {
  _id: string;
  name: string;
  slug: string;
  sports: string[];
  courtCount: number;
  location?: {
    city?: string;
    province?: string;
    address?: string;
    coordinates?: { lat?: number | null; lng?: number | null };
  };
  settings?: { hourlyRate?: number; currency?: string };
}

const SPORT_LABELS: Record<string, string> = {
  badminton: 'Badminton',
  pickleball: 'Pickleball',
  tennis: 'Tennis',
};

interface CourtMapModalProps {
  court: CourtMapItem | null;
  onClose: () => void;
}

export default function CourtMapModal({ court, onClose }: CourtMapModalProps) {
  if (!court) return null;

  const rate = court.settings?.hourlyRate;
  const currency = court.settings?.currency ?? 'PHP';
  const locationLabel = [court.location?.city, court.location?.province].filter(Boolean).join(', ');

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="court-map-modal-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/60 border-none cursor-pointer"
        onClick={onClose}
        aria-label="Close court details"
      />
      <div
        className="relative w-full max-w-[400px] border border-[var(--divider)] p-6 shadow-2xl"
        style={{ borderRadius: 'var(--r-block)', background: 'var(--teal-mid)' }}
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-[var(--line-dim)] hover:text-[var(--line)] bg-transparent border-none cursor-pointer"
          aria-label="Close"
        >
          <X size={18} />
        </button>

        <p className="font-mono-data text-[0.7rem] uppercase tracking-[0.08em] text-[var(--amber)] mb-2">
          Court details
        </p>
        <h2 id="court-map-modal-title" className="font-bold text-[1.2rem] text-[var(--line)] mb-3 pr-8">
          {court.name}
        </h2>

        {locationLabel && (
          <p className="text-[0.85rem] text-[var(--line-dim)] flex items-center gap-1.5 mb-4">
            <MapPin size={13} />
            {locationLabel}
          </p>
        )}

        <div className="flex gap-2 flex-wrap mb-4">
          {(court.sports ?? []).map((s) => (
            <span key={s} className="public-chip text-[0.7rem]">
              <strong className="text-[var(--amber)]">{SPORT_LABELS[s]?.[0] ?? s[0]?.toUpperCase()}</strong>{' '}
              {SPORT_LABELS[s] ?? s}
            </span>
          ))}
        </div>

        <div className="border-t border-[var(--divider)] pt-4 mb-5 flex justify-between items-baseline gap-4">
          <div>
            <p className="text-[0.72rem] text-[var(--line-dim)] mb-1">Hourly rate</p>
            {rate != null ? (
              <p className="font-mono-data text-[1.4rem] text-[var(--amber)]">
                ₱{rate.toLocaleString()}
                <span className="text-[0.8rem] text-[var(--line-dim)] ml-1">/ hour</span>
              </p>
            ) : (
              <p className="text-[0.85rem] text-[var(--line-dim)]">Rates shown at booking</p>
            )}
          </div>
          <p className="font-mono-data text-[0.75rem] text-[var(--line-faint)]">
            {court.courtCount} court{court.courtCount !== 1 ? 's' : ''}
          </p>
        </div>

        <Link href={`/book/${court.slug}`} className="pub-cta pub-cta-primary w-full justify-center">
          Book now
        </Link>
      </div>
    </div>
  );
}
