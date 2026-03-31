import mongoose from 'mongoose';

const MatchSchema = new mongoose.Schema({
  courtId:   { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true, index: true },
  team1:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  team2:     [{ type: mongoose.Schema.Types.ObjectId, ref: 'Player' }],
  matchType: { type: String, enum: ['MD','WD','XD'], required: true },
  court:     { type: Number, min: 1, required: true },  // physical court number
  status:    { type: String, enum: ['queued','playing','done'], default: 'queued' },
}, { timestamps: true });

MatchSchema.index({ courtId: 1, status: 1 });
MatchSchema.index({ courtId: 1, updatedAt: -1 });

export default mongoose.models.Match || mongoose.model('Match', MatchSchema);