import express from 'express';
import cors from 'cors';

import userRoutes from './routes/userRoutes.js';
import playerRoutes from './routes/playerRoutes.js';
import queueRoutes from './routes/queueRoutes.js';
import itemRoutes from './routes/itemRoutes.js';
import tabRoutes from './routes/tabRoutes.js';
import reservationRoutes from './routes/reservationRoutes.js';
import scheduleRoutes from './routes/scheduleRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js';
import reservationTabRoutes from './routes/reservationtabRoutes.js';
import courtRoutes from './routes/courtRoutes.js';
import superadminRoutes from './routes/superadminRoutes.js';
import publicRoutes from './routes/publicRoutes.js';
import { tenantMiddleware } from './middleware/tenantMiddleware.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';

const app = express();

app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://badminton-scbc.vercel.app',
  ],
  credentials: true,
}));

app.use(express.json());

// Public routes
app.use('/api/public', publicRoutes);
app.use('/api/users', userRoutes);

// Super admin
app.use('/api/superadmin', superadminRoutes);

// Court self-management
app.use('/api/court', tenantMiddleware, courtRoutes);

// Tenant-scoped admin routes
app.use('/api/players', tenantMiddleware, playerRoutes);
app.use('/api/queue', tenantMiddleware, queueRoutes);
app.use('/api/items', tenantMiddleware, itemRoutes);
app.use('/api/tabs', tenantMiddleware, tabRoutes);
app.use('/api/reservations', tenantMiddleware, reservationRoutes);
app.use('/api/schedule', tenantMiddleware, scheduleRoutes);
app.use('/api/analytics', tenantMiddleware, analyticsRoutes);
app.use('/api/reservation-tabs', tenantMiddleware, reservationTabRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
