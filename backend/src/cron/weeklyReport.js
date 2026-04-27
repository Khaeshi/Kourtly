import cron from 'node-cron';
import Court from '../models/Court.js';
import {
  getWeeklyAnalytics,
  buildSummaryWithFallback,
  sendSummaryEmail,
} from '../services/weeklySummary.js';

async function processCourt(court) {
  const todayPHT = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
  const lastSentPHT = court.weeklySummary?.lastSentAt
    ? new Date(court.weeklySummary.lastSentAt).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' })
    : null;

  if (lastSentPHT === todayPHT) {
    await Court.updateOne(
      { _id: court._id },
      { $set: { 'weeklySummary.lastStatus': 'skipped' } }
    );
    return;
  }

  const analyticsData = await getWeeklyAnalytics(court._id);
  const summary = await buildSummaryWithFallback(analyticsData);
  await sendSummaryEmail(court, summary, analyticsData);
  await Court.updateOne(
    { _id: court._id },
    {
      $set: {
        'weeklySummary.lastSentAt': new Date(),
        'weeklySummary.lastStatus': 'sent',
      },
    }
  );
}

export function registerWeeklyReportCron() {
  // Every Monday at 08:00 Asia/Manila
  cron.schedule('0 8 * * 1', async () => {
    try {
      const courts = await Court.find({
        'subscription.status': 'active',
        'settings.weeklySummary': true,
      }).lean();

      for (const court of courts) {
        try {
          await processCourt(court);
        } catch (err) {
          await Court.updateOne(
            { _id: court._id },
            { $set: { 'weeklySummary.lastStatus': 'failed' } }
          );
          console.error(`[weekly-report] court=${court._id} failed:`, err.message);
        }
      }
    } catch (err) {
      console.error('[weekly-report] cron run failed:', err.message);
    }
  }, { timezone: 'Asia/Manila' });
}
