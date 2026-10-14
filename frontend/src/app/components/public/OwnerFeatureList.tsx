'use client';
import { useId, useState, type ReactNode } from 'react';
import JoyGaze, { type JoySprite } from './JoyGaze';
import {
  ScheduleDashboard, BlockTimePreview, PlayerDirectoryPreview, QueuePreview,
  PosPreview, TabsPreview, BillingPreview, SupportPreview,
} from './OwnerPreviews';

// Sprite sets live at module level so JoyGaze effects keep a stable identity.
const sp = (name: string, alt: string, angle?: number): JoySprite => ({ src: `/mascot/${name}.webp`, alt, angle });
const CHEER = [sp('state_cheer', 'Joy cheering')];
const SLEEPY = [sp('state_sleepy', 'Joy sleeping with her eyes closed')];
const ERROR = [sp('state_error', 'Joy looking worried')];
const GAZE_DL = [sp('gaze_dl', 'Joy looking down and left')];
const GAZE_UL = [sp('gaze_ul', 'Joy looking up and left')];
const GAZE_D = [sp('gaze_d', 'Joy looking down')];
const GAZE_C = [sp('gaze_c', 'Joy smiling at you')];
const DIRECTORY = [sp('gaze_ul', 'Joy looking up and left', -135), sp('gaze_l', 'Joy looking left', 180), sp('gaze_dl', 'Joy looking down and left', 135)];

type Place = 'side' | 'peek' | 'inside';
interface Feature {
  id: string;
  title: string;
  tier: string;
  description: string;
  visual: ReactNode;
  joy: { sprites: JoySprite[]; place: Place; tracked?: boolean; bubble?: string };
}

const FEATURES: Feature[] = [
  { id: 'booking', title: 'Public booking and reservations', tier: 'Basic+',
    description: 'Your court appears in the Kourtly directory and players book open slots online. Every booking lands on one wide schedule: pick a date on the left and read the whole day across all your courts.',
    visual: <ScheduleDashboard />, joy: { sprites: CHEER, place: 'side', bubble: 'New booking! Juan, Court 1, 12 PM.' } },
  { id: 'blocking', title: 'Schedule blocking', tier: 'Basic+',
    description: 'Block times for maintenance, leagues or private events so they cannot be booked. Blocked time shows on the schedule.',
    visual: <BlockTimePreview />, joy: { sprites: SLEEPY, place: 'peek', bubble: 'Shh. Court 2 is resting.' } },
  { id: 'directory', title: 'Player directory', tier: 'Standard+',
    description: 'Keep a list of your regular players with their skill tier and how many games they played today.',
    visual: <PlayerDirectoryPreview />, joy: { sprites: DIRECTORY, place: 'peek', tracked: true } },
  { id: 'queue', title: 'Queue and match generation', tier: 'Standard+',
    description: 'Walk-ins join a fair, visible queue. Matches pair players by play count and skill tier, with live updates on every screen.',
    visual: <QueuePreview />, joy: { sprites: GAZE_DL, place: 'side' } },
  { id: 'pos', title: 'Item catalog and mini POS', tier: 'Premium+',
    description: 'List what you sell and track how many are left. Items added to a tab deduct stock automatically.',
    visual: <PosPreview />, joy: { sprites: ERROR, place: 'side', bubble: 'Grip tape is out. Restock?' } },
  { id: 'tabs', title: 'Player and reservation tabs', tier: 'Premium+',
    description: 'Run a tab per player or per reservation and clear it at the end of the session.',
    visual: <TabsPreview />, joy: { sprites: GAZE_UL, place: 'side' } },
  { id: 'billing', title: 'Billing history', tier: 'Premium+',
    description: 'Every cleared tab and receipt is kept. Billing keeps working offline and syncs once the connection is back.',
    visual: <BillingPreview />, joy: { sprites: GAZE_D, place: 'peek' } },
  { id: 'support', title: 'Priority support and early access', tier: 'Elite',
    description: 'Priority support, early access to new modules, and the advanced operations roadmap.',
    visual: <SupportPreview />, joy: { sprites: GAZE_C, place: 'inside', bubble: 'Need a hand? Message us.' } },
];

