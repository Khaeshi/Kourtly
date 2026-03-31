import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import dotenv from 'dotenv';
import userRoutes from './src/routes/userRoutes.js';
import playerRoutes from './src/routes/playerRoutes.js';
import queueRoutes from './src/routes/queueRoutes.js';
import itemRoutes from './src/routes/itemRoutes.js';
import tabRoutes from './src/routes/tabRoutes.js';
import reservationRoutes from './src/routes/reservationRoutes.js';
import scheduleRoutes from './src/routes/scheduleRoutes.js';
import analyticsRoutes   from './src/routes/analyticsRoutes.js';
import reservationTabRoutes   from './src/routes/reservationtabRoutes.js';
import { notFound, errorHandler } from './src/middleware/errorMiddleware.js'
import { tenantMiddleware } from './src/middleware/tenantMiddleware.js';
import superadminRoutes from './src/routes/superadminRoutes.js';

dotenv.config();

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://badminton-scbc.vercel.app',
    ],
credentials: true
}));

app.use(express.json());

// MongoDB connection
mongoose.set('returnDocument', 'after')
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error(err));

// Public endpoint — no auth needed
app.get('/api/public/courts', async (req, res) => {
  try {
    const Court = mongoose.model('Court');
    const courts = await Court.find({ 
      isPublic: true, 
      isActive: true,
      'subscription.status': { $in: ['active', 'trial'] }
    })
    .select('name slug sports courtCount location contact')
    .lean();
    res.json(courts);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// Routes
app.use('/api/superadmin', superadminRoutes);
app.use('/api/users', userRoutes);
app.use('/api/players', tenantMiddleware, playerRoutes);
app.use('/api/queue', tenantMiddleware, queueRoutes);
app.use('/api/items', tenantMiddleware, itemRoutes);
app.use('/api/tabs', tenantMiddleware, tabRoutes);
app.use('/api/reservations', tenantMiddleware, reservationRoutes);
app.use('/api/schedule', tenantMiddleware, scheduleRoutes);
app.use('/api/analytics', tenantMiddleware, analyticsRoutes);
app.use('/api/reservation-tabs', tenantMiddleware, reservationTabRoutes);


/**
 * --- Error Handling Middleware ---
 * @desc Handles requests to routes that do not exist.
 */
app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));