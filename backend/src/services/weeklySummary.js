import mongoose from 'mongoose';
import { Resend } from 'resend';
import { generateAIText } from '../lib/ai/index.js';

function getLastWeekRange(anchor = new Date()) {
  const end = new Date(anchor);
  end.setDate(end.getDate() - end.getDay());
  end.setHours(0, 0, 0, 0);
  const start = new Date(end);
  start.setDate(start.getDate() - 7);
  return { start, end };
}

function toDateStr(date) {
  return date.toISOString().slice(0, 10);
}

function safeNum(value) {
  return Number(value || 0);
}

export async function getWeeklyAnalytics(courtId) {
  const Reservation = mongoose.model('Reservation');
  const Tab = mongoose.model('Tab');
  const { start, end } = getLastWeekRange();

  const [reservations, paidTabs] = await Promise.all([
    Reservation.find({
      courtId,
      createdAt: { $gte: start, $lt: end },
    }).lean(),
    Tab.find({
      courtId,
      status: 'paid',
      updatedAt: { $gte: start, $lt: end },
    }).lean(),
  ]);

  const confirmedCount = reservations.filter((r) => ['confirmed', 'completed'].includes(r.status)).length;
  const reservationRevenue = reservations
    .filter((r) => ['confirmed', 'completed'].includes(r.status))
    .reduce((sum, r) => sum + safeNum(r.reservationFeeAmount || 0), 0);
  const billingRevenue = paidTabs.reduce((sum, t) => sum + safeNum(t.total), 0);

  return {
    period: { start: toDateStr(start), end: toDateStr(new Date(end.getTime() - 1)) },
    reservations: {
      total: reservations.length,
      confirmed: confirmedCount,
      cancelled: reservations.filter((r) => r.status === 'cancelled').length,
      expired: reservations.filter((r) => r.status === 'expired').length,
    },
    billing: {
      paidTabs: paidTabs.length,
      reservationRevenue,
      billingRevenue,
      combinedRevenue: reservationRevenue + billingRevenue,
    },
  };
}

export async function generateSummary(analyticsData) {
  const text = await generateAIText({
    maxTokens: 350,
    system: 'You are a court management assistant for Kourtly, a sports booking platform in the Philippines. You receive 7 days of analytics data and write a short, friendly weekly summary for the court owner. Rules: Use simple English mixed with light Filipino phrases where natural (e.g. "Maganda!"). Always cite specific numbers. End with exactly one actionable suggestion (not a generic tip). Maximum 180 words. Tone: helpful colleague, not a corporate report.',
    prompt: `Create weekly summary from this data:\n${JSON.stringify(analyticsData)}`,
  });
  if (!text) throw new Error('AI provider returned empty summary');
  return text;
}

function rawDataFallback(analyticsData) {
  return [
    `Reservations: ${analyticsData.reservations.total} total, ${analyticsData.reservations.confirmed} confirmed, ${analyticsData.reservations.cancelled} cancelled, ${analyticsData.reservations.expired} expired.`,
    `Revenue: PHP ${analyticsData.billing.combinedRevenue.toFixed(2)} total (Reservation ${analyticsData.billing.reservationRevenue.toFixed(2)} + Billing ${analyticsData.billing.billingRevenue.toFixed(2)}).`,
    `Paid tabs: ${analyticsData.billing.paidTabs}.`,
  ].join(' ');
}

export async function sendSummaryEmail(court, summary, analyticsData) {
  const resendKey = process.env.RESEND_API_KEY;
  if (!resendKey) throw new Error('RESEND_API_KEY is not set');
  const resend = new Resend(resendKey);

  const to = court.contact?.email || court.adminEmail;
  if (!to) throw new Error('Court has no email recipient');

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:640px;margin:0 auto;padding:20px;">
      <h2 style="margin:0 0 10px;">Your Kourtly Weekly Summary</h2>
      <p style="color:#555;margin:0 0 18px;">Period: ${analyticsData.period.start} to ${analyticsData.period.end}</p>
      <div style="background:#f7f7f7;padding:14px;border-radius:8px;margin-bottom:16px;">
        <p style="margin:0;line-height:1.6;">${summary}</p>
      </div>
      <p style="margin:0 0 8px;"><strong>Quick Stats</strong></p>
      <ul style="margin:0;padding-left:18px;line-height:1.6;">
        <li>Reservations: ${analyticsData.reservations.total}</li>
        <li>Confirmed: ${analyticsData.reservations.confirmed}</li>
        <li>Combined Revenue: PHP ${analyticsData.billing.combinedRevenue.toFixed(2)}</li>
      </ul>
    </div>
  `;

  await resend.emails.send({
    from: process.env.RESEND_FROM_EMAIL || 'noreply@kourtly.com',
    to,
    subject: `Kourtly Weekly Summary (${analyticsData.period.start} - ${analyticsData.period.end})`,
    html,
  });
}

export async function buildSummaryWithFallback(analyticsData) {
  try {
    return await generateSummary(analyticsData);
  } catch {
    return rawDataFallback(analyticsData);
  }
}
