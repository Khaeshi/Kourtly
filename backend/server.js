import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import app from './src/app.js';
import { validateCoreEnv, validatePaymentEnv } from './src/utils/envValidation.js';
import { startExpirePendingPaymentsJob } from './src/jobs/expirePendingPayments.js';
import { registerWeeklyReportCron } from './src/cron/weeklyReport.js';
import { verifyInternalAssertion } from './src/lib/internalAuth.js';
import User from './src/models/User.js';

dotenv.config();
validateCoreEnv();
validatePaymentEnv();

mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('MongoDB connected ✅'))
  .catch(err => console.error('MongoDB connection failed:', err));

const PORT = process.env.PORT || 5000;
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: [
      'http://localhost:3000',
      'https://badminton-scbc.vercel.app',
    ],
    credentials: true,
  },
});

app.set('io', io);

io.use(async (socket, next) => {
  try {
    const token = socket.handshake?.auth?.token;
    const assertion = token ? verifyInternalAssertion(token) : null;

    if (!assertion?.email) {
      socket.data.verifiedCourtId = null;
      return next();
    }

    const user = await User.findOne({ email: assertion.email.toLowerCase() }).lean();
    if (!user) {
      socket.data.verifiedCourtId = null;
      return next();
    }

    socket.data.verifiedCourtId = user.role === 'superadmin' ? null : user.courtId ?? null;
    socket.data.verifiedRole = user.role ?? 'user';
    next();
  } catch (err) {
    next(err);
  }
});

io.on('connection', (socket) => {
  console.log('[socket] connected:', socket.id, 'role:', socket.data.verifiedRole ?? 'anonymous');

  if (socket.data.verifiedCourtId) {
    socket.join(`court:${socket.data.verifiedCourtId}`);
  }

  const publicRef = socket.handshake?.auth?.publicRef;
  if (publicRef) {
    socket.join(`reservation:${publicRef}`);
  }
});

startExpirePendingPaymentsJob(io);
registerWeeklyReportCron();

httpServer.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));