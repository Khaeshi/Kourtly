import mongoose from 'mongoose';

const PlayerSchema = new mongoose.Schema({
  name:       { type: String, required: true },
  level:      { type: String, enum: ['A','B','C','D'], required: true },
  gender:     { type: String, enum: ['Male','Female'], required: true },
  age:        { type: Number, required: true },
  matchCount: { type: Number, default: 0 },
  isActive:   { type: Boolean, default: true },
}, { timestamps: true });

export default mongoose.model('Player', PlayerSchema);