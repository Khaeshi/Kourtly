// components/AdminSplash.tsx
'use client';
import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

interface Props {
  courtName: string;
  logoUrl?: string | null;
}

export default function AdminSplash({ courtName, logoUrl }: Props) {
  const [visible, setVisible] = useState(false);
  const overlayRef = useRef<HTMLDivElement>(null);
  const logoRef    = useRef<HTMLDivElement>(null);
  const nameRef    = useRef<HTMLParagraphElement>(null);
  const dotRef     = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Only play once per session
    if (sessionStorage.getItem('splash_shown')) return;
    sessionStorage.setItem('splash_shown', '1');
    setVisible(true);
  }, []);

  useEffect(() => {
    if (!visible) return;

    const overlay = overlayRef.current;
    const logo    = logoRef.current;
    const name    = nameRef.current;
    const dot     = dotRef.current;
    if (!overlay || !logo || !name || !dot) return;

    const tl = gsap.timeline({
      onComplete: () => {
        // Fade out entire overlay
        gsap.to(overlay, {
          opacity: 0,
          duration: 0.5,
          ease: 'power2.inOut',
          onComplete: () => setVisible(false),
        });
      },
    });

    // Initial states
    gsap.set([logo, name], { opacity: 0, y: 20 });
    gsap.set(dot, { opacity: 0, scale: 0 });

    tl
      // Logo mark drops in
      .to(logo, {
        opacity: 1,
        y: 0,
        duration: 0.6,
        ease: 'power3.out',
      })
      // Dot pops
      .to(dot, {
        opacity: 1,
        scale: 1,
        duration: 0.3,
        ease: 'back.out(2)',
      }, '-=0.2')
      // Court name slides up
      .to(name, {
        opacity: 1,
        y: 0,
        duration: 0.5,
        ease: 'power2.out',
      }, '-=0.1')
      // Hold
      .to({}, { duration: 1.2 })
      // Logo + name fade up and out
      .to([logo, dot, name], {
        opacity: 0,
        y: -16,
        duration: 0.4,
        ease: 'power2.in',
        stagger: 0.05,
      });

    return () => { tl.kill(); };
  }, [visible]);

  if (!visible) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[9999] flex flex-col items-center justify-center bg-white"
    >
      {/* Logo mark */}
      <div ref={logoRef} className="mb-5">
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={courtName}
            className="w-20 h-20 rounded-2xl object-cover border border-gray-100 shadow-sm"
          />
        ) : (
          <div className="w-20 h-20 rounded-2xl bg-green-700 flex items-center justify-center shadow-sm">
            <div className="w-8 h-8 rounded-full bg-white opacity-90" />
          </div>
        )}
      </div>

      {/* Dot separator */}
      <div
        ref={dotRef}
        className="w-1 h-1 rounded-full bg-green-500 mb-4"
      />

      {/* Court name */}
      <p
        ref={nameRef}
        className="text-lg font-semibold text-gray-800 tracking-tight"
      >
        {courtName}
      </p>
    </div>
  );
}