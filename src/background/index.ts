import type { FactCheckResult, ScanRequest, ScanResponse } from '../types';
import {
    ApiStatusError,
    parseFactCheckResults,
    shouldRetryScanError,
} from '../lib/modelOutput';
import { createPerplexityAuthHeader, normalizeApiKey } from '../lib/perplexity';
import { buildFactCheckMessages } from '../lib/prompt';

chrome.runtime.onMessage.addListener((request: ScanRequest, _sender: chrome.runtime.MessageSender, sendResponse: (response: ScanResponse) => void) => {
    if (request.type === 'SCAN_REQUEST') {
        handleScanRequest(request.text)
            .then((data) => sendResponse({ success: true, data }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
    }
});

async function handleScanRequest(text: string, retryCount = 0): Promise<FactCheckResult[]> {
    const MAX_RETRIES = 3;
    const result = await chrome.storage.sync.get(['perplexityApiKey']);
    const apiKey = typeof result.perplexityApiKey === 'string'
        ? normalizeApiKey(result.perplexityApiKey)
        : '';

    if (!apiKey) {
        throw new Error('API Key not found. Please set it in the extension options.');
    }

    const prompt = buildFactCheckMessages(text, { retryCount });

    try {
        const response = await fetch(
            'https://api.perplexity.ai/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': createPerplexityAuthHeader(apiKey),
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'sonar',  // Fast model for real-time use
                    messages: [
                        {
                            role: 'system',
                            content: prompt.system
                        },
                        {
                            role: 'user',
                            content: prompt.user
                        }
                    ],
                    temperature: 0.0,
                    max_tokens: prompt.maxTokens,
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            const message = typeof errorData.error?.message === 'string'
                ? errorData.error.message
                : `API Error: ${response.status} ${response.statusText}`;
            throw new ApiStatusError(response.status, message);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('No response from Perplexity API');
        }

        console.log('[Veracity] Raw Perplexity response:', content);

        return parseFactCheckResults(content);

    } catch (error) {
        // Retry logic with exponential backoff
        if (shouldRetryScanError(error, retryCount, MAX_RETRIES)) {
            const waitTime = Math.pow(2, retryCount) * 1000; // 1s, 2s, 4s
            console.log(`[Veracity] Retry ${retryCount + 1}/${MAX_RETRIES} after ${waitTime}ms...`);

            await new Promise(resolve => setTimeout(resolve, waitTime));
            return handleScanRequest(text, retryCount + 1);
        }

        // Max retries reached
        console.error('[Veracity] All retries exhausted');
        throw error;
    }
}
