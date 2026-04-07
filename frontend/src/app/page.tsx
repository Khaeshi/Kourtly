'use client';
import Link from 'next/link';
import Image from 'next/image';
import { User2, Search, MapPin, ChevronDown, ArrowRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { APP_NAME, API_BASE } from '@/lib/config';

interface Court {
  _id:        string;
  name:       string;
  slug:       string;
  sports:     string[];
  courtCount: number;
  location:   { city: string; province: string; address: string };
  contact:    { phone: string; facebook: string; website: string };
  isPublic:   boolean;
  subscription: { status: string };
}

const SPORT_LABELS: Record<string, string> = {
  badminton:  'Badminton',
  pickleball: 'Pickleball',
  tennis:     'Tennis',
};

const SPORT_COLORS: Record<string, string> = {
  badminton:  'text-green-400 bg-green-400/10 border-green-400/20',
  pickleball: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  tennis:     'text-blue-400 bg-blue-400/10 border-blue-400/20',
};

export default function LandingPage() {
  const [scrolled,  setScrolled]  = useState(false);
  const [scrollY,   setScrollY]   = useState(0);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [dropOpen,  setDropOpen]  = useState(false);
  const [courts,    setCourts]    = useState<Court[]>([]);
  const [search,    setSearch]    = useState('');
  const [sportFilter, setSportFilter] = useState('all');
  const dropRef  = useRef<HTMLDivElement>(null);
  const mapRef   = useRef<HTMLElement>(null);

  const { data: session, status } = useSession();
  const user       = session?.user;
  const isAdmin    = user?.role === 'admin';
  const isSuperAdmin = user?.role === 'superadmin';

  // Load public courts
// Load public courts - DEBUG VERSION
useEffect(() => {
  console.log('🔄 Fetching courts...');
  fetch('/api/public/courts')
    .then(async (r) => {
      console.log('📡 Response status:', r.status);
      const data = await r.json();
      console.log('📊 Raw data:', data);
      console.log('📊 Is array?', Array.isArray(data));
      console.log('📊 Data length:', data.length || 0);
      setCourts(Array.isArray(data) ? data : []);
    })
    .catch((err) => {
      console.error('❌ Fetch error:', err);
      setCourts([]);
    });
}, []);


useEffect(() => {
  const els = document.querySelectorAll('.reveal');
  const observer = new IntersectionObserver(
    entries => entries.forEach(e => {
      if (e.isIntersecting) e.target.classList.add('visible');
    }),
    { threshold: 0.05 }
  );
  els.forEach(el => observer.observe(el));
  return () => observer.disconnect();
}, [courts]); // re-run after courts load

  useEffect(() => {
    const onScroll = () => { setScrolled(window.scrollY > 40); setScrollY(window.scrollY); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const py = (factor: number) => ({
    transform: `translateY(${scrollY * factor}px)`,
    willChange: 'transform' as const,
  });

  const filteredCourts = courts.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase()) ||
      c.location.city.toLowerCase().includes(search.toLowerCase());
    const matchSport = sportFilter === 'all' || c.sports.includes(sportFilter);
    return matchSearch && matchSport;
  });

  const scrollToMap = () => mapRef.current?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="min-h-screen bg-[#0c1409] text-[#e8f0e4] font-[Plus_Jakarta_Sans,sans-serif]">

      {/* ── NAVBAR ── */}
      <nav className={`fixed top-0 left-0 right-0 z-[200] flex items-center justify-between px-6 py-[1.1rem] transition-all duration-300 ${
        scrolled ? 'bg-[rgba(12,20,9,0.96)] backdrop-blur-md border-b border-white/[0.06]' : 'bg-transparent'
      }`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-[26px] h-[26px] shrink-0 border-[1.5px] border-[#c8a84b] rounded-full flex items-center justify-center">
            <div className="w-[7px] h-[7px] bg-[#c8a84b] rounded-full" />
          </div>
          <span className="font-extrabold text-[clamp(0.82rem,3vw,1.05rem)] text-[#e8f0e4] tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {APP_NAME}
          </span>
        </div>

        <div className="nav-links-desktop flex gap-10 items-center">
          <a href="#courts"   className="nav-link">Courts</a>
          <a href="#pricing"  className="nav-link">Pricing</a>
          <a href="#features" className="nav-link">Features</a>

          {status === 'loading' ? (
            <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
          ) : user ? (
            <div ref={dropRef} className="relative">
              <button onClick={() => setDropOpen(o => !o)}
                className="flex items-center gap-2 p-0.5 rounded-full bg-transparent border-none cursor-pointer transition-opacity hover:opacity-80">
                {user.image ? (
                  <Image src={user.image} alt={user.name ?? ''} width={30} height={30}
                    className="rounded-full border-[1.5px] border-[rgba(200,168,75,0.5)]" />
                ) : (
                  <div className="w-[30px] h-[30px] rounded-full bg-[rgba(200,168,75,0.15)] border-[1.5px] border-[rgba(200,168,75,0.4)] flex items-center justify-center">
                    <span className="text-[0.72rem] font-semibold text-[#c8a84b]">{user.name?.[0]?.toUpperCase() ?? '?'}</span>
                  </div>
                )}
                <ChevronDown size={10} className="text-white/40" style={{ transform: dropOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
              </button>

              {dropOpen && (
                <div className="absolute top-[calc(100%+10px)] right-0 w-[210px] bg-[rgba(18,28,14,0.97)] border border-white/10 rounded-[10px] p-2 z-[300] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]">
                  <div className="px-[0.85rem] pt-[0.6rem] pb-3 border-b border-white/[0.07] mb-1.5">
                    <div className="flex items-center gap-2.5">
                      {user.image ? (
                        <Image src={user.image} alt={user.name ?? ''} width={32} height={32} className="rounded-full shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-[rgba(200,168,75,0.15)] flex items-center justify-center shrink-0">
                          <span className="text-[0.78rem] font-semibold text-[#c8a84b]">{user.name?.[0]?.toUpperCase() ?? '?'}</span>
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[0.8rem] font-semibold text-[#e8f0e4] truncate">{user.name}</p>
                        <p className="text-[0.68rem] text-[rgba(232,240,228,0.35)] truncate">{user.email}</p>
                      </div>
                    </div>
                    {(isAdmin || isSuperAdmin) && (
                      <span className="inline-block mt-2 text-[0.6rem] font-semibold tracking-[0.1em] uppercase bg-[rgba(200,168,75,0.12)] text-[#c8a84b] border border-[rgba(200,168,75,0.25)] px-2 py-0.5 rounded-[3px]">
                        {isSuperAdmin ? 'Super Admin' : 'Admin'}
                      </span>
                    )}
                  </div>

                  {isAdmin && (
                    <Link href="/admin" className="drop-item" onClick={() => setDropOpen(false)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                      </svg>
                      Admin Panel
                    </Link>
                  )}
                  {isSuperAdmin && (
                    <Link href="/superadmin" className="drop-item" onClick={() => setDropOpen(false)}>
                      <User2 size={13} />
                      Super Admin
                    </Link>
                  )}

                  <div className="h-px bg-white/[0.07] my-1.5" />
                  <button className="drop-item danger" onClick={() => { setDropOpen(false); signOut({ callbackUrl: '/' }); }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                      <polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/auth/signin"
              className="text-white/50 no-underline text-[0.8rem] tracking-[0.06em] uppercase border-l border-white/10 pl-8 transition-colors duration-200 hover:text-[#c8a84b]">
              Sign In
            </Link>
          )}
        </div>

        <button className="nav-menu-btn flex-col gap-[5px] p-1.5 bg-transparent border-none cursor-pointer shrink-0"
          onClick={() => setMenuOpen(!menuOpen)}>
          <span className={`block w-[22px] h-[1.5px] bg-[#e8f0e4] transition-all duration-300 ${menuOpen ? 'rotate-45 translate-x-[4.5px] translate-y-[4.5px]' : ''}`} />
          <span className={`block w-[22px] h-[1.5px] bg-[#e8f0e4] transition-opacity duration-300 ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`block w-[22px] h-[1.5px] bg-[#e8f0e4] transition-all duration-300 ${menuOpen ? '-rotate-45 translate-x-[4.5px] -translate-y-[4.5px]' : ''}`} />
        </button>
      </nav>

      {/* ── HERO ── */}
      <section className="min-h-screen flex flex-col items-start justify-end relative overflow-hidden"
        style={{ padding: 'clamp(7rem,14vw,10rem) clamp(1.25rem,6vw,6rem) clamp(3rem,6vw,6rem)' }}>
        <div className="parallax-layer absolute inset-0 bg-gradient-to-br from-[#0f1f0c] via-[#0c1409] to-[#080f06]" style={py(0.12)} />
        <div className="parallax-layer absolute inset-0" style={{ backgroundImage: 'radial-gradient(ellipse 80% 60% at 70% 40%, rgba(45,90,27,0.22) 0%, transparent 70%)', ...py(0.22) }} />
        <svg className="parallax-layer absolute right-0 top-0 bottom-0 w-[55%] h-[110%] opacity-[0.045]"
          style={py(0.35)} viewBox="0 0 500 600" preserveAspectRatio="xMidYMid slice">
          <rect x="50" y="50" width="400" height="500" fill="none" stroke="white" strokeWidth="1.5"/>
          <line x1="50" y1="300" x2="450" y2="300" stroke="white" strokeWidth="1.5"/>
          <line x1="250" y1="50" x2="250" y2="550" stroke="white" strokeWidth="1.5"/>
          <rect x="150" y="50" width="200" height="130" fill="none" stroke="white" strokeWidth="1"/>
          <rect x="150" y="420" width="200" height="130" fill="none" stroke="white" strokeWidth="1"/>
          <circle cx="250" cy="300" r="40" fill="none" stroke="white" strokeWidth="1"/>
        </svg>
        <div className="absolute bottom-0 left-0 right-0 h-[45%] bg-gradient-to-t from-[#0c1409]/100 to-transparent z-[1]" />

        <div className="parallax-layer relative z-[2] max-w-[560px] w-full" style={py(0.18)}>
          <div className="anim-1 flex items-center gap-3 mb-6">
            <div className="w-7 h-px bg-[#c8a84b] shrink-0" />
            <span className="text-[0.7rem] tracking-[0.2em] uppercase text-[#c8a84b] font-medium">Court Management Platform</span>
          </div>
          <h1 className="anim-2 font-extrabold leading-[1.05] tracking-[-0.03em] mb-5 text-[#e8f0e4]"
            style={{ fontSize: 'clamp(2.4rem,8vw,5.5rem)' }}>
            Where Champions<br />
            <span className="text-[#c8a84b]">Come to Play</span>
          </h1>
          <p className="anim-3 text-[rgba(232,240,228,0.55)] leading-[1.8] max-w-[420px] mb-8 font-light"
            style={{ fontSize: 'clamp(0.85rem,1.5vw,1.05rem)' }}>
            Find and book badminton, pickleball, and tennis courts near you. Smart queue, real-time availability.
          </p>
          <div className="anim-4 flex gap-3 flex-wrap">
            <a href="#courts" className="book-btn">Find a Court</a>
            <a href="#pricing" className="ghost-btn">For Court Owners</a>
          </div>
        </div>
      </section>

      {/* ── COURTS ── */}
      <section id="courts" className="bg-[#0e1a0b]" style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.25rem,6vw,6rem)' }}>
        <div className="max-w-[1200px] mx-auto">

          {/* Section header */}
          <div className="reveal mb-10">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase text-[#c8a84b] mb-3">Directory</p>
            <div className="flex items-end justify-between flex-wrap gap-4">
              <h2 className="font-semibold text-[#e8f0e4] tracking-[-0.01em]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)' }}>
                Find Your Court
              </h2>
              <button onClick={scrollToMap}
                className="flex items-center gap-2 text-[0.78rem] text-[#c8a84b] border border-[rgba(200,168,75,0.3)] rounded-md px-3.5 py-2 bg-transparent cursor-pointer hover:bg-[rgba(200,168,75,0.08)] transition-colors">
                <MapPin size={13} />
                View on Map
              </button>
            </div>
            <div className="divider-line" />
          </div>

          {/* Search + filter */}
          <div className="reveal flex flex-wrap gap-3 mb-8">
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or city..."
                className="w-full bg-white/[0.05] border border-white/10 rounded-md pl-9 pr-4 py-2.5 text-[0.82rem] text-[#e8f0e4] placeholder-white/25 outline-none focus:border-[rgba(200,168,75,0.4)] transition-colors"
              />
            </div>
            <div className="flex gap-2">
              {['all', 'badminton', 'pickleball', 'tennis'].map(s => (
                <button key={s} onClick={() => setSportFilter(s)}
                  className={`px-3.5 py-2 rounded-md text-[0.72rem] font-medium border transition-colors cursor-pointer capitalize ${
                    sportFilter === s
                      ? 'bg-[#c8a84b] text-[#0c1409] border-[#c8a84b]'
                      : 'bg-transparent text-white/50 border-white/10 hover:border-white/20'
                  }`}>
                  {s === 'all' ? 'All Sports' : SPORT_LABELS[s]}
                </button>
              ))}
            </div>
          </div>

          {/* Court cards */}
          {filteredCourts.length === 0 ? (
            <div className="reveal py-20 text-center text-white/30 text-sm border border-white/[0.06] rounded-xl">
              {courts.length === 0 ? 'No courts available yet.' : 'No courts match your search.'}
            </div>
          ) : (
            <div className="reveal grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
              {filteredCourts.map(court => (
                <div key={court._id}
                  className="group bg-[rgba(255,255,255,0.03)] border border-white/[0.07] rounded-xl p-5 hover:border-[rgba(200,168,75,0.25)] hover:bg-[rgba(200,168,75,0.04)] transition-all duration-300 cursor-pointer">

                  {/* Sports badges */}
                  <div className="flex gap-1.5 mb-4">
                    {court.sports.map(s => (
                      <span key={s} className={`text-[0.6rem] font-semibold tracking-[0.08em] uppercase px-2 py-0.5 rounded-[3px] border ${SPORT_COLORS[s] ?? 'text-white/40 bg-white/5 border-white/10'}`}>
                        {SPORT_LABELS[s] ?? s}
                      </span>
                    ))}
                  </div>

                  <h3 className="font-semibold text-[#e8f0e4] text-[1rem] mb-1 group-hover:text-[#c8a84b] transition-colors">
                    {court.name}
                  </h3>

                  {(court.location.city || court.location.province) && (
                    <p className="text-[0.75rem] text-white/35 flex items-center gap-1.5 mb-4">
                      <MapPin size={11} />
                      {[court.location.city, court.location.province].filter(Boolean).join(', ')}
                    </p>
                  )}

                  <div className="flex items-center justify-between pt-3 border-t border-white/[0.06]">
                    <span className="text-[0.72rem] text-white/30 font-mono">{court.courtCount} court{court.courtCount !== 1 ? 's' : ''}</span>
                    <Link href={`/book/${court.slug}`}
                      className="flex items-center gap-1.5 text-[0.72rem] text-[#c8a84b] no-underline font-medium hover:gap-2.5 transition-all">
                      Book now <ArrowRight size={12} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── MAP ── */}
      <section ref={mapRef} id="map" className="bg-[#0c1409]" style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.25rem,6vw,6rem)' }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="reveal mb-8">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase text-[#c8a84b] mb-3">Locations</p>
            <h2 className="font-semibold text-[#e8f0e4] tracking-[-0.01em]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)' }}>
              Find Us on the Map
            </h2>
            <div className="divider-line" />
          </div>
          <div className="reveal w-full rounded-xl overflow-hidden border border-white/[0.07] bg-white/[0.03] flex items-center justify-center" style={{ height: '400px' }}>
            <div className="text-center text-white/20">
              <MapPin size={32} className="mx-auto mb-3 opacity-30" />
              <p className="text-sm">Map integration coming soon</p>
              <p className="text-[0.72rem] mt-1 opacity-60">Google Maps embed will appear here</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── PROMOTIONS ── */}
      <section id="promotions" className="bg-[#0e1a0b]" style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.25rem,6vw,6rem)' }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="reveal mb-8">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase text-[#c8a84b] mb-3">Promotions</p>
            <h2 className="font-semibold text-[#e8f0e4] tracking-[-0.01em]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)' }}>
              Active Deals
            </h2>
            <div className="divider-line" />
          </div>

          {/* Promotion slots — 3 placeholders */}
          <div className="reveal grid gap-4 grid-cols-1 sm:grid-cols-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="relative border border-dashed border-white/[0.12] rounded-xl p-6 min-h-[180px] flex flex-col justify-between bg-white/[0.02]">
                <div className="absolute top-3 right-3 text-[0.6rem] text-white/20 uppercase tracking-widest">Slot {i}</div>
                <div>
                  <div className="w-8 h-px bg-[#c8a84b]/30 mb-4" />
                  <div className="h-3 w-3/4 bg-white/[0.06] rounded mb-2" />
                  <div className="h-3 w-1/2 bg-white/[0.04] rounded mb-2" />
                  <div className="h-3 w-2/3 bg-white/[0.04] rounded" />
                </div>
                <div className="text-[0.68rem] text-white/15 italic mt-4">Available for promotion</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="bg-[#0c1409] relative overflow-hidden" style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.25rem,6vw,6rem)' }}>
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(45,90,27,0.10) 0%, transparent 70%)' }} />
        <div className="max-w-[1200px] mx-auto relative z-[1]">
          <div className="reveal mb-12 text-center">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase text-[#c8a84b] mb-3">For Court Owners</p>
            <h2 className="font-semibold text-[#e8f0e4] tracking-[-0.01em]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)' }}>
              Simple, Transparent Pricing
            </h2>
            <div className="w-12 h-px bg-[#c8a84b] mx-auto mt-5" />
          </div>

          <div className="reveal grid gap-6 grid-cols-1 sm:grid-cols-2 max-w-[800px] mx-auto">

            {/* Monthly */}
            <div className="bg-white/[0.03] border border-white/[0.08] rounded-2xl p-8">
              <p className="text-[0.72rem] tracking-[0.15em] uppercase text-white/40 mb-4">Monthly</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-[2.8rem] font-extrabold text-[#e8f0e4] leading-none">₱2,000</span>
                <span className="text-white/30 text-sm mb-1">/month</span>
              </div>
              <p className="text-[0.78rem] text-white/30 mb-8">Billed monthly. Cancel anytime.</p>
              <ul className="flex flex-col gap-3 mb-8">
                {[
                  'Unlimited bookings',
                  'Queue management',
                  'Billing & tabs',
                  'Analytics dashboard',
                  'Public court listing',
                  '14-day free trial',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-[0.82rem] text-white/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c8a84b] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth/signin"
                className="block text-center ghost-btn no-underline text-[0.82rem] py-2.5">
                Start Free Trial
              </Link>
            </div>

            {/* Annual — featured */}
            <div className="bg-[rgba(200,168,75,0.07)] border border-[rgba(200,168,75,0.3)] rounded-2xl p-8 relative">
              <div className="absolute top-4 right-4 text-[0.6rem] font-bold tracking-[0.1em] uppercase bg-[#c8a84b] text-[#0c1409] px-2.5 py-1 rounded-full">
                Best Value
              </div>
              <p className="text-[0.72rem] tracking-[0.15em] uppercase text-[#c8a84b] mb-4">Annual</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-[2.8rem] font-extrabold text-[#e8f0e4] leading-none">₱20,000</span>
                <span className="text-white/30 text-sm mb-1">/year</span>
              </div>
              <p className="text-[0.78rem] text-[#c8a84b]/60 mb-8">Save ₱4,000 vs monthly billing.</p>
              <ul className="flex flex-col gap-3 mb-8">
                {[
                  'Everything in Monthly',
                  'Priority support',
                  'Early access to features',
                  'Promotional slot (1/yr)',
                  'Custom court page URL',
                  '14-day free trial',
                ].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-[0.82rem] text-white/60">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#c8a84b] shrink-0" />
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth/signin"
                className="block text-center book-btn no-underline text-[0.82rem] py-2.5">
                Start Free Trial
              </Link>
            </div>
          </div>

          <p className="reveal text-center text-[0.72rem] text-white/20 mt-8">
            All plans include a 14-day free trial. No credit card required.
          </p>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="bg-[#0e1a0b]" style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.25rem,6vw,6rem)' }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="reveal mb-12">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase text-[#c8a84b] mb-4">The Platform</p>
            <h2 className="font-semibold text-[#e8f0e4] tracking-[-0.01em]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)' }}>
              Everything Your Court Needs
            </h2>
            <div className="divider-line" />
          </div>
          <div className="features-grid reveal reveal-delay-1 grid grid-cols-3 gap-px bg-white/[0.05]">
            {[
              { label: '01', title: 'Smart Queue System', desc: 'Algorithm pairs players by skill tier. Everyone gets fair court time with minimal downtime between games.' },
              { label: '02', title: 'Real-time Reservations', desc: 'Online booking with live availability. Admins confirm, guests get email confirmations automatically.' },
              { label: '03', title: 'Integrated Billing', desc: 'Track drinks, shuttlecocks, and fees per player. Clear tabs, flexible pricing, paid at end of session.' },
            ].map(f => (
              <div key={f.label} className="feature-card bg-[#0e1a0b]">
                <div className="text-[0.85rem] text-[#c8a84b] tracking-[0.1em] mb-5 font-semibold">{f.label}</div>
                <h3 className="font-semibold text-[#e8f0e4] mb-4 leading-[1.3]" style={{ fontSize: 'clamp(1.1rem,2vw,1.4rem)' }}>{f.title}</h3>
                <p className="text-[0.85rem] text-[rgba(232,240,228,0.45)] leading-[1.8] font-light">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="flex justify-between items-center flex-wrap gap-4 border-t border-white/[0.06] bg-[#0c1409]"
        style={{ padding: '2.5rem clamp(1.25rem,6vw,6rem)' }}>
        <div className="flex items-center gap-2.5">
          <div className="w-5 h-5 border border-[rgba(200,168,75,0.4)] rounded-full flex items-center justify-center shrink-0">
            <div className="w-1.5 h-1.5 bg-[#c8a84b] rounded-full" />
          </div>
          <span className="text-[0.9rem] text-[rgba(232,240,228,0.5)]">{APP_NAME}</span>
        </div>
        <p className="text-[0.72rem] text-[rgba(232,240,228,0.2)] tracking-[0.05em]">
          Court Management Platform — Built for the Philippines
        </p>
        <Link href="/auth/signin"
          className="text-[0.72rem] text-[rgba(232,240,228,0.25)] no-underline tracking-[0.08em] uppercase transition-colors duration-200 hover:text-[#c8a84b]">
          Staff Login
        </Link>
      </footer>
    </div>
  );
}