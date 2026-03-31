import mongoose from 'mongoose';

const ReservationTabItemSchema = new mongoose.Schema({
  item:     { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  name:     { type: String, required: true },
  price:    { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  addedAt:  { type: Date,   default: Date.now },
});

const ReservationTabSchema = new mongoose.Schema({
  courtId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  reservation: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Reservation',
    required: true,
    unique:   true,
  },
  guestName: { type: String, required: true },
  court:     { type: Number, required: true },
  date:      { type: String, required: true },
  timeSlot:  { type: String, required: true },
  duration:  { type: Number, default: 1 },
  items:     [ReservationTabItemSchema],
  total:     { type: Number, default: 0 },
  status:    { type: String, enum: ['open', 'paid', 'unpaid'], default: 'open' },
}, { timestamps: true });

ReservationTabSchema.index({ courtId: 1, date: 1, status: 1 });
ReservationTabSchema.index({ courtId: 1, status: 1, updatedAt: -1 });

export default mongoose.models?.ReservationTab ||
  mongoose.model('ReservationTab', ReservationTabSchema);