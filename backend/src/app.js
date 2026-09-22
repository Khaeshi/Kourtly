import express from 'express';
import cors from 'cors';
import helmet from 'helmet'
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
import paymentRoutes from './routes/paymentRoutes.js';
import payoutTransferRoutes from './routes/payoutTransferRoutes.js';
import { tenantMiddleware } from './middleware/tenantMiddleware.js';
import { requireModule, MODULES } from './lib/moduleEntitlements.js';
import { notFound, errorHandler } from './middleware/errorMiddleware.js';

const app = express();
app.use(helmet({
   crossOriginResourcePolicy: { policy: "cross-origin" }
}));

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
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);

// Super admin
app.use('/api/superadmin', superadminRoutes);

// Court self-management
app.use('/api/court', tenantMiddleware, courtRoutes);

// Tenant-scoped admin routes
app.use('/api/players', tenantMiddleware, requireModule(MODULES.QUEUE), playerRoutes);
app.use('/api/queue', tenantMiddleware, requireModule(MODULES.QUEUE), queueRoutes);
app.use('/api/items', tenantMiddleware, requireModule(MODULES.ITEM_TABS), itemRoutes);
app.use('/api/tabs', tenantMiddleware, requireModule(MODULES.ITEM_TABS), tabRoutes);
app.use('/api/reservations', tenantMiddleware, requireModule(MODULES.BOOKING), reservationRoutes);
app.use('/api/schedule', tenantMiddleware, requireModule(MODULES.BOOKING), scheduleRoutes);
app.use('/api/analytics', tenantMiddleware, analyticsRoutes);
app.use('/api/reservation-tabs', tenantMiddleware, requireModule(MODULES.ITEM_TABS), reservationTabRoutes);
app.use('/api/payout-transfers', tenantMiddleware, requireModule(MODULES.ITEM_TABS), payoutTransferRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
