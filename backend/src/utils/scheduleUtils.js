/**
 * scheduleUtils.js
 *
 * Pure functions for resolving which slots are open/blocked on a given date,
 * taking into account ScheduleRules (weekly defaults) and ScheduleBlocks
 * (specific date overrides). No DB calls here — pass in pre-fetched data.
 */

const ALL_SLOTS = [
    '09:00-10:00','10:00-11:00','11:00-12:00','12:00-13:00',
    '13:00-14:00','14:00-15:00','15:00-16:00','16:00-17:00',
    '17:00-18:00','18:00-19:00','19:00-20:00','20:00-21:00',
    '21:00-22:00','22:00-23:00',
  ];
  
  export { ALL_SLOTS };
  
  export function toMinutes(timeStr) {
    const [h, m] = timeStr.split(':').map(Number);
    return h * 60 + m;
  }
  
  /**
   * Get the day-of-week index (0=Sun…6=Sat) for a YYYY-MM-DD string.
   * Uses local noon to avoid DST edge cases.
   * 
   * updated to use date-fns on 3/18/2026, 
   * @todo update this comment
   */
  import { parseISO, getDay } from 'date-fns';
  export function getDayOfWeek(dateStr) {
    return getDay(parseISO(dateStr)); 
  }
  
  /**
   * Given a ScheduleRule for the day, return which slots fall within open hours.
   * Returns ALL_SLOTS if no rule provided (open by default).
   */
  export function getSlotsFromRule(rule) {
    if (!rule || rule.isClosed) return [];
  
    const openMins  = toMinutes(rule.openTime);
    const closeMins = toMinutes(rule.closeTime);
  
    return ALL_SLOTS.filter(slot => {
      const slotStart = toMinutes(slot.split('-')[0]);
      const slotEnd   = slotStart + 60; // each base slot = 1 hour
      return slotStart >= openMins && slotEnd <= closeMins;
    });
  }
  
  /**
   * Given schedule blocks for a date and a court number,
   * return which slots are admin-blocked for that court.
   *
   * A block affects a court if:
   *   - block.courts is empty (means all courts), OR
   *   - courtNum is in block.courts
   */
  export function getAdminBlockedSlots(blocks, courtNum, baseSlots) {
    if (!blocks?.length) return [];
  
    const blocked = new Set();
  
    for (const block of blocks) {
      const affectsThisCourt =
        block.courts.length === 0 || block.courts.includes(courtNum);
      if (!affectsThisCourt) continue;
  
      if (block.blockType === 'day') {
        // Entire day blocked for this court
        baseSlots.forEach(s => blocked.add(s));
        continue;
      }
  
      if (block.blockType === 'range' && block.startTime && block.endTime) {
        const blockStart = toMinutes(block.startTime);
        const blockEnd   = toMinutes(block.endTime);
  
        baseSlots.forEach(slot => {
          const slotStart = toMinutes(slot.split('-')[0]);
          const slotEnd   = slotStart + 60;
          // Slot overlaps the blocked range
          if (slotStart < blockEnd && slotEnd > blockStart) {
            blocked.add(slot);
          }
        });
      }
    }
  
    return [...blocked];
  }


  /**
 * Given existing reservations for a court, return which start slots are blocked
 * for a new booking of `durationHours` length. Uses range overlap detection.
 */
export function getBlockedSlots(existingBookings, candidateSlots, durationHours) {
  const durationMins = durationHours * 60;

  return candidateSlots.filter(slot => {
    const slotStart = toMinutes(slot.split('-')[0]);
    const slotEnd   = slotStart + durationMins;

    return existingBookings.some(existing => {
      const exStart = toMinutes(existing.timeSlot.split('-')[0]);
      const exEnd   = exStart + existing.duration * 60;
      return slotStart < exEnd && slotEnd > exStart;
    });
  });
}

export function getValidStartSlots(baseSlots, durationHours, blockedSlots = []) {
  const baseSet = new Set(baseSlots);
  const blockedSet = new Set(blockedSlots);
  const duration = Math.max(1, Number(durationHours));

  return baseSlots.filter(slot => {
    const start = toMinutes(slot.split('-')[0]);
    for (let offset = 0; offset < duration; offset += 1) {
      const hour = start + offset * 60;
      const key = `${String(Math.floor(hour / 60)).padStart(2, '0')}:00-${String(Math.floor(hour / 60) + 1).padStart(2, '0')}:00`;
      if (!baseSet.has(key) || blockedSet.has(key)) return false;
    }
    return true;
  });
}
  
  /**
   * Master resolver: given rule + blocks for a date, return per-court availability.
   *
   * Returns:
   * {
   *   isFullyClosed: boolean,
   *   baseSlots: string[],          // slots open per weekly rule
   *   perCourt: {
   *     [courtNum]: {
   *       adminBlockedSlots: string[]
   *     }
   *   }
   * }
   */
  export function resolveSchedule(rule, blocks) {
    const baseSlots = getSlotsFromRule(rule);
    const isFullyClosed = baseSlots.length === 0;
  
    const perCourt = {};
    [1, 2, 3, 4].forEach(c => {
      perCourt[c] = {
        adminBlockedSlots: isFullyClosed
          ? []
          : getAdminBlockedSlots(blocks, c, baseSlots),
      };
    });
  
    return { isFullyClosed, baseSlots, perCourt };
  }