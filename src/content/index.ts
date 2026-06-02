import type { FactCheckResult, FactCheckVerdict, ScanResponse } from '../types';

let statusCard: HTMLElement | null = null;

interface VerdictCounts {
  true: number;
  context: number;
  false: number;
  unverified: number;
  unmatched: number;
}

interface ArticleTextPayload {
  text: string;
  truncated: boolean;
  includedCharacters: number;
  totalCharacters: number;
}

interface VerdictPresentation {
  label: string;
  badgeColor: string;
  backgroundColor: string;
  borderColor: string;
  textColor: string;
  icon: string;
}

// Track matched counts globally
let matchedCounts: VerdictCounts = { false: 0, context: 0, true: 0, unverified: 0, unmatched: 0 };

function normalizeVerdict(value: unknown): FactCheckVerdict {
  return value === 'true' || value === 'false' || value === 'context' || value === 'unverified'
    ? value
    : 'unverified';
}

function calculateIntegrityScore(counts: VerdictCounts) {
  const verifiedClaims = counts.true + counts.context + counts.false;
  const totalClaims = verifiedClaims + counts.unverified + counts.unmatched;
  const score = verifiedClaims > 0
    ? Math.round(((counts.true + counts.context * 0.5) / verifiedClaims) * 100)
    : null;

  return {
    score,
    verifiedClaims,
    totalClaims,
  };
}

function getVerdictPresentation(verdict: FactCheckVerdict): VerdictPresentation {
  switch (verdict) {
    case 'false':
      return {
        label: 'False',
        badgeColor: '#EF4444',
        backgroundColor: '#fee2e2',
        borderColor: '#dc2626',
        textColor: '#991b1b',
        icon: 'x',
      };
    case 'context':
      return {
        label: 'Needs Context',
        badgeColor: '#F59E0B',
        backgroundColor: '#fef3c7',
        borderColor: '#f59e0b',
        textColor: '#92400e',
        icon: '!',
      };
    case 'true':
      return {
        label: 'True',
        badgeColor: '#10B981',
        backgroundColor: '#d1fae5',
        borderColor: '#059669',
        textColor: '#065f46',
        icon: '✓',
      };
    case 'unverified':
      return {
        label: 'Unverified',
        badgeColor: '#64748B',
        backgroundColor: '#f1f5f9',
        borderColor: '#64748b',
        textColor: '#334155',
        icon: '?',
      };
  }
}

function buildArticleTextPayload(blocks: string[], limit = 15000): ArticleTextPayload {
  const seen = new Set<string>();
  const uniqueBlocks = blocks
    .map((block) => block.trim())
    .filter((block) => {
      if (!block || seen.has(block)) {
        return false;
      }
      seen.add(block);
      return true;
    });

  const fullText = uniqueBlocks.join('\n\n');
  const text = fullText.length > limit ? fullText.slice(0, limit) : fullText;

  return {
    text,
    truncated: fullText.length > limit,
    includedCharacters: text.length,
    totalCharacters: fullText.length,
  };
}

function normalizeText(text: string): string {
  return text
    .replace(/\s+/g, ' ')
    .replace(/[""]/g, '"')
    .replace(/['']/g, "'")
    .replace(/[–—]/g, '-')
    .trim()
    .toLowerCase();
}

function stripPunctuation(text: string): string {
  return normalizeText(text).replace(/[.,!?;:()]/g, ' ').replace(/\s+/g, ' ').trim();
}

function toDistinctiveWords(text: string): string[] {
  const stopWords = new Set([
    'the',
    'and',
    'for',
    'with',
    'that',
    'this',
    'from',
    'after',
    'before',
    'into',
    'over',
    'under',
    'last',
    'night',
  ]);

  return stripPunctuation(text)
    .split(' ')
    .filter((word) => word.length > 2 && !stopWords.has(word));
}

