// Lumina AI Extension Service Worker (Manifest V3 - Clean & Error-Free)

// 1. Setup Context Menus & Auto-inject on Install
chrome.runtime.onInstalled.addListener(async () => {
  try {
    chrome.contextMenus.removeAll(() => {
      chrome.contextMenus.create({
        id: 'lumina_toggle_floating',
        title: '👁️ Toggle Floating HUD Overlay (Alt+H)',
        contexts: ['all']
      });

      chrome.contextMenus.create({
        id: 'lumina_open_sidepanel',
        title: '📖 Open Invisible Side Panel (Alt+S)',
        contexts: ['all']
      });
    });
  } catch (err) {
    console.warn('[Lumina BG] Context menu setup error:', err);
  }

  // Inject content scripts into all existing open web tabs
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
    console.warn('[Lumina BG] Auto-inject error:', err);
  }
});

// 2. Handle Context Menu Actions
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;

  if (info.menuItemId === 'lumina_toggle_floating') {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' }).catch(() => {});
  } else if (info.menuItemId === 'lumina_open_sidepanel') {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
        if (tab.windowId) {
          chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
        }
      });
    }
  }
});

// 3. Handle Global Keyboard Shortcuts (Alt+H, Alt+S)
chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab || !tab.id) return;

  if (command === 'toggle_overlay') {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' }).catch(() => {});
  } else if (command === 'open_sidepanel') {
    if (chrome.sidePanel && chrome.sidePanel.open) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {
        if (tab.windowId) {
          chrome.sidePanel.open({ windowId: tab.windowId }).catch(() => {});
        }
      });
    }
  }
});
