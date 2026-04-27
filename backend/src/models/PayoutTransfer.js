import mongoose from 'mongoose';

const PayoutTransferSchema = new mongoose.Schema({
  courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', required: true, index: true },
  recipientCode: { type: String, default: '' },
  amount: { type: Number, required: true },
  status: { type: String, enum: ['queued', 'succeeded', 'failed'], default: 'queued' },
  providerDisbursementId: { type: String, default: '', index: true },
  failureReason: { type: String, default: '' },
}, { timestamps: true });

PayoutTransferSchema.index({ courtId: 1, createdAt: -1 });

export default mongoose.models.PayoutTransfer || mongoose.model('PayoutTransfer', PayoutTransferSchema);

