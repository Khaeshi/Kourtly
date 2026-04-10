'use client';
import React from 'react';

type Variant = 'primary' | 'secondary' | 'ghost';

interface PublicButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  loading?: boolean;
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary:
    'bg-[var(--public-accent)] text-[#0b1208] border-[var(--public-accent)] hover:bg-[var(--public-accent-strong)] hover:border-[var(--public-accent-strong)]',
  secondary:
    'bg-[var(--public-accent-soft)] text-[var(--public-accent)] border-[rgba(var(--public-accent-rgb),0.36)] hover:bg-[rgba(var(--public-accent-rgb),0.24)]',
  ghost:
    'bg-transparent text-[var(--public-text-muted)] border-transparent hover:text-[var(--public-text)]',
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
      className={`inline-flex items-center justify-center gap-2 rounded-[10px] border px-5 py-2.5 text-[0.78rem] tracking-[0.05em] transition-all duration-200 cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${VARIANT_CLASS[variant]} ${className}`}
      {...props}
    >
      {loading ? 'Loading...' : children}
    </button>
  );
}
