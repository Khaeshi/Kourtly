import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true, lowercase: true },
  name:     { type: String, default: '' },
  image:    { type: String, default: '' },
  role:     {
    type:    String,
    enum:    ['superadmin', 'admin', 'staff', 'user'],
    default: 'user',
  },
  // null = superadmin (platform-wide access, not tied to any court)
  // ObjectId = this user belongs to this specific court
  courtId:  { type: mongoose.Schema.Types.ObjectId, ref: 'Court', default: null },
  provider: { type: String, default: 'google' },
}, { timestamps: true });

UserSchema.index({ courtId: 1, role: 1 });

export default mongoose.models.User || mongoose.model('User', UserSchema);