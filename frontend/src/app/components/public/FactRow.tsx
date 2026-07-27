export interface Fact {
  label: string;
  description: string;
}

interface FactRowProps {
  facts: Fact[];
}

export default function FactRow({ facts }: FactRowProps) {
  return (
    <div className="facts-list">
      {facts.map((fact) => (
        <div key={fact.label} className="fact-row">
          <span className="font-mono-data text-[0.8rem] text-[var(--amber)]">{fact.label}</span>
          <p className="text-[var(--line-dim)] text-[0.95rem]">{fact.description}</p>
        </div>
      ))}
    </div>
  );
}
