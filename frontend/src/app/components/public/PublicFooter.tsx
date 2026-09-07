interface PublicFooterProps {
  /** Tighter footer for content-heavy pages (courts directory, etc.) */
  compact?: boolean;
}

export default function PublicFooter({ compact = false }: PublicFooterProps) {
  return (
    <footer className="px-[clamp(1.25rem,5vw,3rem)]">
      {!compact && (
        <div className="max-w-[1180px] mx-auto pt-[clamp(2.75rem,6vw,4rem)] pb-[clamp(2.25rem,5vw,3.25rem)] flex justify-between items-start flex-wrap gap-4 max-[480px]:flex-col max-[480px]:items-start">
          <p className="font-display text-[clamp(1.5rem,3.4vw,2.3rem)] text-[var(--line)] leading-[0.95]">
            Book more.
            <br />
            Manage less.
          </p>
          <p className="text-[0.78rem] tracking-[0.08em] text-[var(--line-faint)] shrink-0">
            Playkou
          </p>
        </div>
      )}

      <div
        className={`max-w-[1180px] mx-auto border-t border-[var(--divider)] flex justify-between items-center flex-wrap text-[var(--line-dim)] max-[480px]:flex-col max-[480px]:items-start ${
          compact
            ? 'py-2 gap-1.5 text-[0.72rem] max-[480px]:gap-0.5'
            : 'py-5 gap-3 text-[0.78rem] max-[480px]:gap-1'
        }`}
      >
        <div>&copy; {new Date().getFullYear()} Playkou, built for badminton communities.</div>
        <div className={compact ? 'text-[var(--line-faint)]' : undefined}>Muntinlupa &ndash; Laguna, Philippines</div>
      </div>
    </footer>
  );
}