import mongoose from 'mongoose';

/**
 * Court — one document per subscribing tenant.
 * This is the root of the WaaS model.
 * Every other collection references courtId.
 */
const CourtSchema = new mongoose.Schema({
  // ── Identity ────────────────────────────────────────────────────────────────
  name:   { type: String, required: true, trim: true },
  slug:   { type: String, required: true, unique: true, lowercase: true, trim: true },
  onboarding: { type: Boolean, default: false },
  // URL-safe identifier e.g. "south-city-bc" → /book/south-city-bc

  // ── Sport ───────────────────────────────────────────────────────────────────
  sports: {
    type:    [String],
    enum:    ['badminton', 'pickleball', 'tennis'],
    default: ['badminton'],
  },

  // ── Physical courts ─────────────────────────────────────────────────────────
  courtCount: { type: Number, default: 4, min: 1 },

  // ── Location ────────────────────────────────────────────────────────────────
  location: {
    address:   { type: String, default: '' },
    city:      { type: String, default: '' },
    province:  { type: String, default: '' },
    country:   { type: String, default: 'Philippines' },
    coordinates: {
      lat: { type: Number, default: null },
      lng: { type: Number, default: null },
    },
  },

  // ── Contact ─────────────────────────────────────────────────────────────────
  contact: {
    phone:     { type: String, default: '' },
    email:     { type: String, default: '' },
    facebook:  { type: String, default: '' },
    instagram: { type: String, default: '' },
    website:   { type: String, default: '' },
  },

  // ── Branding ─────────────────────────────────────────────────────────────────
  description: { type: String, default: '' },
  photos:      { type: [String], default: [] }, // URLs (Cloudinary / S3)
  logoUrl:     { type: String, default: '' },
  amenities:   { type: [String], default: [] }, // ['parking','shower','locker']

  // ── Admin ───────────────────────────────────────────────────────────────────
  // The primary admin email for this court (used during onboarding)
  adminEmail: { type: String, required: [true, 'Admin email required'], lowercase: true, trim: true },

  // ── Subscription ────────────────────────────────────────────────────────────
  subscription: {
    status:     { type: String, enum: ['trial', 'active', 'expired', 'suspended'], default: 'trial' },
    plan:       { type: String, enum: ['monthly', 'annual'], default: 'monthly' },
    amount:     { type: Number, default: 2000 },           // PHP
    trialEnds:  { type: Date, default: () => {
      const d = new Date(); d.setDate(d.getDate() + 14);  // 14-day trial
      return d;
    }},
    startDate:    { type: Date, default: null },
    nextBilling:  { type: Date, default: null },
    // Future: Stripe / PayMongo customer ID
    paymentRef:   { type: String, default: '' },
  },

  // ── Settings ────────────────────────────────────────────────────────────────
  settings: {
    timezone:     { type: String, default: 'Asia/Manila' },
    currency:     { type: String, default: 'PHP' },
    hourlyRate:   { type: Number, default: 210 },          // per hour
    reservationFee: { type: Number, default: 210 },        // legacy fallback
    weeklySummary: { type: Boolean, default: true },
  },

  weeklySummary: {
    lastSentAt: { type: Date, default: null },
    lastStatus: { type: String, enum: ['sent', 'failed', 'skipped'], default: 'skipped' },
  },

  analyticsAskQuota: {
    day: { type: String, default: '' },
    count: { type: Number, default: 0 },
  },

  // ── Payout Destination (admin) ─────────────────────────────────────────────
  payout: {
    recipientCode:    { type: String, default: '' }, // Cocoart recipient code
    accountName:      { type: String, default: '' },
    channelCode:      { type: String, default: '' }, // e.g. BPI, BDO, GCASH, MAYA
    accountNumberLast4: { type: String, default: '' },
    isConfigured:     { type: Boolean, default: false },
  },

  // ── Visibility ──────────────────────────────────────────────────────────────
  isPublic:  { type: Boolean, default: false }, // show on landing page once active
  isActive:  { type: Boolean, default: true  }, // false = suspended/deleted

}, { timestamps: true });

// Indexes
CourtSchema.index({ slug: 1 });
CourtSchema.index({ 'subscription.status': 1 });
CourtSchema.index({ isPublic: 1, isActive: 1 });

export default mongoose.models.Court || mongoose.model('Court', CourtSchema);