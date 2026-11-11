/**
 * StudioBand Anime AdBlocker - Content Script
 * Runs in all frames at document_start. Injects main world interceptor and cleans the DOM.
 */

(function () {
  'use strict';

  // 1. Inject inject.js into the main page context
  function injectMainWorldScript() {
    try {
      const script = document.createElement('script');
      script.src = browser.runtime.getURL('inject.js');
      script.async = false;
      const target = document.head || document.documentElement;
      if (target) {
        target.insertBefore(script, target.firstChild);
        script.onload = () => script.remove();
      }
    } catch (e) {
      console.warn('[StudioBand AdBlocker] Failed to inject main world script:', e);
    }
  }

  injectMainWorldScript();

  // If head/documentElement wasn't ready yet:
  if (!document.head && !document.documentElement) {
    document.addEventListener('DOMContentLoaded', injectMainWorldScript, { once: true });
  }

  // 2. Auto-click skip buttons
  const SKIP_SELECTORS = [
    '.skip-button',
    '.vast-skip-button',
    '.kodik-skip',
    '.play-skip',
    '.video-skip-btn',
    'button[class*="skip"]',
    'div[class*="skip-button"]',
    'a[class*="skip-button"]',
    '[id*="skip_button"]',
    '.fp-ui .skip',
    '.player-skip'
  ];

  function tryClickSkipButtons() {
    for (const sel of SKIP_SELECTORS) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        if (el && el.offsetParent !== null && typeof el.click === 'function') {
          try {
            el.click();
            browser.runtime.sendMessage({ action: 'adBlockedInDom', type: 'video' }).catch(() => {});
          } catch (_) {}
        }
      }
    }
  }

  // 3. Fast-forward or skip rogue ad videos
  function checkVideoElement(video) {
    if (!video || video._adblock_checked) return;
    video._adblock_checked = true;

    video.addEventListener('timeupdate', () => {
      // Check if video is inside an ad container or has ad styling
      const isAdContainer = video.closest('#vpaid_iframe, .advert_box, [class*="advert"], [id*="advert"], .kodik-adv');
      const isShortAd = !isNaN(video.duration) && isFinite(video.duration) && video.duration > 0 && video.duration <= 45;

      if (isAdContainer || (isShortAd && video.closest('.player_box, #movie_video, .tabs-block__content'))) {
        try {
          video.muted = true;
          video.currentTime = video.duration;
          video.playbackRate = 16;
          browser.runtime.sendMessage({ action: 'adBlockedInDom', type: 'video' }).catch(() => {});
        } catch (_) {}
      }
    });
  }

  // 4. DOM cleanup for banners and RTB blocks
  const AD_CONTAINER_SELECTORS = [
    'div[id^="yandex_rtb_"]',
    'div[class*="yandex_rtb"]',
    '.ya-partner',
    '#vpaid_iframe',
    '.kodik-adv',
    '.advert_box',
    'iframe[src*="vak345"]',
    'iframe[src*="adfox"]',
    'iframe[src*="buzzoola"]'
  ];

  function cleanAdElements() {
    for (const sel of AD_CONTAINER_SELECTORS) {
      const elements = document.querySelectorAll(sel);
      for (const el of elements) {
        if (el && el.parentNode) {
          el.remove();
          browser.runtime.sendMessage({ action: 'adBlockedInDom', type: 'banner' }).catch(() => {});
        }
      }
    }

    // Check all video elements
    const videos = document.querySelectorAll('video');
    for (const v of videos) {
      checkVideoElement(v);
    }

    tryClickSkipButtons();
  }

  // 5. Setup MutationObserver for dynamic insertions
  const observer = new MutationObserver(() => {
    cleanAdElements();
  });

  function startObserver() {
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      cleanAdElements();
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        if (document.body) {
          observer.observe(document.body, { childList: true, subtree: true });
          cleanAdElements();
        }
      }, { once: true });
    }
  }

  startObserver();

  // Periodic fallback check
  setInterval(tryClickSkipButtons, 400);
})();
