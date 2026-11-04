'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Renders children inside the admin app root: keeps the admin tokens and sits above the rail and top bar. Client only. */
export function Portal({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<Element | null>(null);
  useEffect(() => { setTarget(document.querySelector('.ad-app') ?? document.body); }, []);
  return target ? createPortal(children, target) : null;
}

/** One modal for every admin dialog: solid dim (no blur), paper panel, Escape and outside click close. */
export function Modal({ onClose, children, width = 'max-w-lg', label, dismissOnBackdrop = true }: {
  onClose: () => void; children: ReactNode; width?: string; label: string; dismissOnBackdrop?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <Portal>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#0E2420]/55" onClick={dismissOnBackdrop ? onClose : undefined}>
        <div role="dialog" aria-modal="true" aria-label={label}
          className={`w-full ${width} max-h-[92dvh] overflow-y-auto rounded-xl bg-[#F4F0E6] border border-[#C9C3B3] text-[#0E2420] shadow-[0_28px_64px_rgba(14,36,32,.4),0_4px_10px_rgba(14,36,32,.18)]`}
          onClick={e => e.stopPropagation()}>
          {children}
        </div>
      </div>
    </Portal>
  );
}
