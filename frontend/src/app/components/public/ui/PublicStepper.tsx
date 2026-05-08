import React from 'react';

interface PublicStepperProps {
  labels: string[];
  step: number;
}

export function PublicStepper({ labels, step }: PublicStepperProps) {
  return (
    <div className="mb-10 flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:gap-0">
      {labels.map((label, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <div key={label} className="flex w-full items-center sm:w-auto">
            <div className={`flex w-full items-center gap-2 rounded-full px-2 py-1 transition-all duration-300 sm:w-auto sm:gap-1.5 sm:px-3 sm:py-1.5 ${active ? 'bg-[var(--public-accent-soft)] border border-[rgba(255,159,67,0.34)]' : 'border border-transparent'}`}>
              <div className={`flex h-4 w-4 items-center justify-center rounded-full text-[0.55rem] font-bold transition-all duration-300 sm:h-5 sm:w-5 ${
                done
                  ? 'bg-[var(--public-accent)] text-[#0a0f05]'
                  : active
                  ? 'bg-[var(--public-accent-soft)] border border-[rgba(255,159,67,0.55)] text-[var(--public-accent)]'
                  : 'bg-white/5 border border-white/10 text-white/30'
              }`}>{done ? '✓' : idx}</div>
              <span className={`truncate text-[0.65rem] font-medium transition-colors duration-300 sm:text-xs ${active ? 'text-[var(--public-accent)]' : done ? 'text-white/50' : 'text-white/20'}`}>{label}</span>
            </div>
            {i < labels.length - 1 && (
              <>
                <div className={`mx-2 h-4 w-px transition-colors duration-300 sm:hidden ${done ? 'bg-[rgba(255,159,67,0.34)]' : 'bg-white/10'}`} />
                <div className={`hidden h-px w-6 transition-colors duration-300 sm:block ${done ? 'bg-[rgba(255,159,67,0.34)]' : 'bg-white/10'}`} />
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
