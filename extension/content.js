// Lumina AI Floating In-Page Assistant
// Each time this script is re-injected by the icon click, it toggles show/hide.

(function () {
  // Safety: never run on video call pages
  const host = window.location.hostname.toLowerCase();
  if (host.includes('meet.google.com') || host.includes('zoom.us') ||
      host.includes('teams.microsoft.com') || host.includes('teams.live.com') ||
      host.includes('discord.com') || host.includes('slack.com')) return;

  const FRAME_ID = 'lumina-ai-hud-frame';
  const existing = document.getElementById(FRAME_ID);

  if (existing) {
    // Already injected — just toggle visibility
    existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
    return;
  }

  // First injection — create and show the floating frame
  const iframe = document.createElement('iframe');
  iframe.id = FRAME_ID;
  iframe.src = chrome.runtime.getURL('app.html');
  iframe.allow = 'microphone *; clipboard-read *; clipboard-write *';
  iframe.style.cssText = [
    'position: fixed',
    'top: 10px',
    'right: 15px',
    'width: 740px',
    'height: 560px',
    'max-width: 96vw',
    'max-height: 94vh',
    'border: none',
    'background: transparent',
    'z-index: 2147483647',
    'pointer-events: auto',
    'overflow: visible',
    'display: block'
  ].map(r => r + ' !important').join('; ');

  document.documentElement.appendChild(iframe);

  // Alt+H shortcut on the page
  window.addEventListener('keydown', (e) => {
    if (e.altKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      const f = document.getElementById(FRAME_ID);
      if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
    }
  });
})();
