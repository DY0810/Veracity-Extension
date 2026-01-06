import type { ScanRequest, ScanResponse } from '../types';

chrome.runtime.onMessage.addListener((request: ScanRequest, _sender: chrome.runtime.MessageSender, sendResponse: (response: ScanResponse) => void) => {
    if (request.type === 'SCAN_REQUEST') {
        handleScanRequest(request.text)
            .then((data) => sendResponse({ success: true, data }))
            .catch((error) => sendResponse({ success: false, error: error.message }));
        return true; // Keep channel open for async response
    }
});

async function handleScanRequest(text: string, retryCount = 0): Promise<any> {
    const MAX_RETRIES = 3;
    const result = await chrome.storage.sync.get(['perplexityApiKey']);
    const apiKey = result.perplexityApiKey;

    if (!apiKey) {
        throw new Error('API Key not found. Please set it in the extension options.');
    }

    // Auto-generate current date
    const today = new Date();
    const dateString = today.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

    // Optimized prompt - strict JSON compliance
    const systemPrompt = `You are a fact-checking AI with web search. Today's date: ${dateString}.

TASK: Extract 15-20 verifiable factual claims from the article and verify them using web search.

CRITICAL OUTPUT RULE:
Return ONLY pure JSON. START with [ and END with ]. NO markdown (no \`\`\`json), NO text before/after, NO explanations.

QUOTE EXTRACTION:
- "quote" = EXACT text from article (copy-paste accuracy)
- Maximum 10 words
- DO NOT paraphrase
- Choose unique, distinctive phrases

SEARCH & VERIFICATION:
- Base verdicts ONLY on web search results
- Prioritize recent sources (2024-2025)
- Prefer: major news, academic, government sites
- Avoid: social media, blogs, forums
- If search results insufficient: use verdict "unverified"

VERDICT OPTIONS (choose one):
- "true": Verified accurate with strong sources
- "false": Demonstrably incorrect per search results  
- "context": True but misleading/missing critical context
- "unverified": Unable to find sufficient reliable sources

JSON STRUCTURE (REQUIRED):
[
  {
    "quote": "exact article text here",
    "verdict": "true|false|context|unverified",
    "claim": "Clear statement of fact being checked",
    "comments": "Brief explanation citing source. If unverified, state: Unable to verify from search results",
    "source": "https://full-url-to-source.com"
  }
]

JSON COMPLIANCE RULES:
1. Escape ALL quotes in strings: \\"
2. NO line breaks in string values
3. NO trailing commas
4. Valid JSON syntax only

Return the JSON array now (15-20 claims):`;

    try {
        const response = await fetch(
            'https://api.perplexity.ai/chat/completions',
            {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model: 'sonar',  // Fast model for real-time use
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: `Analyze this article and fact-check its claims. Base your fact-checks ONLY on information you can find through web search:\n\n${text}`
                        }
                    ],
                    temperature: 0.0,
                    max_tokens: 2000,
                }),
            }
        );

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.error?.message || `API Error: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const content = data.choices?.[0]?.message?.content;

        if (!content) {
            throw new Error('No response from Perplexity API');
        }

        console.log('[Veracity] Raw Perplexity response:', content);

        // Clean and extract JSON
        let jsonString = null;

        // Strategy 1: Look for markdown code block with json tag
        let codeBlockMatch = content.match(/```json\\s*([\\s\\S]*?)```/);
        if (codeBlockMatch) {
            jsonString = codeBlockMatch[1].trim();
        }

        // Strategy 2: Look for any code block
        if (!jsonString) {
            codeBlockMatch = content.match(/```\\s*([\\s\\S]*?)```/);
            if (codeBlockMatch) {
                jsonString = codeBlockMatch[1].trim();
            }
        }

        // Strategy 3: Look for raw JSON array
        if (!jsonString) {
            const jsonMatch = content.match(/\\[\\s*\\{[\\s\\S]*\\}\\s*\\]/);
            if (jsonMatch) {
                jsonString = jsonMatch[0];
            }
        }

        // Strategy 4: Content starts with [ - use whole thing
        if (!jsonString && content.trim().startsWith('[')) {
            jsonString = content.trim();
        }

        if (!jsonString) {
            console.error('[Veracity] Failed to extract JSON from response');
            console.error('[Veracity] Response content:', content.substring(0, 1000));
            throw new Error('Could not find JSON in API response');
        }

        // COMPREHENSIVE JSON REPAIR
        function repairJSON(str: string): string {
            let repaired = str;

            // 1. Remove control characters
            repaired = repaired.replace(/[\\x00-\\x1F\\x7F-\\x9F]/g, '');

            // 2. Fix common escape issues
            repaired = repaired
                .replace(/\\\\'/g, "'")           // Unescape single quotes
                .replace(/([^\\\\])"/g, '$1\\\\"')  // Escape unescaped quotes
                .replace(/\\\\\\\\"/g, '\\\\"')       // Fix double-escaped quotes
                .replace(/\\\\\\\\/g, '\\\\');        // Fix double backslashes

            // 3. Remove newlines and tabs from string values
            repaired = repaired.replace(/"([^"]*?)"/g, (_match, content: string) => {
                const cleaned = content
                    .replace(/\\n/g, ' ')
                    .replace(/\\r/g, ' ')
                    .replace(/\\t/g, ' ')
                    .replace(/\\s+/g, ' ')
                    .trim();
                return `"${cleaned}"`;
            });

            // 4. Fix trailing commas
            repaired = repaired.replace(/,(\\s*[}\\]])/g, '$1');

            // 5. Normalize whitespace
            repaired = repaired.replace(/\\s+/g, ' ').trim();

            return repaired;
        }

        console.log('[Veracity] Original JSON length:', jsonString.length);

        // Try parsing with progressive repair
        const errors: string[] = [];

        // Attempt 1: Parse as-is
        try {
            const claims = JSON.parse(jsonString);
            if (Array.isArray(claims) && claims.length > 0) {
                console.log('[Veracity] Successfully parsed without repair');
                return claims;
            }
        } catch (e) {
            errors.push(`Attempt 1: ${(e as Error).message}`);
        }

        // Attempt 2: Basic repair
        try {
            const repaired = repairJSON(jsonString);
            console.log('[Veracity] Repaired JSON length:', repaired.length);
            const claims = JSON.parse(repaired);
            if (Array.isArray(claims) && claims.length > 0) {
                console.log('[Veracity] Successfully parsed after basic repair');
                return claims;
            }
        } catch (e) {
            errors.push(`Attempt 2: ${(e as Error).message}`);
        }

        // Attempt 3: Aggressive cleaning
        try {
            let aggressive = jsonString;

            aggressive = aggressive
                .replace(/[\\u0000-\\u001F\\u007F-\\u009F]/g, '')
                .replace(/\\\\n/g, ' ')
                .replace(/\\\\r/g, ' ')
                .replace(/\\\\t/g, ' ');

            const claims = JSON.parse(aggressive);
            if (Array.isArray(claims) && claims.length > 0) {
                console.log('[Veracity] Successfully parsed after aggressive cleaning');
                return claims;
            }
        } catch (e) {
            errors.push(`Attempt 3: ${(e as Error).message}`);
        }

        // Attempt 4: Partial recovery
        try {
            console.log('[Veracity] Attempting partial JSON recovery...');
            let truncated = jsonString;
            const lastCompleteObject = truncated.lastIndexOf('},');
            if (lastCompleteObject > 0) {
                truncated = truncated.substring(0, lastCompleteObject + 1) + ']';
                const claims = JSON.parse(truncated);
                if (Array.isArray(claims) && claims.length > 0) {
                    console.log(`[Veracity] ✓ Partial recovery successful! Salvaged ${claims.length} claims`);
                    return claims;
                }
            }
        } catch (e) {
            errors.push(`Attempt 4: ${(e as Error).message}`);
        }

        // If all parsing attempts failed, throw error to trigger retry
        throw new Error(`JSON parsing failed: ${errors[errors.length - 1]}`);

    } catch (error) {
        // Retry logic with exponential backoff
        if (retryCount < MAX_RETRIES) {
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
