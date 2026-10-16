'use client';

interface BookingStepperProps {
  labels: string[];
  step: number; // 1-based
  onStepClick?: (n: number) => void; // finished steps are tappable so answers can be edited
}

export default function BookingStepper({ labels, step, onStepClick }: BookingStepperProps) {
  return (
    <ol className="m-0 mb-8 grid list-none gap-2 p-0 sm:gap-3" style={{ gridTemplateColumns: `repeat(${labels.length}, minmax(0, 1fr))` }} aria-label="Booking progress">
      {labels.map((label, i) => {
        const n = i + 1;
        const done = n < step;
        const current = n === step;
        const color = done ? 'var(--success)' : current ? 'var(--amber)' : 'var(--line-faint)';
        const inner = (
          <>
            <span className="mb-2 block h-1 rounded-full" style={{ background: done ? 'var(--success)' : current ? 'var(--amber)' : 'var(--divider-strong)' }} />
            <span className="text-[0.78rem] font-bold sm:text-[0.82rem]" style={{ color }}>
              {done ? '✓ ' : <span className="hidden sm:inline">{n} </span>}
              {label}
            </span>
          </>
        );
        return (
          <li key={label} aria-current={current ? 'step' : undefined}>
            {done && onStepClick ? (
              <button type="button" onClick={() => onStepClick(n)} className="block w-full cursor-pointer border-none bg-transparent p-0 text-left" aria-label={`Edit ${label}`}>
                {inner}
              </button>
            ) : (
              inner
            )}
          </li>
        );
      })}
    </ol>
  );
}
