import mongoose from 'mongoose';

const ReservationSchema = new mongoose.Schema({
  courtId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  name:        { type: String, required: true },
  phone:       { type: String, required: true },
  email:       { type: String, default: '' },
  court:       { type: Number, required: true, min: 1 },  // physical court number
  date:        { type: String, required: true },           // "YYYY-MM-DD"
  timeSlot:    { type: String, required: true },           // "08:00-09:00"
  duration:    { type: Number, default: 1 },
  playerCount: { type: Number, default: 2 },
  status: {
    type:    String,
    enum:    ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending',
  },
  notes: { type: String, default: '' },
}, { timestamps: true });

ReservationSchema.index({ courtId: 1, date: 1, status: 1 });
ReservationSchema.index({ courtId: 1, date: 1, court: 1 });
ReservationSchema.index({ courtId: 1, createdAt: -1 });

export default mongoose.models.Reservation ||
  mongoose.model('Reservation', ReservationSchema);