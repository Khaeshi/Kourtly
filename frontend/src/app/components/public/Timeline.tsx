export interface TimelineStep {
  title: string;
  description: string;
  chips?: { letter: string; label: string }[];
}

interface TimelineProps {
  steps: TimelineStep[];
}

export default function Timeline({ steps }: TimelineProps) {
  return (
    <div className="timeline">
      {steps.map((step) => (
        <div key={step.title} className="tl-item">
          <h4 className="text-[1.15rem] font-bold mb-1.5 text-[var(--line)]">{step.title}</h4>
          <p className="text-[var(--line-dim)] text-[0.92rem] max-w-[52ch]">{step.description}</p>
          {step.chips && step.chips.length > 0 && (
            <div className="flex gap-2 flex-wrap mt-3.5 max-[480px]:gap-1.5">
              {step.chips.map((chip) => (
                <span key={chip.letter} className="public-chip max-[480px]:text-[0.7rem] max-[480px]:px-[0.55rem] max-[480px]:py-[0.26rem]">
                  <strong className="text-[var(--amber)]">{chip.letter}</strong> {chip.label}
                </span>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
