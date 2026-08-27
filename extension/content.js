// Lumina AI Content Script (Shadow DOM + Background Port Proxy)

(() => {
  if (document.getElementById('lumina-overlay-root')) return;

  const host = document.createElement('div');
  host.id = 'lumina-overlay-root';
  document.documentElement.appendChild(host);

  const shadow = host.attachShadow({ mode: 'open' });

  // Inline stylesheet so it NEVER fails on cross-origin security
  const style = document.createElement('style');
  style.textContent = `
#lumina-floating-container {
  position: fixed !important;
  top: 20px !important;
  right: 20px !important;
  width: 440px !important;
  max-width: 90vw !important;
  background: #ffffff !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 16px !important;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.15), 0 8px 10px -6px rgba(0, 0, 0, 0.1) !important;
  color: #111827 !important;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif !important;
  font-size: 13px !important;
  z-index: 2147483647 !important;
  overflow: hidden !important;
  box-sizing: border-box !important;
}

#lumina-floating-container.hidden { display: none !important; }
#lumina-floating-container.minimized #lumina-body { display: none !important; }

#lumina-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 10px 14px !important;
  background: #f9fafb !important;
  border-bottom: 1px solid #f3f4f6 !important;
  cursor: move !important;
  user-select: none !important;
}

.lumina-brand {
  display: flex !important;
  align-items: center !important;
  gap: 8px !important;
  font-weight: 700 !important;
  font-size: 13px !important;
  color: #1e1b4b !important;
}

.lumina-logo-badge {
  background: #4f46e5 !important;
  color: white !important;
  padding: 2px 6px !important;
  border-radius: 6px !important;
  font-size: 11px !important;
  font-weight: 800 !important;
}

.lumina-header-actions {
  display: flex !important;
  align-items: center !important;
  gap: 6px !important;
}

.lumina-icon-btn {
  background: white !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 6px !important;
  padding: 3px 8px !important;
  font-size: 11px !important;
  color: #4b5563 !important;
  cursor: pointer !important;
}

.lumina-icon-btn:hover {
  background: #f3f4f6 !important;
  color: #4f46e5 !important;
}

#lumina-body {
  padding: 12px 14px !important;
  display: flex !important;
  flex-direction: column !important;
  gap: 10px !important;
  box-sizing: border-box !important;
}

.lumina-toolbar {
  display: flex !important;
  gap: 8px !important;
}

.lumina-btn-primary {
  flex: 1 !important;
  background: #4f46e5 !important;
  color: white !important;
  border: none !important;
  border-radius: 8px !important;
  padding: 9px 12px !important;
  font-weight: 600 !important;
  font-size: 12px !important;
  cursor: pointer !important;
  display: flex !important;
  align-items: center !important;
  justify-content: center !important;
}

.lumina-btn-primary:hover { background: #4338ca !important; }

.lumina-btn-secondary {
  background: #f3f4f6 !important;
  color: #374151 !important;
  border: 1px solid #e5e7eb !important;
  border-radius: 8px !important;
  padding: 9px 12px !important;
  font-weight: 500 !important;
  font-size: 12px !important;
  cursor: pointer !important;
}

.lumina-btn-secondary:hover { background: #e5e7eb !important; }

#lumina-input {
  width: 100% !important;
  box-sizing: border-box !important;
  padding: 8px 10px !important;
  border: 1px solid #d1d5db !important;
  border-radius: 8px !important;
  font-size: 12px !important;
  color: #111827 !important;
  background: #f9fafb !important;
  resize: vertical !important;
  min-height: 48px !important;
  outline: none !important;
  font-family: inherit !important;
}

#lumina-input:focus { border-color: #4f46e5 !important; background: #ffffff !important; }

#lumina-output-card {
  background: #f8fafc !important;
  border: 1px solid #e2e8f0 !important;
  border-radius: 10px !important;
  overflow: hidden !important;
}

.lumina-output-header {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  padding: 6px 10px !important;
  background: #f1f5f9 !important;
  border-bottom: 1px solid #e2e8f0 !important;
  font-size: 11px !important;
  font-weight: 700 !important;
  color: #475569 !important;
}

#lumina-output-text {
  padding: 10px 12px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  line-height: 1.5 !important;
  color: #0f172a !important;
  max-height: 200px !important;
  overflow-y: auto !important;
  white-space: pre-wrap !important;
  user-select: text !important;
}

.lumina-footer {
  display: flex !important;
  align-items: center !important;
  justify-content: space-between !important;
  font-size: 11px !important;
  color: #9ca3af !important;
}

.lumina-shortcut-badge {
  background: #f3f4f6 !important;
  border: 1px solid #e5e7eb !important;
  padding: 1px 4px !important;
  border-radius: 4px !important;
  color: #4f46e5 !important;
  font-family: monospace !important;
}
`;
  shadow.appendChild(style);

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
          <button class="lumina-icon-btn" id="lumina-copy-btn" title="Copy Answer">📋 Copy</button>
        </div>
        <div id="lumina-output-text">Click <b>Scan & Solve Tab</b> (Alt+S) or paste screenshot (Ctrl+V)</div>
      </div>

      <div class="lumina-footer">
        <span><span class="lumina-shortcut-badge">Alt+S</span> Scan | <span class="lumina-shortcut-badge">Alt+H</span> Hide</span>
        <span id="lumina-status-dot" style="color: #10b981; font-weight: 600;">● Engine Ready</span>
      </div>
    </div>
  `;
  shadow.appendChild(container);

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

  // Draggable logic
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
    container.style.left = `${Math.max(10, initialLeft + (e.clientX - startX))}px`;
    container.style.top = `${Math.max(10, initialTop + (e.clientY - startY))}px`;
    container.style.right = 'auto';
  });

  window.addEventListener('mouseup', () => { isDragging = false; });

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
    if (text) {
      navigator.clipboard.writeText(text);
      copyBtn.textContent = '✓ Copied';
      setTimeout(() => { copyBtn.textContent = '📋 Copy'; }, 1500);
    }
  });

  // Solve using Background Port (NO Mixed Content issues!)
  const solveContent = (text, imageBase64) => {
    if (isSolving) return;
    isSolving = true;
    scanBtn.disabled = true;
    scanBtn.textContent = '⏳ Solving...';
    outputText.textContent = '✨ Analyzing question & calculating with 120B Math Reasoner...';

    const payload = {
      question: text || 'Solve visible problem and output ONLY the option numbers and answers.',
      image_base64: imageBase64 || null,
      category: 'auto',
      answer_style: 'option_only'
    };

    const port = chrome.runtime.connect({ name: 'LUMINA_SOLVER_STREAM' });
    let firstToken = true;

    port.onMessage.addListener((msg) => {
      if (msg.error) {
        outputText.textContent = `⚠️ ${msg.error}`;
      } else if (msg.token) {
        if (firstToken) {
          outputText.textContent = '';
          firstToken = false;
        }
        outputText.textContent += msg.token;
      } else if (msg.done) {
        isSolving = false;
        scanBtn.disabled = false;
        scanBtn.textContent = '⚡ Scan & Solve Tab';
      }
    });

    port.postMessage({ action: 'START_SOLVE', payload });
  };

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