function Bubble({ text, className = '' }: { text: string; className?: string }) {
  return (
    <div className={`pointer-events-none bg-[#F4F0E6] text-[#0E2420] rounded-[14px] px-3.5 py-2.5 text-[0.8rem] font-bold leading-[1.35] ${className}`}>
      {text}
      <i className="absolute w-3 h-3 bg-[#F4F0E6] rotate-45" style={{ right: -6, top: '50%', marginTop: -6 }} aria-hidden="true" />
    </div>
  );
}

function Body({ f }: { f: Feature }) {
  const joy = <JoyGaze sprites={f.joy.sprites} tracked={f.joy.tracked} />;
  if (f.joy.place === 'side') {
    return (
      <div className="grid gap-6 md:grid-cols-[1fr_190px] items-end mt-6">
        <div>{f.visual}</div>
        <div className="hidden md:flex flex-col items-center gap-2">
          {f.joy.bubble && <p className="bg-[#F4F0E6] text-[#0E2420] rounded-[14px] px-3.5 py-2.5 text-[0.8rem] font-bold leading-[1.35] m-0 w-full">{f.joy.bubble}</p>}
          {joy}
        </div>
      </div>
    );
  }
  if (f.joy.place === 'peek') {
    return (
      <div className="relative mt-[170px] md:mt-[176px]">
        <div className="absolute -top-[154px] right-4 md:right-12 z-[3]">{joy}</div>
        {f.joy.bubble && <Bubble text={f.joy.bubble} className="hidden md:block absolute z-[4] w-[190px] -top-[112px] right-[226px]" />}
        <div className="relative z-[1]">{f.visual}</div>
      </div>
    );
  }
  return (
    <div className="relative mt-6">
      {f.visual}
      <div className="hidden md:block absolute right-3 bottom-0 z-[3]">{joy}</div>
      {f.joy.bubble && <Bubble text={f.joy.bubble} className="hidden md:block absolute z-[4] w-[170px] bottom-24 right-[190px]" />}
    </div>
  );
}

/** Expandable list of every owner feature. One open at a time. Height animates with CSS (see .acc in globals). */
export default function OwnerFeatureList() {
  const [open, setOpen] = useState<string | null>(FEATURES[0].id);
  // Bodies mount on first open and stay mounted so the close animation has content to collapse.
  const [seen, setSeen] = useState<Set<string>>(() => new Set([FEATURES[0].id]));
  const uid = useId();

  return (
    <div>
      {FEATURES.map((f) => {
        const isOpen = open === f.id;
        return (
          <div key={f.id} className="border-t border-[var(--divider)] last:border-b">
            <h3 className="m-0">
              <button
                type="button"
                id={`${uid}-${f.id}-btn`}
                aria-expanded={isOpen}
                aria-controls={`${uid}-${f.id}`}
                onClick={() => {
                  setOpen(isOpen ? null : f.id);
                  setSeen((prev) => new Set(prev).add(f.id));
                }}
                className="flex w-full items-center gap-4 sm:gap-5 py-5 text-left bg-transparent border-none cursor-pointer text-[var(--line)]"
              >
                <span className="text-[1.15rem] sm:text-[1.25rem] font-bold">{f.title}</span>
                <span className="font-mono-data text-[0.72rem] text-[var(--amber)]">{f.tier}</span>
                <span
                  aria-hidden="true"
                  className={`ml-auto grid place-items-center w-9 h-9 shrink-0 rounded-full border border-[var(--divider-strong)] text-[1.2rem] transition-transform duration-200 motion-reduce:transition-none ${isOpen ? 'rotate-45' : ''}`}
                >
                  +
                </span>
              </button>
            </h3>
            <div id={`${uid}-${f.id}`} role="region" aria-labelledby={`${uid}-${f.id}-btn`} className={`acc ${isOpen ? 'is-open' : ''}`}>
              <div className="acc-inner">
                <div className="pb-8">
                  <p className="text-[var(--line-dim)] text-base leading-[1.55] max-w-[680px] m-0">{f.description}</p>
                  {seen.has(f.id) && <Body f={f} />}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
