import mongoose from 'mongoose';

const ReservationSchema = new mongoose.Schema({
  tenantId:    { type: String, default: 'default' },
  name:        { type: String, required: true },
  phone:       { type: String, required: true },
  email:       { type: String, default: '' },
  court:       { type: Number, required: true, min: 1, max: 4 },
  date:        { type: String, required: true },   // "YYYY-MM-DD"
  timeSlot:    { type: String, required: true },   // "08:00-09:00"
  duration:    { type: Number, default: 1 },       // hours
  playerCount: { type: Number, default: 2 },
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'cancelled', 'completed'],
    default: 'pending',
  },
  notes: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.models.Reservation || mongoose.model('Reservation', ReservationSchema);