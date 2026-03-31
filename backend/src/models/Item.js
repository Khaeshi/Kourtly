import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
  courtId:      { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  name:         { type: String, required: true },
  price:        { type: Number, required: true },
  category:     { type: String, default: 'general' },
  isActive:     { type: Boolean, default: true },
  isSplittable: { type: Boolean, default: false },
}, { timestamps: true });

ItemSchema.index({ courtId: 1, category: 1 });
ItemSchema.index({ courtId: 1, isActive: 1 });

export default mongoose.models.Item || mongoose.model('Item', ItemSchema);