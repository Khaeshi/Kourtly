'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { APP_NAME } from '@/lib/config';

interface NavLink { href: string; label: string; }

interface Props {
  /** Pass anchor links for the current page e.g. [{href:'#courts',label:'Courts'}] */
  links?: NavLink[];
  /** Whether nav background is always visible (non-hero pages) */
  alwaysVisible?: boolean;
}

export default function PublicNav({ links = [], alwaysVisible = false }: Props) {
  const [scrolled,  setScrolled]  = useState(false);
  const [menuOpen,  setMenuOpen]  = useState(false);
  const [dropOpen,  setDropOpen]  = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const { data: session, status } = useSession();
  const user         = session?.user;
  const isAdmin      = user?.role === 'admin';
  const isSuperAdmin = user?.role === 'superadmin';

  useEffect(() => {
    if (alwaysVisible) { setScrolled(true); return; }
    const fn = () => setScrolled(window.scrollY > 40);
    window.addEventListener('scroll', fn, { passive: true });
    return () => window.removeEventListener('scroll', fn);
  }, [alwaysVisible]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [menuOpen]);

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, []);

  const navBg = scrolled || alwaysVisible
    ? 'bg-[rgba(11,17,32,0.96)] backdrop-blur-xl border-b border-blue-500/10 shadow-[0_4px_24px_rgba(0,0,0,0.3)]'
    : 'bg-transparent';

  return (
    <>
      <nav className={`fixed top-0 left-0 right-0 z-[200] flex items-center justify-between px-6 lg:px-8 py-4 transition-all duration-300 ${navBg}`}>

        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5 min-w-0 no-underline">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0 bg-gradient-to-br from-blue-900 to-blue-500">
            <span className="text-white text-xs font-bold">P</span>
          </div>
          <span className="font-bold text-[clamp(0.85rem,3vw,1.05rem)] text-white tracking-tight whitespace-nowrap">
            {APP_NAME}
          </span>
        </Link>

        {/* Desktop nav */}
        <div className="nav-links-desktop flex gap-8 items-center">
          {links.map(l => (
            <a key={l.href} href={l.href} className="nav-link">{l.label}</a>
          ))}

          {/* Courts / For Courts context switcher */}
          <div className="flex gap-2 ml-2">
            <Link href="/courts"
              className="text-[0.75rem] font-medium px-3 py-1.5 rounded-lg no-underline transition-all text-white/50 hover:text-white hover:bg-white/8">
              Find Courts
            </Link>
            <Link href="/for-courts"
              className="text-[0.75rem] font-medium px-3 py-1.5 rounded-lg no-underline transition-all text-white/50 hover:text-white hover:bg-white/8">
              Court Owners
            </Link>
          </div>

          {/* Auth */}
          {status === 'loading' ? (
            <div className="w-8 h-8 rounded-full bg-white/10 animate-pulse" />
          ) : user ? (
            <div ref={dropRef} className="relative">
              <button onClick={() => setDropOpen(o => !o)}
                className="flex items-center gap-2 p-0.5 rounded-full bg-transparent border-none cursor-pointer hover:opacity-80 transition-opacity">
                {user.image ? (
                  <Image src={user.image} alt={user.name ?? ''} width={32} height={32}
                    className="rounded-full border-2 border-blue-500/40" />
                ) : (
                  <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-blue-300"
                    style={{ background: 'rgba(59,130,246,0.15)', border: '1.5px solid rgba(59,130,246,0.35)' }}>
                    {user.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <ChevronDown size={10} className={`text-white/40 transition-transform ${dropOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropOpen && (
                <div className="absolute top-[calc(100%+10px)] right-0 w-[220px] rounded-xl p-2 z-[300]"
                  style={{
                    background: 'rgba(11,17,32,0.97)',
                    backdropFilter: 'blur(20px)',
                    border: '1px solid rgba(59,130,246,0.15)',
                    boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
                  }}>
                  <div className="px-3 pt-2.5 pb-3 mb-1.5 border-b border-blue-500/10">
                    <div className="flex items-center gap-2.5">
                      {user.image ? (
                        <Image src={user.image} alt={user.name ?? ''} width={34} height={34} className="rounded-full shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-blue-300 shrink-0"
                          style={{ background: 'rgba(59,130,246,0.15)' }}>
                          {user.name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[0.82rem] font-semibold text-white truncate">{user.name}</p>
                        <p className="text-[0.68rem] text-white/35 truncate">{user.email}</p>
                      </div>
                    </div>
                    {(isAdmin || isSuperAdmin) && (
                      <span className="inline-block mt-2 text-[0.6rem] font-semibold tracking-[0.1em] uppercase px-2 py-0.5 rounded text-blue-300"
                        style={{ background: 'rgba(59,130,246,0.12)', border: '1px solid rgba(59,130,246,0.25)' }}>
                        {isSuperAdmin ? 'Super Admin' : 'Admin'}
                      </span>
                    )}
                  </div>

                  {isAdmin && (
                    <Link href="/admin" className="drop-item" onClick={() => setDropOpen(false)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
                        <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
                      </svg>
                      Admin Panel
                    </Link>
                  )}
                  {isSuperAdmin && (
                    <Link href="/superadmin" className="drop-item" onClick={() => setDropOpen(false)}>
                      Super Admin
                    </Link>
                  )}
                  <div className="h-px my-1.5 bg-blue-500/10" />
                  <button className="drop-item danger"
                    onClick={() => { setDropOpen(false); signOut({ callbackUrl: '/' }); }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
            <Link href="/auth/signin"
              className="text-white/50 no-underline text-[0.8rem] tracking-[0.05em] border-l border-white/10 pl-7 transition-colors hover:text-blue-400">
              Sign In
            </Link>
          )}
        </div>

        {/* Hamburger */}
        <button className="nav-menu-btn flex-col gap-[5px] p-1.5 bg-transparent border-none cursor-pointer shrink-0"
          onClick={() => setMenuOpen(!menuOpen)}>
          <span className={`block w-[22px] h-[1.5px] bg-white transition-all duration-300 ${menuOpen ? 'rotate-45 translate-x-[4px] translate-y-[5px]' : ''}`} />
          <span className={`block w-[22px] h-[1.5px] bg-white transition-opacity ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`block w-[22px] h-[1.5px] bg-white transition-all duration-300 ${menuOpen ? '-rotate-45 translate-x-[4px] -translate-y-[5px]' : ''}`} />
        </button>
      </nav>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="fixed inset-0 z-[190]">
          <button className="absolute inset-0 bg-black/60 backdrop-blur-sm border-none"
            onClick={() => setMenuOpen(false)} />
          <div className="absolute top-[68px] left-4 right-4 rounded-2xl p-4"
            style={{
              background: 'rgba(11,17,32,0.97)',
              border: '1px solid rgba(59,130,246,0.15)',
              boxShadow: '0 16px 40px rgba(0,0,0,0.5)',
            }}>
            {links.map(l => (
              <a key={l.href} href={l.href}
                className="block px-4 py-3 rounded-lg text-sm text-white/70 no-underline hover:text-blue-400 hover:bg-blue-500/8 transition-colors"
                onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
            {links.length > 0 && <div className="h-px my-2 bg-blue-500/10" />}
            <Link href="/courts"
              className="block px-4 py-3 rounded-lg text-sm text-white/70 no-underline hover:text-blue-400 hover:bg-blue-500/8 transition-colors"
              onClick={() => setMenuOpen(false)}>
              Find Courts
            </Link>
            <Link href="/for-courts"
              className="block px-4 py-3 rounded-lg text-sm text-white/70 no-underline hover:text-blue-400 hover:bg-blue-500/8 transition-colors"
              onClick={() => setMenuOpen(false)}>
              Court Owners
            </Link>
            <div className="h-px my-2 bg-blue-500/10" />
            {user ? (
              <>
                {(isAdmin || isSuperAdmin) && (
                  <Link href={isSuperAdmin ? '/superadmin' : '/admin'}
                    className="block px-4 py-3 rounded-lg text-sm text-white/70 no-underline hover:text-blue-400 transition-colors"
                    onClick={() => setMenuOpen(false)}>
                    {isSuperAdmin ? 'Super Admin' : 'Admin Panel'}
                  </Link>
                )}
                <button className="w-full text-left px-4 py-3 rounded-lg text-sm text-red-300/80 hover:bg-red-500/10 transition-colors bg-transparent border-none cursor-pointer"
                  onClick={() => { setMenuOpen(false); signOut({ callbackUrl: '/' }); }}>
                  Sign Out
                </button>
              </>
            ) : (
              <Link href="/auth/signin"
                className="block px-4 py-3 rounded-lg text-sm text-white/70 no-underline hover:text-blue-400 transition-colors"
                onClick={() => setMenuOpen(false)}>
                Sign In
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}