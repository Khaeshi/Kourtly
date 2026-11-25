'use client';
import Link from 'next/link';
import Image from 'next/image';
import { useState, useEffect, useRef, type MouseEvent } from 'react';

export function initials(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('') || '?';
}

/** Profile button and menu shared by the admin and super admin shells (rail = desktop, bar = phone top bar). */
export function ProfileMenu({ variant, user, subtitle, signingOut, onSignOut, onNavigate }: {
  variant: 'rail' | 'bar';
  user: { name: string; email: string; image: string };
  subtitle: string;
  signingOut: boolean;
  onSignOut: () => void;
  onNavigate: (href: string) => (event: MouseEvent<HTMLAnchorElement>) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const size = variant === 'bar' ? 44 : 32;

  useEffect(() => {
    if (!open) return;
    const onDown = (event: PointerEvent) => {
      if (!ref.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="ad-profile">
      <button
        type="button"
        className="ad-profile-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={variant === 'bar' ? 'Account menu' : undefined}
        onClick={() => setOpen(o => !o)}
      >
        <span className="ad-avatar">
          {user.image ? (
            <Image src={user.image} alt="" width={size} height={size} className="rounded-full" />
          ) : (
            initials(user.name || 'Admin')
          )}
        </span>
        {variant === 'rail' && (
          <span className="ad-profile-meta ad-lbl">
            <b>{user.name || 'Admin'}</b>
            <small>{subtitle}</small>
          </span>
        )}
      </button>

      {open && (
        <div className="ad-pop" role="menu">
          <div className="ad-who">
            <b>{user.name || 'Admin'}</b>
            <span>{user.email}</span>
            <span>{subtitle}</span>
          </div>
          <Link
            href="/"
            role="menuitem"
            className="ad-pop-item"
            onClick={event => { setOpen(false); onNavigate('/')(event); }}
          >
            View site
          </Link>
          <button
            type="button"
            role="menuitem"
            className="ad-pop-item danger"
            onClick={onSignOut}
            disabled={signingOut}
          >
            {signingOut ? 'Signing out...' : 'Sign out'}
          </button>
        </div>
      )}
    </div>
  );
}
