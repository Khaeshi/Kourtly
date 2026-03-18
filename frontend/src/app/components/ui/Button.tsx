'use client';
import { ButtonHTMLAttributes } from 'react';

// ── Types ─────────────────────────────────────────────────────────────────────

type Variant = 'primary' | 'ghost' | 'danger' | 'warning' | 'dark';
type Size    = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  v?:       Variant;
  size?:    Size;
  loading?: boolean;
  icon?:    string; 
}

/**
 * @desc Button Map
 */

const VARIANT: Record<Variant, string> = {
  primary: 'bg-green-100/70 border border-green-300/60 text-green-700 hover:bg-green-100',
  ghost:   'bg-white border border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700',
  danger:  'bg-red-50 border border-red-200/60 text-red-400 hover:bg-red-100 hover:text-red-500',
  warning: 'bg-yellow-50 border border-yellow-200/60 text-yellow-600 hover:bg-yellow-100',
  dark:    'bg-gray-900 border border-gray-900 text-white hover:bg-gray-800',
};

const SIZE: Record<Size, string> = {
  sm: 'px-2.5 py-1 text-[0.7rem]',
  md: 'px-3 py-1.5 text-xs',
};

/**
 * @desc Component
 * @param param0 
 * @returns 
 */

export function Button({
  v       = 'ghost',
  size    = 'md',
  loading = false,
  icon,
  children,
  disabled,
  className = '',
  ...props
}: ButtonProps) {
  return (
    <button
      {...props}
      disabled={disabled || loading}
      className={[
        'inline-flex items-center gap-1.5 rounded-md font-medium',
        'cursor-pointer transition-all duration-150',
        'disabled:opacity-40 disabled:cursor-not-allowed',
        VARIANT[v],
        SIZE[size],
        className,
      ].join(' ')}
    >
      {loading ? (
        <>
          <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin" />
          {children}
        </>
      ) : (
        <>
          {icon && <span>{icon}</span>}
          {children}
        </>
      )}
    </button>
  );
}