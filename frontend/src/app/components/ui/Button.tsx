'use client';
import { ButtonHTMLAttributes } from 'react';

// ── Types (unchanged API: v, size, loading, icon) ─────────────────────────────

type Variant = 'primary' | 'ghost' | 'danger' | 'warning' | 'dark';
type Size    = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  v?:       Variant;
  size?:    Size;
  loading?: boolean;
  icon?:    string;
}

/**
 * @desc Button map. Pine / paper / gold admin look.
 * primary = the one main action (gold). danger = named destructive text button.
 */
const VARIANT: Record<Variant, string> = {
  primary: 'bg-[#E3A92B] border border-[#E3A92B] text-[#0E2420] font-bold shadow-[0_2px_0_#B8821A,0_6px_14px_rgba(184,130,26,.25)] hover:bg-[#F0B83A] active:shadow-[0_1px_0_#B8821A]',
  ghost:   'bg-[#FBF9F3] border border-[#C9C3B3] text-[#0E2420] shadow-[0_1px_0_rgba(14,36,32,.1),0_2px_6px_rgba(14,36,32,.06)] hover:border-[#0E2420]',
  danger:  'bg-transparent border border-transparent text-[#B8431F] font-bold hover:bg-[#B8431F]/10',
  warning: 'bg-[#FBEBC4] border border-[#B8821A]/40 text-[#6B4A0C] hover:bg-[#F6DFA3]',
  dark:    'bg-[#0E2420] border border-[#0E2420] text-[#F5F1E8] hover:bg-[#19352F]',
};

const SIZE: Record<Size, string> = {
  sm: 'min-h-[36px] [@media(pointer:coarse)]:min-h-[44px] px-3 text-xs',
  md: 'min-h-[44px] px-4 text-sm',
};


export function buttonClass(v: Variant = 'ghost', size: Size = 'md', extra = ''): string {
  return [
    'inline-flex items-center justify-center gap-1.5 rounded-md font-medium',
    'cursor-pointer transition-[transform,background-color,border-color,color] duration-150 ease-out',
    'active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
    'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
    VARIANT[v], SIZE[size], extra,
  ].join(' ');
}

/**
 * @desc Component
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
        'inline-flex items-center justify-center gap-1.5 rounded-md font-medium',
        'cursor-pointer transition-[transform,background-color,border-color,color] duration-150 ease-out',
        'active:scale-[0.97] motion-reduce:transition-none motion-reduce:active:scale-100',
        'disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100',
        VARIANT[v],
        SIZE[size],
        className,
      ].join(' ')}
    >
      {loading ? (
        <>
          <span className="w-3 h-3 rounded-full border-2 border-current border-t-transparent animate-spin motion-reduce:animate-none" />
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
