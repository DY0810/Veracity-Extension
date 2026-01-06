import type { ScanResponse, FactCheckResult } from '../types';

let statusCard: HTMLElement | null = null;

// Track matched counts globally
let matchedCounts = { false: 0, context: 0, true: 0 };

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

function showScoreCard(falseCount: number, contextCount: number, trueCount: number) {
  if (!statusCard) return;

  const totalClaims = falseCount + contextCount + trueCount;
  const score = totalClaims > 0 ? Math.round(((trueCount + (contextCount * 0.5)) / totalClaims) * 100) : 100;

  const scoreColor = score > 80 ? '#059669' : score > 50 ? '#f59e0b' : '#dc2626';

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
              stroke-dashoffset="${283 - (283 * score / 100)}"
              style="transition: stroke-dashoffset 1s ease;"
            />
          </svg>
          <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center;">
            <div style="font-size: 32px; font-weight: bold; color: ${scoreColor};">${score}</div>
            <div style="font-size: 10px; color: #9ca3af; text-transform: uppercase;">Score</div>
          </div>
        </div>
        <div style="border-top: 1px solid #e5e7eb; padding-top: 12px; display: flex; justify-content: space-around; font-size: 11px;">
          <div style="text-align: center;">
            <div style="font-weight: 600; color: #059669;">${trueCount}</div>
            <div style="color: #9ca3af;">True</div>
          </div>
          <div style="text-align: center;">
            <div style="font-weight: 600; color: #f59e0b;">${contextCount}</div>
            <div style="color: #9ca3af;">Context</div>
          </div>
          <div style="text-align: center;">
            <div style="font-weight: 600; color: #dc2626;">${falseCount}</div>
            <div style="color: #9ca3af;">False</div>
          </div>
        </div>
        <div style="margin-top: 8px; font-size: 9px; color: #9ca3af;">
          ${totalClaims} verified claims
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
  const text = extractVisibleText();
  console.log('[Veracity] Extracted text length:', text.length);

  if (!text) {
    throw new Error('No readable text found on this page.');
  }

  const response = await chrome.runtime.sendMessage({
    type: 'SCAN_REQUEST',
    text,
  }) as ScanResponse;

  console.log('[Veracity] API Response:', response);

  if (response.success && response.data) {
    console.log('[Veracity] Claims received:', response.data.length);
    console.log('[Veracity] Claims data:', response.data);

    // Reset matched counts before displaying badges
    matchedCounts = { false: 0, context: 0, true: 0 };

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

function extractVisibleText(): string {
  const elements = document.querySelectorAll('article p, p, h1, h2, h3, h4, h5, h6, li');
  let text = '';
  elements.forEach((el) => {
    const htmlEl = el as HTMLElement;
    if (htmlEl.innerText && htmlEl.offsetParent !== null) {
      text += htmlEl.innerText + '\n\n';
    }
  });
  return text.slice(0, 15000);
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

function fuzzyMatch(haystack: string, needle: string): { match: boolean; startIndex: number; endIndex: number } {
  const normHaystack = normalizeText(haystack);
  const normNeedle = normalizeText(needle);

  // Strategy 1: Exact match
  const exactIndex = normHaystack.indexOf(normNeedle);
  if (exactIndex !== -1) {
    return { match: true, startIndex: exactIndex, endIndex: exactIndex + normNeedle.length };
  }

  // Strategy 2: Match first and last 5 words (for longer quotes)
  const needleWords = normNeedle.split(' ').filter(w => w.length > 2);
  if (needleWords.length >= 5) {
    const firstWords = needleWords.slice(0, 5).join(' ');
    const lastWords = needleWords.slice(-5).join(' ');

    if (normHaystack.includes(firstWords) && normHaystack.includes(lastWords)) {
      const start = normHaystack.indexOf(firstWords);
      const end = normHaystack.indexOf(lastWords) + lastWords.length;
      return { match: true, startIndex: start, endIndex: end };
    }
  }

  // Strategy 3: Match first 3 words only (aggressive partial match)
  if (needleWords.length >= 3) {
    const firstThree = needleWords.slice(0, 3).join(' ');
    if (normHaystack.includes(firstThree)) {
      const start = normHaystack.indexOf(firstThree);
      return { match: true, startIndex: start, endIndex: start + 100 };
    }
  }

  // Strategy 4: Match ANY 4 consecutive words from the quote
  if (needleWords.length >= 4) {
    for (let i = 0; i <= needleWords.length - 4; i++) {
      const fourWords = needleWords.slice(i, i + 4).join(' ');
      if (normHaystack.includes(fourWords)) {
        const start = normHaystack.indexOf(fourWords);
        return { match: true, startIndex: start, endIndex: start + 100 };
      }
    }
  }

  // Strategy 5: Match at least 50% of words (very lenient)
  if (needleWords.length >= 3) {
    const matchedWords = needleWords.filter(word => normHaystack.includes(word));
    const matchPercent = matchedWords.length / needleWords.length;

    if (matchPercent >= 0.5) {
      // Find approximate position of first matched word
      const firstMatch = matchedWords[0];
      const start = normHaystack.indexOf(firstMatch);
      return { match: true, startIndex: start, endIndex: start + 100 };
    }
  }

  // Strategy 6: Try removing punctuation and matching
  const cleanNeedle = normNeedle.replace(/[.,!?;:()]/g, ' ').replace(/\s+/g, ' ');
  const cleanHaystack = normHaystack.replace(/[.,!?;:()]/g, ' ').replace(/\s+/g, ' ');

  if (cleanHaystack.includes(cleanNeedle)) {
    const start = cleanHaystack.indexOf(cleanNeedle);
    return { match: true, startIndex: start, endIndex: start + cleanNeedle.length };
  }

  return { match: false, startIndex: 0, endIndex: 0 };
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
  let unmatchedClaims: string[] = [];
  let skippedElements = 0;

  results.forEach((result, index) => {
    console.log(`[Veracity] Processing claim ${index + 1}/${results.length}:`, result.quote);

    const quote = result.quote;
    if (!quote) {
      console.warn(`[Veracity] Claim ${index + 1} has no quote`);
      unmatchedClaims.push(`Claim ${index + 1}: NO QUOTE`);
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

        try {
          // Skip if this element already has a badge
          if (htmlEl.querySelector('.veracity-compact-badge')) {
            console.log(`[Veracity] Element already has badge, trying next match`);
            continue;
          }

          createCompactBadge(htmlEl, [result]);
          observer.observe(htmlEl);
          matchedCount++;
          found = true;
          break;
        } catch (badgeError) {
          console.error(`[Veracity] Failed to create badge for claim ${index + 1}:`, badgeError);
          console.error('[Veracity] Error details:', badgeError);
          skippedElements++;
          // Try next match instead of giving up
          continue;
        }
      }
    }

    if (!found) {
      console.warn(`[Veracity] ✗ UNMATCHED claim ${index + 1}: "${quote.substring(0, 50)}..."`);
      unmatchedClaims.push(`"${quote.substring(0, 60)}..."`);
    } else {
      // Increment matched counts for score card
      if (result.verdict === 'false') matchedCounts.false++;
      else if (result.verdict === 'context') matchedCounts.context++;
      else if (result.verdict === 'true') matchedCounts.true++;
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
  showScoreCard(matchedCounts.false, matchedCounts.context, matchedCounts.true);
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

    const claim = claims[0];
    if (!claim) {
      throw new Error('No claim data provided');
    }

    let badgeColor, icon;
    if (claim.verdict === 'false') {
      badgeColor = '#EF4444'; // Modern red
      icon = '✕';
    } else if (claim.verdict === 'context') {
      badgeColor = '#F59E0B'; // Amber/Orange
      icon = '!';
    } else {
      badgeColor = '#10B981'; // Emerald green/teal
      icon = '✓';
    }

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
        ">View Details</div>
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

    panel.appendChild(createClaimCard(claim));

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

  let bgColor, borderColor, textColor, icon;
  if (result.verdict === 'false') {
    bgColor = '#fee2e2';
    borderColor = '#dc2626';
    textColor = '#991b1b';
    icon = '❌';
  } else if (result.verdict === 'context') {
    bgColor = '#fef3c7';
    borderColor = '#f59e0b';
    textColor = '#92400e';
    icon = '⚠️';
  } else {
    bgColor = '#d1fae5';
    borderColor = '#059669';
    textColor = '#065f46';
    icon = '✓';
  }

  card.style.cssText = `
    background: ${bgColor};
    border: 2px solid ${borderColor};
    border-radius: 8px;
    padding: 12px;
    font-family: system-ui, -apple-system, sans-serif;
    font-size: 13px;
    line-height: 1.5;
    color: ${textColor};
  `;

  card.innerHTML = `
    <div style="font-weight: bold; margin-bottom: 10px; text-transform: uppercase; font-size: 11px; display: flex; align-items: center; gap: 6px;">
      <span style="font-size: 18px;">${icon}</span>
      <span>${result.verdict}</span>
    </div>
    <div style="margin-bottom: 10px;">
      <div style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">Claim:</div>
      <div style="font-size: 12px; font-style: italic; opacity: 0.9; line-height: 1.4;">
        "${result.quote}"
      </div>
    </div>
    <div style="margin-bottom: 10px;">
      <div style="font-weight: 600; font-size: 12px; margin-bottom: 4px;">Comments:</div>
      <div style="font-size: 12px; line-height: 1.5;">
        ${result.comments}
      </div>
    </div>
    <div style="font-size: 11px; opacity: 0.7; padding-top: 10px; border-top: 1px solid ${borderColor}; word-break: break-all; overflow-wrap: break-word;">
      <strong>Source:</strong> ${result.source}
    </div>
  `;

  return card;
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
