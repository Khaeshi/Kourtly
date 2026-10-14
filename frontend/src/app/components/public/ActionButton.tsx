'use client';
import { useEffect, useRef, useState } from 'react';

interface ActionButtonProps {
  label: string; // idle label, e.g. "Clear tab"
  doneLabel: string; // confirmation, e.g. "Cleared!"
  variant?: 'solid' | 'text'; // solid = yellow pill, text = yellow text link
  holdMs?: number; // how long the confirmation stays before it reverts
  className?: string;
  onClick?: () => void;
}

export default function ActionButton({ label, doneLabel, variant = 'solid', holdMs = 1600, className = '', onClick }: ActionButtonProps) {
  const [done, setDone] = useState(false);
  const [pressed, setPressed] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  const click = () => {
    if (done) return;
    setDone(true);
    onClick?.();
    timer.current = window.setTimeout(() => setDone(false), holdMs);
  };

  const base =
    variant === 'solid'
      ? 'pub-cta pub-cta-primary'
      : 'inline-flex items-center border-none bg-transparent p-0 font-bold cursor-pointer text-[var(--amber)]';
  const doneClass = done ? (variant === 'solid' ? '!bg-[var(--success)] !text-[var(--ink)]' : '!text-[var(--success)]') : '';

  return (
    <button
      type="button"
      onClick={click}
      onPointerDown={() => setPressed(true)}
      onPointerUp={() => setPressed(false)}
      onPointerLeave={() => setPressed(false)}
      onPointerCancel={() => setPressed(false)}
      className={`${base} ${doneClass} !transition-[transform,background-color,color] !duration-200 motion-reduce:!transition-none ${className}`}
      style={pressed ? { transform: 'scale(0.97)' } : undefined}
    >
      <span className="relative inline-grid place-items-center">
        <span aria-hidden={done} className={`[grid-area:1/1] transition-opacity duration-200 motion-reduce:transition-none ${done ? 'opacity-0' : 'opacity-100'}`}>
          {label}
        </span>
        <span
          aria-hidden={!done}
          className={`[grid-area:1/1] transition-[opacity,transform] duration-200 ease-out motion-reduce:transition-none ${done ? 'opacity-100 scale-100' : 'opacity-0 scale-90'}`}
        >
          {doneLabel}
        </span>
      </span>
      <span className="sr-only" role="status">{done ? doneLabel : ''}</span>
    </button>
  );
}