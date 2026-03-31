import mongoose from 'mongoose';

const ScheduleRuleSchema = new mongoose.Schema({
  courtId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  dayOfWeek: { type: Number, required: true, min: 0, max: 6 },
  isClosed:  { type: Boolean, default: false },
  openTime:  { type: String,  default: '09:00' },
  closeTime: { type: String,  default: '23:00' },
}, { timestamps: true });

// One rule per day per court
ScheduleRuleSchema.index({ courtId: 1, dayOfWeek: 1 }, { unique: true });

export default mongoose.models.ScheduleRule ||
  mongoose.model('ScheduleRule', ScheduleRuleSchema);