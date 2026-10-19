import type { ReactNode } from 'react';
import ActionButton from './ActionButton';
const CARD = 'border border-[var(--divider)] bg-[var(--surface)] rounded-[var(--r-block)]';
const MONO = 'font-mono-data';
const T = {
  paid: 'bg-[var(--success)] text-[var(--ink)]',
  open: 'bg-[var(--accent)] text-[var(--ink)]',
  pend: 'border-2 border-dashed border-[var(--line-dim)] text-[var(--line)]',
} as const;

type Block = { t: keyof typeof T; s: number; e: number; title: string; sub: string };
const H = 48;
const HOURS = Array.from({ length: 12 }, (_, i) => {
  const h = 9 + i;
  return `${h > 12 ? h - 12 : h} ${h < 12 ? 'AM' : 'PM'}`;
});
const DAYS = [
  ['Tue', 13], ['Wed', 14], ['Thu', 15], ['Fri', 16], ['Sat', 17], ['Sun', 18], ['Mon', 19],
] as const;
const COURTS: Block[][] = [
  [
    { t: 'open', s: 9, e: 11, title: 'Open play', sub: '9 AM to 11 AM' },
    { t: 'pend', s: 12, e: 14, title: 'Juan dela Cruz', sub: 'Online · 4 players · ₱420' },
    { t: 'paid', s: 18, e: 19, title: 'Ana R.', sub: '6 PM' },
  ],
  [
    { t: 'paid', s: 10, e: 11, title: 'Lei S.', sub: '10 AM' },
    { t: 'paid', s: 15, e: 17, title: 'Paolo M.', sub: '3 PM to 5 PM' },
  ],
  [
    { t: 'paid', s: 9, e: 10, title: 'Rey D.', sub: '9 AM' },
    { t: 'open', s: 18, e: 20, title: 'Open play', sub: '6 PM to 8 PM' },
  ],
  [
    { t: 'pend', s: 14, e: 16, title: 'Khael', sub: 'Pending' },
    { t: 'paid', s: 19, e: 20, title: 'Nico', sub: '7 PM' },
  ],
];

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="mb-3">
      <div className="text-[0.75rem] text-[var(--line-dim)] mb-1">{label}</div>
      <div className="h-[42px] flex items-center px-3.5 rounded-[10px] border border-[var(--divider-strong)] bg-[var(--page-bg)]">{value}</div>
    </div>
  );
}

function Table({ cols, head, rows, pre }: { cols: string; head: string[]; rows: ReactNode[][]; pre?: ReactNode }) {
  const g = { gridTemplateColumns: cols };
  return (
    <div className={`${CARD} overflow-hidden overflow-x-auto`}>
      <div className="min-w-[560px]">
        {pre}
        <div className="grid px-5 py-3 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[var(--line-dim)] border-t border-[var(--divider)]" style={g}>
          {head.map((h) => <span key={h}>{h}</span>)}
        </div>
        {rows.map((r, i) => (
          <div key={i} className="grid px-5 py-3 text-[0.92rem] items-center border-t border-[var(--divider)]" style={g}>
            {r.map((c, j) => <span key={j}>{c}</span>)}
          </div>
        ))}
      </div>
    </div>
  );
}

const Teal = ({ children }: { children: ReactNode }) => <span className="text-[var(--success)]">{children}</span>;
const Dim = ({ children }: { children: ReactNode }) => <span className="text-[var(--line-dim)]">{children}</span>;

