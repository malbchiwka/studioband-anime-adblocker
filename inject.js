/**
 * StudioBand Anime AdBlocker - In-Page Main World Injection Script
 * Intercepts in-page fetch/XHR responses and neutralizes player ad configs directly in memory.
 */

(function () {
  'use strict';

  // Prevent multiple injections
  if (window.__STUDIOBAND_ADBLOCK_INJECTED__) return;
  window.__STUDIOBAND_ADBLOCK_INJECTED__ = true;

  console.log('[StudioBand AdBlocker] In-page protection initialized');

  /**
   * Sanitizes CDN playlist data
   */
  function cleanCdnPlaylistObj(data) {
    if (!data || typeof data !== 'object') return data;
    try {
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
      data.adPod = { preroll: 0, midroll: 0, pauseroll: 0 };
      data.yad = {};
    } catch (e) {
      console.warn('[StudioBand AdBlocker] Error cleaning playlist object:', e);
    }
    return data;
  }

  /**
   * Sanitizes Kodik /ftor data
   */
  function cleanKodikFtorObj(data) {
    if (!data || typeof data !== 'object') return data;
    try {
      data.vast = null;
      data.reserve_vast = null;
      data.advert_script = null;
      if ('script' in data) {
        data.script = null;
      }
    } catch (e) {
      console.warn('[StudioBand AdBlocker] Error cleaning ftor object:', e);
    }
    return data;
  }

  // 1. Hook window.fetch
  if (typeof window.fetch === 'function') {
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url ? args[0].url : '');
      
      const isCdn = url.includes('plapi.cdnvideohub.com') || url.includes('/player/sv/playlist');
      const isFtor = url.includes('/ftor');

      const response = await originalFetch.apply(this, args);

      if (isCdn || isFtor) {
        try {
          const clone = response.clone();
          const json = await clone.json();

          let cleanedJson = json;
          if (isCdn) {
            cleanedJson = cleanCdnPlaylistObj(json);
          } else if (isFtor) {
            cleanedJson = cleanKodikFtorObj(json);
          }

          const cleanedText = JSON.stringify(cleanedJson);
          return new Response(cleanedText, {
            status: response.status,
            statusText: response.statusText,
            headers: response.headers
          });
        } catch (e) {
          // If not json or failed, return original
          return response;
        }
      }

      return response;
    };
  }

  // 2. Hook XMLHttpRequest
  if (typeof window.XMLHttpRequest === 'function') {
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function (method, url, ...rest) {
      this._adblock_target_url = String(url || '');
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function (...sendArgs) {
      const url = this._adblock_target_url || '';
      const isCdn = url.includes('plapi.cdnvideohub.com') || url.includes('/player/sv/playlist');
      const isFtor = url.includes('/ftor');

      if (isCdn || isFtor) {
        const interceptResponse = () => {
          if (this.readyState === 4 && (this.status === 200 || this.status === 0)) {
            try {
              let parsed = null;
              if (this.responseType === '' || this.responseType === 'text') {
                parsed = JSON.parse(this.responseText);
              } else if (this.responseType === 'json') {
                parsed = this.response;
              }

              if (parsed) {
                if (isCdn) {
                  parsed = cleanCdnPlaylistObj(parsed);
                } else if (isFtor) {
                  parsed = cleanKodikFtorObj(parsed);
                }

                const cleanedText = JSON.stringify(parsed);

                Object.defineProperty(this, 'responseText', {
                  get: () => cleanedText,
                  configurable: true
                });

                Object.defineProperty(this, 'response', {
                  get: () => {
                    if (this.responseType === 'json') return parsed;
                    return cleanedText;
                  },
                  configurable: true
                });
              }
            } catch (err) {
              // Ignore non-json
            }
          }
        };

        this.addEventListener('readystatechange', interceptResponse, true);
        this.addEventListener('load', interceptResponse, true);
      }

      return originalSend.apply(this, sendArgs);
    };
  }

  // 3. Neutralize Kodik ad globals
  try {
    Object.defineProperty(window, 'advertScript', {
      get: () => null,
      set: () => {},
      configurable: true
    });
    Object.defineProperty(window, 'advertDebug', {
      get: () => false,
      set: () => {},
      configurable: true
    });
    Object.defineProperty(window, 'a_detect', {
      get: () => false,
      set: () => {},
      configurable: true
    });
  } catch (_) {}

  // 4. Intercept playerSettings for Kodik
  let _playerSettings = window.playerSettings || {};
  try {
    Object.defineProperty(window, 'playerSettings', {
      get: () => _playerSettings,
      set: (val) => {
        if (val && typeof val === 'object') {
          delete val.vast;
          delete val.reserve_vast;
          val.onlyAdvert = false;
        }
        _playerSettings = val;
      },
      configurable: true
    });
  } catch (_) {}

  // 5. Block popunders / clickunders that try to call window.open upon player click
  const originalWindowOpen = window.open;
  window.open = function (url, target, features) {
    if (typeof url === 'string') {
      const suspicious = ['1xbet', 'bet', 'vulkan', 'casino', 'vak345', 'redirect', 'click'];
      if (suspicious.some(s => url.toLowerCase().includes(s))) {
        console.log('[StudioBand AdBlocker] Blocked popunder window.open:', url);
        return null;
      }
    }
    return originalWindowOpen.call(window, url, target, features);
  };
})();
