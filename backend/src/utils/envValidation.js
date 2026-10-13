import { getXenditMode, isValidXenditWebhookUrl } from '../services/xenditService.js';

function missing(vars) {
  return vars.filter((k) => !process.env[k] || String(process.env[k]).trim() === '');
}

export function validateCoreEnv() {
  const required = ['MONGODB_URI'];
  const missingVars = missing(required);
  if (missingVars.length) {
    throw new Error(`Missing required env vars: ${missingVars.join(', ')}`);
  }
}

export function validatePaymentEnv() {
  getXenditMode();

  const required = ['XENDIT_SECRET_KEY', 'XENDIT_CALLBACK_TOKEN', 'XENDIT_MASTER_USER_ID', 'APP_BASE_URL'];
  /* @author Khaesey Angel Tablante
   * const missingMasterUserId = missing(['XENDIT_MASTER_USER_ID']);
  if (missingMasterUserId.length) {
    throw new Error('Missing required env vars: XENDIT_MASTER_USER_ID');
  } Note: This is a hard strict, only apply when necessary */
  const missingVars = missing(required);

  if (missingVars.length) {
    const msg = `Payment env incomplete; payment routes may fail: ${missingVars.join(', ')}`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(msg);
    }
    console.warn(`[env] ${msg}`);
  }

  if (process.env.NODE_ENV === 'production' && !isValidXenditWebhookUrl()) {
    throw new Error('XENDIT_WEBHOOK_URL must be a valid public HTTPS Xendit webhook URL.');
  }

  const provider = (process.env.PAYMENT_PROVIDER || 'xendit').toLowerCase();
  if (provider !== 'xendit' && !(provider === 'mock' && process.env.NODE_ENV !== 'production')) {
    throw new Error(`Unsupported PAYMENT_PROVIDER "${provider}". Current supported provider: xendit or mock for local development`);
  }
}