export function ScheduleDashboard() {
  return (
    <div className={`${CARD} p-5 md:p-7`}>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mb-5">
        <p className="text-[1.3rem] font-bold m-0">Booking schedule</p>
        {([['Paid', 'bg-[var(--success)]'], ['Open play', 'bg-[var(--accent)]']] as const).map(([l, c]) => (
          <span key={l} className="flex items-center gap-2 text-[0.85rem] text-[var(--line-dim)]"><i className={`w-3.5 h-3.5 rounded ${c}`} />{l}</span>
        ))}
        <span className="flex items-center gap-2 text-[0.85rem] text-[var(--line-dim)]"><i className="w-3.5 h-3.5 rounded border-2 border-dashed border-[var(--line-dim)]" />Pending</span>
        <span className={`${MONO} ml-auto text-[0.75rem] text-[var(--amber)]`}>Basic+</span>
      </div>
      <div className="grid gap-4 md:grid-cols-[110px_1fr] items-start">
        <div className="flex md:flex-col gap-2 overflow-x-auto pb-1 md:pb-0">
          {DAYS.map(([d, n], i) => (
            <div key={n} className={`relative shrink-0 w-[84px] md:w-auto h-[76px] rounded-[20px] flex flex-col items-center justify-center border ${(i as number) === 4 ? 'bg-[var(--accent)] text-[var(--ink)] border-transparent' : 'bg-[var(--page-bg)] border-[var(--divider)]'}`}>
              {i === 0 && <i className={`absolute top-2.5 right-3 w-2 h-2 rounded-full ${(i as number) === 4 ? 'bg-[var(--ink)]' : 'bg-[var(--success)]'}`} />}
              <span className="text-[0.8rem]">{d}</span>
              <b className="text-[1.5rem] leading-[1.1]">{n}</b>
              <span className="text-[0.8rem]">Oct</span>
            </div>
          ))}
        </div>
        <div className="overflow-x-auto">
          <div className="min-w-[640px] grid grid-cols-[64px_repeat(4,1fr)] rounded-[18px] border border-[var(--divider)] overflow-hidden">
            <div className="h-12 border-b border-[var(--divider)]" />
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="h-12 flex items-center justify-center font-bold border-b border-l border-[var(--divider)]">Court {n}</div>
            ))}
            <div>{HOURS.map((h) => <div key={h} className="flex items-center justify-center text-[0.8rem] text-[var(--line-dim)]" style={{ height: H }}>{h}</div>)}</div>
            {COURTS.map((blocks, c) => (
              <div
                key={c}
                className="relative border-l border-[var(--divider)]"
                style={{ height: H * 12, backgroundImage: `repeating-linear-gradient(to bottom, transparent 0, transparent ${H - 1}px, var(--divider) ${H - 1}px, var(--divider) ${H}px)` }}
              >
                {blocks.map((b) => (
                  <div key={b.title + b.s} className={`absolute left-1 right-1 rounded-xl px-3 py-2 overflow-hidden ${T[b.t]}`} style={{ top: (b.s - 9) * H + 3, height: (b.e - b.s) * H - 6 }}>
                    <b className="block text-[0.85rem]">{b.title}</b>
                    <span className="text-[0.75rem]">{b.sub}</span>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BlockTimePreview() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={`${CARD} p-6`}>
        <p className="font-bold text-[1.1rem] mb-4">Block time</p>
        <div className="grid grid-cols-2 gap-x-3.5"><Field label="Court" value="Court 2" /><Field label="Date" value="Saturday" /><Field label="From" value="1:00 PM" /><Field label="To" value="3:00 PM" /></div>
        <Field label="Reason" value="Net replacement" />
        <ActionButton label="Block time" doneLabel="Blocked!" className="mt-1" />
      </div>
      <div className={`${CARD} p-6`}>
        <p className="font-bold text-[1.1rem] mb-4">Court 2 · Saturday</p>
        <div className="grid grid-cols-[56px_1fr]">
          <div>{['12 PM', '1 PM', '2 PM', '3 PM'].map((h) => <div key={h} className="h-12 flex items-center text-[0.8rem] text-[var(--line-dim)]">{h}</div>)}</div>
          <div className="relative border-l border-[var(--divider)] h-[192px]" style={{ backgroundImage: 'repeating-linear-gradient(to bottom, transparent 0, transparent 47px, var(--divider) 47px, var(--divider) 48px)' }}>
            <div className={`absolute left-1.5 right-1.5 top-[3px] h-[42px] rounded-[10px] px-2.5 py-1.5 text-[0.8rem] font-bold ${T.paid}`}>Lei S.</div>
            <div className="absolute left-1.5 right-1.5 top-[51px] h-[90px] rounded-[10px] border-[1.5px] border-[var(--danger)] px-2.5 py-2" style={{ backgroundImage: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--danger) 28%, transparent) 0 8px, transparent 8px 16px)' }}>
              <b className="block text-[0.85rem]">Blocked</b><span className="text-[0.75rem]">Net replacement</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PlayerDirectoryPreview() {
  const pre = (
    <div className="flex gap-3 items-center p-4">
      <div className="flex-1 h-11 flex items-center px-[18px] rounded-full border border-[var(--divider-strong)] bg-[var(--page-bg)] text-[var(--line-dim)]">Search players</div>
      <span className="pub-cta pub-cta-ghost bg-[var(--page-bg)] whitespace-nowrap">+ Add player</span>
    </div>
  );
  const r = (n: string, t: string, g: string, s: ReactNode) => [<b key="n">{n}</b>, t, <span key="g" className={MONO}>{g}</span>, s];
  return (
    <Table pre={pre} cols="1.2fr 1.3fr .9fr 1fr" head={['Player', 'Tier', 'Games today', 'Status']} rows={[
      r('Migs', 'A · Advanced', '13', <Teal key="s">Playing</Teal>),
      r('Tine', 'B · Intermediate', '10', <Dim key="s">In queue</Dim>),
      r('Nico', 'C · Casual', '9', <Dim key="s">In queue</Dim>),
      r('Khael', 'B · Intermediate', '8', <Dim key="s">In queue</Dim>),
      r('Rey', 'D · Beginner', '6', <Teal key="s">Playing</Teal>),
    ]} />
  );
}

export function QueuePreview() {
  const q = [['Khael', 'B', 8], ['Lei', 'C', 8], ['Nico', 'C', 9], ['Jo', 'B', 10], ['Migs', 'A', 13]] as const;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={`${CARD} p-6`}>
        <p className="font-bold text-[1.1rem] mb-2">Walk-in queue</p>
        {q.map(([n, t, g], i) => (
          <div key={n} className="flex justify-between py-3 border-t border-[var(--divider)] text-[0.92rem]">
            <span><b className={`${MONO} text-[var(--amber)] mr-2`}>{i + 1}</b>{n} <Dim>· Tier {t}</Dim></span><Dim>{g} games</Dim>
          </div>
        ))}
      </div>
      <div className={`${CARD} p-6`}>
        <p className="font-bold text-[1.1rem] mb-3.5">Next match · Court 2</p>
        <div className="grid grid-cols-[1fr_auto_1fr] gap-3 items-center mb-4">
          <div className="bg-[var(--page-bg)] rounded-[14px] p-3.5 text-center"><b>Khael</b> + <b>Lei</b><div className="text-[0.75rem] text-[var(--line-dim)] mt-1">B + C</div></div>
          <span className="font-display text-[1.3rem] text-[var(--amber)]">vs</span>
          <div className="bg-[var(--page-bg)] rounded-[14px] p-3.5 text-center"><b>Nico</b> + <b>Jo</b><div className="text-[0.75rem] text-[var(--line-dim)] mt-1">C + B</div></div>
        </div>
        <p className="text-[0.85rem] text-[var(--line-dim)] leading-relaxed mb-4">Lowest play count goes first, and skill tiers are balanced across both teams.</p>
        <div className="flex gap-2.5 flex-wrap"><ActionButton label="Start match" doneLabel="Match started!" /><span className="pub-cta pub-cta-ghost">Shuffle</span></div>
      </div>
    </div>
  );
}

export function PosPreview() {
  const items: [string, string, ReactNode][] = [
    ['Shuttlecock', '₱45', <Teal key="a">48</Teal>],
    ['Bottled water', '₱25', <Teal key="b">24</Teal>],
    ['Sports drink', '₱55', <span key="c" className="text-[var(--danger)]">6 · Low</span>],
    ['Racket rental', '₱60', <Teal key="d">3 of 6 free</Teal>],
    ['Grip tape', '₱120', <span key="e" className="text-[var(--danger)]">0 · Out</span>],
  ];
  return (
    <div className="grid gap-4 md:grid-cols-[1.25fr_1fr] items-start">
      <div className={`${CARD} overflow-hidden`}>
        <div className="flex justify-between items-center p-5"><p className="font-bold text-[1.1rem] m-0">Item catalog</p><span className="pub-cta pub-cta-ghost">+ Add item</span></div>
        <div className="grid grid-cols-[1.5fr_70px_120px] px-5 py-3 text-[0.72rem] font-bold uppercase tracking-[0.08em] text-[var(--line-dim)]"><span>Item</span><span>Price</span><span>In stock</span></div>
        {items.map(([n, p, s]) => (
          <div key={n} className="grid grid-cols-[1.5fr_70px_120px] px-5 py-3.5 border-t border-[var(--divider)] text-[0.92rem] items-center"><span>{n}</span><span className={MONO}>{p}</span><span className={MONO}>{s}</span></div>
        ))}
      </div>
      <div className={`${CARD} p-6`}>
        <div className="flex justify-between items-baseline mb-3"><p className="font-bold text-[1.1rem] m-0">Rey&apos;s tab</p><Dim>Court 2</Dim></div>
        {[['Shuttlecock ×2', '₱90'], ['Bottled water ×1', '₱25'], ['Sports drink ×1', '₱55']].map(([a, b]) => (
          <div key={a} className="flex justify-between py-2.5 border-t border-[var(--divider)]"><span>{a}</span><span className={MONO}>{b}</span></div>
        ))}
        <p className="text-[0.8rem] text-[var(--success)] mt-1 mb-4">Sports drink stock 7 → 6</p>
        <div className="flex justify-between items-baseline border-t border-[var(--divider)] pt-3.5 mb-4"><b>Tab total</b><span className="font-display text-[2rem] text-[var(--amber)]">₱170</span></div>
        <ActionButton label="Clear tab" doneLabel="Cleared!" />
      </div>
    </div>
  );
}

export function TabsPreview() {
  const r = (n: string, c: string, i: string, b: string) => [<b key="n">{n}</b>, c, <Dim key="i">{i}</Dim>, <span key="b" className={MONO}>{b}</span>,<ActionButton key="s" variant="text" label="Settle tab" doneLabel="Settled!" />];
  return (
    <div>
      <div className="flex gap-7 mb-3 font-bold"><span className="border-b-2 border-[var(--accent)] pb-2">By player</span><span className="text-[var(--line-dim)] pb-2">By reservation</span></div>
      <Table cols="1.2fr .8fr .8fr .8fr 1fr" head={['Player', 'Court', 'Items', 'Balance', '']} rows={[r('Rey D.', 'Court 2', '3 items', '₱170'), r('Ana R.', 'Court 1', '1 item', '₱45'), r('Paolo M.', 'Court 2', '2 items', '₱80')]} />
    </div>
  );
}

export function BillingPreview() {
  const r = (d: string, n: string, c: string, t: string, s: ReactNode) => [<Dim key="d">{d}</Dim>, <b key="n">{n}</b>, c, <span key="t" className={MONO}>{t}</span>, s];
  return (
    <Table cols=".8fr 1.2fr .8fr .8fr 1.5fr" head={['Date', 'Tab', 'Court', 'Total', 'Status']} rows={[
      r('Oct 17', 'Rey D.', 'Court 2', '₱170', <Teal key="s">Paid</Teal>),
      r('Oct 17', 'Ana R.', 'Court 1', '₱45', <Teal key="s">Paid</Teal>),
      r('Oct 16', 'Juan dela Cruz', 'Court 1', '₱420', <Teal key="s">Paid</Teal>),
      r('Oct 16', 'Khael', 'Court 3', '₱55', <span key="s" className="text-[var(--amber)] font-bold">Saved offline · syncing</span>),
    ]} />
  );
}

export function SupportPreview() {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className={`${CARD} p-6`}>
        <p className="font-bold text-[1.1rem] mb-3.5">Priority support</p>
        <div className="bg-[var(--surface-raised)] rounded-[14px] px-4 py-3 mb-2.5 ml-12 text-[0.92rem]">A player tier looks wrong on the queue.</div>
        <div className="bg-[var(--page-bg)] border border-[var(--divider)] rounded-[14px] px-4 py-3 mb-3.5 mr-12 text-[0.92rem]">Thanks for flagging it. We will update you here.</div>
        <div className="h-[42px] flex items-center px-[18px] rounded-full border border-[var(--divider-strong)] bg-[var(--page-bg)] text-[var(--line-dim)]">Write a message</div>
      </div>
      <div className={`${CARD} p-6 min-h-[330px]`}>
        <p className="font-bold text-[1.1rem] mb-2">Early access</p>
        {[1].map((n) => (
          <div key={n} className="flex justify-between py-3 border-t border-[var(--divider)]">
            <span>[Analytics] 
              <span className={`${MONO} text-[0.7rem] text-[var(--amber)]`}>BETA</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
