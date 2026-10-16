'use client';
import Image from 'next/image';
import { useEffect, useRef, useState } from 'react';

export type JoyState = 'idle' | 'closed' | 'noSlots' | 'invalid' | 'taken' | 'working' | 'done';
type Dir = 'ul' | 'u' | 'ur' | 'l' | 'c' | 'r' | 'dl' | 'd' | 'dr';

const DIRS: Dir[] = ['ul', 'u', 'ur', 'l', 'c', 'r', 'dl', 'd', 'dr'];
// Screen angles: 0 = right, 90 = down, 180 = left, -90 = up
const ANGLES: [Dir, number][] = [['r', 0], ['dr', 45], ['d', 90], ['dl', 135], ['l', 180], ['ul', -135], ['u', -90], ['ur', -45]];
const STATE_SPRITE: Partial<Record<JoyState, string>> = {
  closed: 'state_sleepy', noSlots: 'state_sad', invalid: 'state_error', taken: 'state_annoyed', done: 'state_cheer',
};
const W = 200;
const H = 191;

function pick(dx: number, dy: number): Dir {
  if (Math.hypot(dx, dy) < 90) return 'c';
  const a = (Math.atan2(dy, dx) * 180) / Math.PI;
  let best: Dir = 'c';
  let bd = 999;
  for (const [d, t] of ANGLES) {
    const diff = Math.abs(((a - t + 540) % 360) - 180);
    if (diff < bd) { bd = diff; best = d; }
  }
  return best;
}

/**
 * Joy for the booking pages (desktop and tablet, 768px and up).
 * Mouse: follows the pointer in 9 directions. Touch tablets: looks at the field in focus, otherwise straight ahead.
 * Reduced motion: looks straight ahead. Decorative, so hidden from assistive tech: real messages live in the form.
 */
export default function JoyCompanion({ state = 'idle', message }: { state?: JoyState; message: string }) {
  const face = useRef<HTMLDivElement>(null);
  const [dir, setDir] = useState<Dir>('c');
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = face.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!inView || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const origin = () => {
      const r = face.current?.getBoundingClientRect();
      return r ? { x: r.left + r.width / 2, y: r.top + r.height * 0.38 } : null;
    };
    let raf = 0;
    const onMove = (e: PointerEvent) => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const o = origin();
        if (o) setDir(pick(e.clientX - o.x, e.clientY - o.y));
      });
    };
    const onFocusIn = (e: FocusEvent) => {
      const t = e.target as HTMLElement | null;
      const o = origin();
      if (!t || !o || typeof t.getBoundingClientRect !== 'function') return;
      const r = t.getBoundingClientRect();
      setDir(pick(r.left + r.width / 2 - o.x, r.top + r.height / 2 - o.y));
    };
    const onFocusOut = () => setDir('c');
    if (fine) window.addEventListener('pointermove', onMove, { passive: true });
    else {
      document.addEventListener('focusin', onFocusIn);
      document.addEventListener('focusout', onFocusOut);
    }
    return () => {
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      cancelAnimationFrame(raf);
    };
  }, [inView]);

  const sprite = STATE_SPRITE[state];
  const shown: Dir = state === 'working' ? 'd' : dir;

  return (
    <div aria-hidden="true" className="pointer-events-none mt-6 hidden select-none md:block">
      <p className="relative mx-6 mb-3.5 mt-0 rounded-[14px] bg-[#F4F0E6] px-3.5 py-2.5 text-center text-[0.8rem] font-bold leading-[1.35] text-[#0E2420]">
        {message}
        <i className="absolute left-1/2 -bottom-1.5 -ml-1.5 h-3 w-3 rotate-45 bg-[#F4F0E6]" />
      </p>
      <div ref={face} className="relative mx-auto" style={{ width: W, height: H }}>
        {DIRS.map((d) => (
          <Image
            key={d}
            src={`/mascot/gaze_${d}.webp`}
            alt=""
            width={W}
            height={H}
            sizes={`${W}px`}
            loading="lazy"
            draggable={false}
            className="absolute inset-0 transition-opacity duration-200 motion-reduce:transition-none"
            style={{ opacity: !sprite && d === shown ? 1 : 0 }}
          />
        ))}
        {sprite && (
          <Image key={sprite} src={`/mascot/${sprite}.webp`} alt="" width={W} height={H} sizes={`${W}px`} draggable={false} className="absolute inset-0" />
        )}
      </div>
    </div>
  );
}
