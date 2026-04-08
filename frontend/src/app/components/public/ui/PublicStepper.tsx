import React from 'react';

interface PublicStepperProps {
  labels: string[];
  step: number;
}

export function PublicStepper({ labels, step }: PublicStepperProps) {
  return (
    <div className="flex items-center gap-0 mb-10">
      {labels.map((label, i) => {
        const idx = i + 1;
        const active = idx === step;
        const done = idx < step;
        return (
          <div key={label} className="flex items-center">
            <div className={`flex items-center gap-1.5 px-2 py-1 sm:px-3 sm:py-1.5 rounded-full transition-all duration-300 ${active ? 'bg-[var(--public-accent-soft)] border border-[rgba(255,159,67,0.34)]' : 'border border-transparent'}`}>
              <div className={`w-4 h-4 sm:w-5 sm:h-5 rounded-full flex items-center justify-center text-[0.55rem] font-bold transition-all duration-300 ${
                done
                  ? 'bg-[var(--public-accent)] text-[#0a0f05]'
                  : active
                  ? 'bg-[var(--public-accent-soft)] border border-[rgba(255,159,67,0.55)] text-[var(--public-accent)]'
                  : 'bg-white/5 border border-white/10 text-white/30'
              }`}>{done ? '✓' : idx}</div>
              <span className={`text-[0.6rem] sm:text-xs font-medium transition-colors duration-300 ${active ? 'text-[var(--public-accent)]' : done ? 'text-white/50' : 'text-white/20'} ${!active && !done ? 'hidden sm:inline' : ''}`}>{label}</span>
            </div>
            {i < labels.length - 1 && <div className={`w-3 sm:w-6 h-px transition-colors duration-300 ${done ? 'bg-[rgba(255,159,67,0.34)]' : 'bg-white/10'}`} />}
          </div>
        );
      })}
    </div>
  );
}
