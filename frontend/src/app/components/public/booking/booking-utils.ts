import { addDays, format, getDay, parseISO } from 'date-fns';

// ── Types ─────────────────────────────────────────────────────────────────────
export interface Court {
  _id: string; name: string; slug: string;
  sports: string[]; courtCount: number;
  description: string; logoUrl: string; amenities: string[];
  location: { city: string; province: string };
  contact: { phone: string; email: string; facebook: string };
  settings: { reservationFee?: number; hourlyRate?: number };
}
export interface ScheduleRule { dayOfWeek: number; dayName: string; isClosed: boolean; openTime: string; closeTime: string }
export interface CourtAvailability { court: number; isFullyClosed: boolean; availableSlots: string[]; blockedSlots: string[] }

// ── Dates and slots (unchanged logic) ─────────────────────────────────────────
export const ALL_SLOTS = [
  '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00',
  '13:00-14:00', '14:00-15:00', '15:00-16:00', '16:00-17:00',
  '17:00-18:00', '18:00-19:00', '19:00-20:00', '20:00-21:00',
  '21:00-22:00', '22:00-23:00',
];
export const BOOKING_WINDOW_DAYS = 13; // today + 13 = 14 bookable days
export const MAX_PLAYERS = 10;

export function todayStr() { return format(new Date(), 'yyyy-MM-dd'); }
export function bookingMaxDateStr() { return format(addDays(new Date(), BOOKING_WINDOW_DAYS), 'yyyy-MM-dd'); }
export function toMinutes(t: string) { const [h, m] = t.split(':').map(Number); return h * 60 + m; }
export function fmtMins(m: number) {
  const h = Math.floor(m / 60), min = m % 60, ampm = h >= 12 ? 'PM' : 'AM';
  return `${h > 12 ? h - 12 : h === 0 ? 12 : h}:${String(min).padStart(2, '0')} ${ampm}`;
}
export function fmtSlotRange(slot: string, dur: number) {
  const s = toMinutes(slot.split('-')[0]);
  return `${fmtMins(s)} – ${fmtMins(s + dur * 60)}`;
}
export function fmtDateLong(d: string) { return format(parseISO(d), 'EEEE, MMMM d, yyyy'); }
export function fmtDateShort(d: string) { return format(parseISO(d), 'MMM d, yyyy'); }
export function fmtDateChip(d: string) { return format(parseISO(d), 'EEE, MMM d'); }
export const peso = (n: number) => `₱${n.toLocaleString('en-US')}`;

export function validSlotsForDuration(dur: number, date?: string) {
  const isToday = date === todayStr();
  const nowMins = isToday ? new Date().getHours() * 60 + new Date().getMinutes() : 0;
  return ALL_SLOTS.filter((slot) => {
    const s = toMinutes(slot.split('-')[0]);
    if (s + dur * 60 > 23 * 60) return false;
    if (isToday && s + 60 <= nowMins) return false;
    return true;
  });
}

export function validSlotsForSchedule(dur: number, date: string, rules: ScheduleRule[]) {
  const rule = rules.find((r) => r.dayOfWeek === getDay(parseISO(date)));
  if (!rule || rule.isClosed) return [];
  const openMins = toMinutes(rule.openTime);
  const closeMins = toMinutes(rule.closeTime);
  return validSlotsForDuration(dur, date).filter((slot) => {
    const start = toMinutes(slot.split('-')[0]);
    return start >= openMins && start + dur * 60 <= closeMins;
  });
}

// ── Field validation (UI level). Returns '' when valid. ───────────────────────
export function validateName(v: string) {
  const t = v.trim();
  if (!t) return 'Enter your full name.';
  if (t.length < 2) return 'Name is too short.';
  if (t.length > 60) return 'Keep your name under 60 characters.';
  if (!/^[\p{L}\s.'-]+$/u.test(t)) return 'Use letters only in your name.';
  return '';
}

/** Accepts 09XXXXXXXXX, 9XXXXXXXXX, +639XXXXXXXXX or 639XXXXXXXXX, with spaces or dashes. */
export function validatePhone(v: string) {
  const t = v.replace(/[\s-]/g, '');
  if (!t) return 'Enter your mobile number.';
  if (!/^(\+?63|0)?9\d{9}$/.test(t)) return 'Enter a mobile number like 0917 123 4567.';
  return '';
}

export function validateEmail(v: string) {
  const t = v.trim();
  if (!t) return ''; // optional
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(t)) return 'Enter a valid email, like juan@email.com.';
  return '';
}

export function validateNotes(v: string) { return v.length > 200 ? 'Keep notes under 200 characters.' : ''; }

const DOMAINS = ['gmail.com', 'yahoo.com', 'yahoo.com.ph', 'outlook.com', 'hotmail.com', 'icloud.com'];
function lev(a: string, b: string) {
  const dp = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) dp[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[a.length][b.length];
}
/** "juan@gmial.com" -> "juan@gmail.com". Returns null when nothing looks wrong. */
export function suggestEmail(v: string): string | null {
  const m = v.trim().toLowerCase().match(/^([^\s@]+)@([^\s@]+)$/);
  if (!m) return null;
  const [, user, domain] = m;
  if (DOMAINS.includes(domain)) return null;
  let best: string | null = null;
  let bd = 3;
  for (const d of DOMAINS) {
    const dist = lev(domain, d);
    if (dist < bd) { bd = dist; best = d; }
  }
  return best && bd <= 2 ? `${user}@${best}` : null;
}
