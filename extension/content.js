// Lumina AI In-Page Assistant (100% Meeting Safe & Default Hidden)

(() => {
  // 1. Safety Check: Never inject into live meeting or video call frames
  const host = window.location.hostname.toLowerCase();
  if (
    host.includes('meet.google.com') ||
    host.includes('zoom.us') ||
    host.includes('teams.microsoft.com') ||
    host.includes('teams.live.com') ||
    host.includes('discord.com') ||
    host.includes('slack.com')
  ) {
    return;
  }

  if (document.getElementById('lumina-floating-hud-frame')) return;

  const iframe = document.createElement('iframe');
  iframe.id = 'lumina-floating-hud-frame';
  iframe.src = chrome.runtime.getURL('app.html');
  iframe.allow = 'microphone *; clipboard-read *; clipboard-write *';
  iframe.style.cssText = `
    position: fixed !important;
    top: 10px !important;
    right: 15px !important;
    width: 740px !important;
    height: 560px !important;
    max-width: 96vw !important;
    max-height: 94vh !important;
    border: none !important;
    background: transparent !important;
    z-index: 2147483647 !important;
    pointer-events: auto !important;
    overflow: visible !important;
    color-scheme: light !important;
    display: none !important;
    transition: opacity 0.15s ease, transform 0.15s ease !important;
  `;

  document.documentElement.appendChild(iframe);

  let isHidden = true;

  const toggleHide = () => {
    isHidden = !isHidden;
    iframe.style.display = isHidden ? 'none' : 'block';
  };

  // Global hotkeys Alt+H / Ctrl+Shift+H to toggle in-page overlay
  window.addEventListener('keydown', (e) => {
    if ((e.altKey && (e.key === 'h' || e.key === 'H')) ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && (e.key === 'h' || e.key === 'H'))) {
      e.preventDefault();
      toggleHide();
    }
  });

  // Listen for Background Hotkeys & Messages
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === 'TOGGLE_OVERLAY') {
      toggleHide();
    }
  });
})();
