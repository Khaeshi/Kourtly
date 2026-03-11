import mongoose from 'mongoose';

const TabItemSchema = new mongoose.Schema({
  item:     { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
  name:     { type: String, required: true },
  price:    { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  addedAt:  { type: Date, default: Date.now },
});

const TabSchema = new mongoose.Schema({
  player:      { type: mongoose.Schema.Types.ObjectId, ref: 'Player', required: true },
  items:       [TabItemSchema],
  total:       { type: Number, default: 0 },
  status:      { type: String, enum: ['open', 'paid'], default: 'open' },
  sessionDate: { type: Date, default: Date.now },
}, { timestamps: true });

export default mongoose.model('Tab', TabSchema);