function fuzzyMatch(haystack: string, needle: string) {
  const normHaystack = normalizeText(haystack);
  const normNeedle = normalizeText(needle);

  if (!normNeedle) {
    return { match: false, startIndex: 0, endIndex: 0 };
  }

  const exactIndex = normHaystack.indexOf(normNeedle);
  if (exactIndex !== -1) {
    return { match: true, startIndex: exactIndex, endIndex: exactIndex + normNeedle.length };
  }

  const cleanHaystack = stripPunctuation(haystack);
  const cleanNeedle = stripPunctuation(needle);
  const cleanIndex = cleanHaystack.indexOf(cleanNeedle);
  if (cleanNeedle.length >= 12 && cleanIndex !== -1) {
    return { match: true, startIndex: cleanIndex, endIndex: cleanIndex + cleanNeedle.length };
  }

  const needleWords = toDistinctiveWords(needle);
  if (needleWords.length < 4) {
    return { match: false, startIndex: 0, endIndex: 0 };
  }

  const cleanWords = cleanHaystack.split(' ');
  for (let windowSize = Math.min(needleWords.length, 6); windowSize >= 4; windowSize--) {
    for (let i = 0; i <= needleWords.length - windowSize; i++) {
      const phrase = needleWords.slice(i, i + windowSize).join(' ');
      const start = cleanHaystack.indexOf(phrase);
      if (start !== -1 && cleanWords.includes(needleWords[i])) {
        return { match: true, startIndex: start, endIndex: start + phrase.length };
      }
    }
  }

  return { match: false, startIndex: 0, endIndex: 0 };
}

chrome.runtime.onMessage.addListener((request: { type: string }, _sender: chrome.runtime.MessageSender, sendResponse: (response: { success: boolean; count?: number }) => void) => {
  if (request.type === 'TRIGGER_SCAN') {
    showLoadingCard();
    scanPage()
      .then((count) => {
        showToast(`Scan complete. Found ${count} claims.`, 'success');
        sendResponse({ success: true, count });
      })
      .catch((err) => {
        hideStatusCard();
        showToast(`Scan failed: ${err.message}`, 'error');
        sendResponse({ success: false });
      });
    return true;
  }
});

