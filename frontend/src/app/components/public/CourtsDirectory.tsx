'use client';
import Link from 'next/link';
import { Search, MapPin, ArrowRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import CourtsGlobeMap from './CourtsGlobeMap';
import type { CourtMapItem } from './CourtMapModal';

const SPORT_ORDER = ['all', 'badminton', 'pickleball', 'tennis'] as const;
type Sport = (typeof SPORT_ORDER)[number];

const SPORT_LABELS: Record<string, string> = {
  badminton: 'Badminton',
  pickleball: 'Pickleball',
  tennis: 'Tennis',
};


const SPORT_COPY: Record<Sport, { eyebrow: string; heading: string; description: string }> = {
  all: {
    eyebrow: 'Court booking and queueing, built for badminton',
    heading: 'Find courts near you',
    description:
      'Browse courts, check real-time availability, and reserve your slot. Badminton, pickleball, or tennis.',
  },
  badminton: {
    eyebrow: 'Warm courts, fast rallies',
    heading: 'Badminton courts near you',
    description: 'Real-time slots, fair queueing by skill tier, and a court reserved in under two minutes.',
  },
  pickleball: {
    eyebrow: 'Dinks, drives, and drop shots',
    heading: 'Pickleball courts near you',
    description: 'Paddle-friendly courts with open-play and reserved slots, updated in real time.',
  },
  tennis: {
    eyebrow: 'Baseline to net, booked in seconds',
    heading: 'Tennis courts near you',
    description: 'Hard and clay courts, singles or doubles, booked by the hour.',
  },
};

export default function CourtsDirectory() {
  const [courts, setCourts] = useState<CourtMapItem[]>([]);
  const [search, setSearch] = useState('');
  const [sport, setSport] = useState<Sport>('all');
  const [loading, setLoading] = useState(true);
  const [direction, setDirection] = useState<'left' | 'right'>('right');
  const prevIndexRef = useRef(0);

  useEffect(() => {
    fetch('/api/public/courts')
      .then((r) => r.json())
      .then((d) => setCourts(Array.isArray(d) ? d : []))
      .catch(() => setCourts([]))
      .finally(() => setLoading(false));
  }, []);

  const filtered = courts.filter((c) => {
    const city = c.location?.city ?? '';
    const matchesSearch =
      (c.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      city.toLowerCase().includes(search.toLowerCase());
    return matchesSearch && (sport === 'all' || (c.sports ?? []).includes(sport));
  });

  const handleSportChange = (s: Sport) => {
    const newIndex = SPORT_ORDER.indexOf(s);
    setDirection(newIndex >= prevIndexRef.current ? 'right' : 'left');
    prevIndexRef.current = newIndex;
    setSport(s);
  };

  const copy = SPORT_COPY[sport];

  return (
    <div style={{ transition: 'background-color 0.4s ease' }}>
      <style>{`
        @keyframes pkSlideInRight { from { opacity: 0; transform: translateX(28px); } to { opacity: 1; transform: translateX(0); } }
        @keyframes pkSlideInLeft { from { opacity: 0; transform: translateX(-28px); } to { opacity: 1; transform: translateX(0); } }
        .pk-slide-right { animation: pkSlideInRight 0.35s ease; }
        .pk-slide-left { animation: pkSlideInLeft 0.35s ease; }
      `}</style>

      <header className="pt-[calc(64px+clamp(2rem,5vw,3rem))] pb-0 max-[480px]:pt-[calc(56px+1.6rem)]">
        <div className="public-wrap">
          <p className="text-[0.95rem] text-[var(--line-dim)] mb-3 max-[480px]:text-[0.85rem]">{copy.eyebrow}</p>
          <h1 className="font-display text-[clamp(2rem,5vw,3.2rem)] text-[var(--line)] mb-4 max-w-[14ch]">
            {copy.heading}
          </h1>
          <p className="text-[var(--line-dim)] text-[clamp(0.98rem,1.5vw,1.08rem)] max-w-[480px] mb-8">
            {copy.description}
          </p>

          <div className="flex flex-wrap gap-3 items-center mb-8 max-[640px]:flex-col max-[640px]:items-stretch">
            <div className="relative flex-1 min-w-[220px] max-w-[360px] max-[640px]:max-w-none">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--line-faint)]" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by court name or city..."
                className="public-input pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap max-[640px]:w-full">
              {SPORT_ORDER.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => handleSportChange(s)}
                  className="px-4 py-2.5 text-[0.75rem] font-semibold border transition-all cursor-pointer capitalize whitespace-nowrap"
                  style={{
                    borderRadius: 'var(--r-pill)',
                    background: sport === s ? 'var(--amber)' : 'transparent',
                    color: sport === s ? 'var(--ink)' : 'var(--line-dim)',
                    borderColor: sport === s ? 'var(--amber)' : 'var(--divider)',
                  }}
                >
                  {s === 'all' ? 'All Sports' : SPORT_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      <section className="public-wrap pb-6 overflow-hidden">
        <p className="text-[var(--line-dim)] text-sm mb-2">
          {loading ? 'Loading courts...' : `${filtered.length} court${filtered.length !== 1 ? 's' : ''} found`}
        </p>

        <div key={sport} className={direction === 'right' ? 'pk-slide-right' : 'pk-slide-left'}>
          {loading ? (
            <div className="border-t border-[var(--divider)]">
              {[...Array(4)].map((_, i) => (
                <div key={i} className="py-5 border-b border-[var(--divider)] pk-pulse">
                  <div className="h-5 w-48 bg-white/5 mb-2" style={{ borderRadius: 'var(--r-block)' }} />
                  <div className="h-4 w-32 bg-white/5" style={{ borderRadius: 'var(--r-block)' }} />
                </div>
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div
              className="py-10 text-center border border-dashed border-[var(--divider)]"
              style={{ borderRadius: 'var(--r-block)' }}
            >
              <p className="text-[var(--line-dim)] text-sm mb-2">
                {courts.length === 0 ? 'No courts registered yet.' : 'No courts match your search.'}
              </p>
              {courts.length === 0 && (
                <Link href="/register-court" className="text-[var(--amber)] text-sm no-underline hover:opacity-80">
                  Register your court →
                </Link>
              )}
            </div>
          ) : (
            <div>
              {filtered.map((court) => (
                <Link key={court._id} href={`/book/${court.slug}`} className="court-row group">
                  <div>
                    <div className="flex gap-2 flex-wrap mb-2">
                      {(court.sports ?? []).map((s) => (
                        <span key={s} className="public-chip text-[0.7rem] py-1">
                          <strong className="text-[var(--amber)]">{SPORT_LABELS[s]?.[0] ?? s[0]?.toUpperCase()}</strong>{' '}
                          {SPORT_LABELS[s] ?? s}
                        </span>
                      ))}
                    </div>
                    <h3 className="font-bold text-[var(--line)] text-[1.05rem] mb-1 group-hover:text-[var(--amber)] transition-colors">
                      {court.name}
                    </h3>
                    {(court.location?.city || court.location?.province) && (
                      <p className="text-[0.8rem] text-[var(--line-dim)] flex items-center gap-1.5">
                        <MapPin size={11} />
                        {[court.location?.city, court.location?.province].filter(Boolean).join(', ')}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="font-mono-data text-[0.72rem] text-[var(--line-faint)] hidden sm:block">
                      {court.courtCount} court{court.courtCount !== 1 ? 's' : ''}
                    </span>
                    <span className="flex items-center gap-1.5 text-[0.8rem] font-bold text-[var(--amber)] whitespace-nowrap">
                      Book now <ArrowRight size={13} />
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Shared map instance — receives updated `filtered` props on every tab switch, never unmounts/remounts */}
      <section className="public-wrap pb-4 hidden min-[800px]:block">
        <h2 className="font-display text-[clamp(1.2rem,2.5vw,1.6rem)] text-[var(--line)] mb-1 mt-6">Court map</h2>
        <p className="text-[var(--line-dim)] text-[0.88rem] mb-4">Click a pin to view rates and book.</p>
        <CourtsGlobeMap courts={filtered} />
      </section>
    </div>
  );
}