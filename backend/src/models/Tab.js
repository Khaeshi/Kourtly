import mongoose from 'mongoose';

const TabItemSchema = new mongoose.Schema({
  item:     { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  name:     { type: String, required: true },
  price:    { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  addedAt:  { type: Date, default: Date.now },
});

const TabSchema = new mongoose.Schema({
  courtId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  player:      { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  items:       [TabItemSchema],
  total:       { type: Number, default: 0 },
  status:      { type: String, enum: ['open', 'paid', 'unpaid'], default: 'open' },
  sessionDate: { type: Date, default: Date.now },
}, { timestamps: true });

TabSchema.index({ courtId: 1, player: 1, status: 1 });
TabSchema.index({ courtId: 1, status: 1, updatedAt: -1 });

export default mongoose.models.Tab || mongoose.model('Tab', TabSchema);