function showLoadingCard() {
  if (statusCard) {
    statusCard.remove();
  }

  statusCard = document.createElement('div');
  statusCard.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: white;
    padding: 20px;
    border-radius: 16px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.15);
    z-index: 999999;
    font-family: system-ui, sans-serif;
    min-width: 200px;
    transition: all 0.3s ease;
  `;

  statusCard.innerHTML = `
    <div style="display: flex; align-items: center; gap: 12px;">
      <div style="
        width: 32px;
        height: 32px;
        border: 3px solid #e5e7eb;
        border-top-color: #3b82f6;
        border-radius: 50%;
        animation: spin 1s linear infinite;
      "></div>
      <div>
        <div style="font-size: 14px; font-weight: 600; color: #1f2937;">Fact Checking...</div>
        <div style="font-size: 11px; color: #6b7280;">Analyzing with AI</div>
      </div>
    </div>
    <style>
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
  `;

  document.body.appendChild(statusCard);
}

function showScoreCard(counts: VerdictCounts) {
  if (!statusCard) return;

  const result = calculateIntegrityScore(counts);
  const score = result.score;

  const scoreColor = score === null ? '#64748B' : score > 80 ? '#059669' : score > 50 ? '#f59e0b' : '#dc2626';
  const scoreValue = score ?? 0;
  const scoreLabel = score === null ? 'N/A' : String(score);

  // Transition the same card
  statusCard.style.opacity = '0';

  setTimeout(() => {
    if (!statusCard) return;

    statusCard.innerHTML = `
      <div style="position: relative; text-align: center;">
        <button id="veracity-close-score" style="
          position: absolute;
          right: -8px;
          top: -8px;
          width: 28px;
          height: 28px;
          border-radius: 50%;
          background: #ef4444;
          color: white;
          border: 2px solid white;
          cursor: pointer;
          font-size: 16px;
          font-weight: bold;
          display: flex;
          align-items: center;
          justify-content: center;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
          transition: transform 0.2s;
        " onmouseover="this.style.transform='scale(1.1)'" onmouseout="this.style.transform='scale(1)'">×</button>
        
        <div style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 12px;">
          Integrity Score
        </div>
        <div style="position: relative; width: 100px; height: 100px; margin: 0 auto 16px;">
          <svg style="width: 100%; height: 100%; transform: rotate(-90deg);">
            <circle cx="50" cy="50" r="45" stroke="#e5e7eb" stroke-width="6" fill="transparent"/>
            <circle 
              cx="50" cy="50" r="45" 
              stroke="${scoreColor}" 
              stroke-width="6" 
              fill="transparent"
              stroke-dasharray="283"
              stroke-dashoffset="${283 - (283 * scoreValue / 100)}"
              style="transition: stroke-dashoffset 1s ease;"
            />
          </svg>
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
            <div style="font-size: 32px; font-weight: bold; color: ${scoreColor};">${scoreLabel}</div>
            <div style="font-size: 10px; color: #9ca3af; text-transform: uppercase;">Score</div>
          </div>
        </div>
        <div style="border-top: 1px solid #e5e7eb; padding-top: 12px; display: flex; justify-content: space-around; gap: 10px; flex-wrap: wrap; font-size: 11px;">
          <div style="text-align: center;">
            <div style="font-weight: 600; color: #059669;">${counts.true}</div>
            <div style="color: #9ca3af;">True</div>
          </div>
          <div style="text-align: center;">
            <div style="font-weight: 600; color: #f59e0b;">${counts.context}</div>
            <div style="color: #9ca3af;">Context</div>
          </div>
          <div style="text-align: center;">
            <div style="font-weight: 600; color: #dc2626;">${counts.false}</div>
            <div style="color: #9ca3af;">False</div>
          </div>
          <div style="text-align: center;">
            <div style="font-weight: 600; color: #64748B;">${counts.unverified}</div>
            <div style="color: #9ca3af;">Unverified</div>
          </div>
          <div style="text-align: center;">
            <div style="font-weight: 600; color: #6b7280;">${counts.unmatched}</div>
            <div style="color: #9ca3af;">Unmatched</div>
          </div>
        </div>
        <div style="margin-top: 8px; font-size: 9px; color: #9ca3af;">
          ${result.verifiedClaims} verified of ${result.totalClaims} claims
        </div>
      </div>
    `;

    // Add close button handler
    const closeButton = statusCard.querySelector('#veracity-close-score');
    if (closeButton) {
      closeButton.addEventListener('click', () => {
        hideStatusCard();
      });
    }

    statusCard.style.opacity = '1';
  }, 300);
}

function hideStatusCard() {
  if (statusCard) {
    statusCard.style.opacity = '0';
    setTimeout(() => {
      if (statusCard) {
        statusCard.remove();
        statusCard = null;
      }
    }, 300);
  }
}

async function scanPage() {
  const articleText = extractVisibleText();
  console.log('[Veracity] Extracted text length:', articleText.text.length);

  if (!articleText.text) {
    throw new Error('No readable text found on this page.');
  }

  if (articleText.truncated) {
    showToast('Long page detected. Veracity scanned the first portion of readable article text.', 'info');
  }

  const response = await chrome.runtime.sendMessage({
    type: 'SCAN_REQUEST',
    text: articleText.text,
  }) as ScanResponse;

  console.log('[Veracity] API Response:', response);

  if (response.success && response.data) {
    console.log('[Veracity] Claims received:', response.data.length);
    console.log('[Veracity] Claims data:', response.data);

    // Reset matched counts before displaying badges
    matchedCounts = { false: 0, context: 0, true: 0, unverified: 0, unmatched: 0 };

    displayClaimBadges(response.data);
    // Score card will be shown after badges are created with actual matched counts

    // The score card is now shown after badges are created, using matchedCounts
    // const falseCount = response.data.filter(c => c.verdict === 'false').length;
    // const contextCount = response.data.filter(c => c.verdict === 'context').length;
    // const trueCount = response.data.filter(c => c.verdict === 'true').length;
    // showScoreCard(falseCount, contextCount, trueCount);

    return response.data.length;
  } else {
    console.error('[Veracity] Scan failed:', response.error);
    throw new Error(response.error || 'Unknown error');
  }
}

function extractVisibleText(): ArticleTextPayload {
  const elements = document.querySelectorAll('article p, p, h1, h2, h3, h4, h5, h6, li');
  const blocks: string[] = [];
  elements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.innerText && htmlEl.offsetParent !== null) {
      blocks.push(htmlEl.innerText);
    }
  });
  return buildArticleTextPayload(blocks);
}

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    const badge = entry.target.querySelector('.veracity-compact-badge') as HTMLElement;
    if (badge) {
      badge.style.opacity = entry.isIntersecting ? '1' : '0';
      badge.style.pointerEvents = entry.isIntersecting ? 'auto' : 'none';
    }
  });
}, { threshold: 0.1 });

function displayClaimBadges(results: FactCheckResult[]) {
  console.log('[Veracity] Creating badges for', results.length, 'claims');

  document.querySelectorAll('.veracity-compact-badge').forEach(el => el.remove());
  document.querySelectorAll('.veracity-dropdown-panel').forEach(el => el.remove());
  document.querySelectorAll('.veracity-highlight-bracket').forEach(el => el.remove());

  let matchedCount = 0;
  const unmatchedClaims: string[] = [];
  let skippedElements = 0;
  const claimsByElement = new Map<HTMLElement, FactCheckResult[]>();

  results.forEach((rawResult, index) => {
    const result = { ...rawResult, verdict: normalizeVerdict(rawResult.verdict) };
    console.log(`[Veracity] Processing claim ${index + 1}/${results.length}:`, result.quote);

    const quote = result.quote;
    if (!quote) {
      console.warn(`[Veracity] Claim ${index + 1} has no quote`);
      unmatchedClaims.push(`Claim ${index + 1}: NO QUOTE`);
      matchedCounts.unmatched++;
      return;
    }

    const elements = document.querySelectorAll('article p, article h1, article h2, article h3, article h4, article h5, article h6, article li, main p, main h1, main h2, main h3, p, h1, h2, h3, li');
    let found = false;

    for (const el of elements) {
      const htmlEl = el as HTMLElement;

      // Skip if element is too short
      if (!htmlEl.textContent || htmlEl.textContent.length < 20) continue;

      // Skip problematic elements (ads, scripts, third-party widgets)
      const className = htmlEl.className || '';
      const id = htmlEl.id || '';
      const skipPatterns = ['ad', 'banner', 'sponsor', 'widget', 'vendor', 'script', 'slot'];

      if (skipPatterns.some(pattern =>
        className.toLowerCase().includes(pattern) ||
        id.toLowerCase().includes(pattern)
      )) {
        skippedElements++;
        continue;
      }

      // Skip if element or its parent doesn't have stable positioning
      try {
        if (!htmlEl.parentElement) {
          skippedElements++;
          continue;
        }
        const style = window.getComputedStyle(htmlEl.parentElement);
        if (style.display === 'none' || style.visibility === 'hidden') {
          skippedElements++;
          continue;
        }
      } catch (err) {
        console.warn('[Veracity] Could not check element style:', err);
        skippedElements++;
        continue;
      }

      const textContent = htmlEl.textContent || '';
      const matchResult = fuzzyMatch(textContent, quote);

      if (matchResult.match) {
        console.log(`[Veracity] ✓ MATCHED claim ${index + 1} in element`);

        const claims = claimsByElement.get(htmlEl) ?? [];
        claims.push(result);
        claimsByElement.set(htmlEl, claims);
        matchedCount++;
        matchedCounts[result.verdict]++;
        found = true;
        break;
      }
    }

    if (!found) {
      console.warn(`[Veracity] ✗ UNMATCHED claim ${index + 1}: "${quote.substring(0, 50)}..."`);
      unmatchedClaims.push(`"${quote.substring(0, 60)}..."`);
      matchedCounts.unmatched++;
    }
  });

  claimsByElement.forEach((claims, htmlEl) => {
    try {
      createCompactBadge(htmlEl, claims);
      observer.observe(htmlEl);
    } catch (badgeError) {
      console.error('[Veracity] Failed to create badge for matched element:', badgeError);
      console.error('[Veracity] Error details:', badgeError);
      skippedElements += claims.length;
      matchedCounts.unmatched += claims.length;
      claims.forEach((claim) => {
        matchedCounts[claim.verdict]--;
      });
    }
  });

  console.log(`[Veracity] ====== MATCH SUMMARY ======`);
  console.log(`[Veracity] Total claims: ${results.length}`);
  console.log(`[Veracity] Matched: ${matchedCount}`);
  console.log(`[Veracity] Unmatched: ${unmatchedClaims.length}`);
  console.log(`[Veracity] Skipped problematic elements: ${skippedElements}`);
  if (unmatchedClaims.length > 0) {
    console.log(`[Veracity] Unmatched claims:`, unmatchedClaims);
  }

  // Update score card with actual matched counts
  showScoreCard(matchedCounts);
}

function selectPrimaryClaim(claims: FactCheckResult[]): FactCheckResult {
  const severityOrder = ['false', 'context', 'unverified', 'true'];
  return [...claims].sort((a, b) =>
    severityOrder.indexOf(a.verdict) - severityOrder.indexOf(b.verdict)
  )[0];
}

function createCompactBadge(element: HTMLElement, claims: FactCheckResult[]): void {
  try {
    console.log('[Veracity] Creating badge for element:', element.tagName, element.className);

    // Validation checks
    if (!element) {
      throw new Error('Element is null or undefined');
    }

    if (!element.parentNode) {
      throw new Error('Element has no parent node');
    }

    if (!document.body.contains(element)) {
      throw new Error('Element is not in the DOM');
    }

    // Make the element itself the container
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.position === 'static') {
      element.style.position = 'relative';
    }

    // Ensure element has some dimensions
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) {
      console.warn('[Veracity] Element has zero dimensions, might be hidden');
      // Continue anyway, might still work
    }

    const claim = selectPrimaryClaim(claims);
    if (!claim) {
      throw new Error('No claim data provided');
    }

    const presentation = getVerdictPresentation(claim.verdict);
    const badgeColor = presentation.badgeColor;
    const icon = claims.length > 1 ? String(claims.length) : presentation.icon;

    const badge = document.createElement('div');
    badge.className = 'veracity-compact-badge';

    // Modern squircle styling with entrance animation
    badge.style.cssText = `
      position: absolute !important;
      left: -50px !important;
      top: 0 !important;
      cursor: pointer !important;
      z-index: 999998 !important;
      user-select: none !important;
      pointer-events: auto !important;
      visibility: visible !important;
      opacity: 0 !important;
      animation: badge-pop-in 0.4s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards !important;
    `;

    // Squircle badge with tooltip
    badge.innerHTML = `
      <div class="veracity-squircle" style="
        width: 34px;
        height: 34px;
        background: ${badgeColor};
        border-radius: 10px;
        border: 2px solid white;
        display: flex;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        font-size: 16px;
        font-weight: bold;
        color: white;
        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        position: relative;
      ">${icon}
        <div class="veracity-tooltip" style="
          position: absolute;
          bottom: calc(100% + 8px);
          left: 50%;
          transform: translateX(-50%) scale(0.9);
          background: #1F2937;
          color: white;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 11px;
          font-weight: 500;
          white-space: nowrap;
          opacity: 0;
          pointer-events: none;
          transition: all 0.2s ease;
          box-shadow: 0 2px 8px rgba(0,0,0,0.2);
        ">View ${claims.length === 1 ? 'Details' : `${claims.length} Claims`}</div>
      </div>
      <style>
        @keyframes badge-pop-in {
          0% {
            opacity: 0;
            transform: scale(0.3) translateY(10px);
          }
          60% {
            transform: scale(1.1) translateY(0);
          }
          100% {
            opacity: 1;
            transform: scale(1) translateY(0);
          }
        }
        
        .veracity-squircle:hover {
          transform: scale(1.08) !important;
          box-shadow: 0 6px 16px rgba(0,0,0,0.25) !important;
        }
        
        .veracity-squircle:hover .veracity-tooltip {
          opacity: 1 !important;
          transform: translateX(-50%) scale(1) !important;
        }
        
        .veracity-squircle:active {
          transform: scale(0.95) !important;
        }
      </style>
    `;

    const panel = document.createElement('div');
    panel.className = 'veracity-dropdown-panel';
    // Position on LEFT side to avoid covering article
    panel.style.cssText = `
      position: fixed !important;
      left: 20px !important;
      top: 50% !important;
      transform: translateY(-50%) !important;
      width: 380px !important;
      max-width: 90vw !important;
      max-height: 85vh !important;
      overflow-y: auto !important;
      background: white !important;
      border: 2px solid ${badgeColor} !important;
      border-radius: 16px !important;
      box-shadow: 0 20px 60px rgba(0,0,0,0.4) !important;
      display: none !important;
      z-index: 9999999 !important;
      padding: 24px !important;
      visibility: visible !important;
      transition: all 0.3s ease !important;
    `;

    // No backdrop - panel appears as dropdown next to article

    claims.forEach((claim) => {
      panel.appendChild(createClaimCard(claim));
    });

    let isOpen = false;
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      isOpen = !isOpen;
      panel.style.display = isOpen ? 'block' : 'none';
      badge.style.transform = isOpen ? 'scale(1.2)' : 'scale(1)';
      console.log('[Veracity] Badge clicked, panel', isOpen ? 'opened' : 'closed');
    });

    // Close when clicking outside
    const closePanel = (e: MouseEvent) => {
      if (!badge.contains(e.target as Node) && !panel.contains(e.target as Node)) {
        isOpen = false;
        panel.style.display = 'none';
        badge.style.transform = 'scale(1)';
      }
    };
    document.addEventListener('click', closePanel);
    // Try to append - this is where failures usually happen
    try {
      element.appendChild(badge);
      document.body.appendChild(panel);
    } catch (appendError) {
      console.error('[Veracity] Failed to appendChild:', appendError);
      throw new Error(`appendChild failed: ${appendError}`);
    }

    console.log('[Veracity] ✓ Badge successfully created and appended');

    // Verify it's in the DOM
    setTimeout(() => {
      if (document.contains(badge)) {
        console.log('[Veracity] ✓ Badge confirmed in DOM');
      } else {
        console.error('[Veracity] ✗ Badge was removed from DOM!');
      }
    }, 100);

  } catch (err) {
    console.error('[Veracity] Error creating badge:', err);
    console.error('[Veracity] Element details:', {
      tagName: element?.tagName,
      className: element?.className,
      id: element?.id,
      hasParent: !!element?.parentNode,
      inDOM: element ? document.body.contains(element) : false
    });
    throw err; // Re-throw to be caught by caller
  }
}

function createClaimCard(result: FactCheckResult): HTMLElement {
  const card = document.createElement('div');
  const presentation = getVerdictPresentation(result.verdict);

  card.style.cssText = `
    background: ${presentation.backgroundColor};
    border: 2px solid ${presentation.borderColor};
    border-radius: 8px;
    padding: 12px;
    margin-bottom: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: ${presentation.textColor};
  `;

  const header = document.createElement('div');
  header.style.cssText = 'font-weight: bold; margin-bottom: 10px; text-transform: uppercase; font-size: 11px; display: flex; align-items: center; gap: 6px;';

  const icon = document.createElement('span');
  icon.style.fontSize = '18px';
  icon.textContent = presentation.icon;

  const verdict = document.createElement('span');
  verdict.textContent = presentation.label;

  header.append(icon, verdict);
  card.appendChild(header);

  card.appendChild(createDetailSection('Claim:', `"${result.quote}"`, true));
  card.appendChild(createDetailSection('Comments:', result.comments));
  card.appendChild(createSourceSection(result.source, presentation.borderColor));

  return card;
}

function createDetailSection(labelText: string, valueText: string, italic = false): HTMLElement {
  const section = document.createElement('div');
  section.style.marginBottom = '10px';

  const label = document.createElement('div');
  label.style.cssText = 'font-weight: 600; font-size: 12px; margin-bottom: 4px;';
  label.textContent = labelText;

  const value = document.createElement('div');
  value.style.cssText = `font-size: 12px; line-height: ${italic ? '1.4' : '1.5'}; opacity: 0.9;${italic ? ' font-style: italic;' : ''}`;
  value.textContent = valueText;

  section.append(label, value);
  return section;
}

function createSourceSection(source: string, borderColor: string): HTMLElement {
  const section = document.createElement('div');
  section.style.cssText = `font-size: 11px; opacity: 0.7; padding-top: 10px; border-top: 1px solid ${borderColor}; word-break: break-all; overflow-wrap: break-word;`;

  const label = document.createElement('strong');
  label.textContent = 'Source: ';
  section.appendChild(label);

  const safeUrl = toSafeHttpUrl(source);
  if (safeUrl) {
    const link = document.createElement('a');
    link.href = safeUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    link.textContent = safeUrl;
    section.appendChild(link);
  } else {
    const text = document.createElement('span');
    text.textContent = source || 'No reliable source provided';
    section.appendChild(text);
  }

  return section;
}

function toSafeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

let toastContainer: HTMLElement | null = null;

function showToast(message: string, type: 'info' | 'success' | 'error') {
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.style.position = 'fixed';
    toastContainer.style.top = '20px';
    toastContainer.style.right = '20px';
    toastContainer.style.zIndex = '1000001';
    toastContainer.style.display = 'flex';
    toastContainer.style.flexDirection = 'column';
    toastContainer.style.gap = '10px';
    document.body.appendChild(toastContainer);
  }

  const toast = document.createElement('div');
  toast.style.padding = '12px 20px';
  toast.style.borderRadius = '8px';
  toast.style.color = 'white';
  toast.style.fontFamily = 'system-ui, sans-serif';
  toast.style.fontSize = '14px';
  toast.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
  toast.style.transition = 'opacity 0.3s ease';
  toast.style.opacity = '0';
  toast.style.minWidth = '250px';

  if (type === 'info') toast.style.backgroundColor = '#3b82f6';
  if (type === 'success') toast.style.backgroundColor = '#22c55e';
  if (type === 'error') toast.style.backgroundColor = '#ef4444';

  toast.textContent = message;
  toastContainer.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
  });

  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => {
      toast.remove();
      if (toastContainer && toastContainer.childNodes.length === 0) {
        toastContainer.remove();
        toastContainer = null;
      }
    }, 300);
  }, type === 'error' ? 5000 : 3000);
}
