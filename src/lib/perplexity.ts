export function normalizeApiKey(apiKey: string): string {
  return apiKey.trim();
}

export function createPerplexityAuthHeader(apiKey: string): string {
  return `Bearer ${normalizeApiKey(apiKey)}`;
}

export function createPerplexityValidationBody() {
  return {
    model: 'sonar',
    messages: [{ role: 'user', content: 'Test' }],
    max_tokens: 16,
  };
}

export function formatPerplexityErrorMessage(status: number, providerMessage?: string): string {
  if (status === 401 || status === 403) {
    return 'Perplexity rejected this API key. Check that you copied the full key and that it is active.';
  }

  if (status === 402) {
    return 'Perplexity rejected the request because the account has a billing or credits issue.';
  }

  if (status === 429) {
    return 'Perplexity rate limit exceeded. Wait a moment and try again.';
  }

  const detail = providerMessage?.trim();
  return detail
    ? `Perplexity rejected the validation request: ${detail}`
    : `Perplexity rejected the validation request with status ${status}.`;
}
