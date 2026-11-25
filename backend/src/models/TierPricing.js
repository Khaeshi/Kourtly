import mongoose from 'mongoose';

const PriceHistorySchema = new mongoose.Schema({
  price: {
    type: Number,
    required: true,
    min: 1,
    max: 10000,
    validate: { validator: Number.isInteger, message: 'Price must be an integer.' },
  },
  changedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  changedAt: { type: Date, default: Date.now },
}, { _id: false });

const TierPricingSchema = new mongoose.Schema({
  tier: {
    type: String,
    enum: ['basic', 'standard', 'premium', 'elite'],
    required: true,
    unique: true,
  },
  price: {
    type: Number,
    required: true,
    min: 1,
    max: 10000,
    validate: { validator: Number.isInteger, message: 'Price must be an integer.' },
  },
  active: { type: Boolean, default: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedAt: { type: Date, default: Date.now },
  history: {
    type: [PriceHistorySchema],
    default: [],
    validate: { validator: entries => entries.length <= 20, message: 'History is limited to 20 entries.' },
  },
});

export default mongoose.models.TierPricing || mongoose.model('TierPricing', TierPricingSchema);
