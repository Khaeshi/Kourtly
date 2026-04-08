import mongoose from 'mongoose';
import dotenv from 'dotenv';
import app from './src/app.js';

dotenv.config();

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected ✅'))
  .catch(err => console.error('MongoDB connection failed:', err));

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));