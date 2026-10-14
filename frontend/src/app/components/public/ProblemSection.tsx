import LiveCourtBoard from './LiveCourtBoard';
import Reveal from './Reveal';

const PROBLEMS = [
  { title: 'Bookings scattered across Messenger', description: 'Chat threads mean double-bookings and lost requests.' },
  { title: 'Queues on paper or Excel', description: 'A spreadsheet is outdated by the time someone checks it.' },
  { title: 'No record of items or stock', description: 'Shuttlecocks, drinks, and rentals tracked from memory, with no way to see what is left.' },
  { title: 'Records that get lost', description: 'Paper logs get misplaced, wet, or thrown out, with no way to recover them.' },
];

export default function ProblemSection() {
  return (
    <section className="type-proto py-[clamp(3.5rem,7vw,5.5rem)] max-[480px]:py-[2.6rem]">
      <div className="public-wrap">
        <div className="section-head">
          <span className="eyebrow">The problem</span>
          <h2 className="font-display t-h2 text-[var(--line)] mb-3">
            From Messenger threads to one live board
          </h2>
          <p className="text-[var(--line-dim)] t-lead">
            Courts across the Philippines still track their day on Messenger, spreadsheets, and notebooks. It works,
            until it doesn&apos;t.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-2 items-start">
          <Reveal>
            <div
              className="border border-[var(--divider)] bg-[var(--surface)] p-7 h-full"
              style={{ borderRadius: 'var(--r-block)' }}
            >
              <p className="text-[0.78rem] font-bold uppercase tracking-[0.1em] text-[var(--line-dim)] mb-5">Before</p>
              <ul className="list-none m-0 p-0 flex flex-col gap-5">
                {PROBLEMS.map((item) => (
                  <li key={item.title}>
                    <h3 className="text-[1.05rem] font-bold text-[var(--line)] mb-1">{item.title}</h3>
                    <p className="text-[0.92rem] text-[var(--line-dim)] leading-relaxed">{item.description}</p>
                  </li>
                ))}
              </ul>
            </div>
          </Reveal>
          <Reveal delay={120}>
            <p className="text-[0.78rem] font-bold uppercase tracking-[0.1em] text-[var(--line-dim)] mb-3 md:hidden">With Kourtly</p>
            <LiveCourtBoard />
          </Reveal>
        </div>
      </div>
    </section>
  );
}
