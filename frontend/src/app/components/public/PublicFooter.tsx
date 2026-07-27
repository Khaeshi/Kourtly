interface PublicFooterProps {
  compact?: boolean;
}

export default function PublicFooter({ compact = false }: PublicFooterProps) {
  return (
    <footer
      className={`border-t border-[var(--divider)] px-[clamp(1.25rem,5vw,3rem)] flex justify-between items-center flex-wrap gap-3 text-[0.82rem] text-[var(--line-dim)] max-[480px]:flex-col max-[480px]:items-start max-[480px]:gap-1 max-[480px]:px-[1.1rem] ${
        compact ? 'py-3.5' : 'py-6 max-[480px]:py-5'
      }`}
    >
      <div>Playkou, built for badminton communities.</div>
      <div>Manila, Philippines</div>
    </footer>
  );
}
