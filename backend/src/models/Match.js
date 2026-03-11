import mongoose from 'mongoose';

const MatchSchema = new mongoose.Schema({
  team1:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  team2:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  matchType: { type: String, enum: ['MD','WD','XD'], required: true },
  court:     { type: Number, min: 1, max: 4, required: true },
  status:    { type: String, enum: ['queued','playing','done'], default: 'queued' },
}, { timestamps: true });

export default mongoose.model('Match', MatchSchema);