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
    enum:    [
      'pending',
      'pending_admin',
      'approved_waiting_payment',
      'payment_processing',
      'payment_received',
      'payment_conflict',
      'refund_required',
      'expired',
      'confirmed',
      'cancelled',
      'completed',
    ],
    default: 'pending_admin',
  },
  notes: { type: String, default: '' },
  publicRef: { type: String, default: '', index: true },
  paymentOption: { type: String, enum: ['downpayment', 'full'], default: 'downpayment' },
  reservationFeeAmount: { type: Number, default: 0 },
  downpaymentAmount: { type: Number, default: 0 },
  maintenanceFeeAmount: { type: Number, default: 0 },
  amountPaidOnline: { type: Number, default: 0 },
  remainingBalanceAmount: { type: Number, default: 0 },
  adminNetAmount: { type: Number, default: 0 },
  paymentStatus: {
    type: String,
    enum: ['none', 'awaiting_payment', 'paid', 'expired', 'failed', 'cancelled'],
    default: 'none',
  },
  paymentExpiresAt: { type: Date, default: null },
  paidAt: { type: Date, default: null },
  xenditInvoiceId: { type: String, default: '', index: true },
  xenditInvoiceUrl: { type: String, default: '' },
  xenditQrString: { type: String, default: '' },
}, { timestamps: true });

ReservationSchema.index({ courtId: 1, date: 1, status: 1 });
ReservationSchema.index({ courtId: 1, date: 1, court: 1 });
ReservationSchema.index({ courtId: 1, createdAt: -1 });

export default mongoose.models.Reservation ||
  mongoose.model('Reservation', ReservationSchema);