import mongoose from 'mongoose';

const SubscriptionPaymentSchema = new mongoose.Schema({
  invoiceId: { type: String, required: true, unique: true, index: true },
  externalId: { type: String, required: true, unique: true, index: true },
  courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  tier: { type: String, enum: ['basic', 'standard', 'premium', 'elite'], required: true },
  expectedAmount: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ['pending', 'paid'], default: 'pending' },
  providerPaidAt: { type: Date, default: null },
  paymentChannel: { type: String, default: '' },
  paymentMethod: { type: String, default: '' },
  paidAmount: { type: Number, default: null },
  paymentId: { type: String, default: '' },
}, { timestamps: true });

export default mongoose.models.SubscriptionPayment ||
  mongoose.model('SubscriptionPayment', SubscriptionPaymentSchema);
