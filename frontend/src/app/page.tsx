'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { APP_NAME } from '@/lib/config'


export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrollY,  setScrollY]  = useState(0);
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const { data: session, status } = useSession();
  const user    = session?.user;
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    const onScroll = () => { setScrolled(window.scrollY > 40); setScrollY(window.scrollY); };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const observer = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.12 }
    );
    els.forEach(el => observer.observe(el));
    return () => observer.disconnect();
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

  // Parallax transforms — only applied via inline style (value is dynamic)
  const py = (factor: number) => ({ transform: `translateY(${scrollY * factor}px)`, willChange: 'transform' as const });

  return (
    <div className="min-h-screen bg-[#0c1409] text-[#e8f0e4] font-[Plus_Jakarta_Sans,sans-serif]">

      {/* ── NAVBAR ── */}
      <nav className={`fixed top-0 left-0 right-0 z-[200] flex items-center justify-between px-6 py-[1.1rem] transition-all duration-300 ${
        scrolled ? 'bg-[rgba(12,20,9,0.96)] backdrop-blur-md border-b border-white/[0.06]' : 'bg-transparent'
      }`}>

        {/* Brand */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-[26px] h-[26px] shrink-0 border-[1.5px] border-[#c8a84b] rounded-full flex items-center justify-center">
            <div className="w-[7px] h-[7px] bg-[#c8a84b] rounded-full" />
          </div>
          <span className="font-extrabold text-[clamp(0.82rem,3vw,1.05rem)] text-[#e8f0e4] tracking-tight whitespace-nowrap overflow-hidden text-ellipsis">
            {APP_NAME}
          </span>
        </div>

        {/* Desktop nav + auth */}
        <div className="nav-links-desktop flex gap-10 items-center">
          <a href="#courts"   className="nav-link">Courts</a>
          <a href="#features" className="nav-link">Features</a>
          <a href="#book"     className="nav-link">Book</a>

          {/* Auth area */}
          {status === 'loading' ? (
            <div className="avatar-skeleton" />

          ) : user ? (
            /* ── Profile dropdown ── */
            <div ref={dropRef} className="relative">
              <button
                onClick={() => setDropOpen(o => !o)}
                aria-label="Profile menu"
                className="flex items-center gap-2 p-0.5 rounded-full bg-transparent border-none cursor-pointer transition-opacity hover:opacity-80"
              >
                {user.image ? (
                  <Image src={user.image} alt={user.name ?? ''} width={30} height={30}
                    className="rounded-full border-[1.5px] border-[rgba(200,168,75,0.5)]" />
                ) : (
                  <div className="w-[30px] h-[30px] rounded-full bg-[rgba(200,168,75,0.15)] border-[1.5px] border-[rgba(200,168,75,0.4)] flex items-center justify-center">
                    <span className="text-[0.72rem] font-semibold text-[#c8a84b]">{user.name?.[0]?.toUpperCase() ?? '?'}</span>
                  </div>
                )}
                <svg width="10" height="10" viewBox="0 0 10 10"
                  className="text-white/40 transition-transform duration-200"
                  style={{ transform: dropOpen ? 'rotate(180deg)' : 'none' }}>
                  <path d="M2 3.5L5 6.5L8 3.5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round"/>
                </svg>
              </button>

              {/* Dropdown */}
              {dropOpen && (
                <div className="absolute top-[calc(100%+10px)] right-0 w-[210px] bg-[rgba(18,28,14,0.97)] border border-white/10 rounded-[10px] p-2 z-[300] backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.5)]" style={{ animation: 'dropIn 0.18s ease both' }}>

                  {/* User info */}
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
                    {isAdmin && (
                      <span className="inline-block mt-2 text-[0.6rem] font-semibold tracking-[0.1em] uppercase bg-[rgba(200,168,75,0.12)] text-[#c8a84b] border border-[rgba(200,168,75,0.25)] px-2 py-0.5 rounded-[3px]">
                        Admin
                      </span>
                    )}
                  </div>

                  {/* Admin Panel — admins only */}
                  {isAdmin && (
                    <Link href="/admin" className="drop-item" onClick={() => setDropOpen(false)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                      </svg>
                      Admin Panel
                    </Link>
                  )}

                  {/* Settings — static placeholder */}
                  <button className="drop-item muted">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <circle cx="12" cy="12" r="3"/>
                      <path d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 010 2.83 2 2 0 01-2.83 0l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-2 2 2 2 0 01-2-2v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 01-2-2 2 2 0 012-2h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 012-2 2 2 0 012 2v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 012 2 2 2 0 01-2 2h-.09a1.65 1.65 0 00-1.51 1z"/>
                    </svg>
                    Settings
                    <span className="ml-auto text-[0.6rem] text-white/20 italic">soon</span>
                  </button>

                  <div className="h-px bg-white/[0.07] my-1.5" />

                  {/* Sign out */}
                  <button className="drop-item danger" onClick={() => { setDropOpen(false); signOut({ callbackUrl: '/' }); }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/>
                      <polyline points="16 17 21 12 16 7"/>
                      <line x1="21" y1="12" x2="9" y2="12"/>
                    </svg>
                    Sign Out
                  </button>
                </div>
              )}
            </div>

          ) : (
            /* Not signed in */
            <Link href="/auth/signin"
              className="text-white/50 no-underline font-[Plus_Jakarta_Sans,sans-serif] text-[0.8rem] tracking-[0.06em] uppercase border-l border-white/10 pl-8 transition-colors duration-200 hover:text-[#c8a84b]">
              Sign In
            </Link>
          )}
        </div>

        {/* Hamburger */}
        <button className="nav-menu-btn flex-col gap-[5px] p-1.5 bg-transparent border-none cursor-pointer shrink-0"
          aria-label="Toggle menu" onClick={() => setMenuOpen(!menuOpen)}>
          <span className={`block w-[22px] h-[1.5px] bg-[#e8f0e4] transition-all duration-300 ${menuOpen ? 'rotate-45 translate-x-[4.5px] translate-y-[4.5px]' : ''}`} />
          <span className={`block w-[22px] h-[1.5px] bg-[#e8f0e4] transition-opacity duration-300 ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`block w-[22px] h-[1.5px] bg-[#e8f0e4] transition-all duration-300 ${menuOpen ? '-rotate-45 translate-x-[4.5px] -translate-y-[4.5px]' : ''}`} />
        </button>
      </nav>

      {/* ── MOBILE MENU ── */}
      <div className={`mobile-menu fixed inset-0 z-[190] bg-[rgba(12,20,9,0.99)] flex-col items-center justify-center gap-10 ${menuOpen ? 'flex' : 'hidden'}`}>
        {[['#courts','Courts'],['#features','Features'],['#book','Book a Court']].map(([href, label]) => (
          <a key={href} href={href} onClick={() => setMenuOpen(false)}
            className="text-[2rem] font-semibold text-[#e8f0e4] no-underline tracking-[0.04em]">
            {label}
          </a>
        ))}
        {user ? (
          <>
            {isAdmin && (
              <Link href="/admin" onClick={() => setMenuOpen(false)}
                className="text-[0.85rem] text-[#c8a84b] no-underline tracking-[0.1em] uppercase">
                Admin Panel
              </Link>
            )}
            <button onClick={() => { setMenuOpen(false); signOut({ callbackUrl: '/' }); }}
              className="bg-transparent border border-red-400/30 rounded-md px-6 py-2 text-red-400 text-[0.85rem] cursor-pointer">
              Sign Out
            </button>
          </>
        ) : (
          <Link href="/auth/signin" onClick={() => setMenuOpen(false)}
            className="text-[0.85rem] text-[#c8a84b] no-underline tracking-[0.1em] uppercase mt-4">
            Sign In
          </Link>
        )}
      </div>

      {/* ── HERO ── */}
      <section className="min-h-screen flex flex-col items-start justify-end relative overflow-hidden"
        style={{ padding: 'clamp(7rem,14vw,10rem) clamp(1.25rem,6vw,6rem) clamp(3rem,6vw,6rem)' }}>

        {/* Parallax layers */}
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
        <div className="parallax-layer absolute pointer-events-none opacity-[0.35]"
          style={{ inset: '-20%', backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`, backgroundSize: '180px 180px', ...py(0.08) }} />
        <div className="absolute bottom-0 left-0 right-0 h-[45%] bg-gradient-to-t from-[#0c1409]/100 to-transparent z-[1]" />

        {/* Hero content */}
        <div className="parallax-layer relative z-[2] max-w-[560px] w-full" style={py(0.18)}>
          <div className="anim-1 flex items-center gap-3 mb-6">
            <div className="w-7 h-px bg-[#c8a84b] shrink-0" />
            <span className="text-[0.7rem] tracking-[0.2em] uppercase text-[#c8a84b] font-medium">Premium Badminton Club</span>
          </div>

          <h1 className="anim-2 font-extrabold leading-[1.05] tracking-[-0.03em] mb-5 text-[#e8f0e4]"
            style={{ fontSize: 'clamp(2.4rem,8vw,5.5rem)' }}>
            Where Champions<br />
            <span className="text-[#c8a84b]">Come to Play</span>
          </h1>

          <p className="anim-3 text-[rgba(232,240,228,0.55)] leading-[1.8] max-w-[420px] mb-8 font-light"
            style={{ fontSize: 'clamp(0.85rem,1.5vw,1.05rem)' }}>
            Four professional courts. Smart queue matching. Book your session, step on the court, and play.
          </p>

          {/* Mobile stats */}
          <div className="anim-4 stats-row-mobile gap-8 mb-8">
            {[['4','Courts'],['A–D','Skill Tiers'],['3','Formats']].map(([num, label]) => (
              <div key={label}>
                <div className="text-2xl font-semibold text-[#c8a84b] leading-none">{num}</div>
                <div className="text-[0.62rem] text-[rgba(232,240,228,0.35)] uppercase tracking-[0.1em] mt-1">{label}</div>
              </div>
            ))}
          </div>

          <div className="anim-4 hero-btns flex gap-3 flex-wrap">
            <a href="#book"   className="book-btn">Reserve a Court</a>
            <a href="#courts" className="ghost-btn">View Courts</a>
          </div>
        </div>

        {/* Desktop stats */}
        <div className="anim-5 stats-row-desktop parallax-layer absolute z-[2] flex gap-12"
          style={{ bottom: '3rem', right: 'clamp(1.5rem,6vw,6rem)', ...py(0.28) }}>
          {[['4','Courts'],['A–D','Skill Tiers'],['3','Match Formats']].map(([num, label]) => (
            <div key={label} className="text-right">
              <div className="text-[2rem] font-semibold text-[#c8a84b] leading-none">{num}</div>
              <div className="text-[0.7rem] text-[rgba(232,240,228,0.35)] uppercase tracking-[0.12em] mt-1">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── COURTS ── */}
      <section id="courts" className="bg-[#0e1a0b]" style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.25rem,6vw,6rem)' }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="reveal mb-12">
            <h2 className="font-semibold text-[#e8f0e4] tracking-[-0.01em]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)' }}>
              Four World-Class Courts
            </h2>
            <div className="divider-line" />
          </div>
          <div className="courts-grid reveal reveal-delay-1 grid grid-cols-4 gap-px bg-white/[0.05]">
            {[1,2,3,4].map(court => (
              <div key={court} className="court-card bg-[#0e1a0b]">
                <div className="font-semibold text-[rgba(200,168,75,0.15)] leading-none mb-3" style={{ fontSize: 'clamp(2rem,5vw,3rem)' }}>
                  {String(court).padStart(2,'0')}
                </div>
                <div className="text-[0.7rem] tracking-[0.15em] uppercase text-[#c8a84b] mb-1">Court {court}</div>
                <div className="text-[0.75rem] text-[rgba(232,240,228,0.4)] mb-4">Doubles & Singles</div>
                <div className="inline-block w-2 h-2 rounded-full bg-[#4a9c3f]" />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── BOOK CTA ── */}
      <section id="book" className="bg-[#0c1409] relative overflow-hidden" style={{ padding: 'clamp(5rem,10vw,9rem) clamp(1.25rem,6vw,6rem)' }}>
        <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(45,90,27,0.12) 0%, transparent 70%)' }} />
        <div className="reveal max-w-[700px] mx-auto text-center relative z-[1]">
          <p className="text-[0.75rem] tracking-[0.2em] uppercase text-[#c8a84b] mb-6">Reservations</p>
          <h2 className="font-semibold text-[#e8f0e4] leading-[1.15] mb-6 tracking-[-0.01em]" style={{ fontSize: 'clamp(2rem,5vw,3.5rem)' }}>
            Ready to Step on the Court?
          </h2>
          <div className="w-12 h-px bg-[#c8a84b] mx-auto mb-8" />
          <p className="text-[rgba(232,240,228,0.5)] leading-[1.8] mb-12 font-light" style={{ fontSize: 'clamp(0.85rem,1.5vw,1rem)' }}>
            Walk in and join the queue, or contact us to reserve a specific court for your group or session.
          </p>
          <div className="flex gap-4 justify-center flex-wrap">
            <a href="/booking" className="book-btn">Book Now</a>
            <a href="mailto:book@smashcourt.com" className="ghost-btn">Email Us</a>
          </div>
          <p className="text-[0.78rem] text-[rgba(232,240,228,0.25)] mt-8 tracking-[0.05em]">
            Walk-ins welcome · Smart queue system keeps it fair for everyone
          </p>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="bg-[#0e1a0b]" style={{ padding: 'clamp(4rem,8vw,7rem) clamp(1.25rem,6vw,6rem)' }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="reveal mb-12">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase text-[#c8a84b] mb-4">The Experience</p>
            <h2 className="font-semibold text-[#e8f0e4] tracking-[-0.01em]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)' }}>
              Built Around Fair Play
            </h2>
            <div className="divider-line" />
          </div>
          <div className="features-grid reveal reveal-delay-1 grid grid-cols-3 gap-px bg-white/[0.05]">
            {[
              { label: '01', title: 'Smart Match Pairing',
                desc: 'Our algorithm pairs players by skill tier (A through D) and ensures everyone gets equal court time. No one waits longer than needed.' },
              { label: '02', title: 'Live Queue Display',
                desc: 'See your position in real time. Matches are assigned across all four courts simultaneously, minimising downtime between games.' },
              { label: '03', title: 'Integrated Billing',
                desc: 'Drinks and shuttlecocks tracked per player. Flexible pricing with a clear tab — settle up at the end of your session.' },
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
          Premium Badminton Club — All courts reserved
        </p>
        <Link href="/auth/signin"
          className="text-[0.72rem] text-[rgba(232,240,228,0.25)] no-underline tracking-[0.08em] uppercase transition-colors duration-200 hover:text-[#c8a84b]">
          Staff Login
        </Link>
      </footer>
    </div>
  );
}