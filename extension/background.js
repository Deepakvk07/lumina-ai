// Lumina AI - Background Service Worker (Manifest V3)

const DEFAULT_GROQ_KEY = "";

// 1. Auto-inject into existing open tabs on install/reload
chrome.runtime.onInstalled.addListener(async () => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'lumina_solve_selection',
        title: '⚡ Solve Question with Lumina AI',
        contexts: ['selection']
      });

      chrome.contextMenus.create({
        id: 'lumina_open_sidepanel',
        title: '📖 Open Lumina Side Panel',
        contexts: ['all']
      });
    });
  } catch (e) {}

  try {
    const tabs = await chrome.tabs.query({ url: ['http://*/*', 'https://*/*'] });
    for (const tab of tabs) {
      if (tab.id && !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.log('[Lumina Init] Auto-inject skipped:', err);
  }
});

// 2. Handle Context Menu
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lumina_solve_selection' && info.selectionText) {
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'SOLVE_TEXT',
        text: info.selectionText
      }).catch(() => {});
    }
  } else if (info.menuItemId === 'lumina_open_sidepanel') {
    if (tab && tab.id && chrome.sidePanel) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    }
  }
});

// 3. Handle Global Commands (Alt+S, Alt+H)
chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab || !tab.id) return;

  if (command === 'scan_and_solve') {
    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 75 }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        chrome.tabs.sendMessage(tab.id, { action: 'SCAN_DOM' }).catch(() => {});
      } else {
        chrome.tabs.sendMessage(tab.id, {
          action: 'SOLVE_IMAGE',
          dataUrl: dataUrl
        }).catch(() => {});
      }
    });
  } else if (command === 'toggle_overlay') {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' }).catch(() => {});
  }
});

// 4. Robust Streaming Solver via Long-Lived Port
// Bypasses Mixed Content (HTTPS -> HTTP) and CORS completely!
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'LUMINA_SOLVER_STREAM') {
    port.onMessage.addListener(async (req) => {
      if (req.action === 'START_SOLVE') {
        await handleStreamSolve(req.payload, port);
      }
    });
  }
});

async function handleStreamSolve(payload, port) {
  const storage = await chrome.storage.local.get(['backend_url', 'groq_api_key']);
  const backendUrl = storage.backend_url || 'http://127.0.0.1:8765';
  const groqKey = storage.groq_api_key || DEFAULT_GROQ_KEY;

  let localSuccess = false;

  // Try Local Python Middle-Layer Backend first
  try {
    const res = await fetch(`${backendUrl}/api/solve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(3500)
    });

    if (res.ok && res.body) {
      localSuccess = true;
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
          if (token === '[DONE]') {
            port.postMessage({ done: true });
            return;
          }
          port.postMessage({ token: token.replaceAll('⏎', '\n') });
        }
      }
      port.postMessage({ done: true });
      return;
    }
  } catch (err) {
    console.log('[Lumina BG] Local backend unavailable, falling back to Direct Groq API:', err);
  }

  // Fallback: Direct Cloud Groq API (Works standalone even if Python backend is offline!)
  if (!localSuccess && groqKey) {
    try {
      port.postMessage({ token: '*(Solving via 120B Cloud Engine...)*\n\n' });
      
      const systemPrompt = `You are an ultra-fast competition-grade mathematical, quantitative aptitude, and logical reasoning solver.
YOUR PRIME DIRECTIVE IS 100% ACCURACY AND DIRECT STREAMING OUTPUT.
FORMAT:
**🎯 Option [A/B/C/D] — [Value/Text]**
*(Short 1-line key proof)*
RULES:
1. NEVER use LaTeX ($ or \\text). Use clean plain text.
2. Start directly with the answer on Line 1.`;

      let userContent;
      let model = 'openai/gpt-oss-120b';

      if (payload.image_base64) {
        model = 'qwen/qwen3.8-27b';
        userContent = [
          { type: 'text', text: payload.question || 'Solve question in screenshot.' },
          { type: 'image_url', image_url: { url: payload.image_base64 } }
        ];
      } else {
        userContent = payload.question;
      }

      const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${groqKey}`
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent }
          ],
          temperature: 0.0,
          stream: true
        })
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        port.postMessage({ error: errJson.error?.message || `HTTP ${res.status}` });
        port.postMessage({ done: true });
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data: ')) continue;
          const dataStr = trimmed.slice(6);
          if (dataStr === '[DONE]') {
            port.postMessage({ done: true });
            return;
          }
          try {
            const parsed = JSON.parse(dataStr);
            const delta = parsed.choices?.[0]?.delta?.content || '';
            if (delta) {
              port.postMessage({ token: delta });
            }
          } catch {}
        }
      }
      port.postMessage({ done: true });
    } catch (directErr) {
      port.postMessage({ error: `Connection failed: ${directErr.message}` });
      port.postMessage({ done: true });
    }
  }
}

// 5. General message listener (Tab captures)
chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'CAPTURE_VISIBLE_TAB') {
    const windowId = sender.tab ? sender.tab.windowId : null;
    chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 75 }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ error: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Capture failed' });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true;
  }
});
