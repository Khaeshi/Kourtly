import React from 'react';

type Variant = 'info' | 'error' | 'success' | 'warning';

const VARIANT_CLASS: Record<Variant, string> = {
  info: 'bg-[var(--public-surface-strong)] border-[var(--divider)] text-[var(--line-dim)]',
  error: 'bg-[var(--danger-soft)] border-[var(--danger)]/25 text-[var(--danger)]',
  success: 'bg-[var(--success-soft)] border-[var(--success)]/35 text-[var(--success)]',
  warning: 'bg-[var(--warning-soft)] border-[var(--warning)]/35 text-[var(--warning)]',
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
