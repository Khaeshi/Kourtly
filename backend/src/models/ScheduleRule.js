import mongoose from 'mongoose';

/**
 * ScheduleRule — recurring weekly open hours per day of week.
 * One document per day (0=Sun … 6=Sat). Seeded with defaults on first use.
 */
const ScheduleRuleSchema = new mongoose.Schema({
  dayOfWeek: {
    type:     Number,
    required: true,
    min:      0,
    max:      6,
    unique:   true,
  },
  isClosed:  { type: Boolean, default: false },
  openTime:  { type: String,  default: '09:00' }, // "HH:MM" 24h
  closeTime: { type: String,  default: '23:00' }, // "HH:MM" 24h
}, { timestamps: true });

export default mongoose.models.ScheduleRule ||
  mongoose.model('ScheduleRule', ScheduleRuleSchema);