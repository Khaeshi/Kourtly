import mongoose from 'mongoose';

const TabItemSchema = new mongoose.Schema({
  item:      { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  name:      { type: String, required: true },
  price:     { type: Number, required: true },
  costEach:  { type: Number, default: 0 },
  quantity:  { type: Number, default: 1 },
  addedAt:   { type: Date, default: Date.now },
});

const TabSchema = new mongoose.Schema({
  courtId:     { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  tabType:     { type: String, enum: ['player', 'cash'], default: 'player' },
  cashLabel:   { type: String, default: '' },
  player:      { type: mongoose.Schema.Types.ObjectId, ref: 'Player', default: null },
  items:       [TabItemSchema],
  total:       { type: Number, default: 0 },
  status:      { type: String, enum: ['open', 'paid', 'unpaid'], default: 'open' },
  sessionDate: { type: Date, default: Date.now },
}, { timestamps: true });

TabSchema.index({ courtId: 1, player: 1, status: 1 });
TabSchema.index({ courtId: 1, status: 1, updatedAt: -1 });
TabSchema.index({ courtId: 1, tabType: 1, status: 1 });

export default mongoose.models.Tab || mongoose.model('Tab', TabSchema);
