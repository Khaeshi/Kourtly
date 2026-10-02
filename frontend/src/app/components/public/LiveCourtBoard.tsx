'use client';
import { useEffect, useState } from 'react';

type Player = { name: string; tier: string; games: number };

const INITIAL_ON: Player[] = [
  { name: 'Migs', tier: 'A', games: 12 },
  { name: 'Jo', tier: 'B', games: 9 },
  { name: 'Ana', tier: 'B', games: 10 },
  { name: 'Lei', tier: 'C', games: 8 },
];

const INITIAL_QUEUE: Player[] = [
  { name: 'Paolo', tier: 'C', games: 7 },
  { name: 'Rey', tier: 'D', games: 6 },
  { name: 'Bea', tier: 'B', games: 8 },
  { name: 'Nico', tier: 'C', games: 9 },
];

export default function LiveCourtBoard() {
  const [{ on, queue, tick }, setState] = useState({
    on: INITIAL_ON,
    queue: INITIAL_QUEUE,
    tick: 0,
  });

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = setInterval(() => {
      setState(s => {
        const [out, ...restOn] = s.on;
        const [inn, ...restQueue] = s.queue;
        return {
          on: [...restOn, inn],
          queue: [...restQueue, { ...out, games: out.games + 1 }],
          tick: s.tick + 1,
        };
      });
    }, 2600);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      aria-label="Sample live queue"
      role="group"
      className="border border-[var(--divider)] bg-[rgba(255,255,255,0.03)] p-5 animate-[kt-pop_.5s_cubic-bezier(.23,1,.32,1)_.1s_both]"
      style={{ borderRadius: 'var(--r-block)' }}
    >
      <div className="flex items-center justify-between mb-4">
        <h3 className="font-display text-[1rem] text-[var(--line)]">Court 2</h3>
        <span className="inline-flex items-center gap-1.5 font-mono-data text-[0.68rem] tracking-[0.08em] text-[var(--amber)]">
          <span className="kt-live-dot" aria-hidden="true" />
          LIVE
        </span>
      </div>

      <div className="grid grid-cols-4 gap-2 mb-4">
        {on.map((p, i) => (
          <div
            key={`${p.name}-on`}
            className={`flex flex-col items-center gap-1 px-1 py-3 bg-[rgba(255,255,255,0.04)] text-[0.8rem] text-[var(--line)] ${
              tick > 0 && i === on.length - 1 ? 'animate-[kt-pop_.35s_cubic-bezier(.23,1,.32,1)]' : ''
            }`}
            style={{ borderRadius: 10 }}
          >
            <span className="grid place-items-center w-[34px] h-[34px] rounded-full bg-[rgba(255,255,255,0.08)] text-[0.85rem]">
              {p.name[0]}
            </span>
            {p.name}
            <em className="not-italic text-[0.72rem] font-bold text-[var(--amber)]">{p.tier}</em>
          </div>
        ))}
      </div>

      <ul className="list-none m-0 p-0 border-t border-[var(--divider)]">
        {queue.map((p, i) => (
          <li
            key={`${p.name}-q`}
            className={`flex justify-between py-2.5 border-b border-[var(--divider)] text-[0.88rem] text-[var(--line)] ${
              tick > 0 && i === queue.length - 1 ? 'animate-[kt-fade_.3s_ease-out]' : ''
            }`}
          >
            <span>
              {i + 1}. {p.name}
            </span>
            <span className="text-[var(--line-dim)]">
              Tier {p.tier}, {p.games} games today
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}