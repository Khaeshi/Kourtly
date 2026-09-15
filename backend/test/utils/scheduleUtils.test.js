import {
  toMinutes,
  getSlotsFromRule,
  getAdminBlockedSlots,
  getBlockedSlots,
  getValidStartSlots,
  resolveSchedule,
} from '../../src/utils/scheduleUtils.js';

describe('scheduleUtils', () => {
  test('toMinutes converts HH:mm correctly', () => {
    expect(toMinutes('09:30')).toBe(570);
    expect(toMinutes('23:00')).toBe(1380);
  });

  test('getSlotsFromRule returns slots inside open/close window', () => {
    const slots = getSlotsFromRule({
      isClosed: false,
      openTime: '12:00',
      closeTime: '15:00',
    });

    expect(slots).toEqual(['12:00-13:00', '13:00-14:00', '14:00-15:00']);
  });

  test('getAdminBlockedSlots applies day and range blocks', () => {
    const baseSlots = ['12:00-13:00', '13:00-14:00', '14:00-15:00'];
    const blocks = [
      { blockType: 'range', startTime: '12:30', endTime: '13:30', courts: [1] },
      { blockType: 'day', courts: [2] },
    ];

    expect(getAdminBlockedSlots(blocks, 1, baseSlots)).toEqual(['12:00-13:00', '13:00-14:00']);
    expect(getAdminBlockedSlots(blocks, 2, baseSlots)).toEqual(baseSlots);
  });

  test('getBlockedSlots detects overlap for multi-hour booking', () => {
    const existing = [{ timeSlot: '13:00-14:00', duration: 2 }];
    const candidates = ['12:00-13:00', '13:00-14:00', '14:00-15:00', '16:00-17:00'];

    const blocked = getBlockedSlots(existing, candidates, 1);
    expect(blocked).toEqual(['13:00-14:00', '14:00-15:00']);
  });

  test('getValidStartSlots requires the full duration to be open and unblocked', () => {
    const baseSlots = ['09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00', '13:00-14:00', '14:00-15:00', '15:00-16:00'];

    expect(getValidStartSlots(baseSlots, 4)).toEqual([
      '09:00-10:00', '10:00-11:00', '11:00-12:00', '12:00-13:00',
    ]);
    expect(getValidStartSlots(baseSlots, 2, ['11:00-12:00'])).toEqual([
      '09:00-10:00', '12:00-13:00', '13:00-14:00', '14:00-15:00',
    ]);
  });

  test('resolveSchedule marks fully closed when no slots', () => {
    const resolved = resolveSchedule({ isClosed: true, openTime: '09:00', closeTime: '23:00' }, []);
    expect(resolved.isFullyClosed).toBe(true);
    expect(resolved.baseSlots).toEqual([]);
  });
});
