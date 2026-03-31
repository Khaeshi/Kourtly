import mongoose from 'mongoose';

const PlayerSchema = new mongoose.Schema({
  courtId:    { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  name:       { type: String, required: true },
  level:      { type: String, enum: ['A','B','C','D'], required: true },
  gender:     { type: String, enum: ['Male','Female'], required: true },
  age:        { type: Number, required: true },
  matchCount: { type: Number, default: 0 },
  isActive:   { type: Boolean, default: true },
}, { timestamps: true });

PlayerSchema.index({ courtId: 1, isActive: 1 });
PlayerSchema.index({ courtId: 1, level: 1 });

export default mongoose.models.Player || mongoose.model('Player', PlayerSchema);