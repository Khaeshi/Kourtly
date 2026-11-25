import mongoose from 'mongoose';

const StockCountItemSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  name: { type: String, required: true },
  expectedQuantity: { type: Number, required: true },
  countedQuantity: { type: Number, required: true },
  difference: { type: Number, required: true },
  note: { type: String, default: '' },
  movementId: { type: mongoose.Schema.Types.ObjectId, ref: 'StockMovement', default: null },
}, { _id: false });

const StockCountSchema = new mongoose.Schema({
  courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true },
  idempotencyKey: { type: String, required: true },
  requestHash: { type: String, required: true },
  timezone: { type: String, required: true },
  salesToday: { type: Number, required: true },
  unitsSoldToday: { type: Number, required: true },
  itemsMatched: { type: Number, required: true },
  itemsShort: { type: Number, required: true },
  itemsOver: { type: Number, required: true },
  actorId: { type: String, required: true },
  items: { type: [StockCountItemSchema], default: [] },
}, { timestamps: { createdAt: 'countedAt', updatedAt: false } });

StockCountSchema.index({ courtId: 1, idempotencyKey: 1 }, { unique: true });
StockCountSchema.index({ courtId: 1, countedAt: -1 });

export default mongoose.models.StockCount ||
  mongoose.model('StockCount', StockCountSchema);
