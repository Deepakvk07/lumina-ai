// Lumina AI Extension Service Worker

// Setup context menus on install
chrome.runtime.onInstalled.addListener(async () => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'lumina_toggle_overlay',
        title: '✨ Toggle Lumina AI Floating Assistant',
        contexts: ['all']
      });
    });
  } catch (err) {}
});

// Toolbar icon click → toggle floating overlay on current tab
chrome.action.onClicked.addListener(async (tab) => {
  if (!tab || !tab.id) return;
  if (!tab.url || tab.url.startsWith('chrome://') || tab.url.startsWith('chrome-extension://')) return;

  try {
    // Inject content script if not already injected
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['content.js']
    });
  } catch (e) {
    // Already injected - that's fine
  }

  // Toggle the overlay visibility
  chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' }).catch(() => {});
});

// Context menu
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === 'lumina_toggle_overlay') {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' }).catch(() => {});
  }
});

// Keyboard shortcut Alt+H
chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab || !tab.id) return;
  if (command === 'toggle_overlay') {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' }).catch(() => {});
  }
});
