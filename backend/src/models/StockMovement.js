import mongoose from 'mongoose';

const StockWarningSchema = new mongoose.Schema({
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  shortfall: { type: Number, required: true, min: 1 },
}, { _id: false });

const StockMovementSchema = new mongoose.Schema({
  courtId: { type: mongoose.Schema.Types.ObjectId, ref: 'Court', required: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', required: true },
  type: {
    type: String,
    enum: ['opening', 'restock', 'adjustment', 'sale', 'void', 'count'],
    required: true,
  },
  quantityDelta: { type: Number, required: true },
  soldQuantityDelta: { type: Number },
  balanceAfter: { type: Number, required: true },
  stockWarning: { type: StockWarningSchema, default: undefined },
  unitPrice: { type: Number, default: 0, min: 0 },
  note: { type: String, required: true },
  tabType: { type: String, enum: ['queue', 'reservation', null], default: null },
  tabId: { type: mongoose.Schema.Types.ObjectId, default: null },
  tabLineId: { type: mongoose.Schema.Types.ObjectId, default: null },
  chargeGroupId: { type: mongoose.Schema.Types.ObjectId, default: null },
  originalSaleAt: { type: Date, default: null },
  actorId: { type: String, required: true },
  idempotencyKey: { type: String, required: true },
  requestHash: { type: String, required: true },
}, { timestamps: true });

StockMovementSchema.index({ courtId: 1, idempotencyKey: 1 }, { unique: true });
StockMovementSchema.index({ courtId: 1, itemId: 1, createdAt: -1 });
StockMovementSchema.index({ courtId: 1, createdAt: -1 });

export default mongoose.models.StockMovement ||
  mongoose.model('StockMovement', StockMovementSchema);
