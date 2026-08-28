// Lumina AI Extension Service Worker

chrome.runtime.onInstalled.addListener(() => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'lumina_toggle',
        title: '✨ Toggle Lumina AI on this page',
        contexts: ['all']
      });
    });
  } catch (_) {}
});

// Re-injecting content.js is the toggle - the IIFE inside handles show/hide.
async function toggleOnTab(tab) {
  if (!tab || !tab.id) return;
  const url = tab.url || '';
  if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') ||
      url.startsWith('devtools://') || url === '') return;

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  } catch (e) {
    // Restricted page - silently ignore
  }
}

// Toolbar icon click
chrome.action.onClicked.addListener((tab) => {
  toggleOnTab(tab);
});

// Right-click context menu
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === 'lumina_toggle') toggleOnTab(tab);
});

// Alt+H keyboard shortcut
chrome.commands.onCommand.addListener((command, tab) => {
  if (command === 'toggle_overlay') toggleOnTab(tab);
});

// Capture visible tab screenshot for Scan Website / Problem Snip
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CAPTURE_TAB') {
    chrome.tabs.captureVisibleTab(null, { format: 'jpeg', quality: 90 }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ error: chrome.runtime.lastError?.message || 'Capture failed' });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true; // Keep message port open for async sendResponse
  }
});
