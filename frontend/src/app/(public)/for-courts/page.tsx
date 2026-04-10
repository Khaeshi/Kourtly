'use client';
import Link from 'next/link';
import { ArrowRight, MapPin } from 'lucide-react';
import { useEffect } from 'react';
import PublicNav from '@/app/components/public/PublicNav';

const FEATURES = [
  { title: 'Smart Queue System',     desc: 'Algorithm pairs players by skill tier. Everyone gets fair court time with zero paperwork.' },
  { title: 'Real-time Reservations', desc: 'Online booking with live availability. Admins confirm, guests get email confirmations.' },
  { title: 'Integrated Billing',     desc: 'Track drinks, shuttlecocks, and fees per player. Clear tabs paid at end of session.' },
  { title: 'Analytics Dashboard',    desc: 'Revenue charts, court utilization, peak hours, and top-selling items at a glance.' },
  { title: 'Instant Notifications',  desc: 'Booking reminders and admin alerts keep everyone synced without manual follow-ups.' },
  { title: 'Multi-tenant Security',  desc: 'Your data is fully isolated. Role-based access with subscription guards.' },
];

const HOW = [
  { step: '01', title: 'Register your court',   desc: 'Fill in your court name, location, and sport type. Takes under 3 minutes.' },
  { step: '02', title: 'Set up your schedule',  desc: 'Configure open hours, court count, and pricing per your needs.' },
  { step: '03', title: 'Go live',               desc: 'Your court appears on the PlayKou directory. Bookings start coming in.' },
];

