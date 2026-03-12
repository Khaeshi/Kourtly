import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './src/routes/userRoutes.js';
import playerRoutes from './src/routes/playerRoutes.js';
import queueRoutes from './src/routes/queueRoutes.js';
import itemRoutes from './src/routes/itemRoutes.js';
import tabRoutes  from './src/routes/tabRoutes.js';
import reservation from './src/routes/reservationRoutes.js'


dotenv.config();

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-app.vercel.app'  
  ],
  credentials: true
}));
app.use(express.json());

// MongoDB connection
mongoose.set('returnDocument', 'after')
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

// Routes
app.use('/api/users', userRoutes);
app.use('/api/players', playerRoutes);
app.use('/api/queue', queueRoutes);
app.use('/api/items', itemRoutes);
app.use('/api/tabs',  tabRoutes);
app.use('/api/reservations', reservation)

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));