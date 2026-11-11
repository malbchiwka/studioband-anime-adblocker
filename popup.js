document.addEventListener('DOMContentLoaded', () => {
  const toggleSwitch = document.getElementById('toggleSwitch');
  const statusCard = document.getElementById('statusCard');
  const statusTitle = document.getElementById('statusTitle');
  const statusDesc = document.getElementById('statusDesc');

  const statVideoAds = document.getElementById('statVideoAds');
  const statBanners = document.getElementById('statBanners');
  const statTrackers = document.getElementById('statTrackers');

  const btnReload = document.getElementById('btnReload');
  const btnReset = document.getElementById('btnReset');

  function updateUI(enabled, stats) {
    toggleSwitch.checked = enabled;
    if (enabled) {
      statusCard.classList.remove('disabled');
      statusTitle.textContent = 'Защита активна';
      statusDesc.textContent = 'Реклама в сериях заблокирована';
    } else {
      statusCard.classList.add('disabled');
      statusTitle.textContent = 'Защита отключена';
      statusDesc.textContent = 'Рекламные вставки не блокируются';
    }

    if (stats) {
      statVideoAds.textContent = stats.videoAds || 0;
      statBanners.textContent = stats.banners || 0;
      statTrackers.textContent = stats.trackers || 0;
    }
  }

  // Request current status from background script
  browser.runtime.sendMessage({ action: 'getStatus' }).then(response => {
    if (response) {
      updateUI(response.enabled, response.stats);
    }
  }).catch(err => {
    console.warn('[StudioBand AdBlocker] Could not contact background:', err);
  });

  // Toggle switch listener
  toggleSwitch.addEventListener('change', () => {
    browser.runtime.sendMessage({ action: 'toggleEnabled' }).then(response => {
      if (response) {
        updateUI(response.enabled, response.stats);
      }
    });
  });

  // Reset stats listener
  btnReset.addEventListener('click', () => {
    browser.runtime.sendMessage({ action: 'resetStats' }).then(response => {
      if (response && response.stats) {
        updateUI(toggleSwitch.checked, response.stats);
      }
    });
  });

  // Reload current active tab
  btnReload.addEventListener('click', () => {
    browser.tabs.query({ active: true, currentWindow: true }).then(tabs => {
      if (tabs[0] && tabs[0].id) {
        browser.tabs.reload(tabs[0].id);
        window.close();
      }
    });
  });
});
