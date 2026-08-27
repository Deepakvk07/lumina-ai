// Lumina AI Extension Popup Script

document.addEventListener('DOMContentLoaded', async () => {
  const statusEl = document.getElementById('server-status');
  const backendInput = document.getElementById('backend-url');
  const saveBtn = document.getElementById('btn-save-settings');
  const scanBtn = document.getElementById('btn-scan-tab');
  const toggleBtn = document.getElementById('btn-toggle-overlay');
  const sidepanelBtn = document.getElementById('btn-open-sidepanel');

  // Load saved backend URL
  const storage = await chrome.storage.local.get(['backend_url']);
  const backendUrl = storage.backend_url || 'http://127.0.0.1:8765';
  backendInput.value = backendUrl;

  // Check health
  try {
    const res = await fetch(`${backendUrl}/api/config`, { signal: AbortSignal.timeout(1500) });
    if (res.ok) {
      statusEl.textContent = '● Online (8765)';
      statusEl.style.color = '#10b981';
    } else {
      statusEl.textContent = '● Error';
      statusEl.style.color = '#f59e0b';
    }
  } catch {
    statusEl.textContent = '● Standalone';
    statusEl.style.color = '#6b7280';
  }

  // Save Settings
  saveBtn.addEventListener('click', async () => {
    const url = backendInput.value.trim() || 'http://127.0.0.1:8765';
    await chrome.storage.local.set({ backend_url: url });
    saveBtn.textContent = '✓ Saved!';
    setTimeout(() => { saveBtn.textContent = 'Save Settings'; }, 1500);
  });

  // Scan Active Tab
  scanBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab) return;
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 80 }, (dataUrl) => {
      if (dataUrl) {
        chrome.tabs.sendMessage(tab.id, { action: 'SOLVE_IMAGE', dataUrl }).catch(() => {});
        window.close();
      }
    });
  });

  // Toggle In-Page Overlay
  toggleBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' }).catch(() => {});
      window.close();
    }
  });

  // Open Side Panel
  sidepanelBtn.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id && chrome.sidePanel) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
      window.close();
    }
  });
});
