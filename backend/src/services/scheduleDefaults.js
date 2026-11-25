import ScheduleRule from '../models/ScheduleRule.js';

export async function seedDefaultRules(courtId) {
  const count = await ScheduleRule.countDocuments({ courtId });
  if (count > 0) return;

  const defaults = [
    { courtId, dayOfWeek: 0, isClosed: false, openTime: '12:00', closeTime: '23:00' },
    { courtId, dayOfWeek: 1, isClosed: true },
    { courtId, dayOfWeek: 2, isClosed: false, openTime: '12:00', closeTime: '23:00' },
    { courtId, dayOfWeek: 3, isClosed: false, openTime: '12:00', closeTime: '23:00' },
    { courtId, dayOfWeek: 4, isClosed: false, openTime: '12:00', closeTime: '23:00' },
    { courtId, dayOfWeek: 5, isClosed: false, openTime: '06:00', closeTime: '16:00' },
    { courtId, dayOfWeek: 6, isClosed: false, openTime: '09:00', closeTime: '23:00' },
  ];

  await ScheduleRule.insertMany(defaults);
}
