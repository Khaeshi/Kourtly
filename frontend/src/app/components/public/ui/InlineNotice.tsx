import React from 'react';

type Variant = 'info' | 'error' | 'success' | 'warning';

const VARIANT_CLASS: Record<Variant, string> = {
  info: 'bg-white/5 border-white/10 text-white/70',
  error: 'bg-red-500/10 border-red-500/25 text-red-300',
  success: 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300',
  warning: 'bg-amber-500/10 border-amber-500/25 text-amber-300',
};

interface InlineNoticeProps {
  children: React.ReactNode;
  className?: string;
  variant?: Variant;
}

export function InlineNotice({ children, className = '', variant = 'info' }: InlineNoticeProps) {
  return (
    <div className={`rounded-xl border px-4 py-3 text-sm ${VARIANT_CLASS[variant]} ${className}`}>
      {children}
    </div>
  );
}
