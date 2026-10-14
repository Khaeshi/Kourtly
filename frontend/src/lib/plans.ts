export type PlanId = 'basic' | 'standard' | 'premium' | 'elite';
export const PLAN_ORDER: PlanId[] = ['basic', 'standard', 'premium', 'elite'];

export interface Plan {
  id: PlanId;
  name: string;
  eyebrow: string;
  price: number; // PHP per month
  blurb: string;
  highlights: string[];
}

/** Single source of truth for tiers. Landing strip, owners table and feature tags all read from here. */
export const PLANS: Plan[] = [
  { id: 'basic', name: 'Basic', eyebrow: 'Start here', price: 2000,
    blurb: 'Put your court online with reservations and schedule blocking.',
    highlights: ['Public court listing', 'Online reservations', 'Court schedule blocking', 'Admin dashboard'] },
  { id: 'standard', name: 'Standard', eyebrow: 'For busy courts', price: 3500,
    blurb: 'Add player registration and a fair, visible queue for walk-ins.',
    highlights: ['Everything in Basic', 'Player directory', 'Queue and match generation', 'Live queue updates'] },
  { id: 'premium', name: 'Premium', eyebrow: 'For full operations', price: 5500,
    blurb: 'Run items and player tabs alongside court activity.',
    highlights: ['Everything in Standard', 'Item catalog', 'Player and reservation tabs', 'Billing history'] },
  { id: 'elite', name: 'Elite', eyebrow: 'For growing venues', price: 7500,
    blurb: 'Everything in Premium, plus priority support and future advanced capabilities.',
    highlights: ['Everything in Premium', 'Priority support', 'Early access to new modules', 'Advanced operations roadmap'] },
];

/** Feature matrix rows: `from` is the first tier that includes the feature. */
export const PLAN_MATRIX: { label: string; from: PlanId }[] = [
  { label: 'Public listing, online reservations, schedule blocking, admin dashboard', from: 'basic' },
  { label: 'Player directory', from: 'standard' },
  { label: 'Queue, match generation, live queue updates', from: 'standard' },
  { label: 'Item catalog', from: 'premium' },
  { label: 'Player and reservation tabs', from: 'premium' },
  { label: 'Billing history', from: 'premium' },
  { label: 'Priority support, early access to new modules, operations roadmap', from: 'elite' },
];

export const includes = (plan: PlanId, from: PlanId) => PLAN_ORDER.indexOf(plan) >= PLAN_ORDER.indexOf(from);
export const TRIAL_NOTE = 'All new courts start with a 14-day Basic trial. No credit card required.';
export const REGISTER_HREF = '/register-court';
