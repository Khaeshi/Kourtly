'use client';
import Link from 'next/link';
import Image from 'next/image';
import { ChevronDown } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useSession, signOut } from 'next-auth/react';
import { APP_NAME } from '@/lib/config';

interface NavLink { href: string; label: string; }

interface Props {
  links?: NavLink[];
  alwaysVisible?: boolean;
}

export default function PublicNav({ links = [], alwaysVisible = true }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  const { data: session, status } = useSession();
  const user = session?.user;
  const isAdmin = user?.role === 'admin';
  const isSuperAdmin = user?.role === 'superadmin';

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

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 8);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const navLinkClass =
    'text-[0.9rem] font-semibold text-[var(--line-dim)] no-underline opacity-75 hover:opacity-100 transition-opacity';

  return (
    <>
      <nav
        className="public-nav"
        style={{
          background: scrolled ? 'rgba(11, 61, 58, 0.86)' : 'transparent',
          backdropFilter: scrolled ? 'blur(10px)' : 'none',
          WebkitBackdropFilter: scrolled ? 'blur(10px)' : 'none',
          borderBottomColor: scrolled ? 'var(--divider)' : 'transparent',
          transition: 'background 0.3s ease, border-color 0.3s ease, backdrop-filter 0.3s ease',
        }}
      >
        <Link href="/" className="flex items-center gap-2.5 min-w-0 no-underline">
          <Image
            src="/Playkoubg.png"
            alt={APP_NAME}
            width={32}
            height={32}
            priority
            className="w-8 h-8 object-cover shrink-0"
            style={{ borderRadius: 'var(--r-block)' }}
          />
          <span className="font-display text-[clamp(0.85rem,3vw,1.25rem)] text-[var(--line)] tracking-tight whitespace-nowrap max-[480px]:text-[1.1rem]">
            {APP_NAME.toUpperCase()}
          </span>
        </Link>

        <div className="nav-links-desktop flex gap-7 items-center">
          {links.map((l) => (
            <a key={l.href} href={l.href} className={navLinkClass}>{l.label}</a>
          ))}
          <Link href="/courts" className={navLinkClass}>Find Courts</Link>
          <Link href="/for-courts" className={navLinkClass}>Court Owners</Link>

          {status === 'loading' ? (
            <div className="w-8 h-8 rounded-full bg-white/10" style={{ borderRadius: 'var(--r-pill)' }} />
          ) : user ? (
            <div ref={dropRef} className="relative">
              <button
                type="button"
                onClick={() => setDropOpen((o) => !o)}
                className="flex items-center gap-2 p-0.5 bg-transparent border-none cursor-pointer hover:opacity-80 transition-opacity"
                aria-label="Account menu"
              >
                {user.image ? (
                  <Image src={user.image} alt={user.name ?? ''} width={32} height={32}
                    className="rounded-full border-2 border-[var(--amber)]/40" />
                ) : (
                  <div
                    className="w-8 h-8 flex items-center justify-center text-xs font-bold text-[var(--amber)]"
                    style={{ borderRadius: 'var(--r-pill)', background: 'rgba(232,163,61,0.14)', border: '1.5px solid rgba(232,163,61,0.35)' }}
                  >
                    {user.name?.[0]?.toUpperCase() ?? '?'}
                  </div>
                )}
                <ChevronDown size={10} className={`text-[var(--line-dim)] transition-transform ${dropOpen ? 'rotate-180' : ''}`} />
              </button>

              {dropOpen && (
                <div
                  className="absolute top-[calc(100%+10px)] right-0 w-[220px] p-2 z-[300] border border-[var(--divider)]"
                  style={{ borderRadius: 'var(--r-block)', background: 'rgba(11,61,58,0.97)', backdropFilter: 'blur(20px)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}
                >
                  <div className="px-3 pt-2.5 pb-3 mb-1.5 border-b border-[var(--divider)]">
                    <div className="flex items-center gap-2.5">
                      {user.image ? (
                        <Image src={user.image} alt={user.name ?? ''} width={34} height={34} className="rounded-full shrink-0" />
                      ) : (
                        <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-[var(--amber)] shrink-0"
                          style={{ background: 'rgba(232,163,61,0.14)' }}>
                          {user.name?.[0]?.toUpperCase() ?? '?'}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="text-[0.82rem] font-semibold text-[var(--line)] truncate">{user.name}</p>
                        <p className="text-[0.68rem] text-[var(--line-dim)] truncate">{user.email}</p>
                      </div>
                    </div>
                    {(isAdmin || isSuperAdmin) && (
                      <span className="inline-block mt-2 font-mono-data text-[0.6rem] tracking-[0.1em] uppercase px-2 py-0.5 text-[var(--amber)] border border-[rgba(232,163,61,0.35)]"
                        style={{ borderRadius: 'var(--r-pill)' }}>
                        {isSuperAdmin ? 'Super Admin' : 'Admin'}
                      </span>
                    )}
                  </div>

                  {isAdmin && (
                    <Link href="/admin" className="drop-item" onClick={() => setDropOpen(false)}>
                      Admin Panel
                    </Link>
                  )}
                  {isSuperAdmin && (
                    <Link href="/superadmin" className="drop-item" onClick={() => setDropOpen(false)}>
                      Super Admin
                    </Link>
                  )}
                  <div className="h-px my-1.5 bg-[var(--divider)]" />
                  <button type="button" className="drop-item danger"
                    onClick={() => { setDropOpen(false); signOut({ callbackUrl: '/' }); }}>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <Link href="/auth/signin" className={navLinkClass}>Sign in</Link>
          )}
        </div>

        <button
          type="button"
          className="nav-menu-btn flex-col gap-[5px] p-1.5 bg-transparent border-none cursor-pointer shrink-0"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label="Toggle menu"
        >
          <span className={`block w-[22px] h-[1.5px] bg-[var(--line)] transition-all duration-300 ${menuOpen ? 'rotate-45 translate-x-[4px] translate-y-[5px]' : ''}`} />
          <span className={`block w-[22px] h-[1.5px] bg-[var(--line)] transition-opacity ${menuOpen ? 'opacity-0' : 'opacity-100'}`} />
          <span className={`block w-[22px] h-[1.5px] bg-[var(--line)] transition-all duration-300 ${menuOpen ? '-rotate-45 translate-x-[4px] -translate-y-[5px]' : ''}`} />
        </button>
      </nav>

      {menuOpen && (
        <div className="fixed inset-0 z-[190]">
          <button type="button" className="absolute inset-0 bg-black/60 backdrop-blur-sm border-none"
            onClick={() => setMenuOpen(false)} aria-label="Close menu" />
          <div
            className="absolute top-[68px] left-4 right-4 p-4 border border-[var(--divider)] max-[480px]:top-[60px]"
            style={{ borderRadius: 'var(--r-block)', background: 'rgba(11,61,58,0.97)', boxShadow: '0 16px 40px rgba(0,0,0,0.5)' }}
          >
            {links.map((l) => (
              <a key={l.href} href={l.href}
                className="block px-4 py-3 text-sm text-[var(--line-dim)] no-underline hover:text-[var(--amber)] transition-colors"
                style={{ borderRadius: 'var(--r-block)' }}
                onClick={() => setMenuOpen(false)}>
                {l.label}
              </a>
            ))}
            {links.length > 0 && <div className="h-px my-2 bg-[var(--divider)]" />}
            <Link href="/courts" className="block px-4 py-3 text-sm text-[var(--line-dim)] no-underline hover:text-[var(--amber)] transition-colors"
              onClick={() => setMenuOpen(false)}>Find Courts</Link>
            <Link href="/for-courts" className="block px-4 py-3 text-sm text-[var(--line-dim)] no-underline hover:text-[var(--amber)] transition-colors"
              onClick={() => setMenuOpen(false)}>Court Owners</Link>
            <div className="h-px my-2 bg-[var(--divider)]" />
            {user ? (
              <>
                {(isAdmin || isSuperAdmin) && (
                  <Link href={isSuperAdmin ? '/superadmin' : '/admin'}
                    className="block px-4 py-3 text-sm text-[var(--line-dim)] no-underline hover:text-[var(--amber)] transition-colors"
                    onClick={() => setMenuOpen(false)}>
                    {isSuperAdmin ? 'Super Admin' : 'Admin Panel'}
                  </Link>
                )}
                <button type="button"
                  className="w-full text-left px-4 py-3 text-sm text-red-300/80 hover:bg-red-500/10 transition-colors bg-transparent border-none cursor-pointer"
                  style={{ borderRadius: 'var(--r-block)' }}
                  onClick={() => { setMenuOpen(false); signOut({ callbackUrl: '/' }); }}>
                  Sign Out
                </button>
              </>
            ) : (
              <Link href="/auth/signin"
                className="block px-4 py-3 text-sm text-[var(--line-dim)] no-underline hover:text-[var(--amber)] transition-colors"
                onClick={() => setMenuOpen(false)}>
                Sign in
              </Link>
            )}
          </div>
        </div>
      )}
    </>
  );
}