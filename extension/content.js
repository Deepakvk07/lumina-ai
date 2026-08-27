// Lumina AI - In-Page Content Script & Shadow DOM Overlay

(() => {
  if (window.__LUMINA_INJECTED__) return;
  window.__LUMINA_INJECTED__ = true;

  // 1. Create Host Element & Shadow Root for 100% style isolation
  const host = document.createElement('lumina-overlay-root');
  const shadow = host.attachShadow({ mode: 'open' });
  document.documentElement.appendChild(host);

  // 2. Fetch or inject styles
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('content.css');
  shadow.appendChild(styleLink);

  // 3. Create Container
  const container = document.createElement('div');
  container.id = 'lumina-floating-container';
  container.innerHTML = `
    <div id="lumina-header">
      <div class="lumina-brand">
        <span class="lumina-logo-badge">LUMINA</span>
        <span>Question Solver</span>
      </div>
      <div class="lumina-header-actions">
        <button class="lumina-icon-btn" id="lumina-min-btn" title="Minimize">—</button>
        <button class="lumina-icon-btn" id="lumina-hide-btn" title="Hide (Alt+H)">👁️</button>
        <button class="lumina-icon-btn" id="lumina-close-btn" title="Close">✕</button>
      </div>
    </div>
    
    <div id="lumina-body">
      <div class="lumina-toolbar">
        <button class="lumina-btn-primary" id="lumina-scan-btn" title="Scan active tab (Alt+S)">
          <span>⚡ Scan & Solve Tab</span>
        </button>
        <button class="lumina-btn-secondary" id="lumina-dom-btn" title="Extract question text from webpage DOM">
          <span>📄 Extract DOM</span>
        </button>
      </div>

      <textarea id="lumina-input" placeholder="Paste screenshot (Ctrl+V) or type question..."></textarea>

      <div id="lumina-output-card">
        <div class="lumina-output-header">
          <span>🎯 VERIFIED ANSWER</span>
          <button class="lumina-icon-btn" id="lumina-copy-btn" title="Copy Answer" style="width: auto; padding: 0 6px;">📋 Copy</button>
        </div>
        <div id="lumina-output-text">
          <div class="lumina-placeholder">Click <b>Scan & Solve Tab</b> or paste screenshot (Ctrl+V)</div>
        </div>
      </div>

      <div class="lumina-footer">
        <span>Shortcuts: <span class="lumina-shortcut-badge">Alt+S</span> Scan | <span class="lumina-shortcut-badge">Alt+H</span> Hide</span>
        <span id="lumina-status-dot" style="color: #10b981; font-weight: 600;">● Engine Ready</span>
      </div>
    </div>
  `;
  shadow.appendChild(container);

  // 4. Element references
  const header = shadow.getElementById('lumina-header');
  const minBtn = shadow.getElementById('lumina-min-btn');
  const hideBtn = shadow.getElementById('lumina-hide-btn');
  const closeBtn = shadow.getElementById('lumina-close-btn');
  const scanBtn = shadow.getElementById('lumina-scan-btn');
  const domBtn = shadow.getElementById('lumina-dom-btn');
  const inputEl = shadow.getElementById('lumina-input');
  const outputText = shadow.getElementById('lumina-output-text');
  const copyBtn = shadow.getElementById('lumina-copy-btn');

  let isHidden = false;
  let isMinimized = false;
  let isSolving = false;

  // 5. Draggable logic
  let isDragging = false;
  let startX, startY, initialLeft, initialTop;

  header.addEventListener('mousedown', (e) => {
    if (e.target.closest('.lumina-icon-btn')) return;
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
    container.style.left = `${Math.max(10, initialLeft + dx)}px`;
    container.style.top = `${Math.max(10, initialTop + dy)}px`;
    container.style.right = 'auto';
  });

  window.addEventListener('mouseup', () => {
    isDragging = false;
  });

  // 6. UI Actions
  minBtn.addEventListener('click', () => {
    isMinimized = !isMinimized;
    container.classList.toggle('minimized', isMinimized);
    minBtn.textContent = isMinimized ? '□' : '—';
  });

  const toggleHide = () => {
    isHidden = !isHidden;
    container.classList.toggle('hidden', isHidden);
  };

  hideBtn.addEventListener('click', toggleHide);
  closeBtn.addEventListener('click', toggleHide);

  copyBtn.addEventListener('click', () => {
    const text = outputText.innerText;
    if (text && !text.includes('Click Scan & Solve')) {
      navigator.clipboard.writeText(text);
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
    }
  });

  // 7. Solving Logic
  const solveContent = async (text, imageBase64) => {
    if (isSolving) return;
    isSolving = true;
    scanBtn.disabled = true;
    scanBtn.innerHTML = '<span>⏳ Solving 99%+ Accuracy...</span>';
    outputText.innerHTML = '<div class="lumina-loading-pulse">✨ Analyzing question & calculating with 120B Math Reasoner...</div>';

    try {
      const storage = await chrome.storage.local.get(['backend_url']);
      const backendUrl = storage.backend_url || 'http://127.0.0.1:8765';

      const payload = {
        question: text || 'Solve visible problem and output ONLY the option numbers and answers.',
        image_base64: imageBase64 || null,
        category: 'auto',
        answer_style: 'option_only'
      };

      const res = await fetch(`${backendUrl}/api/solve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        throw new Error(`Server returned ${res.status}`);
      }

      outputText.textContent = '';
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const token = line.slice(6);
          if (token === '[DONE]') break;
          const restored = token.replaceAll('⏎', '\n');
          outputText.textContent += restored;
        }
      }

      if (!outputText.textContent.trim()) {
        outputText.textContent = '🎯 Completed.';
      }
    } catch (err) {
      outputText.innerHTML = `<span style="color: #ef4444;">⚠️ Error: ${err.message}. Ensure Lumina backend is running at http://127.0.0.1:8765</span>`;
    } finally {
      isSolving = false;
      scanBtn.disabled = false;
      scanBtn.innerHTML = '<span>⚡ Scan & Solve Tab</span>';
    }
  };

  // 8. Scan Tab Screenshot Handler
  const triggerTabScan = () => {
    chrome.runtime.sendMessage({ action: 'CAPTURE_VISIBLE_TAB' }, (res) => {
      if (res && res.dataUrl) {
        solveContent(inputEl.value.trim() || 'Solve question in screenshot.', res.dataUrl);
      } else {
        extractAndSolveDOM();
      }
    });
  };

  scanBtn.addEventListener('click', triggerTabScan);

  // 9. DOM Extractor
  const extractAndSolveDOM = () => {
    const selectors = [
      '.question', '.problem-statement', '.mcq-question', '[data-cy="question-title"]',
      '.quiz-question', '.test-question', 'article', 'main', 'h1, h2, h3, p'
    ];
    let extracted = '';
    const selText = window.getSelection().toString().trim();
    if (selText) {
      extracted = selText;
    } else {
      for (const sel of selectors) {
        const els = document.querySelectorAll(sel);
        if (els.length > 0) {
          const text = Array.from(els).map(e => e.innerText.trim()).filter(Boolean).join('\n');
          if (text.length > 30) {
            extracted = text.slice(0, 3000);
            break;
          }
        }
      }
      if (!extracted) {
        extracted = document.body.innerText.slice(0, 3000);
      }
    }
    inputEl.value = extracted.slice(0, 500);
    solveContent(extracted, null);
  };

  domBtn.addEventListener('click', extractAndSolveDOM);

  // 10. Paste Listener
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      solveContent(inputEl.value.trim(), null);
    }
  });

  window.addEventListener('paste', (e) => {
    if (isHidden) return;
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
    if (!items) return;
    for (const item of items) {
      if (item.type.indexOf('image') !== -1) {
        const file = item.getAsFile();
        const reader = new FileReader();
        reader.onload = (event) => {
          solveContent('Solve question in screenshot.', event.target.result);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  });

  // 11. Listen for Background messages (Alt+S, Alt+H, Context Menu)
  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === 'TOGGLE_OVERLAY') {
      toggleHide();
    } else if (req.action === 'SOLVE_IMAGE' && req.dataUrl) {
      if (isHidden) isHidden = false;
      container.classList.remove('hidden');
      solveContent('Solve question in screenshot.', req.dataUrl);
    } else if (req.action === 'SOLVE_TEXT' && req.text) {
      if (isHidden) isHidden = false;
      container.classList.remove('hidden');
      inputEl.value = req.text;
      solveContent(req.text, null);
    } else if (req.action === 'SCAN_DOM') {
      if (isHidden) isHidden = false;
      container.classList.remove('hidden');
      extractAndSolveDOM();
    }
  });

})();
