/**
 * StudioBand Anime AdBlocker - Background Service Script
 * Intercepts & neutralizes video ads, midrolls, VAST pods, popunders, and trackers.
 */

// Blocked ad domains and URL patterns
const BLOCKED_PATTERNS = [
  // Popunders, redirects & aggressive ad scripts
  '*://vak345.com/*',
  '*://*.vak345.com/*',
  '*://*.trafficbass.com/*',
  '*://*.serving-sys.ru/*',
  
  // VAST video ad servers
  '*://exchange.buzzoola.com/*',
  '*://*.buzzoola.com/*',
  '*://yandex.ru/ads/*',
  '*://*.adfox.ru/*',
  '*://an.yandex.ru/*',
  '*://pagead2.googlesyndication.com/*',

  // Ad telemetry, beacons and trackers
  '*://allvideometrika.com/*',
  '*://*.kodikres.com/a-e/*',
  '*://mc.yandex.ru/*',
  '*://*.cdnvideohub.com/v3/events*'
];

// Extension state
let isEnabled = true;
let stats = {
  videoAds: 0,
  banners: 0,
  trackers: 0
};

// Initialize settings and stats from storage
browser.storage.local.get(['enabled', 'stats']).then(result => {
  if (result.enabled !== undefined) {
    isEnabled = result.enabled;
  }
  if (result.stats) {
    stats = Object.assign(stats, result.stats);
  }
  updateBadge();
}).catch(err => {
  console.warn('[StudioBand AdBlocker] Storage init error:', err);
});

function saveStats() {
  browser.storage.local.set({ stats: stats }).catch(() => {});
}

function updateBadge() {
  if (!isEnabled) {
    browser.browserAction.setBadgeText({ text: 'OFF' });
    browser.browserAction.setBadgeBackgroundColor({ color: '#6b7280' });
    return;
  }
  const total = stats.videoAds + stats.banners;
  browser.browserAction.setBadgeText({ text: total > 0 ? String(total) : '' });
  browser.browserAction.setBadgeBackgroundColor({ color: '#8b5cf6' });
}

function incrementStat(type) {
  if (stats[type] !== undefined) {
    stats[type]++;
    saveStats();
    updateBadge();
  }
}

/**
 * Sanitizes CDN playlist JSON (video-player / mali / cdnvideohub)
 * Removes all VAST prerolls, midrolls, pauserolls and resets ad pod targets.
 */
function cleanCdnPlaylist(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    
    // Clear vast fields
    if (data.vast && typeof data.vast === 'object') {
      for (const k of Object.keys(data.vast)) {
        if (Array.isArray(data.vast[k])) {
          data.vast[k] = [];
        } else {
          data.vast[k] = null;
        }
      }
      data.vast.preroll = [];
      data.vast.prerolls = [];
      data.vast.midroll = null;
      data.vast.midrolls = [];
      data.vast.pauseroll = [];
      data.vast.pauserolls = [];
    }
    
    // Clear ads.vast fields
    if (data.ads && typeof data.ads === 'object') {
      if (data.ads.vast && typeof data.ads.vast === 'object') {
        for (const k of Object.keys(data.ads.vast)) {
          if (Array.isArray(data.ads.vast[k])) {
            data.ads.vast[k] = [];
          } else {
            data.ads.vast[k] = null;
          }
        }
      }
    }
    
    // Disable ad pod counts and Yandex ads fallback
    data.adPod = { preroll: 0, midroll: 0, pauseroll: 0 };
    data.yad = {};
    
    return JSON.stringify(data);
  } catch (err) {
    console.error('[StudioBand AdBlocker] Error parsing CDN playlist JSON:', err);
    return jsonStr;
  }
}

/**
 * Sanitizes Kodik /ftor response JSON
 * Strips VAST manifests, reserve ads, and inline advertising scripts.
 */
function cleanKodikFtor(jsonStr) {
  try {
    const data = JSON.parse(jsonStr);
    data.vast = null;
    data.reserve_vast = null;
    data.advert_script = null;
    if ('script' in data) {
      data.script = null;
    }
    return JSON.stringify(data);
  } catch (err) {
    console.error('[StudioBand AdBlocker] Error parsing Kodik ftor JSON:', err);
    return jsonStr;
  }
}

/**
 * Checks if a URL matches any blocked ad patterns
 */
function isAdUrl(url) {
  const adKeywords = [
    'vak345.com',
    'trafficbass.com',
    'serving-sys.ru',
    'buzzoola.com',
    'yandex.ru/ads/',
    'adfox.ru',
    'an.yandex.ru',
    'pagead2.googlesyndication.com',
    'allvideometrika.com',
    'kodikres.com/a-e/',
    'mc.yandex.ru',
    'cdnvideohub.com/v3/events'
  ];
  return adKeywords.some(keyword => url.includes(keyword));
}

// 1. Intercept network requests via Firefox webRequest
browser.webRequest.onBeforeRequest.addListener(
  function(details) {
    if (!isEnabled) {
      return {};
    }

    const url = details.url;

    // Check for target video API endpoints to filter response bodies
    const isCdnPlaylist = url.includes('plapi.cdnvideohub.com') && url.includes('playlist');
    const isKodikFtor = url.includes('/ftor');

    if (isCdnPlaylist || isKodikFtor) {
      try {
        const filter = browser.webRequest.filterResponseData(details.requestId);
        const decoder = new TextDecoder('utf-8');
        const encoder = new TextEncoder();
        const chunks = [];

        filter.ondata = event => {
          chunks.push(event.data);
        };

        filter.onstop = () => {
          let str = '';
          for (const chunk of chunks) {
            str += decoder.decode(chunk, { stream: true });
          }
          str += decoder.decode();

          let modifiedStr = str;
          if (isCdnPlaylist) {
            modifiedStr = cleanCdnPlaylist(str);
            incrementStat('videoAds');
          } else if (isKodikFtor) {
            modifiedStr = cleanKodikFtor(str);
            incrementStat('videoAds');
          }

          filter.write(encoder.encode(modifiedStr));
          filter.close();
        };

        filter.onerror = err => {
          console.warn('[StudioBand AdBlocker] Response filter stream error:', err);
        };
      } catch (err) {
        console.warn('[StudioBand AdBlocker] filterResponseData unavailable:', err);
      }
      return {};
    }

    // Cancel direct ad and tracker network requests
    if (isAdUrl(url)) {
      if (url.includes('vak345') || url.includes('yandex.ru/ads') || url.includes('adfox') || url.includes('buzzoola') || url.includes('pagead2')) {
        incrementStat('banners');
      } else {
        incrementStat('trackers');
      }
      return { cancel: true };
    }

    return {};
  },
  {
    urls: ['<all_urls>']
  },
  ['blocking']
);

// 2. Messaging interface for Popup & Content scripts
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'getStatus') {
    sendResponse({ enabled: isEnabled, stats: stats });
    return true;
  }
  
  if (message.action === 'toggleEnabled') {
    isEnabled = !isEnabled;
    browser.storage.local.set({ enabled: isEnabled });
    updateBadge();
    sendResponse({ enabled: isEnabled, stats: stats });
    return true;
  }
  
  if (message.action === 'resetStats') {
    stats = { videoAds: 0, banners: 0, trackers: 0 };
    browser.storage.local.set({ stats: stats });
    updateBadge();
    sendResponse({ success: true, stats: stats });
    return true;
  }

  if (message.action === 'adBlockedInDom') {
    if (message.type === 'video') {
      incrementStat('videoAds');
    } else {
      incrementStat('banners');
    }
    sendResponse({ success: true });
    return true;
  }
});
