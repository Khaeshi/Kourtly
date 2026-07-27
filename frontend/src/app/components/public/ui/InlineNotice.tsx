import React from 'react';

type Variant = 'info' | 'error' | 'success' | 'warning';

const VARIANT_CLASS: Record<Variant, string> = {
  info: 'bg-white/5 border-[var(--divider)] text-[var(--line-dim)]',
  error: 'bg-red-500/10 border-red-500/25 text-red-300',
  success: 'bg-[rgba(232,163,61,0.1)] border-[rgba(232,163,61,0.35)] text-[var(--amber)]',
  warning: 'bg-[rgba(232,163,61,0.1)] border-[rgba(232,163,61,0.35)] text-[var(--amber)]',
};

interface InlineNoticeProps {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
}

export function InlineNotice({ children, className = '', variant = 'info' }: InlineNoticeProps) {
  return (
    <div className={`border px-4 py-3 text-sm ${VARIANT_CLASS[variant]} ${className}`} style={{ borderRadius: 'var(--r-block)' }}>
      {children}
    </div>
  );
}
