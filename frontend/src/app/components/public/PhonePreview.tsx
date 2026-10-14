'use client';
import { useEffect, useRef } from 'react';

const SLOTS = ['9:00 AM', '10:00 AM', '11:00 AM', '12:00 PM', '1:00 PM', '2:00 PM'];

const LOOP = 7000; // ms
const T = (ms: number) => ms / LOOP; // ms -> keyframe offset
const EASE = 'ease'; // hover and colour changes
const OUT = 'cubic-bezier(0.23, 1, 0.32, 1)'; // ease-out-quint: things entering or leaving
const IN_OUT = 'cubic-bezier(0.77, 0, 0.175, 1)'; // ease-in-out-quart: things already on screen

const GOLD = '#E3A92B';
const GOLD_HOVER = '#F0B83A';
const TEAL = '#34B8A6';

type Frame = [offset: number, props: Keyframe, easing?: string];
const kf = (frames: Frame[]): Keyframe[] => frames.map(([offset, props, easing = EASE]) => ({ offset, easing, ...props }));

export default function PhonePreview() {
  const root = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLDivElement>(null);
  const confirmLabel = useRef<HTMLSpanElement>(null);
  const bookedLabel = useRef<HTMLSpanElement>(null);
  const headPick = useRef<HTMLParagraphElement>(null);
  const headBooked = useRef<HTMLParagraphElement>(null);
  const curX = useRef<HTMLDivElement>(null);
  const curY = useRef<HTMLDivElement>(null);
  const curPress = useRef<HTMLDivElement>(null);
  const ring = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || typeof el.animate !== 'function') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const opts: KeyframeAnimationOptions = { duration: LOOP, iterations: Infinity, fill: 'both' };
    const run = (node: HTMLElement | null, frames: Frame[]) => node?.animate(kf(frames), opts);

    // Moments (ms): 500 cursor starts, 1500 arrives, 1650 hover, 2100 press, 2250 booked, 3400 cursor leaves, 5600 reset
    const fadeOut = (): Frame[] => [
      [0, { opacity: 1 }],
      [T(2100), { opacity: 1 }],
      [T(2300), { opacity: 0 }],
      [T(5600), { opacity: 0 }],
      [T(5900), { opacity: 1 }],
      [1, { opacity: 1 }],
    ];
    const fadeIn = (): Frame[] => [
      [0, { opacity: 0 }],
      [T(2100), { opacity: 0 }],
      [T(2300), { opacity: 1 }],
      [T(5600), { opacity: 1 }],
      [T(5900), { opacity: 0 }],
      [1, { opacity: 0 }],
    ];

    const anims = [
      run(btn.current, [
        [0, { backgroundColor: GOLD, transform: 'none' }],
        [T(1500), { backgroundColor: GOLD, transform: 'none' }],
        [T(1650), { backgroundColor: GOLD_HOVER, transform: 'translateY(-1px)' }],
        [T(2100), { backgroundColor: GOLD_HOVER, transform: 'translateY(-1px)' }],
        [T(2200), { backgroundColor: GOLD_HOVER, transform: 'scale(0.97)' }],
        [T(2450), { backgroundColor: TEAL, transform: 'none' }],
        [T(5600), { backgroundColor: TEAL, transform: 'none' }],
        [T(5900), { backgroundColor: GOLD, transform: 'none' }],
        [1, { backgroundColor: GOLD, transform: 'none' }],
      ]),
      run(confirmLabel.current, fadeOut()),
      run(bookedLabel.current, fadeIn()),
      run(headPick.current, fadeOut()),
      run(headBooked.current, fadeIn()),

      // Cursor arc: X eases out (fast then settles), Y eases in-out (slower start)
      run(curX.current, [
        [0, { transform: 'translateX(130px)', opacity: 0 }],
        [T(500), { transform: 'translateX(130px)', opacity: 0 }, OUT],
        [T(1500), { transform: 'translateX(0)', opacity: 1 }],
        [T(3400), { transform: 'translateX(0)', opacity: 1 }, OUT],
        [T(4000), { transform: 'translateX(80px)', opacity: 0 }],
        [1, { transform: 'translateX(80px)', opacity: 0 }],
      ]),
      run(curY.current, [
        [0, { transform: 'translateY(140px)' }],
        [T(500), { transform: 'translateY(140px)' }, IN_OUT],
        [T(1500), { transform: 'translateY(0)' }],
        [T(3400), { transform: 'translateY(0)' }, OUT],
        [T(4000), { transform: 'translateY(100px)' }],
        [1, { transform: 'translateY(100px)' }],
      ]),
      run(curPress.current, [
        [0, { transform: 'scale(1)' }],
        [T(2100), { transform: 'scale(1)' }],
        [T(2200), { transform: 'scale(0.86)' }],
        [T(2500), { transform: 'scale(1)' }, OUT],
        [1, { transform: 'scale(1)' }],
      ]),
      run(ring.current, [
        [0, { transform: 'scale(0.3)', opacity: 0 }],
        [T(2200), { transform: 'scale(0.3)', opacity: 0.5 }, OUT],
        [T(2750), { transform: 'scale(1.7)', opacity: 0 }],
        [1, { transform: 'scale(1.7)', opacity: 0 }],
      ]),
    ].filter((a): a is Animation => Boolean(a));

    anims.forEach((a) => a.pause());
    const io = new IntersectionObserver(
      ([entry]) => anims.forEach((a) => (entry.isIntersecting ? a.play() : a.pause())),
      { threshold: 0.4 },
    );
    io.observe(el);

    return () => {
      io.disconnect();
      anims.forEach((a) => a.cancel());
    };
  }, []);

  return (
    <div
      ref={root}
      aria-hidden="true"
      className="mx-auto w-full max-w-[340px] border-[6px] border-[#19352F] bg-[#0E2420] p-6 text-[#F5F1E8] pointer-events-none"
      style={{ borderRadius: 36 }}
    >
      <p className="font-mono-data text-[0.72rem] text-[#AABAB3] mb-1">COURT 1 · SATURDAY</p>

      <div className="grid mb-4">
        <p ref={headPick} className="[grid-area:1/1] text-[1.2rem] font-extrabold m-0">Pick a start time</p>
        <p ref={headBooked} className="[grid-area:1/1] text-[1.2rem] font-extrabold m-0" style={{ opacity: 0 }}>
          You&apos;re booked
        </p>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-5">
        {SLOTS.map((s) => (
          <div
            key={s}
            className={`font-mono-data text-[0.78rem] text-center py-2.5 rounded-[10px] border ${
              s === '12:00 PM'
                ? 'bg-[#E3A92B] text-[#0E2420] border-[#E3A92B] font-bold'
                : s === '2:00 PM'
                  ? 'border-[rgba(245,241,232,.14)] opacity-40'
                  : 'bg-[#142C27] border-[rgba(245,241,232,.14)]'
            }`}
          >
            {s}
          </div>
        ))}
      </div>

      <div className="relative">
        <div
          ref={btn}
          className="grid place-items-center text-[#0E2420] font-extrabold rounded-full py-3 text-[0.95rem]"
          style={{ backgroundColor: GOLD, willChange: 'transform' }}
        >
          <span ref={confirmLabel} className="[grid-area:1/1]">Confirm · ₱210</span>
          <span ref={bookedLabel} className="[grid-area:1/1]" style={{ opacity: 0 }}>Booked ✓</span>
        </div>

        <span
          ref={ring}
          className="absolute rounded-full border-2 border-white"
          style={{ left: '62%', top: '50%', width: 40, height: 40, marginLeft: -20, marginTop: -20, opacity: 0 }}
        />

        {/* Cursor: three nested layers so X, Y and the click scale each get their own easing */}
        <div ref={curX} className="absolute z-[2]" style={{ left: '62%', top: '50%', opacity: 0 }}>
          <div ref={curY} style={{ willChange: 'transform' }}>
            <div ref={curPress} style={{ transformOrigin: '0 0' }}>
              <svg
                width="22"
                height="30"
                viewBox="0 0 22 30"
                style={{ display: 'block', marginLeft: -2, marginTop: -2, filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.4))' }}
              >
                <path
                  d="M2 2 L2 23.5 L8 18 L12.2 27.5 L16 25.8 L11.8 16.5 L19.5 16.5 Z"
                  fill="#fff"
                  stroke="#0E2420"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}