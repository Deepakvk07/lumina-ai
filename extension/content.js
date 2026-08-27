// Lumina AI In-Page Floating App (Embedded Full React App)

(() => {
  if (document.getElementById('lumina-iframe-root')) return;

  const container = document.createElement('div');
  container.id = 'lumina-iframe-root';
  container.style.cssText = 'position: fixed !important; top: 15px !important; right: 15px !important; width: 680px !important; height: 560px !important; max-width: 95vw !important; max-height: 90vh !important; z-index: 2147483647 !important; border-radius: 16px !important; box-shadow: 0 20px 35px -5px rgba(0, 0, 0, 0.25), 0 10px 15px -5px rgba(0, 0, 0, 0.15) !important; overflow: hidden !important; background: #ffffff !important; border: 1px solid rgba(229, 231, 235, 0.8) !important; display: flex !important; flex-direction: column !important;';

  // Top Drag & Control Bar
  const dragBar = document.createElement('div');
  dragBar.style.cssText = 'height: 30px !important; background: #f8fafc !important; border-bottom: 1px solid #e2e8f0 !important; display: flex !important; align-items: center !important; justify-content: space-between !important; padding: 0 10px !important; cursor: move !important; user-select: none !important; font-family: -apple-system, BlinkMacSystemFont, sans-serif !important; font-size: 11px !important; font-weight: 700 !important; color: #4338ca !important;';
  dragBar.innerHTML = '<div style="display:flex;align-items:center;gap:6px;"><span style="background:#4f46e5;color:white;padding:1px 5px;border-radius:4px;font-size:9px;font-weight:800;">LUMINA</span><span>Live Voice Assistant & Solver</span></div><div style="display:flex;align-items:center;gap:6px;"><span style="font-size:10px;color:#94a3b8;font-weight:normal;">Alt+H Hide</span><button id="lumina-hide-btn" style="background:#e2e8f0;border:none;border-radius:4px;width:20px;height:20px;cursor:pointer;font-size:11px;">✕</button></div>';
  container.appendChild(dragBar);

  // Full React App Iframe
  const iframe = document.createElement('iframe');
  iframe.src = chrome.runtime.getURL('app.html');
  iframe.style.cssText = 'flex: 1 !important; width: 100% !important; border: none !important; background: #ffffff !important;';
  container.appendChild(iframe);

  document.documentElement.appendChild(container);

  let isHidden = false;
  const hideBtn = dragBar.querySelector('#lumina-hide-btn');

  const toggleHide = () => {
    isHidden = !isHidden;
    container.style.display = isHidden ? 'none' : 'flex';
  };

  hideBtn.addEventListener('click', toggleHide);

  // Draggable Handler
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  dragBar.addEventListener('mousedown', (e) => {
    if (e.target.id === 'lumina-hide-btn') return;
    isDragging = true;
    startX = e.clientX;
    startY = e.clientY;
    const rect = container.getBoundingClientRect();
    initialLeft = rect.left;
    initialTop = rect.top;
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    container.style.left = Math.max(10, initialLeft + dx) + 'px';
    container.style.top = Math.max(10, initialTop + dy) + 'px';
    container.style.right = 'auto';
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // Listen for Alt+H messages
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === 'TOGGLE_OVERLAY') {
      toggleHide();
    }
  });
})();
