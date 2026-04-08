'use client';
import Link from 'next/link';
import Image from 'next/image';
import { Search, MapPin, ChevronDown, ArrowRight } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { APP_NAME } from '@/lib/config';

interface Court {
  _id: string;
  name: string;
  slug: string;
  sports: string[];
  courtCount: number;
  location?: { city?: string; province?: string; address?: string };
  contact?: { phone?: string; facebook?: string; website?: string };
  isPublic?: boolean;
  subscription?: { status?: string };
}
const SPORT_LABELS: Record<string, string> = { badminton: 'Badminton', pickleball: 'Pickleball', tennis: 'Tennis' };
const SPORT_COLORS: Record<string, string> = {
  badminton: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/25',
  pickleball: 'text-amber-400 bg-amber-400/10 border-amber-400/25',
  tennis: 'text-blue-400 bg-blue-400/10 border-blue-400/25',
};
const FEATURES = [
  { icon: '🏆', title: 'Smart Queue System', desc: 'Algorithm pairs players by skill tier with fair court time.' },
  { icon: '📅', title: 'Real-time Reservations', desc: 'Online booking with live availability and admin approval flow.' },
  { icon: '💳', title: 'Integrated Billing', desc: 'Track fees and purchases per player with clean tabs.' },
  { icon: '📊', title: 'Analytics Dashboard', desc: 'Revenue, utilization, peak hours, and top-selling items.' },
  { icon: '🔔', title: 'Instant Notifications', desc: 'Booking reminders and admin alerts keep everyone synced.' },
  { icon: '🛡️', title: 'Multi-tenant Security', desc: 'Role-based access with tenant-isolated court data.' },
];

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [courts, setCourts] = useState<Court[]>([]);
  const [search, setSearch] = useState('');
  const [sport, setSport] = useState('all');

  const dropRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<HTMLElement>(null);

  const { data: session, status } = useSession();
  const user = session?.user;
  const isAdmin = user?.role === 'admin';
  const isSuperAdmin = user?.role === 'superadmin';

  useEffect(() => {
    fetch('/api/public/courts')
      .then((r) => r.json())
      .then((d) => setCourts(Array.isArray(d) ? d : []))
      .catch(() => setCourts([]));
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const obs = new IntersectionObserver(
      (entries) => entries.forEach((e) => e.isIntersecting && e.target.classList.add('visible')),
      { threshold: 0.05 }
    );
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, []);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const filtered = courts.filter((c) => {
    const city = c.location?.city ?? '';
    const matchSearch =
      (c.name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      city.toLowerCase().includes(search.toLowerCase());
    return matchSearch && (sport === 'all' || (c.sports ?? []).includes(sport));
  });

  return (
    <div className="public-root min-h-screen">

      {/* NAVBAR */}
      <nav className={`fixed top-0 left-0 right-0 z-[200] flex items-center justify-between px-6 lg:px-8 py-4 transition-all duration-300 ${scrolled ? 'bg-[rgba(11,17,32,0.96)] backdrop-blur-xl border-b border-blue-500/10 shadow-[0_4px_24px_rgba(0,0,0,0.3)]' : 'bg-transparent'}`}>
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-blue-900 to-blue-500">
            <span className="text-white text-xs font-bold">S</span>
          </div>
          <span className="font-bold text-[clamp(0.85rem,3vw,1.05rem)] text-white tracking-tight whitespace-nowrap">{APP_NAME}</span>
        </div>
        <div className="nav-links-desktop flex gap-8 items-center">
          {['#courts', '#features', '#pricing'].map((h, i) => (<a key={h} href={h} className="nav-link">{['Courts', 'Features', 'Pricing'][i]}</a>))}
          {status === 'loading' ? (<div className="avatar-skeleton" />) : user ? (
            <div ref={dropRef} className="relative">
              <button onClick={() => setDropOpen((o) => !o)} className="flex items-center gap-2 p-0.5 rounded-full bg-transparent border-none cursor-pointer hover:opacity-80 transition-opacity">
                {user.image ? (<Image src={user.image} alt={user.name ?? ''} width={32} height={32} className="rounded-full border-2 border-blue-500/40" />) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-blue-300 bg-blue-500/15 border-[1.5px] border-blue-500/35">
                    {user.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <ChevronDown size={10} className={`text-white/40 transition-transform ${dropOpen ? 'rotate-180' : ''}`} />
              </button>
              {dropOpen && (
                <div className="absolute top-[calc(100%+10px)] right-0 w-[220px] rounded-xl border border-blue-500/15 bg-[rgba(11,17,32,0.97)] backdrop-blur-xl p-2 z-[300] shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
                  <div className="px-3 pt-2.5 pb-3 mb-1.5 border-b border-blue-500/10">
                    <div className="flex items-center gap-2.5">
                      {user.image ? (<Image src={user.image} alt={user.name ?? ''} width={34} height={34} className="rounded-full shrink-0" />) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-blue-300 shrink-0 bg-blue-500/15">{user.name?.[0]?.toUpperCase() ?? '?'}</div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[0.82rem] font-semibold text-white truncate">{user.name}</p>
                        <p className="text-[0.68rem] text-white/35 truncate">{user.email}</p>
                      </div>
                    </div>
                    {(isAdmin || isSuperAdmin) && (<span className="inline-block mt-2 text-[0.6rem] font-semibold tracking-[0.1em] uppercase px-2 py-0.5 rounded text-blue-300 bg-blue-500/12 border border-blue-500/25">{isSuperAdmin ? 'Super Admin' : 'Admin'}</span>)}
                  </div>
                  {isAdmin && (<Link href="/admin" className="drop-item" onClick={() => setDropOpen(false)}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="7" height="7" /><rect x="14" y="3" width="7" height="7" /><rect x="3" y="14" width="7" height="7" /><rect x="14" y="14" width="7" height="7" /></svg>Admin Panel</Link>)}
                  {isSuperAdmin && (<Link href="/superadmin" className="drop-item" onClick={() => setDropOpen(false)}>Super Admin</Link>)}
                  <div className="h-px my-1.5 bg-blue-500/10" />
                  <button className="drop-item danger" onClick={() => { setDropOpen(false); signOut({ callbackUrl: '/' }); }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/auth/signin" className="text-white/50 no-underline text-[0.8rem] tracking-[0.05em] border-l border-white/10 pl-7 transition-colors hover:text-blue-400">Sign In</Link>
          )}
        </div>
        <button className="nav-menu-btn flex-col gap-[5px] p-1.5 bg-transparent border-none cursor-pointer shrink-0" onClick={() => setMenuOpen(!menuOpen)}>
          <span className={`block w-[22px] h-[1.5px] bg-white transition-all duration-300 ${menuOpen ? 'rotate-45 translate-x-[4px] translate-y-[5px]' : ''}`} />
          <span className={`block w-[22px] h-[1.5px] bg-white transition-opacity ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`block w-[22px] h-[1.5px] bg-white transition-all duration-300 ${menuOpen ? '-rotate-45 translate-x-[4px] -translate-y-[5px]' : ''}`} />
        </button>
      </nav>

      {/* MOBILE MENU */}
      {menuOpen && (
        <div className="mobile-menu fixed inset-0 z-[190]">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm border-none" onClick={() => setMenuOpen(false)} />
          <div className="absolute top-[68px] left-4 right-4 rounded-2xl p-4 bg-[rgba(11,17,32,0.97)] border border-blue-500/15 shadow-[0_16px_40px_rgba(0,0,0,0.5)]">
            {[['#courts', 'Courts'], ['#features', 'Features'], ['#pricing', 'Pricing']].map(([h, l]) => (
              <a key={h} href={h} className="block px-4 py-3 rounded-lg text-sm text-white/70 no-underline hover:text-blue-400 hover:bg-blue-500/8 transition-colors" onClick={() => setMenuOpen(false)}>{l}</a>
            ))}
            <div className="h-px my-2 bg-blue-500/10" />
            {user ? (
              <>
                {(isAdmin || isSuperAdmin) && (<Link href={isSuperAdmin ? '/superadmin' : '/admin'} className="block px-4 py-3 rounded-lg text-sm text-white/70 no-underline hover:text-blue-400 transition-colors" onClick={() => setMenuOpen(false)}>{isSuperAdmin ? 'Super Admin' : 'Admin Panel'}</Link>)}
                <button className="w-full text-left px-4 py-3 rounded-lg text-sm text-red-300/80 hover:bg-red-500/10 transition-colors bg-transparent border-none cursor-pointer" onClick={() => { setMenuOpen(false); signOut({ callbackUrl: '/' }); }}>Sign Out</button>
              </>
            ) : (
              <Link href="/auth/signin" className="block px-4 py-3 rounded-lg text-sm text-white/70 no-underline hover:text-blue-400 transition-colors" onClick={() => setMenuOpen(false)}>Sign In</Link>
            )}
          </div>
        </div>
      )}

      {/* HERO */}
      <section className="public-hero min-h-screen flex flex-col items-start justify-center relative overflow-hidden px-[clamp(1.25rem,6vw,6rem)] pt-[clamp(8rem,14vw,10rem)] pb-[clamp(4rem,6vw,6rem)]">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_70%_55%_at_65%_40%,rgba(59,130,246,0.18)_0%,transparent_65%)]" />
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_40%_35%_at_85%_70%,rgba(16,185,129,0.1)_0%,transparent_60%)]" />
        <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[radial-gradient(circle,_#60a5fa_1px,_transparent_1px)] bg-[size:44px_44px]" />
        <div className="absolute bottom-0 left-0 right-0 h-[30%] pointer-events-none bg-gradient-to-t from-[#0b1120] to-transparent" />

        <div className="relative z-[2] max-w-[620px] w-full">
          <div className="anim-1 inline-flex items-center gap-2.5 mb-7 px-3.5 py-2 rounded-full bg-blue-500/12 border border-blue-500/25">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"/>
            <span className="text-[0.72rem] tracking-[0.18em] uppercase text-blue-300 font-medium">Court Management Platform</span>
          </div>
          <h1 className="anim-2 font-bold leading-[1.07] tracking-[-0.025em] mb-6 text-white text-[clamp(2.6rem,8vw,5rem)]">
            Enterprise Sports<br/>
            <span className="gradient-text">Booking Platform</span>
          </h1>
          <p className="anim-3 leading-[1.85] max-w-[480px] mb-10 font-light text-white/55 text-[clamp(0.9rem,1.5vw,1.08rem)]">
            Streamline reservations, queue management, and billing for badminton, pickleball, and tennis courts. Built for the Philippines.
          </p>
          <div className="anim-4 flex gap-3 flex-wrap hero-btns">
            <a href="#courts" className="book-btn">Find a Court</a>
            <a href="#pricing" className="ghost-btn">For Court Owners</a>
          </div>
          <div className="anim-5 grid grid-cols-3 gap-3 mt-12 max-w-[440px]">
            {[{num:'14',label:'Day Free Trial'},{num:'₱2K',label:'Per Month'},{num:'24/7',label:'Available'}].map(s=>(
              <div key={s.label} className="stat-chip">
                <div className="stat-chip-num text-2xl">{s.num}</div>
                <div className="text-[0.65rem] uppercase tracking-widest font-medium mt-1 text-[var(--pub-muted)]">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COURTS */}
      <section id="courts" className="bg-[var(--pub-bg2)] px-[clamp(1.25rem,6vw,6rem)] py-[clamp(4rem,8vw,7rem)]">
        <div className="max-w-[1200px] mx-auto">
          <div className="reveal mb-10">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase font-medium mb-3 text-blue-400">Directory</p>
            <div className="flex items-end justify-between flex-wrap gap-4">
              <h2 className="font-bold text-white tracking-[-0.015em] text-[clamp(1.8rem,4vw,3rem)]">Find Your Court</h2>
              <button onClick={() => mapRef.current?.scrollIntoView({ behavior: 'smooth' })} className="flex items-center gap-2 text-[0.78rem] text-blue-400 border border-blue-500/25 rounded-xl px-3.5 py-2 bg-transparent cursor-pointer hover:bg-blue-500/8 transition-colors">
                <MapPin size={13}/> View on Map
              </button>
            </div>
            <div className="divider-line"/>
          </div>
          <div className="reveal flex flex-wrap gap-3 mb-8">
            <div className="relative flex-1 min-w-[200px] max-w-[320px]">
              <Search size={14} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"/>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by name or city..." className="w-full pl-9 pr-4 py-2.5 text-[0.82rem] text-white rounded-xl outline-none transition-colors bg-white/5 border border-blue-500/15 focus:border-blue-400/45"/>
            </div>
            <div className="flex gap-2 flex-wrap">
              {['all', 'badminton', 'pickleball', 'tennis'].map(s => (
                <button key={s} onClick={() => setSport(s)} className={`px-3.5 py-2 rounded-xl text-[0.72rem] font-medium border transition-all cursor-pointer capitalize ${sport === s ? 'bg-gradient-to-br from-blue-900 to-blue-500 text-white border-blue-500 shadow-[0_4px_16px_rgba(59,130,246,0.3)]' : 'bg-transparent text-white/45 border-blue-500/18'}`}>
                  {s === 'all' ? 'All Sports' : SPORT_LABELS[s]}
                </button>
              ))}
            </div>
          </div>
          {filtered.length === 0 ? (
            <div className="reveal py-20 text-center text-white/30 text-sm rounded-2xl border border-blue-500/10">
              {courts.length === 0 ? 'No courts available yet.' : 'No courts match your search.'}
            </div>
          ) : (
            <div className="reveal grid gap-5 [grid-template-columns:repeat(auto-fill,minmax(300px,1fr))]">
              {filtered.map((court) => (
                <div key={court._id} className="court-card group">
                  <div className="flex gap-2 mb-4">
                    {(court.sports ?? []).map((s) => (<span key={s} className={`text-[0.6rem] font-semibold tracking-[0.08em] uppercase px-2 py-0.5 rounded-md border ${SPORT_COLORS[s] ?? 'text-white/40 bg-white/5 border-white/10'}`}>{SPORT_LABELS[s] ?? s}</span>))}
                  </div>
                  <h3 className="font-semibold text-white text-[1rem] mb-1.5 group-hover:text-blue-400 transition-colors">{court.name}</h3>
                  {(court.location?.city || court.location?.province) && (
                    <p className="text-[0.75rem] text-white/35 flex items-center gap-1.5 mb-5"><MapPin size={11}/>{[court.location?.city, court.location?.province].filter(Boolean).join(', ')}</p>
                  )}
                  <div className="flex items-center justify-between pt-3 border-t border-blue-500/10">
                    <span className="text-[0.72rem] font-mono text-white/25">{court.courtCount} court{court.courtCount !== 1 ? 's' : ''}</span>
                    <Link href={`/book/${court.slug}`} className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-blue-400 no-underline hover:gap-2.5 transition-all">Book now <ArrowRight size={13}/></Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" className="bg-[var(--pub-bg)] px-[clamp(1.25rem,6vw,6rem)] py-[clamp(4rem,8vw,7rem)] relative">
        <div className="absolute left-1/2 top-0 -translate-x-1/2 pointer-events-none w-[600px] h-[300px] bg-[radial-gradient(ellipse,rgba(59,130,246,0.08)_0%,transparent_70%)] blur-[40px]"/>
        <div className="max-w-[1200px] mx-auto relative z-[1]">
          <div className="reveal text-center mb-14">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase font-medium mb-3 text-emerald-400">The Platform</p>
            <h2 className="font-bold text-white tracking-[-0.015em] mb-4 text-[clamp(1.8rem,4vw,3rem)]">Everything Your Court Needs</h2>
            <p className="text-white/45 max-w-[500px] mx-auto leading-relaxed text-sm">Built for the Philippines — from small badminton clubs to multi-court facilities running multiple sports.</p>
            <div className="divider-line mx-auto"/>
          </div>
          <div className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f=>(
              <div key={f.title} className="feature-card">
                <div className="feat-icon">{f.icon}</div>
                <h3 className="font-semibold text-white mb-3 text-[1.05rem]">{f.title}</h3>
                <p className="text-white/45 text-sm leading-[1.8]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MAP */}
      <section ref={mapRef} id="map" className="bg-[var(--pub-bg2)] px-[clamp(1.25rem,6vw,6rem)] py-[clamp(4rem,8vw,7rem)]">
        <div className="max-w-[1200px] mx-auto">
          <div className="reveal mb-8">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase font-medium mb-3 text-blue-400">Locations</p>
            <h2 className="font-bold text-white tracking-[-0.015em] text-[clamp(1.8rem,4vw,3rem)]">Find Courts Near You</h2>
            <div className="divider-line"/>
          </div>
          <div className="reveal w-full rounded-2xl overflow-hidden flex items-center justify-center h-[380px] bg-white/3 border border-blue-500/12">
            <div className="text-center"><MapPin size={36} className="mx-auto mb-3 opacity-25 text-white/25"/><p className="text-sm text-white/25">Map integration coming soon</p><p className="text-[0.72rem] mt-1 text-white/15">Google Maps embed will appear here</p></div>
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="pricing" className="bg-[var(--pub-bg)] px-[clamp(1.25rem,6vw,6rem)] py-[clamp(4rem,8vw,7rem)] relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_60%_70%_at_50%_50%,rgba(30,58,138,0.15)_0%,transparent_70%)]"/>
        <div className="max-w-[1200px] mx-auto relative z-[1]">
          <div className="reveal text-center mb-14">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase font-medium mb-3 text-blue-400">For Court Owners</p>
            <h2 className="font-bold text-white tracking-[-0.015em] mb-4 text-[clamp(1.8rem,4vw,3rem)]">Simple, Transparent Pricing</h2>
            <p className="text-white/40 text-sm">No hidden fees. No credit card required to start.</p>
            <div className="divider-line mx-auto"/>
          </div>
          <div className="reveal grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-[820px] mx-auto">
            <div className="pricing-card">
              <p className="text-[0.72rem] tracking-[0.15em] uppercase text-white/40 mb-5 font-medium">Monthly</p>
              <div className="flex items-end gap-1 mb-1"><span className="text-[2.8rem] font-bold text-white leading-none">₱2,000</span><span className="text-white/30 text-sm mb-2">/month</span></div>
              <p className="text-[0.78rem] text-white/30 mb-7">Billed monthly. Cancel anytime.</p>
              <ul className="flex flex-col gap-3 mb-8">
                {['Unlimited bookings','Queue management','Billing & tabs','Analytics dashboard','Public court listing','14-day free trial'].map(f=>(
                  <li key={f} className="flex items-center gap-2.5 text-[0.84rem] text-white/55">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-emerald-400 bg-emerald-500/12 border border-emerald-500/25"><span className="text-[10px]">✓</span></div>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth/signin" className="ghost-btn block text-center no-underline text-[0.85rem] py-3">Start Free Trial</Link>
            </div>
            <div className="pricing-card featured relative">
              <div className="absolute top-5 right-5 text-[0.6rem] font-bold tracking-[0.1em] uppercase px-2.5 py-1 rounded-full text-white bg-gradient-to-br from-blue-900 to-blue-500 shadow-[0_4px_12px_rgba(59,130,246,0.35)]">Best Value</div>
              <p className="text-[0.72rem] tracking-[0.15em] uppercase text-blue-400 mb-5 font-medium">Annual</p>
              <div className="flex items-end gap-1 mb-1"><span className="text-[2.8rem] font-bold text-white leading-none">₱20,000</span><span className="text-white/30 text-sm mb-2">/year</span></div>
              <p className="text-[0.78rem] text-blue-400/60 mb-7">Save ₱4,000 vs monthly billing.</p>
              <ul className="flex flex-col gap-3 mb-8">
                {['Everything in Monthly','Priority support','Early access to features','Promotional slot (1/yr)','Custom court page URL','14-day free trial'].map(f=>(
                  <li key={f} className="flex items-center gap-2.5 text-[0.84rem] text-white/55">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-blue-400 bg-blue-500/12 border border-blue-500/30"><span className="text-[10px]">✓</span></div>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/auth/signin" className="book-btn block text-center no-underline text-[0.85rem] py-3">Start Free Trial</Link>
            </div>
          </div>
          <p className="reveal text-center text-[0.72rem] text-white/20 mt-8">All plans include a 14-day free trial. No credit card required.</p>
        </div>
      </section>

      {/* CTA */}
      <section className="px-[clamp(1.25rem,6vw,6rem)] pb-[clamp(4rem,6vw,5rem)]">
        <div className="reveal max-w-[1200px] mx-auto rounded-3xl overflow-hidden relative bg-gradient-to-br from-blue-900 to-blue-500 px-[clamp(1.5rem,5vw,4rem)] py-[clamp(3rem,6vw,5rem)]">
          <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_at_80%_50%,rgba(16,185,129,0.18)_0%,transparent_55%)]"/>
          <div className="absolute inset-0 pointer-events-none opacity-[0.04] bg-[radial-gradient(circle,rgba(255,255,255,0.8)_1px,transparent_1px)] bg-[size:32px_32px]"/>
          <div className="relative z-[1] text-center">
            <h2 className="font-bold text-white mb-4 tracking-[-0.02em] text-[clamp(1.8rem,4vw,2.8rem)]">Ready to Transform<br/>Your Court Operations?</h2>
            <p className="text-white/65 text-sm max-w-[480px] mx-auto mb-8 leading-relaxed">Join court owners across the Philippines already using our platform to manage bookings, queues, and billing.</p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Link href="/auth/signin" className="inline-block bg-white text-blue-800 font-semibold text-sm px-8 py-3.5 rounded-xl no-underline hover:-translate-y-0.5 transition-transform shadow-[0_4px_20px_rgba(0,0,0,0.2)]">Start Free Trial</Link>
              <Link href="/register-court" className="inline-block text-white text-sm font-medium px-8 py-3.5 rounded-xl no-underline transition-all border border-white/35">Register Your Court</Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-[clamp(1.25rem,6vw,6rem)] py-[2.5rem] border-t border-blue-500/10 bg-[var(--pub-bg)]">
        <div className="max-w-[1200px] mx-auto flex justify-between items-center flex-wrap gap-4">
          <div className="flex items-center gap-2.5">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-gradient-to-br from-blue-900 to-blue-500"><span className="text-white text-[10px] font-bold">S</span></div>
            <span className="text-[0.88rem] text-white/45">{APP_NAME}</span>
          </div>
          <p className="text-[0.72rem] text-white/20 tracking-[0.04em]">Court Management Platform — Built for the Philippines</p>
          <Link href="/auth/signin" className="text-[0.72rem] text-white/25 no-underline tracking-[0.08em] uppercase hover:text-blue-400 transition-colors">Staff Login</Link>
        </div>
      </footer>
    </div>
  );
}