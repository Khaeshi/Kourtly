import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import app from './src/app.js';
import { validateCoreEnv, validatePaymentEnv } from './src/utils/envValidation.js';
import { startExpirePendingPaymentsJob } from './src/jobs/expirePendingPayments.js';
import { registerWeeklyReportCron } from './src/cron/weeklyReport.js';

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

io.on('connection', (socket) => {
  const courtId = socket.handshake?.auth?.courtId;
  if (courtId) socket.join(`court:${courtId}`);
});

startExpirePendingPaymentsJob(io);
registerWeeklyReportCron();

httpServer.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT}`));