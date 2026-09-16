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

  const provider = (process.env.PAYMENT_PROVIDER || 'cocoart').toLowerCase();
  if (provider !== 'cocoart' && !(provider === 'mock' && process.env.NODE_ENV !== 'production')) {
    throw new Error(`Unsupported PAYMENT_PROVIDER "${provider}". Current supported provider: cocoart or mock for local development`);
  }

  const aiProvider = (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
  if (aiProvider === 'anthropic' && (!process.env.ANTHROPIC_API_KEY || String(process.env.ANTHROPIC_API_KEY).trim() === '')) {
    console.warn('[env] ANTHROPIC_API_KEY not set. AI features will use fallback responses.');
  }
  if (aiProvider === 'local-llama' && (!process.env.LOCAL_LLM_ENDPOINT || String(process.env.LOCAL_LLM_ENDPOINT).trim() === '')) {
    console.warn('[env] LOCAL_LLM_ENDPOINT not set. Defaulting to http://localhost:11434/api/generate.');
  }
}

