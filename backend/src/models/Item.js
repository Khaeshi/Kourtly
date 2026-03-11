import mongoose from 'mongoose';

const ItemSchema = new mongoose.Schema({
  name:         { type: String, required: true },
  price:        { type: Number, required: true },
  category:     { type: String, default: 'general' },
  isActive:     { type: Boolean, default: true },
  isSplittable: { type: Boolean, default: false }, // e.g. shuttlecocks split across players
}, { timestamps: true });

export default mongoose.model('Item', ItemSchema);