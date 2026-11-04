'use client';

const BTN = 'w-11 h-11 rounded-md border border-[#C9C3B3] bg-[#FBF9F3] text-[#0E2420] text-lg leading-none cursor-pointer transition-transform active:scale-[0.97] motion-reduce:active:scale-100 disabled:opacity-40 disabled:cursor-not-allowed';

export function Stepper({ value, onChange, disabled, label }: {
  value: number; onChange: (next: number) => void; disabled?: boolean; label: string;
}) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button type="button" aria-label={`One less ${label}`} disabled={disabled} className={BTN}
        onClick={e => { e.stopPropagation(); onChange(Math.max(1, value - 1)); }}>−</button>
      <span className="ad-mono text-sm font-bold min-w-[24px] text-center">{value}</span>
      <button type="button" aria-label={`One more ${label}`} disabled={disabled} className={BTN}
        onClick={e => { e.stopPropagation(); onChange(value + 1); }}>+</button>
    </div>
  );
}