export default function ForCourtsPage() {
  useEffect(() => {
    const els = document.querySelectorAll('.reveal');
    const obs = new IntersectionObserver(
      entries => entries.forEach(e => { if (e.isIntersecting) e.target.classList.add('visible'); }),
      { threshold: 0.05 }
    );
    els.forEach(el => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  return (
    <>
      <PublicNav />

      {/* ── HERO ── */}
      <section className="relative overflow-hidden pt-[96px] pb-20 px-[clamp(1.25rem,6vw,6rem)]"
        style={{ background: 'linear-gradient(180deg,#080e1e 0%,#0b1120 100%)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(ellipse 60% 55% at 70% 30%,rgba(99,102,241,0.13) 0%,transparent 65%)' }} />
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(ellipse 40% 40% at 20% 70%,rgba(59,130,246,0.1) 0%,transparent 60%)' }} />
        <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
          style={{ backgroundImage: 'radial-gradient(circle,#a78bfa 1px,transparent 1px)', backgroundSize: '40px 40px' }} />
        <div className="absolute bottom-0 left-0 right-0 h-[25%] pointer-events-none"
          style={{ background: 'linear-gradient(to top,#0b1120,transparent)' }} />

        <div className="max-w-[1200px] mx-auto relative z-[1] px-3 py-6">
          <h1 className="anim-2 font-bold text-white leading-[1.07] tracking-[-0.025em] mb-6"
            style={{ fontSize: 'clamp(2.2rem,5.5vw,4rem)' }}>
            The smartest way to<br />
            <span style={{
              background: 'linear-gradient(135deg,#a78bfa,#6366f1)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              run your court
            </span>
          </h1>

          <p className="anim-3 text-white/50 max-w-[500px] leading-[1.85] mb-10"
            style={{ fontSize: 'clamp(0.9rem,1.5vw,1.05rem)' }}>
            PlayKou gives your court an online presence, a booking system, queue management, and billing — all in one platform built for the Philippines.
          </p>

          <div className="anim-4 flex gap-3 flex-wrap items-center">
            <Link href="/register-court" className="book-btn" style={{
              background: 'linear-gradient(135deg,#4c1d95,#6366f1)',
              boxShadow: '0 4px 20px rgba(99,102,241,0.35)',
            }}>
              Start Free Trial →
            </Link>
            <a href="#features" className="ghost-btn" style={{ borderColor: 'rgba(167,139,250,0.35)', color: '#a78bfa' }}>
              See Features
            </a>
          </div>

          {/* Stat row */}
          <div className="anim-5 flex flex-wrap gap-6 mt-14">
            {[
              { num: '14 days',  label: 'Free trial, no card' },
              { num: '₱2,000',  label: 'Per month after trial' },
              { num: '3 sports', label: 'Badminton · Pickle · Tennis' },
            ].map(s => (
              <div key={s.label} className="flex items-center gap-3">
                <div className="text-[1.4rem] font-bold text-violet-300">{s.num}</div>
                <div className="text-[0.72rem] text-white/35 leading-tight">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── VIDEO ── */}
      <section className="px-[clamp(1.25rem,6vw,6rem)] py-16" style={{ background: 'var(--pub-bg2)' }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="reveal text-center mb-10">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase font-medium mb-2 text-violet-400">See it in action</p>
            <h2 className="font-bold text-white text-[clamp(1.5rem,3vw,2.2rem)]">Watch how it works</h2>
            <div className="w-12 h-[2px] mx-auto mt-4 rounded" style={{ background: 'linear-gradient(90deg,#6366f1,#a855f7)' }} />
          </div>
          <div className="reveal mx-auto max-w-[820px]">
            <div className="relative w-full rounded-2xl overflow-hidden"
              style={{ paddingBottom: '56.25%', border: '1px solid rgba(99,102,241,0.2)', background: 'rgba(255,255,255,0.03)' }}>
              {/* Replace the src with your actual YouTube embed URL */}
              <iframe
                className="absolute inset-0 w-full h-full"
                src="https://www.youtube.com/embed/dQw4w9WgXcQ"
                title="PlayKou demo"
                frameBorder="0"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <p className="text-center text-white/20 text-xs mt-3">Replace the YouTube link with your actual demo video</p>
          </div>
        </div>
      </section>

      {/* ── FEATURES ── */}
      <section id="features" className="px-[clamp(1.25rem,6vw,6rem)] py-[clamp(4rem,8vw,7rem)] relative"
        style={{ background: 'var(--pub-bg)' }}>
        <div className="absolute left-1/2 top-0 -translate-x-1/2 pointer-events-none"
          style={{ width: '600px', height: '300px', background: 'radial-gradient(ellipse,rgba(99,102,241,0.07) 0%,transparent 70%)', filter: 'blur(40px)' }} />

        <div className="max-w-[1200px] mx-auto relative z-[1]">
          <div className="reveal text-center mb-14">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase font-medium mb-3 text-violet-400">Platform</p>
            <h2 className="font-bold text-white tracking-[-0.015em] mb-4" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)' }}>
              Everything your court needs
            </h2>
            <p className="text-white/40 max-w-[480px] mx-auto leading-relaxed text-sm">
              One subscription. No extra modules. No hidden fees. Everything is included from day one.
            </p>
            <div className="w-12 h-[2px] mx-auto mt-5 rounded" style={{ background: 'linear-gradient(90deg,#6366f1,#a855f7)' }} />
          </div>

          <div className="reveal grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="feature-card">
                <h3 className="font-semibold text-white mb-3 text-[1.05rem]">{f.title}</h3>
                <p className="text-white/45 text-sm leading-[1.8]">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ── */}
      <section id="how" className="px-[clamp(1.25rem,6vw,6rem)] py-[clamp(4rem,8vw,7rem)]"
        style={{ background: 'var(--pub-bg2)' }}>
        <div className="max-w-[1200px] mx-auto">
          <div className="reveal text-center mb-14">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase font-medium mb-3 text-violet-400">Process</p>
            <h2 className="font-bold text-white tracking-[-0.015em]" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)' }}>
              Up and running in minutes
            </h2>
            <div className="w-12 h-[2px] mx-auto mt-5 rounded" style={{ background: 'linear-gradient(90deg,#6366f1,#a855f7)' }} />
          </div>

          <div className="reveal grid grid-cols-1 md:grid-cols-3 gap-6">
            {HOW.map((h, i) => (
              <div key={h.step} className="relative p-8 rounded-2xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(99,102,241,0.15)' }}>
                {/* Step connector */}
                {i < HOW.length - 1 && (
                  <div className="hidden md:block absolute top-[2.5rem] left-full w-6 h-[1px] -translate-y-1/2"
                    style={{ background: 'rgba(99,102,241,0.2)', zIndex: 1 }} />
                )}
                <div className="text-[2.5rem] font-extrabold mb-4 leading-none"
                  style={{
                    background: 'linear-gradient(135deg,rgba(99,102,241,0.15),rgba(167,139,250,0.2))',
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text',
                  }}>
                  {h.step}
                </div>
                <h3 className="font-semibold text-white text-[1rem] mb-2">{h.title}</h3>
                <p className="text-white/40 text-sm leading-[1.75]">{h.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="px-[clamp(1.25rem,6vw,6rem)] py-[clamp(4rem,8vw,7rem)] relative overflow-hidden"
        style={{ background: 'var(--pub-bg)' }}>
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(ellipse 60% 70% at 50% 50%,rgba(79,46,136,0.12) 0%,transparent 70%)' }} />

        <div className="max-w-[1200px] mx-auto relative z-[1]">
          <div className="reveal text-center mb-14">
            <p className="text-[0.75rem] tracking-[0.2em] uppercase font-medium mb-3 text-violet-400">Pricing</p>
            <h2 className="font-bold text-white tracking-[-0.015em] mb-3" style={{ fontSize: 'clamp(1.8rem,4vw,3rem)' }}>
              Simple, transparent pricing
            </h2>
            <p className="text-white/35 text-sm">No credit card required to start. Cancel anytime.</p>
            <div className="w-12 h-[2px] mx-auto mt-5 rounded" style={{ background: 'linear-gradient(90deg,#6366f1,#a855f7)' }} />
          </div>

          <div className="reveal grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-[820px] mx-auto">

            {/* Monthly */}
            <div className="pricing-card">
              <p className="text-[0.72rem] tracking-[0.15em] uppercase text-white/40 mb-5 font-medium">Monthly</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-[2.8rem] font-bold text-white leading-none">₱2,000</span>
                <span className="text-white/30 text-sm mb-2">/month</span>
              </div>
              <p className="text-[0.78rem] text-white/30 mb-7">Billed monthly. Cancel anytime.</p>
              <ul className="flex flex-col gap-3 mb-8">
                {['Unlimited bookings','Queue management','Billing & tabs','Analytics dashboard','Public court listing','14-day free trial'].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-[0.84rem] text-white/55">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-violet-400"
                      style={{ background: 'rgba(139,92,246,0.12)', border: '1px solid rgba(139,92,246,0.25)' }}>
                      <span className="text-[10px]">✓</span>
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/register-court"
                className="block text-center no-underline text-[0.85rem] py-3 rounded-xl font-semibold text-violet-300 transition-all"
                style={{ border: '1px solid rgba(139,92,246,0.35)', background: 'transparent' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(139,92,246,0.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}>
                Start Free Trial
              </Link>
            </div>

            {/* Annual */}
            <div className="pricing-card featured relative">
              <div className="absolute top-5 right-5 text-[0.6rem] font-bold tracking-[0.1em] uppercase px-2.5 py-1 rounded-full text-white"
                style={{ background: 'linear-gradient(135deg,#4c1d95,#6366f1)', boxShadow: '0 4px 12px rgba(99,102,241,0.35)' }}>
                Best Value
              </div>
              <p className="text-[0.72rem] tracking-[0.15em] uppercase text-violet-400 mb-5 font-medium">Annual</p>
              <div className="flex items-end gap-1 mb-1">
                <span className="text-[2.8rem] font-bold text-white leading-none">₱20,000</span>
                <span className="text-white/30 text-sm mb-2">/year</span>
              </div>
              <p className="text-[0.78rem] text-violet-400/60 mb-7">Save ₱4,000 vs monthly billing.</p>
              <ul className="flex flex-col gap-3 mb-8">
                {['Everything in Monthly','Priority support','Early access to features','Promotional slot (1/yr)','Custom court page URL','14-day free trial'].map(f => (
                  <li key={f} className="flex items-center gap-2.5 text-[0.84rem] text-white/55">
                    <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-violet-400"
                      style={{ background: 'rgba(139,92,246,0.15)', border: '1px solid rgba(139,92,246,0.35)' }}>
                      <span className="text-[10px]">✓</span>
                    </div>
                    {f}
                  </li>
                ))}
              </ul>
              <Link href="/register-court"
                className="block text-center no-underline text-[0.85rem] py-3 rounded-xl font-bold text-white transition-all hover:text-black/80"
                style={{ background: 'linear-gradient(135deg,#4c1d95,#6366f1)', boxShadow: '0 4px 16px rgba(99,102,241,0.35)' }}>
                Start Free Trial
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── CTA BAND ── */}
      <section className="px-[clamp(1.25rem,6vw,6rem)] pb-[clamp(4rem,6vw,5rem)]">
        <div className="reveal max-w-[1200px] mx-auto rounded-3xl overflow-hidden relative px-[clamp(1.5rem,5vw,4rem)] py-[clamp(3rem,6vw,5rem)]"
          style={{ background: 'linear-gradient(135deg,#4c1d95,#6366f1,#3b82f6)' }}>
          <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(ellipse at 80% 50%,rgba(16,185,129,0.1) 0%,transparent 55%)' }} />
          <div className="absolute inset-0 pointer-events-none opacity-[0.04]"
            style={{ backgroundImage: 'radial-gradient(circle,rgba(255,255,255,0.8) 1px,transparent 1px)', backgroundSize: '32px 32px' }} />
          <div className="relative z-[1] text-center">
            <h2 className="font-bold text-white mb-4 tracking-[-0.02em]" style={{ fontSize: 'clamp(1.8rem,4vw,2.8rem)' }}>
              Ready to go live?
            </h2>
            <p className="text-white/65 text-sm max-w-[440px] mx-auto mb-8 leading-relaxed">
              Register your court today and have your booking system live within minutes. Free for the first 14 days.
            </p>
            <div className="flex gap-4 justify-center flex-wrap">
              <Link href="/register-court"
                className="inline-flex items-center gap-2 bg-white text-indigo-800 font-bold text-sm px-8 py-3.5 rounded-xl no-underline hover:-translate-y-0.5 transition-transform"
                style={{ boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
                Register Your Court <ArrowRight size={14} />
              </Link>
              <Link href="/courts"
                className="inline-block text-white text-sm font-medium px-8 py-3.5 rounded-xl no-underline transition-all"
                style={{ border: '1px solid rgba(255,255,255,0.3)' }}>
                Browse Courts First
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="px-[clamp(1.25rem,6vw,6rem)] py-6 border-t border-white/5"
        style={{ background: 'var(--pub-bg)' }}>
        <div className="max-w-[1200px] mx-auto flex justify-between items-center flex-wrap gap-4">
          <Link href="/" className="flex items-center gap-2 no-underline">
            <div className="w-6 h-6 rounded-lg flex items-center justify-center bg-gradient-to-br from-indigo-900 to-indigo-500">
              <span className="text-white text-[10px] font-bold">P</span>
            </div>
            <span className="text-[0.82rem] text-white/40">PlayKou</span>
          </Link>
          <p className="text-[0.7rem] text-white/15">Court management platform — Philippines</p>
          <Link href="/courts" className="text-[0.72rem] text-white/25 no-underline hover:text-blue-400 transition-colors">
            Find courts →
          </Link>
        </div>
      </footer>
    </>
  );
}