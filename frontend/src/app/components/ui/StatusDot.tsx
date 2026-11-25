import type { ReactNode } from 'react';

export type StatusTone = 'ok' | 'wait' | 'off' | 'bad';
const DOT: Record<StatusTone, string> = {
  ok: 'bg-[#1F8A7A]', wait: 'bg-[#B8821A]', off: 'bg-[#8A9A94]', bad: 'bg-[#C4401F]',
};

/** Status = dot + text. No pills around static metadata. */
export function StatusDot({ tone = 'ok', children }: { tone?: StatusTone; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-sm">
      <span aria-hidden="true" className={`w-2 h-2 rounded-full shrink-0 ${DOT[tone]}`} />
      {children}
    </span>
  );
}
