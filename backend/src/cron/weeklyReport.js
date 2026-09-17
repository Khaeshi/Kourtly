import cron from 'node-cron';
import Court from '../models/Court.js';
import {
  getWeeklyAnalytics,
  buildSummaryWithFallback,
  sendSummaryEmail,
} from '../services/weeklySummary.js';

async function processCourt(court, todayPHT) {
  // Atomic claim: only one instance's update can match, since the condition
  // requires lastSentDatePHT to NOT already be today. A second instance
  // running the same query a moment later matches zero documents.
  const claimed = await Court.findOneAndUpdate(
    {
      _id: court._id,
      'weeklySummary.lastSentDatePHT': { $ne: todayPHT },
    },
    {
      $set: {
        'weeklySummary.lastSentDatePHT': todayPHT,
        'weeklySummary.lastStatus': 'sending',
      },
    },
    { new: true }
  );

  if (!claimed) {
    // Another instance already claimed (or already sent) this court today.
    return;
  }

  try {
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
  } catch (err) {
    // Release the claim so a same-day manual retry isn't blocked by
    // lastSentDatePHT already pointing at today.
    await Court.updateOne(
      { _id: court._id },
      {
        $set: { 'weeklySummary.lastStatus': 'failed' },
        $unset: { 'weeklySummary.lastSentDatePHT': 1 },
      }
    );
    console.error(`[weekly-report] court=${court._id} failed:`, err.message);
  }
}

export function registerWeeklyReportCron() {
  cron.schedule('0 8 * * 1', async () => {
    try {
      const todayPHT = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });

      const courts = await Court.find({
        'subscription.status': 'active',
        'settings.weeklySummary': true,
      }).lean();

      for (const court of courts) {
        await processCourt(court, todayPHT);
      }
    } catch (err) {
      console.error('[weekly-report] cron run failed:', err.message);
    }
  }, { timezone: 'Asia/Manila' });
}