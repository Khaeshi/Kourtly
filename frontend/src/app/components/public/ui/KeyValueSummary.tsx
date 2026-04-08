import React from 'react';

interface KeyValueSummaryProps {
  rows: [string, string][];
  title?: string;
  className?: string;
}

export function KeyValueSummary({ rows, title, className = '' }: KeyValueSummaryProps) {
  return (
    <div className={`bg-white/3 border border-white/6 rounded-xl p-4 sm:p-5 ${className}`}>
      {title ? <p className="text-[0.6rem] tracking-widest uppercase text-white/20 mb-3">{title}</p> : null}
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between items-center gap-4">
            <span className="text-[0.6rem] tracking-widest uppercase text-white/25 shrink-0">{label}</span>
            <span className="text-sm text-white/60 text-right">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
