'use client';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function LandingPage() {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrollY, setScrollY]   = useState(0);

  useEffect(() => {
    const onScroll = () => {
      setScrolled(window.scrollY > 40);
      setScrollY(window.scrollY);
    };
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

  // ─── render ───────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#0c1409', color: '#e8f0e4', fontFamily: "'Georgia', serif" }}>

      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        .landing-body { font-family: 'Plus Jakarta Sans', sans-serif; }
        .display-font { font-family: 'Plus Jakarta Sans', sans-serif; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(24px); } to { opacity:1; transform:translateY(0); } }
        @keyframes fadeIn { from { opacity:0; } to { opacity:1; } }
        @keyframes lineExpand { from { width:0; } to { width:100%; } }
        .anim-1 { animation: fadeUp 0.8s ease 0.1s both; }
        .anim-2 { animation: fadeUp 0.8s ease 0.25s both; }
        .anim-3 { animation: fadeUp 0.8s ease 0.4s both; }
        .anim-4 { animation: fadeUp 0.8s ease 0.55s both; }
        .anim-5 { animation: fadeUp 0.8s ease 0.7s both; }
        .reveal { opacity: 0; transform: translateY(32px); transition: opacity 0.75s ease, transform 0.75s ease; }
        .reveal.visible { opacity: 1; transform: translateY(0); }
        .reveal-delay-1 { transition-delay: 0.1s; }
        .reveal-delay-2 { transition-delay: 0.2s; }
        .reveal-delay-3 { transition-delay: 0.3s; }
        .book-btn {
          display: inline-block;
          background: #c8a84b;
          color: #0c1409;
          padding: 1rem 2.5rem;
          border-radius: 2px;
          text-decoration: none;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 600;
          font-size: 0.9rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          transition: background 0.25s, transform 0.2s;
        }
        .book-btn:hover { background: #e0c060; transform: translateY(-2px); }
        .ghost-btn {
          display: inline-block;
          background: transparent;
          color: #c8a84b;
          padding: 1rem 2.5rem;
          border-radius: 2px;
          text-decoration: none;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-weight: 500;
          font-size: 0.9rem;
          letter-spacing: 0.12em;
          text-transform: uppercase;
          border: 1px solid rgba(200,168,75,0.4);
          transition: border-color 0.25s, background 0.25s;
        }
        .ghost-btn:hover { border-color: #c8a84b; background: rgba(200,168,75,0.06); }
        .nav-link {
          color: rgba(232,240,228,0.65);
          text-decoration: none;
          font-family: 'Plus Jakarta Sans', sans-serif;
          font-size: 0.85rem;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          transition: color 0.2s;
        }
        .nav-link:hover { color: #c8a84b; }
        .feature-card {
          background: rgba(255,255,255,0.025);
          border: 1px solid rgba(255,255,255,0.06);
          border-radius: 2px;
          padding: 2.5rem;
          transition: border-color 0.3s, background 0.3s;
        }
        .feature-card:hover { border-color: rgba(200,168,75,0.25); background: rgba(200,168,75,0.03); }
        .court-card {
          position: relative;
          background: rgba(255,255,255,0.03);
          border: 1px solid rgba(255,255,255,0.07);
          border-radius: 2px;
          padding: 2rem;
          text-align: center;
          transition: border-color 0.3s, transform 0.3s;
          overflow: hidden;
        }
        .court-card::before {
          content: '';
          position: absolute; top: 0; left: 0; right: 0;
          height: 2px;
          background: linear-gradient(90deg, transparent, #c8a84b, transparent);
          opacity: 0;
          transition: opacity 0.3s;
        }
        .court-card:hover { border-color: rgba(200,168,75,0.3); transform: translateY(-4px); }
        .court-card:hover::before { opacity: 1; }
        .divider-line {
          width: 48px; height: 1px;
          background: #c8a84b;
          margin: 1.5rem 0;
        }
        @media (max-width: 768px) {
          .hero-btns { flex-direction: column; align-items: stretch; }
          .hero-btns a { text-align: center; }
          .courts-grid { grid-template-columns: repeat(2, 1fr) !important; }
          .features-grid { grid-template-columns: 1fr !important; }
          .stats-row { gap: 2rem !important; }
          .nav-links-desktop { display: none !important; }
          .nav-menu-btn { display: flex !important; }
          .mobile-menu { display: block !important; }
          .hero-title { font-size: clamp(2.8rem, 10vw, 5rem) !important; }
        }
        @media (min-width: 769px) {
          .nav-menu-btn { display: none !important; }
          .mobile-menu { display: none !important; }
        }
      `}</style>

      {/* NAVBAR */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 200,
        background: scrolled ? 'rgba(12,20,9,0.96)' : 'transparent',
        backdropFilter: scrolled ? 'blur(12px)' : 'none',
        borderBottom: scrolled ? '1px solid rgba(255,255,255,0.06)' : 'none',
        transition: 'all 0.4s ease',
        padding: '1.25rem 2.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: '28px', height: '28px', border: '1.5px solid #c8a84b', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '8px', height: '8px', background: '#c8a84b', borderRadius: '50%' }} />
          </div>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.1rem', fontWeight: 800, color: '#e8f0e4', letterSpacing: '-0.01em' }}>
            South City Badminton Court
          </span>
        </div>

        <div className="nav-links-desktop" style={{ display: 'flex', gap: '2.5rem', alignItems: 'center' }}>
          <a href="#courts" className="nav-link">Courts</a>
          <a href="#features" className="nav-link">Features</a>
          <a href="#book" className="nav-link">Book</a>
          <Link href="/admin" style={{ color: 'rgba(232,240,228,0.5)', textDecoration: 'none', fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.8rem', letterSpacing: '0.06em', textTransform: 'uppercase', borderLeft: '1px solid rgba(255,255,255,0.1)', paddingLeft: '2rem', transition: 'color 0.2s' }}
            onMouseOver={e => (e.currentTarget.style.color = '#c8a84b')}
            onMouseOut={e => (e.currentTarget.style.color = 'rgba(232,240,228,0.5)')}>
            Admin
          </Link>
        </div>

        <button className="nav-menu-btn" style={{ background: 'none', border: 'none', cursor: 'pointer', flexDirection: 'column', gap: '5px', padding: '4px' }}
          onClick={() => setMenuOpen(!menuOpen)}>
          <span style={{ display: 'block', width: '22px', height: '1.5px', background: '#e8f0e4', transition: 'all 0.3s', transform: menuOpen ? 'rotate(45deg) translate(5px, 5px)' : 'none' }} />
          <span style={{ display: 'block', width: '22px', height: '1.5px', background: '#e8f0e4', opacity: menuOpen ? 0 : 1, transition: 'opacity 0.3s' }} />
          <span style={{ display: 'block', width: '22px', height: '1.5px', background: '#e8f0e4', transition: 'all 0.3s', transform: menuOpen ? 'rotate(-45deg) translate(5px, -5px)' : 'none' }} />
        </button>
      </nav>

      {/* MOBILE MENU */}
      <div className="mobile-menu" style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 150, background: 'rgba(12,20,9,0.98)', display: menuOpen ? 'flex' : 'none', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '2.5rem' }}>
        {[['#courts', 'Courts'], ['#features', 'Features'], ['#book', 'Book a Court']].map(([href, label]) => (
          <a key={href} href={href} onClick={() => setMenuOpen(false)} style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '2rem', fontWeight: 600, color: '#e8f0e4', textDecoration: 'none', letterSpacing: '0.04em' }}>{label}</a>
        ))}
        <Link href="/admin" onClick={() => setMenuOpen(false)} style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.85rem', color: '#c8a84b', textDecoration: 'none', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: '1rem' }}>Admin Panel</Link>
      </div>

      {/* HERO */}
      <section style={{
        minHeight: '100vh', display: 'flex', flexDirection: 'column',
        alignItems: 'flex-start', justifyContent: 'flex-end',
        position: 'relative', overflow: 'hidden',
        padding: 'clamp(6rem, 12vw, 10rem) clamp(1.5rem, 6vw, 6rem) clamp(4rem, 8vw, 6rem)',
      }}>
        {/* Parallax layer 0 — deep background gradient, slowest */}
        <div style={{
          position: 'absolute', inset: 0,
          background: 'linear-gradient(160deg, #0f1f0c 0%, #0c1409 50%, #080f06 100%)',
          transform: `translateY(${scrollY * 0.12}px)`,
          willChange: 'transform',
        }} />

        {/* Parallax layer 1 — radial glow, slow */}
        <div style={{
          position: 'absolute', inset: 0,
          backgroundImage: 'radial-gradient(ellipse 80% 60% at 70% 40%, rgba(45,90,27,0.22) 0%, transparent 70%)',
          transform: `translateY(${scrollY * 0.22}px)`,
          willChange: 'transform',
        }} />

        {/* Parallax layer 2 — court line art SVG, medium */}
        <svg style={{
          position: 'absolute', right: 0, top: 0, bottom: 0, width: '55%', height: '110%',
          opacity: 0.045,
          transform: `translateY(${scrollY * 0.35}px)`,
          willChange: 'transform',
        }} viewBox="0 0 500 600" preserveAspectRatio="xMidYMid slice">
          <rect x="50" y="50" width="400" height="500" fill="none" stroke="white" strokeWidth="1.5"/>
          <line x1="50" y1="300" x2="450" y2="300" stroke="white" strokeWidth="1.5"/>
          <line x1="250" y1="50" x2="250" y2="550" stroke="white" strokeWidth="1.5"/>
          <rect x="150" y="50" width="200" height="130" fill="none" stroke="white" strokeWidth="1"/>
          <rect x="150" y="420" width="200" height="130" fill="none" stroke="white" strokeWidth="1"/>
          <circle cx="250" cy="300" r="40" fill="none" stroke="white" strokeWidth="1"/>
        </svg>

        {/* Parallax layer 3 — subtle grain/noise texture, faster */}
        <div style={{
          position: 'absolute', inset: '-20%',
          backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)' opacity='0.04'/%3E%3C/svg%3E")`,
          backgroundSize: '180px 180px',
          opacity: 0.35,
          transform: `translateY(${scrollY * 0.08}px)`,
          willChange: 'transform',
          pointerEvents: 'none',
        }} />

        {/* Fade-out bottom scrim — fixed, not parallaxed */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '45%', background: 'linear-gradient(to top, #0c1409 10%, transparent)', zIndex: 1 }} />

        <div style={{ position: 'relative', zIndex: 2, maxWidth: '100%', transform: `translateY(${scrollY * 0.18}px)`, willChange: 'transform' }}>
          <div className="anim-1" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '2rem' }}>
            <div style={{ width: '32px', height: '1px', background: '#c8a84b' }} />
            <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.75rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8a84b', fontWeight: 500 }}>Premium Badminton Club</span>
          </div>

          <h1 className="anim-2 hero-title display-font" style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 'clamp(3rem, 7vw, 5.5rem)',
            fontWeight: 800, lineHeight: 1.05,
            letterSpacing: '-0.03em', marginBottom: '2rem',
            color: '#e8f0e4',
          }}>
            Where Champions<br />
            <span style={{ color: '#c8a84b' }}>Come to Play</span>
          </h1>

          <p className="anim-3" style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 'clamp(0.95rem, 1.5vw, 1.1rem)', color: 'rgba(232,240,228,0.55)',
            lineHeight: 1.8, maxWidth: '460px', marginBottom: '2.5rem', fontWeight: 300,
          }}>
            Four professional courts. Smart queue matching. Book your session, step on the court, and play.
          </p>

          <div className="anim-4 hero-btns" style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
            <a href="#book" className="book-btn">Reserve a Court</a>
            <a href="#courts" className="ghost-btn">View Courts</a>
          </div>
        </div>

        {/* Stats bar */}
        <div className="anim-5 stats-row" style={{
          position: 'absolute', bottom: '3rem', right: 'clamp(1.5rem, 6vw, 6rem)',
          display: 'flex', gap: '3rem', zIndex: 2,
          transform: `translateY(${scrollY * 0.28}px)`,
          willChange: 'transform',
        }}>
          {[['4', 'Courts'], ['A–D', 'Skill Tiers'], ['3', 'Match Formats']].map(([num, label]) => (
            <div key={label} style={{ textAlign: 'right' }}>
              <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '2rem', fontWeight: 600, color: '#c8a84b', lineHeight: 1 }}>{num}</div>
              <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.7rem', color: 'rgba(232,240,228,0.35)', textTransform: 'uppercase', letterSpacing: '0.12em', marginTop: '0.3rem' }}>{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* COURTS */}
      <section id="courts" style={{ padding: 'clamp(4rem, 8vw, 7rem) clamp(1.5rem, 6vw, 6rem)', background: '#0e1a0b' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div className="reveal" style={{ marginBottom: '3.5rem' }}>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 600, color: '#e8f0e4', letterSpacing: '-0.01em' }}>
              Four World-Class Courts
            </h2>
            <div className="divider-line" />
          </div>

          <div className="courts-grid reveal reveal-delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1px', background: 'rgba(255,255,255,0.05)' }}>
            {[1, 2, 3, 4].map(court => (
              <div key={court} className="court-card" style={{ background: '#0e1a0b' }}>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '3rem', fontWeight: 600, color: 'rgba(200,168,75,0.15)', marginBottom: '1rem', lineHeight: 1 }}>{String(court).padStart(2,'0')}</div>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.75rem', letterSpacing: '0.15em', textTransform: 'uppercase', color: '#c8a84b', marginBottom: '0.5rem' }}>Court {court}</div>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.8rem', color: 'rgba(232,240,228,0.4)', marginBottom: '1.25rem' }}>Doubles & Singles</div>
                <div style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: '#4a9c3f' }} />
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* BOOK CTA */}
      <section id="book" style={{
        padding: 'clamp(5rem, 10vw, 9rem) clamp(1.5rem, 6vw, 6rem)',
        background: '#0c1409',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(ellipse 60% 80% at 50% 50%, rgba(45,90,27,0.12) 0%, transparent 70%)' }} />
        <div className="reveal" style={{ maxWidth: '700px', margin: '0 auto', textAlign: 'center', position: 'relative', zIndex: 1 }}>
          <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.75rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8a84b', marginBottom: '1.5rem' }}>Reservations</p>
          <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 'clamp(2.2rem, 5vw, 3.5rem)', fontWeight: 600, color: '#e8f0e4', lineHeight: 1.15, marginBottom: '1.5rem', letterSpacing: '-0.01em' }}>
            Ready to Step on the Court?
          </h2>
          <div style={{ width: '48px', height: '1px', background: '#c8a84b', margin: '0 auto 2rem' }} />
          <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1rem', color: 'rgba(232,240,228,0.5)', lineHeight: 1.8, marginBottom: '3rem', fontWeight: 300 }}>
            Walk in and join the queue, or contact us to reserve a specific court for your group or session.
          </p>
          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <a href='/booking' className="book-btn">Book Now</a>
            <a href="mailto:book@smashcourt.com" className="ghost-btn">Email Us</a>
          </div>
          <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.78rem', color: 'rgba(232,240,228,0.25)', marginTop: '2rem', letterSpacing: '0.05em' }}>
            Walk-ins welcome · Smart queue system keeps it fair for everyone
          </p>
        </div>
      </section>

      {/* FEATURES */}
      <section id="features" style={{ padding: 'clamp(4rem, 8vw, 7rem) clamp(1.5rem, 6vw, 6rem)', background: '#0e1a0b' }}>
        <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
          <div className="reveal" style={{ marginBottom: '3.5rem' }}>
            <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.75rem', letterSpacing: '0.2em', textTransform: 'uppercase', color: '#c8a84b', marginBottom: '1rem' }}>The Experience</p>
            <h2 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 600, color: '#e8f0e4', letterSpacing: '-0.01em' }}>
              Built Around Fair Play
            </h2>
            <div className="divider-line" />
          </div>

          <div className="features-grid reveal reveal-delay-1" style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1px', background: 'rgba(255,255,255,0.05)' }}>
            {[
              { label: '01', title: 'Smart Match Pairing', desc: 'Our algorithm pairs players by skill tier (A through D) and ensures everyone gets equal court time. No one waits longer than needed.' },
              { label: '02', title: 'Live Queue Display', desc: 'See your position in real time. Matches are assigned across all four courts simultaneously, minimising downtime between games.' },
              { label: '03', title: 'Integrated Billing', desc: 'Drinks and shuttlecocks tracked per player. Flexible pricing with a clear tab — settle up at the end of your session.' },
            ].map(f => (
              <div key={f.label} className="feature-card" style={{ background: '#0e1a0b' }}>
                <div style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.85rem', color: '#c8a84b', letterSpacing: '0.1em', marginBottom: '1.5rem', fontWeight: 600 }}>{f.label}</div>
                <h3 style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1.4rem', fontWeight: 600, color: '#e8f0e4', marginBottom: '1rem', lineHeight: 1.3 }}>{f.title}</h3>
                <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.85rem', color: 'rgba(232,240,228,0.45)', lineHeight: 1.8, fontWeight: 300 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer style={{ padding: '3rem clamp(1.5rem, 6vw, 6rem)', borderTop: '1px solid rgba(255,255,255,0.06)', background: '#0c1409', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <div style={{ width: '20px', height: '20px', border: '1px solid rgba(200,168,75,0.4)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: '6px', height: '6px', background: '#c8a84b', borderRadius: '50%' }} />
          </div>
          <span style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '1rem', color: 'rgba(232,240,228,0.5)' }}>South City Badminton Court</span>
        </div>
        <p style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.75rem', color: 'rgba(232,240,228,0.2)', letterSpacing: '0.05em' }}>
          Premium Badminton Club — All courts reserved
        </p>
        <Link href="/admin" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", fontSize: '0.75rem', color: 'rgba(232,240,228,0.25)', textDecoration: 'none', letterSpacing: '0.08em', textTransform: 'uppercase', transition: 'color 0.2s' }}
          onMouseOver={e => (e.currentTarget.style.color = '#c8a84b')}
          onMouseOut={e => (e.currentTarget.style.color = 'rgba(232,240,228,0.25)')}>
          Staff Login
        </Link>
      </footer>
    </div>
  );
}