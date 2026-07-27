interface SectionHeadProps {
  eyebrow?: string;
  title: string;
  description?: string;
}

export default function SectionHead({ eyebrow, title, description }: SectionHeadProps) {
  return (
    <div className="section-head">
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h3 className="font-display text-[clamp(1.6rem,3.2vw,2.3rem)] mb-3 text-[var(--line)]">{title}</h3>
      {description && <p className="text-[var(--line-dim)] text-[0.95rem]">{description}</p>}
    </div>
  );
}
