'use client';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import PublicNav from './components/public/PublicNav';

export default function SplashPage() {
  const [mounted, setMounted] = useState(false);
  useEffect(() => { setMounted(true); }, []);

  return (
    <div className="public-root min-h-screen overflow-hidden" style={{fontFamily:"'Poppins','Plus Jakarta Sans',sans-serif"}}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap');`}</style>

      <PublicNav />

      {/* BACKGROUND */}
      <div className="fixed inset-0 pointer-events-none z-0">
        <div className="absolute inset-0" style={{background:'linear-gradient(135deg,#080e1e 0%,#0b1120 45%,#0d1a2e 100%)'}}/>
        <div className="absolute inset-0" style={{backgroundImage:'radial-gradient(ellipse 60% 50% at 75% 20%,rgba(59,130,246,0.14) 0%,transparent 60%)'}}/>
        <div className="absolute inset-0" style={{backgroundImage:'radial-gradient(ellipse 50% 40% at 15% 80%,rgba(16,185,129,0.09) 0%,transparent 55%)'}}/>
        <div className="absolute inset-0 opacity-[0.035]" style={{backgroundImage:'radial-gradient(circle,#60a5fa 1px,transparent 1px)',backgroundSize:'40px 40px'}}/>
      </div>

      <main className="relative z-[1] min-h-screen flex flex-col">

        {/* Heading */}
        <div className="flex justify-center pt-[108px] pb-0">
          <div className="text-center px-4 pt-8 pb-12">
            <h1 className="font-extrabold text-white leading-[1.05] tracking-[-0.025em]" style={{fontSize:'clamp(2rem,5vw,3.2rem)'}}>
              What brings you here<span className="text-blue-400">?</span>
            </h1>
            <p className="text-white/35 text-sm mt-3 max-w-[360px] mx-auto leading-relaxed">
              Choose your path — we'll take you to the right place.
            </p>
          </div>
        </div>

        {/* TWO CARDS */}
        <div className="flex-1 flex items-start justify-center px-4 sm:px-8 pb-16">
          <div className="w-full max-w-[960px] grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6 items-stretch">

            {/* CARD 1 — PLAYERS */}
            <Link href="/usercourts" className="group no-underline flex flex-col relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-500"
              style={{background:'rgba(255,255,255,0.03)',border:'1px solid rgba(59,130,246,0.15)',minHeight:'420px'}}
              onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='rgba(59,130,246,0.45)';el.style.transform='translateY(-4px)';el.style.boxShadow='0 24px 60px rgba(59,130,246,0.18)';}}
              onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='rgba(59,130,246,0.15)';el.style.transform='translateY(0)';el.style.boxShadow='none';}}>

              {/* Hover top bar */}
              <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl transition-opacity duration-300 opacity-0 group-hover:opacity-100" style={{background:'linear-gradient(90deg,#3b82f6,#10b981)'}}/>
              {/* BG glow */}
              <div className="absolute right-[-20px] top-[-20px] w-[180px] h-[180px] rounded-full opacity-[0.06] transition-all duration-500 group-hover:opacity-[0.12] group-hover:scale-110" style={{background:'radial-gradient(circle,#3b82f6,transparent)'}}/>
              {/* Sport emoji */}
              <div className="absolute right-6 bottom-6 text-[5rem] opacity-10 group-hover:opacity-20 transition-opacity duration-500 select-none"></div>

              <div className="relative z-[1] flex flex-col flex-1 p-8">
                <span className="inline-flex self-start text-[0.62rem] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-md mb-6 text-emerald-400" style={{background:'rgba(16,185,129,0.12)',border:'1px solid rgba(16,185,129,0.25)'}}>
                  For Players
                </span>

                <h2 className="font-bold text-white leading-[1.15] mb-4" style={{fontSize:'clamp(1.4rem,3vw,1.9rem)'}}>
                  Find courts <br/>
                  <span style={{color:'#60a5fa'}}>near you & book now</span>
                </h2>

                <p className="text-white/45 text-sm leading-[1.8] mb-8 max-w-[320px]">
                  Browse courts, check real-time availability, and reserve your slot in under 2 minutes. No app needed.
                </p>

                <div className="flex flex-wrap gap-2 mb-8">
                  {['Real-time slots','Multiple sports','Instant booking'].map(c=>(
                    <span key={c} className="text-[0.68rem] px-2.5 py-1 rounded-full text-white/50" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}}>{c}</span>
                  ))}
                </div>

                <div className="mt-auto">
                  <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-300 group-hover:gap-3.5" style={{background:'linear-gradient(135deg,#1e3a8a,#3b82f6)',boxShadow:'0 4px 20px rgba(59,130,246,0.3)'}}>
                    Let's get started <ArrowRight size={15}/>
                  </div>
                </div>
              </div>
            </Link>

            {/* CARD 2 — COURT OWNERS */}
            <Link href="/for-courts" className="group no-underline flex flex-col relative overflow-hidden rounded-2xl cursor-pointer transition-all duration-500"
              style={{background:'rgba(255,255,255,0.025)',border:'1px solid rgba(255,255,255,0.07)',minHeight:'420px'}}
              onMouseEnter={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='rgba(255,255,255,0.18)';el.style.transform='translateY(-4px)';el.style.boxShadow='0 24px 60px rgba(0,0,0,0.3)';}}
              onMouseLeave={e=>{const el=e.currentTarget as HTMLElement;el.style.borderColor='rgba(255,255,255,0.07)';el.style.transform='translateY(0)';el.style.boxShadow='none';}}>

              {/* Hover top bar */}
              <div className="absolute top-0 left-0 right-0 h-[2px] rounded-t-2xl transition-opacity duration-300 opacity-0 group-hover:opacity-100" style={{background:'linear-gradient(90deg,#6366f1,#a855f7)'}}/>
              <div className="absolute right-[-20px] top-[-20px] w-[180px] h-[180px] rounded-full opacity-[0.04] transition-all duration-500 group-hover:opacity-[0.1] group-hover:scale-110" style={{background:'radial-gradient(circle,#6366f1,transparent)'}}/>
              <div className="absolute right-6 bottom-6 text-[5rem] opacity-10 group-hover:opacity-20 transition-opacity duration-500 select-none"></div>

              <div className="relative z-[1] flex flex-col flex-1 p-8">
                <span className="inline-flex self-start text-[0.62rem] font-bold tracking-[0.12em] uppercase px-2.5 py-1 rounded-md mb-6 text-violet-400" style={{background:'rgba(139,92,246,0.12)',border:'1px solid rgba(139,92,246,0.25)'}}>
                  For Court Owners
                </span>

                <h2 className="font-bold text-white leading-[1.15] mb-4" style={{fontSize:'clamp(1.4rem,3vw,1.9rem)'}}>
                  Online system<br/>
                  <span style={{color:'#a78bfa'}}>for your court?</span>
                </h2>

                <p className="text-white/45 text-sm leading-[1.8] mb-8 max-w-[320px]">
                  Manage bookings, queues, billing, and analytics. Start with a 14-day free trial — no credit card needed.
                </p>

                <div className="flex flex-wrap gap-2 mb-8">
                  {['₱2,000/month','14-day trial','Queue + billing'].map(c=>(
                    <span key={c} className="text-[0.68rem] px-2.5 py-1 rounded-full text-white/50" style={{background:'rgba(255,255,255,0.05)',border:'1px solid rgba(255,255,255,0.08)'}}>{c}</span>
                  ))}
                </div>

                <div className="mt-auto">
                  <div className="inline-flex items-center gap-2.5 px-5 py-3 rounded-xl font-semibold text-sm text-white transition-all duration-300 group-hover:gap-3.5" style={{background:'rgba(255,255,255,0.06)',border:'1px solid rgba(255,255,255,0.12)'}}>
                    Start with PlayKou <ArrowRight size={15}/>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Bottom hint — no footer */}
        <div className="text-center pb-8 relative z-[1]">
          <p className="text-white/15 text-[0.7rem] tracking-[0.06em]">
            Already have an account?{' '}
            <Link href="/auth/signin" className="text-blue-400/60 no-underline hover:text-blue-400 transition-colors">Sign in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}