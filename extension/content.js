// Lumina AI Floating In-Page Assistant
// Each re-injection by the toolbar icon = toggle show/hide.

(function () {
  const host = window.location.hostname.toLowerCase();
  if (host.includes('meet.google.com') || host.includes('zoom.us') ||
      host.includes('teams.microsoft.com') || host.includes('teams.live.com') ||
      host.includes('discord.com') || host.includes('slack.com')) return;

  const FRAME_ID = 'lumina-ai-hud-frame';
  const existing = document.getElementById(FRAME_ID);

  if (existing) {
    existing.style.display = existing.style.display === 'none' ? 'block' : 'none';
    return;
  }

  // First injection -- create and show the floating frame
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
  ].map(function(r) { return r + ' !important'; }).join('; ');

  document.documentElement.appendChild(iframe);

  // Page content extractor for Scan Website feature
  function extractPageContent() {
    var clone = document.body.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,header,footer,nav,aside,iframe').forEach(function(el) { el.remove(); });
    var areas = [
      clone.querySelector('main'),
      clone.querySelector('[role="main"]'),
      clone.querySelector('article'),
      clone.querySelector('.content'),
      clone.querySelector('#content'),
      clone.querySelector('.question'),
      clone.querySelector('#question'),
      clone
    ].filter(Boolean);
    var text = areas[0].innerText || areas[0].textContent || '';
    return text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 12000);
  }

  // Listen for SCAN_PAGE request posted from inside the iframe
  window.addEventListener('message', function(event) {
    var frame = document.getElementById(FRAME_ID);
    if (!frame || event.source !== frame.contentWindow) return;
    if (event.data && event.data.type === 'LUMINA_SCAN_PAGE') {
      try {
        var pageText = extractPageContent();
        var pageUrl = window.location.href;
        var pageTitle = document.title;

        // Also capture high-resolution tab screenshot via background
        chrome.runtime.sendMessage({ action: 'CAPTURE_TAB' }, function(response) {
          var imageDataUrl = (response && response.dataUrl) ? response.dataUrl : null;
          frame.contentWindow.postMessage({
            type: 'LUMINA_SCAN_RESULT',
            text: pageText,
            image: imageDataUrl,
            url: pageUrl,
            title: pageTitle
          }, '*');
        });
      } catch(err) {
        frame.contentWindow.postMessage({
          type: 'LUMINA_SCAN_RESULT',
          error: 'Could not read page: ' + err.message
        }, '*');
      }
    }
  });

  // Alt+H shortcut on the page
  window.addEventListener('keydown', function(e) {
    if (e.altKey && (e.key === 'h' || e.key === 'H')) {
      e.preventDefault();
      var f = document.getElementById(FRAME_ID);
      if (f) f.style.display = f.style.display === 'none' ? 'block' : 'none';
    }
  });
})();
