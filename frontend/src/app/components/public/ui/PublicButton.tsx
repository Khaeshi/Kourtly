'use client';
import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface PublicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    'bg-[var(--amber)] text-[var(--ink)] border-[var(--amber)] hover:brightness-110',
  secondary:
    'bg-[var(--public-accent-soft)] text-[var(--line)] border-[var(--divider)] hover:bg-[rgba(232,163,61,0.22)]',
  ghost:
    'bg-transparent text-[var(--line-dim)] border-transparent hover:text-[var(--line)]',
};

export function PublicButton({
  variant = 'secondary',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: PublicButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      disabled={isDisabled}
      className={`inline-flex items-center justify-center gap-2 border px-5 py-2.5 text-[0.78rem] font-bold tracking-[0.02em] transition-all duration-200 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed whitespace-nowrap ${VARIANT_CLASS[variant]} ${className}`}
      style={{ borderRadius: 'var(--r-pill)' }}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
}
