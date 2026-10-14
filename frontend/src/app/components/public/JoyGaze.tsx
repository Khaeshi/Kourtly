'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export interface JoySprite {
  src: string;
  alt: string;
  /** Direction Joy is looking, in screen degrees: 0 = right, 90 = down, 180 = left, -90 = up. */
  angle?: number;
}

interface JoyGazeProps {
  sprites: JoySprite[]; // define as a module-level constant so identity is stable
  tracked?: boolean;
  size?: number;
  className?: string;
}

const wrap = (a: number) => ((a + 540) % 360) - 180;

/**
 * Joy mascot. Static with one sprite. With `tracked` she follows the pointer by picking the closest sprite,
 * and steps through them once per second when there is no mouse (touch devices, or pointer idle for 4s).
 * Tracking and the timer run only while she is on screen. Sprites lazy-load.
 */
export default function JoyGaze({ sprites, tracked = false, size = 170, className = '' }: JoyGazeProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  const [inView, setInView] = useState(false);
  const [following, setFollowing] = useState(false);
  const h = Math.round((size * 420) / 440);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '120px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  // Automatic fallback: one sprite per second
  useEffect(() => {
    if (!tracked || sprites.length < 2 || !inView || following) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % sprites.length), 1000);
    return () => clearInterval(id);
  }, [tracked, sprites.length, inView, following]);

  // Pointer tracking (mouse and trackpad only)
  useEffect(() => {
    if (!tracked || !inView) return;
    if (!window.matchMedia('(hover: hover) and (pointer: fine)').matches) return;
    let raf = 0;
    let idle = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const r = ref.current?.getBoundingClientRect();
        if (!r) return;
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height * 0.35);
        const a = (Math.atan2(dy, dx) * 180) / Math.PI;
        let best = 0;
        let bd = 999;
        sprites.forEach((s, i) => {
          const d = Math.abs(wrap(a - (s.angle ?? 0)));
          if (d < bd) {
            bd = d;
            best = i;
          }
        });
        setIdx(best);
        setFollowing(true);
        window.clearTimeout(idle);
        idle = window.setTimeout(() => setFollowing(false), 4000);
      });
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', onMove);
      cancelAnimationFrame(raf);
      window.clearTimeout(idle);
    };
  }, [tracked, inView, sprites]);

  return (
    <div ref={ref} className={`relative pointer-events-none ${className}`} style={{ width: size, height: h }}>
      {sprites.map((s, i) => (
        <Image
          key={s.src}
          src={s.src}
          alt={i === idx ? s.alt : ''}
          aria-hidden={i !== idx}
          width={size}
          height={h}
          sizes={`${size}px`}
          loading="lazy"
          draggable={false}
          className="absolute inset-0 select-none"
          style={{ opacity: i === idx ? 1 : 0 }}
        />
      ))}
    </div>
  );
}
