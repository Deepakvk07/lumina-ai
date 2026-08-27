// Lumina AI Extension Service Worker (Full React App Side Panel & Overlay)

// 1. Enable 1-Click Side Panel on Toolbar Icon Click
chrome.runtime.onInstalled.addListener(async () => {
  if (chrome.sidePanel && chrome.sidePanel.setPanelBehavior) {
    chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {});
  }

  // Context menus
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: 'lumina_open_sidepanel',
      title: '⚡ Open Lumina AI (Voice HUD & Solver)',
      contexts: ['all']
    });

    chrome.contextMenus.create({
      id: 'lumina_toggle_floating',
      title: '👁️ Toggle Floating In-Page Overlay (Alt+H)',
      contexts: ['all']
    });
  });

  // Inject content scripts into open tabs
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
  } catch (err) {}
});

// 2. Handle Action Click (Open Side Panel)
chrome.action.onClicked.addListener((tab) => {
  if (tab && tab.id && chrome.sidePanel) {
    chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
  }
});

// 3. Handle Context Menus
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (!tab || !tab.id) return;
  if (info.menuItemId === 'lumina_open_sidepanel') {
    if (chrome.sidePanel) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    }
  } else if (info.menuItemId === 'lumina_toggle_floating') {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' }).catch(() => {});
  }
});

// 4. Handle Global Hotkeys
chrome.commands.onCommand.addListener((command, tab) => {
  if (!tab || !tab.id) return;
  if (command === 'toggle_overlay') {
    chrome.tabs.sendMessage(tab.id, { action: 'TOGGLE_OVERLAY' }).catch(() => {});
  } else if (command === 'open_sidepanel') {
    if (chrome.sidePanel) {
      chrome.sidePanel.open({ tabId: tab.id }).catch(() => {});
    }
  }
});
