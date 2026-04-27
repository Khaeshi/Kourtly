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
  const required = ['COCOART_API_KEY', 'COCOART_WEBHOOK_SECRET', 'APP_BASE_URL'];
  const missingVars = missing(required);

  if (missingVars.length) {
    const msg = `Payment env incomplete; payment routes may fail: ${missingVars.join(', ')}`;
    if (process.env.NODE_ENV === 'production') {
      throw new Error(msg);
    }
    console.warn(`[env] ${msg}`);
  }
}

