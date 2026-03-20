import mongoose from 'mongoose';

/**
 * ReservationTab — billing tab for a walk-in/online reservation.
 * Separate from Tab (which is tied to a Player in the queue system).
 * Auto-surfaces in billing when reservation.date === today AND status === 'confirmed'.
 */

const ReservationTabItemSchema = new mongoose.Schema({
  item:     { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  name:     { type: String, required: true },
  price:    { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  addedAt:  { type: Date,   default: Date.now },
});

const ReservationTabSchema = new mongoose.Schema({
  // Link to the reservation document
  reservation: {
    type:     mongoose.Schema.Types.ObjectId,
    ref:      'Reservation',
    required: true,
    unique:   true, // one tab per reservation
  },

  // Denormalised reservation info for display (so we don't always need to populate)
  guestName:  { type: String, required: true },
  court:      { type: Number, required: true },
  date:       { type: String, required: true }, // YYYY-MM-DD
  timeSlot:   { type: String, required: true },
  duration:   { type: Number, default: 1 },

  items:  [ReservationTabItemSchema],
  total:  { type: Number, default: 0 },
  status: { type: String, enum: ['open', 'paid'], default: 'open' },
}, { timestamps: true });

// Fast lookup by date (used by billing page to surface today's tabs)
ReservationTabSchema.index({ date: 1, status: 1 });

export default mongoose.models?.ReservationTab ||
  mongoose.model('ReservationTab', ReservationTabSchema);