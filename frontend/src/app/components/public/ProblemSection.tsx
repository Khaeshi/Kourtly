const PROBLEMS = [
  {
    title: 'Bookings scattered across Messenger',
    description: 'Manual booking through chat threads means double-bookings and lost requests.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
      </svg>
    ),
  },
  {
    title: 'Queues on paper or Excel',
    description: 'A queue on a spreadsheet is already outdated by the time someone checks it.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <line x1="8" y1="6" x2="21" y2="6" />
        <line x1="8" y1="12" x2="21" y2="12" />
        <line x1="8" y1="18" x2="21" y2="18" />
        <line x1="3" y1="6" x2="3.01" y2="6" />
        <line x1="3" y1="12" x2="3.01" y2="12" />
        <line x1="3" y1="18" x2="3.01" y2="18" />
      </svg>
    ),
  },
  {
    title: 'No record of item orders',
    description: 'Shuttlecocks, drinks, and rentals tracked from memory, with nothing written down.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
        <path d="M3 6h18" />
        <path d="M16 10a4 4 0 0 1-8 0" />
      </svg>
    ),
  },
  {
    title: 'Records that get lost',
    description: 'Paper logs get misplaced, wet, or thrown out, with no way to recover them.',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <path d="M14 2v6h6" />
        <line x1="9" y1="14" x2="15" y2="18" />
        <line x1="15" y1="14" x2="9" y2="18" />
      </svg>
    ),
  },
  {
    title: 'No stock visibility',
    description: "No way to know what's left in inventory until you run out mid-session.",
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 8V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v2" />
        <path d="M3 8h18l-1 12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2Z" />
        <line x1="9" y1="12" x2="15" y2="12" />
      </svg>
    ),
  },
];

export default function ProblemSection() {
  return (
    <section className="py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
      <div className="public-wrap">
        <div className="section-head">
          <span className="eyebrow">The problem</span>
          <h2 className="font-display text-[clamp(1.9rem,4.2vw,2.9rem)] text-[var(--line)] mb-3">
            Everything still running on paper and chat
          </h2>
          <p className="text-[var(--line-dim)] text-[clamp(0.95rem,1.4vw,1.02rem)]">
            Courts across Muntinlupa to Laguna are still tracking their day on Messenger,
            spreadsheets, and notebooks. It works, until it doesn&apos;t.
          </p>
        </div>

        <div
          className="grid gap-[1.1rem]"
          style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}
        >
          {PROBLEMS.map((item) => (
            <div key={item.title} className="feature-card">
              <div
                className="mb-4 text-[var(--amber)]"
                style={{ width: 28, height: 28 }}
              >
                {item.icon}
              </div>
              <h3 className="text-[1.02rem] font-semibold text-[var(--line)] mb-2">
                {item.title}
              </h3>
              <p className="text-[0.92rem] text-[var(--line-dim)] leading-relaxed">
                {item.description}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}