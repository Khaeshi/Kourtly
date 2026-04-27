function getAIProvider() {
  return (process.env.AI_PROVIDER || 'anthropic').toLowerCase();
}

async function callAnthropic({ system, prompt, maxTokens = 300 }) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.ANTHROPIC_MODEL || 'claude-3-5-haiku-latest',
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Anthropic request failed: ${text}`);
  }
  const data = await response.json();
  return data?.content?.find?.((c) => c.type === 'text')?.text || '';
}

async function callLocalLlama({ system, prompt }) {
  const endpoint = process.env.LOCAL_LLM_ENDPOINT || 'http://localhost:11434/api/generate';
  const model = process.env.LOCAL_LLM_MODEL || 'llama3';
  const composedPrompt = `${system}\n\nUser:\n${prompt}\n\nAssistant:`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      prompt: composedPrompt,
      stream: false,
    }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Local LLM request failed: ${text}`);
  }
  const data = await response.json();
  return data?.response || data?.text || '';
}

export async function generateAIText({ system, prompt, maxTokens = 300 }) {
  const provider = getAIProvider();
  if (provider === 'local-llama') return callLocalLlama({ system, prompt, maxTokens });
  return callAnthropic({ system, prompt, maxTokens });
}
