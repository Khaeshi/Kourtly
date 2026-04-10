'use client';
import Link from 'next/link';
import { Search, MapPin, ArrowRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import PublicNav from '@/app/components/public/PublicNav';

interface Court {
  _id: string; name: string; slug: string; sports: string[];
  courtCount: number;
  location?: { city?: string; province?: string; address?: string };
}

const SPORT_LABELS: Record<string, string> = { badminton: 'Badminton', pickleball: 'Pickleball', tennis: 'Tennis' };
const SPORT_COLORS: Record<string, string> = {
  badminton:  'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  pickleball: 'text-amber-400 bg-amber-400/10 border-amber-400/25',
  tennis:     'text-blue-400 bg-blue-400/10 border-blue-400/25',
};

export default function CourtsPage() {
  const [courts,  setCourts]  = useState<Court[]>([]);
  const [search,  setSearch]  = useState('');
  const [sport,   setSport]   = useState('all');
  const [loading, setLoading] = useState(true);
  const mapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/public/courts')
      .then(r => r.json())
      .then(d => setCourts(Array.isArray(d) ? d : []))
      .catch(() => setCourts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.05 }
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const filtered = courts.filter(c => {
    const city = c.location?.city ?? '';
    const ms = (c.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
               city.toLowerCase().includes(search.toLowerCase());
    return ms && (sport === 'all' || (c.sports ?? []).includes(sport));
  });

  return (
    <>
      <PublicNav />

      {/* HERO — compact, no parallax */}
      <section className="relative overflow-hidden pt-[96px] pb-16 px-[clamp(1.25rem,6vw,6rem)]"
        style={{ background: 'linear-gradient(180deg, #080e1e 0%, #0b1120 100%)' }}>
        {/* Glows */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(ellipse 55% 60% at 60% 30%, rgba(59,130,246,0.12) 0%, transparent 65%)' }} />
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle,#60a5fa 1px,transparent 1px)', backgroundSize: '40px 40px' }} />

        <div className="max-w-[1200px] mx-auto relative z-[1] px-3 py-6">

          <h1 className="anim-2 font-bold text-white leading-[1.08] tracking-[-0.02em] mb-4"
            style={{ fontSize: 'clamp(2rem,5vw,3.2rem)' }}>
            Book your next<br />
            <span className="gradient-text">court session</span>
          </h1>
          <p className="anim-3 text-white/45 max-w-[460px] leading-[1.8] text-sm mb-10">
            Browse courts near you, check real-time availability, and reserve your slot — badminton, pickleball, or tennis.
          </p>

          {/* Search + filters */}
          <div className="anim-4 flex flex-wrap gap-3 items-center">
            <div className="relative flex-1 min-w-[220px] max-w-[360px]">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30" />
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Search by court name or city..."
                className="w-full pl-9 pr-4 py-3 text-[0.85rem] text-white rounded-xl outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(59,130,246,0.2)',
                }}
                onFocus={e => (e.target.style.borderColor = 'rgba(59,130,246,0.5)')}
                onBlur={e => (e.target.style.borderColor = 'rgba(59,130,246,0.2)')}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {['all', 'badminton', 'pickleball', 'tennis'].map(s => (
                <button key={s} onClick={() => setSport(s)}
                  className="px-4 py-2.5 rounded-xl text-[0.75rem] font-medium border transition-all cursor-pointer capitalize"
                  style={{
                    background:  sport === s ? 'linear-gradient(135deg,#1e3a8a,#3b82f6)' : 'transparent',
                    color:       sport === s ? '#fff' : 'rgba(255,255,255,0.45)',
                    borderColor: sport === s ? '#3b82f6' : 'rgba(59,130,246,0.18)',
                    boxShadow:   sport === s ? '0 4px 16px rgba(59,130,246,0.3)' : 'none',
                  }}>
                  {s === 'all' ? 'All Sports' : SPORT_LABELS[s]}
                </button>
              ))}
            </div>
            <button onClick={() => mapRef.current?.scrollIntoView({ behavior: 'smooth' })}
              className="flex items-center gap-2 text-[0.78rem] text-blue-400 border border-blue-500/25 rounded-xl px-4 py-2.5 bg-transparent cursor-pointer hover:bg-blue-500/8 transition-colors ml-auto">
              <MapPin size={13} /> View Map
            </button>
          </div>
        </div>
      </section>

      {/* COURT GRID */}
      <section id="courts" className="px-[clamp(1.25rem,6vw,6rem)] py-12"
        style={{ background: 'var(--pub-bg2)' }}>
        <div className="max-w-[1200px] mx-auto">

          {/* Count */}
          <div className="flex items-center justify-between mb-6">
            <p className="text-white/35 text-sm">
              {loading ? 'Loading courts...' : `${filtered.length} court${filtered.length !== 1 ? 's' : ''} found`}
            </p>
          </div>

          {loading ? (
            /* Skeleton */
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
              {[...Array(6)].map((_, i) => (
                <div key={i} className="rounded-2xl h-[200px] animate-pulse"
                  style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(59,130,246,0.08)' }} />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-24 text-center rounded-2xl"
              style={{ border: '1px dashed rgba(59,130,246,0.15)' }}>
              <p className="text-white/30 text-sm mb-2">
                {courts.length === 0 ? 'No courts registered yet.' : 'No courts match your search.'}
              </p>
              {courts.length === 0 && (
                <Link href="/register-court" className="text-blue-400 text-sm no-underline hover:underline">
                  Register your court →
                </Link>
              )}
            </div>
          ) : (
            <div className="grid gap-5" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))' }}>
              {filtered.map(court => (
                <div key={court._id} className="court-card group">
                  {/* Sport badges */}
                  <div className="flex gap-2 mb-4">
                    {(court.sports ?? []).map(s => (
                      <span key={s} className={`text-[0.6rem] font-semibold tracking-[0.08em] uppercase px-2 py-0.5 rounded-md border ${SPORT_COLORS[s] ?? 'text-white/40 bg-white/5 border-white/10'}`}>
                        {SPORT_LABELS[s] ?? s}
                      </span>
                    ))}
                  </div>

                  <h3 className="font-semibold text-white text-[1rem] mb-1.5 group-hover:text-blue-400 transition-colors">
                    {court.name}
                  </h3>

                  {(court.location?.city || court.location?.province) && (
                    <p className="text-[0.75rem] text-white/35 flex items-center gap-1.5 mb-5">
                      <MapPin size={11} />
                      {[court.location?.city, court.location?.province].filter(Boolean).join(', ')}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-3"
                    style={{ borderTop: '1px solid rgba(59,130,246,0.1)' }}>
                    <span className="text-[0.72rem] font-mono text-white/25">
                      {court.courtCount} court{court.courtCount !== 1 ? 's' : ''}
                    </span>
                    <Link href={`/book/${court.slug}`}
                      className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-blue-400 no-underline hover:gap-2.5 transition-all">
                      Book now <ArrowRight size={13} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* MAP */}
      <section id="map" ref={mapRef} className="px-[clamp(1.25rem,6vw,6rem)] py-14"
        style={{ background: 'var(--pub-bg)' }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="reveal mb-8">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase font-medium mb-3 text-blue-400">Locations</p>
            <h2 className="font-bold text-white tracking-[-0.015em]" style={{ fontSize: 'clamp(1.6rem,3vw,2.4rem)' }}>
              Find Courts Near You
            </h2>
            <div className="divider-line" />
          </div>
          <div className="reveal w-full rounded-2xl overflow-hidden flex items-center justify-center"
            style={{ height: '380px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(59,130,246,0.12)' }}>
            <div className="text-center">
              <MapPin size={36} className="mx-auto mb-3 opacity-20 text-white/25" />
              <p className="text-sm text-white/25">Map integration coming soon</p>
              <p className="text-[0.72rem] mt-1 text-white/15">Google Maps embed will appear here</p>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER — simple one-liner */}
      <footer className="px-[clamp(1.25rem,6vw,6rem)] py-6 border-t border-blue-500/10"
        style={{ background: 'var(--pub-bg)' }}>
        <div className="max-w-[1200px] mx-auto flex justify-between items-center flex-wrap gap-4">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-500">
              <span className="text-white text-[10px] font-bold">P</span>
            </div>
            <span className="text-[0.82rem] text-white/40">PlayKou</span>
          </Link>
          <p className="text-[0.7rem] text-white/15">Court booking platform — Philippines</p>
          <Link href="/for-courts" className="text-[0.72rem] text-white/25 no-underline hover:text-blue-400 transition-colors">
            Own a court? →
          </Link>
        </div>
      </footer>
    </>
  );
}