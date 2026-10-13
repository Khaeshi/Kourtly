import { getXenditMode } from '../services/xenditService.js';

export const ONLINE_PAYMENT_ALLOWED_STATUSES = Object.freeze({
  development: Object.freeze(['REGISTERED']),
  production: Object.freeze([]),
});

export function canAcceptOnlinePayments(court) {
  const mode = getXenditMode();
  return Boolean(
    mode &&
    court?.xendit?.subAccountId &&
    court.xendit.webhookConfigured === true &&
    ONLINE_PAYMENT_ALLOWED_STATUSES[mode].includes(court.xendit.status)
  );
}
