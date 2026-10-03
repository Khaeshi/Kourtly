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
import courtRegistrationRoutes from './routes/courtRegistrationRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import payoutTransferRoutes from './routes/payoutTransferRoutes.js';
import { tenantMiddleware } from './middleware/tenantMiddleware.js';
import {
  authAdjacentLimiter,
  limitMethods,
  publicCostlyLimiter,
  publicReadLimiter,
  superadminLimiter,
  tenantAdminLimiter,
} from './middleware/rateLimiters.js';
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
    'https://www.playkou.site',
  ],
  credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-kourtly-auth'],
}));

app.use(express.json());

// Public routes: regexes keep similarly prefixed routes in their own tier.
app.use(/^\/api\/public\/courts\/[^/]+\/reserve$/, publicCostlyLimiter);
app.use(/^\/api\/public\/courts\/[^/]+\/reservations\/[^/]+\/mock-pay$/, publicCostlyLimiter);
app.use(/^\/api\/register-court$/, publicCostlyLimiter);

app.use(/^\/api\/public\/courts$/, publicReadLimiter);
app.use(/^\/api\/public\/courts\/id\/[^/]+$/, publicReadLimiter);
app.use(/^\/api\/public\/courts\/[^/]+$/, publicReadLimiter);
app.use(/^\/api\/public\/courts\/[^/]+\/availability$/, publicReadLimiter);
app.use(/^\/api\/public\/courts\/[^/]+\/schedule$/, publicReadLimiter);
app.use(/^\/api\/public\/courts\/[^/]+\/reservations\/[^/]+$/, publicReadLimiter);

// Auth callbacks call these on sign-in; allow repeated legitimate logins.
app.use(/^\/api\/users\/by-email\/[^/]+$/, authAdjacentLimiter);
app.use(/^\/api\/users\/upsert$/, authAdjacentLimiter);
app.use(/^\/api\/users$/, limitMethods(superadminLimiter, ['GET']));
app.use(/^\/api\/users\/[^/]+\/role$/, limitMethods(superadminLimiter, ['PATCH']));
app.use(/^\/api\/users\/(?!upsert$)[^/]+$/, limitMethods(superadminLimiter, ['DELETE']));

// The Xendit webhook is intentionally not rate limited so provider retries are preserved.
app.use('/api/public', publicRoutes);
app.use('/api/register-court', courtRegistrationRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/users', userRoutes);

// Super admin
app.use('/api/superadmin', superadminLimiter, superadminRoutes);

// Court self-management
app.use('/api/court', tenantAdminLimiter, tenantMiddleware, courtRoutes);

// Tenant-scoped admin routes
app.use('/api/players', tenantAdminLimiter, tenantMiddleware, requireModule(MODULES.QUEUE), playerRoutes);
app.use('/api/queue', tenantAdminLimiter, tenantMiddleware, requireModule(MODULES.QUEUE), queueRoutes);
app.use('/api/items', tenantAdminLimiter, tenantMiddleware, requireModule(MODULES.ITEM_TABS), itemRoutes);
app.use('/api/tabs', tenantAdminLimiter, tenantMiddleware, requireModule(MODULES.ITEM_TABS), tabRoutes);
app.use('/api/reservations', tenantAdminLimiter, tenantMiddleware, requireModule(MODULES.BOOKING), reservationRoutes);
app.use('/api/schedule', tenantAdminLimiter, tenantMiddleware, requireModule(MODULES.BOOKING), scheduleRoutes);
app.use('/api/analytics', tenantAdminLimiter, tenantMiddleware, analyticsRoutes);
app.use('/api/reservation-tabs', tenantAdminLimiter, tenantMiddleware, requireModule(MODULES.ITEM_TABS), reservationTabRoutes);
app.use('/api/payout-transfers', tenantAdminLimiter, tenantMiddleware, requireModule(MODULES.ITEM_TABS), payoutTransferRoutes);

app.use(notFound);
app.use(errorHandler);

export default app;
