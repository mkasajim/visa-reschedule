// Background script - runs when the extension is loaded/enabled

// Listen for when the extension is first installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log('Visa Reschedule Assistant installed');
  // Initialize default settings
  chrome.storage.local.set({
    autoLoginEnabled: false
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleAutoLogin') {
    handleAutoLoginToggle(message.isEnabled);
  }
});

// Listen for tab updates to detect when we're on the visa scheduling site or atlas login page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only act if the page is fully loaded and URL matches
  if (changeInfo.status === 'complete' && tab.url) {
    const isVisaSite = tab.url.includes('usvisascheduling.com');
    const isAtlasLogin = tab.url.includes('atlasauth.b2clogin.com');
    
    if (isVisaSite || isAtlasLogin) {
      // Check if auto login is enabled
      chrome.storage.local.get(['autoLoginEnabled'], (result) => {
        if (result.autoLoginEnabled) {
          // Inject the content script if not already injected
          chrome.scripting.executeScript({
            target: { tabId: tabId },
            files: ['content.js']
          }).catch(err => {
            // Ignore error if script is already injected
            if (!err.message.includes('cannot access a chrome://')) {
              console.error('Script injection failed:', err);
            }
          });
          
          // Send message to start login process
          chrome.tabs.sendMessage(tabId, { action: 'performLogin' });
        }
      });
    }
  }
});

// Function to handle auto login toggle
function handleAutoLoginToggle(isEnabled) {
  if (isEnabled) {
    // Check if there's already a tab with either the visa scheduling site or atlas login
    chrome.tabs.query({ 
      url: [
        '*://www.usvisascheduling.com/*', 
        '*://atlasauth.b2clogin.com/*'
      ] 
    }, (tabs) => {
      if (tabs.length > 0) {
        // Site is already open, send message to the tab
        chrome.tabs.sendMessage(tabs[0].id, { action: 'performLogin' });
      } else {
        // Open a new tab with the site
        chrome.tabs.create({ url: 'https://www.usvisascheduling.com/en-US/' }, (tab) => {
          // Tab creation callback - the content script will be auto-injected via the onUpdated listener
          console.log('Created new tab for visa scheduling site');
        });
      }
    });
  }
}