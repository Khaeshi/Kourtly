import mongoose from 'mongoose';

const UserSchema = new mongoose.Schema({
  email:     { type: String, required: true, unique: true, lowercase: true },
  name:      { type: String, default: '' },
  image:     { type: String, default: '' },
  role:      { type: String, enum: ['user', 'admin'], default: 'user' },
  provider:  { type: String, default: 'google' },
}, { timestamps: true });

export default mongoose.model('User', UserSchema);