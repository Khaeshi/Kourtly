'use client';
import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

interface RevealProps {
  children: ReactNode;
  dir?: 'up' | 'right';
  delay?: number; // ms
  className?: string;
}

/** Scroll reveal. Plays once when ~20% is visible. Styles live in globals.css (.rv). Don't use above the fold. */
export default function Reveal({ children, dir = 'up', delay = 0, className = '' }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      el.classList.add('is-in');
      return;
    }
    const io = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-in');
          io.disconnect();
        }
      },
      { threshold: 0.2 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} data-dir={dir} className={`rv ${className}`} style={{ '--rv-delay': `${delay}ms` } as CSSProperties}>
      {children}
    </div>
  );
}
