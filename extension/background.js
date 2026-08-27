// Lumina AI Extension Background Service Worker (Manifest V3)

chrome.runtime.onInstalled.addListener(() => {
  // Context Menu for text selection
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

  // Enable side panel on action click if configured
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: false }).catch(() => {});
  }
});

// Handle Context Menu clicks
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

// Handle Global Shortcuts (Alt+S, Alt+H)
chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab || !tab.id) return;

  if (command === 'scan_and_solve') {
    // Capture visible tab screenshot instantly
    chrome.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        // Fallback to DOM scan
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

// Message Dispatcher
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'CAPTURE_VISIBLE_TAB') {
    const windowId = sender.tab ? sender.tab.windowId : null;
    chrome.tabs.captureVisibleTab(windowId, { format: 'jpeg', quality: 80 }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ error: chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Failed to capture' });
      } else {
        sendResponse({ dataUrl: dataUrl });
      }
    });
    return true; // Keep channel open for async response
  }

  if (request.action === 'OPEN_SIDEPANEL') {
    if (sender.tab && sender.tab.id && chrome.sidePanel) {
      chrome.sidePanel.open({ tabId: sender.tab.id }).then(() => {
        sendResponse({ ok: true });
      }).catch((e) => {
        sendResponse({ error: e.message });
      });
      return true;
    }
  }
});
