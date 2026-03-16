import mongoose from 'mongoose';

/**
 * ScheduleBlock — one-off blocks on a specific date.
 * Can close the entire venue, a time range across all courts,
 * or a time range on specific courts only.
 */
const ScheduleBlockSchema = new mongoose.Schema({
  date: {
    type:     String,   // "YYYY-MM-DD"
    required: true,
  },

  // Which courts are affected. Empty array = ALL courts.
  courts: {
    type:    [Number],
    default: [],        // [] means all courts
  },

  // 'day'   = entire day closed (startTime/endTime ignored)
  // 'range' = specific time window blocked
  blockType: {
    type:    String,
    enum:    ['day', 'range'],
    default: 'day',
  },

  startTime: { type: String, default: '' }, // "HH:MM" — only for blockType:'range'
  endTime:   { type: String, default: '' }, // "HH:MM" — only for blockType:'range'

  reason: { type: String, default: '' },    // admin note e.g. "Queue session"
}, { timestamps: true });

// Compound index: fast lookups by date
ScheduleBlockSchema.index({ date: 1 });

export default mongoose.models.ScheduleBlock ||
  mongoose.model('ScheduleBlock', ScheduleBlockSchema);