import mongoose from 'mongoose';

const ScheduleBlockSchema = new mongoose.Schema({
  courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  date:    { type: String, required: true }, // "YYYY-MM-DD"
  courts:  { type: [Number], default: [] },  // [] = all courts
  blockType: {
    type:    String,
    enum:    ['day', 'range'],
    default: 'day',
  },
  startTime: { type: String, default: '' },
  endTime:   { type: String, default: '' },
  reason:    { type: String, default: '' },
}, { timestamps: true });

ScheduleBlockSchema.index({ courtId: 1, date: 1 });

export default mongoose.models.ScheduleBlock ||
  mongoose.model('ScheduleBlock', ScheduleBlockSchema);