import mongoose from 'mongoose';

const PaymentWebhookEventSchema = new mongoose.Schema({
  provider: { type: String, default: 'cocoart', index: true },
  eventId: { type: String, required: true, unique: true, index: true },
  eventType: { type: String, default: '' },
  reservationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Reservation', default: null },
  processed: { type: Boolean, default: false },
}, { timestamps: true });

export default mongoose.models.PaymentWebhookEvent ||
  mongoose.model('PaymentWebhookEvent', PaymentWebhookEventSchema);

