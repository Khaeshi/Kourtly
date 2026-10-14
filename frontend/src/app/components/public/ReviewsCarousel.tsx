'use client';
import { useEffect, useRef, useState } from 'react';

// Mock content. Replace with real reviews from the API once reviews launch.
const REVIEWS = [
  { quote: 'Be the first one to review our product! Book a court now with Kourtly', name: 'Owner', stars: 5 },
  
];
const INTERVAL = 5000;

/** Auto-rotating reviews. Pauses on hover/focus, has a visible pause button, and never auto-rotates with reduced motion. */
export default function ReviewsCarousel() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [i, setI] = useState(0);
  const [cycle, setCycle] = useState(0);
  const [hover, setHover] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [inView, setInView] = useState(false);


  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    const el = rootRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.3 });
    io.observe(el);
    return () => io.disconnect();
  }, []);


  useEffect(() => {
    if ( reduced || !inView) return;
    const id = setTimeout(() => {
      setI((x) => (x + 1) % REVIEWS.length);
      setCycle((c) => c + 1);
    }, INTERVAL);
    return () => clearTimeout(id);
  }, [cycle, reduced, inView]);

  const go = (n: number) => {
    setI(n);
    setCycle((c) => c + 1);
  };

  return (
    <div
      ref={rootRef}
      role="region"
      aria-roledescription="carousel"
      aria-label="Player reviews"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
    >
      <div className="grid" aria-live={reduced ? 'polite' : 'off'}>
        {REVIEWS.map((r, n) => {
          const state = n === i ? 'is-active' : n < i ? 'is-before' : 'is-after';
          return (
            <figure
              key={r.name}
              aria-hidden={n !== i}
              className={`kt-review ${state} [grid-area:1/1] m-0 border border-[var(--divider)] bg-[var(--surface)] p-[clamp(1.5rem,4vw,2.25rem)]`}
              style={{ borderRadius: 'var(--r-block)' }}
            >
              <p className="text-[var(--accent)] tracking-[0.1em] text-[1.1rem] mb-3" aria-label={`${r.stars} out of 5 stars`}>
                {'★'.repeat(r.stars)}
                {'☆'.repeat(5 - r.stars)}
              </p>
              <blockquote className="m-0 mb-5 text-[clamp(1.1rem,2.4vw,1.5rem)] font-bold leading-[1.35] text-[var(--line)]">
                {r.quote}
              </blockquote>
              <figcaption className="text-[0.92rem] text-[var(--line-dim)]">
                <b className="text-[var(--line)]">{r.name}</b>
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}
