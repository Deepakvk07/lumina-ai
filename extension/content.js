// Lumina AI Floating In-Page Assistant

(function() {
  // Safety: never inject on video call pages
  const host = window.location.hostname.toLowerCase();
  if (
    host.includes('meet.google.com') ||
    host.includes('zoom.us') ||
    host.includes('teams.microsoft.com') ||
    host.includes('teams.live.com') ||
    host.includes('discord.com') ||
    host.includes('slack.com')
  ) return;

  // If already injected, just toggle visibility
  const existing = document.getElementById('lumina-hud-frame');
  if (existing) {
    existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
    return;
  }

  // Create the floating iframe
  const iframe = document.createElement('iframe');
  iframe.id = 'lumina-hud-frame';
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
    display: block !important;
    transition: opacity 0.2s ease !important;
  `;
  document.documentElement.appendChild(iframe);

  // Listen for toggle messages from background
  chrome.runtime.onMessage.addListener((req) => {
    const frame = document.getElementById('lumina-hud-frame');
    if (!frame) return;
    if (req.action === 'TOGGLE_OVERLAY') {
      frame.style.display = frame.style.display === 'none' ? 'block' : 'none';
    }
  });

  // Alt+H keyboard shortcut on the page
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      const frame = document.getElementById('lumina-hud-frame');
      if (frame) frame.style.display = frame.style.display === 'none' ? 'block' : 'none';
    }
  });
})();
