import React from 'react';

interface KeyValueSummaryProps {
  rows: [string, string][];
  title?: string;
  className?: string;
}

export function KeyValueSummary({ rows, title, className = '' }: KeyValueSummaryProps) {
  return (
    <div className={`public-card p-4 sm:p-5 ${className}`}>
      {title ? <p className="section-head eyebrow mb-3">{title}</p> : null}
      <div className="space-y-2">
        {rows.map(([label, value]) => (
          <div key={label} className="flex justify-between items-center gap-4">
            <span className="font-mono-data text-[0.6rem] tracking-widest uppercase text-[var(--line-faint)] shrink-0">{label}</span>
            <span className="text-sm text-[var(--line-dim)] text-right">{value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
