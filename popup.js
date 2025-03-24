document.addEventListener('DOMContentLoaded', function() {
  // Get DOM elements
  const autoLoginToggle = document.getElementById('autoLoginToggle');
  const statusMessage = document.getElementById('statusMessage');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const saveButton = document.getElementById('saveCredentials');
  
  // API keys elements
  const enableGemini = document.getElementById('enableGemini');
  const geminiApiKey = document.getElementById('geminiApiKey');
  const enableGroq = document.getElementById('enableGroq');
  const groqApiKey = document.getElementById('groqApiKey');
  const saveApiKeysButton = document.getElementById('saveApiKeys');

  // Load saved state
  chrome.storage.local.get(
    [
      'autoLoginEnabled', 
      'username', 
      'password', 
      'enableGemini', 
      'geminiApiKey', 
      'enableGroq', 
      'groqApiKey'
    ], 
    function(result) {
      // Set toggle state
      autoLoginToggle.checked = result.autoLoginEnabled || false;
      
      // Set saved credentials
      usernameInput.value = result.username || '';
      passwordInput.value = result.password || '';
      
      // Set API settings
      enableGemini.checked = result.enableGemini || false;
      geminiApiKey.value = result.geminiApiKey || '';
      enableGroq.checked = result.enableGroq || false;
      groqApiKey.value = result.groqApiKey || '';
      
      updateStatusMessage(result.autoLoginEnabled);
    }
  );

  // Toggle event listener
  autoLoginToggle.addEventListener('change', function() {
    const isEnabled = autoLoginToggle.checked;
    
    // Save to storage
    chrome.storage.local.set({ autoLoginEnabled: isEnabled }, function() {
      updateStatusMessage(isEnabled);
      
      // Notify background script about the toggle change
      chrome.runtime.sendMessage({ 
        action: 'toggleAutoLogin', 
        isEnabled: isEnabled 
      });
    });
  });

  // Save credentials button
  saveButton.addEventListener('click', function() {
    const username = usernameInput.value.trim();
    const password = passwordInput.value.trim();
    
    if (!username || !password) {
      statusMessage.textContent = 'Status: Please enter both username and password';
      statusMessage.style.color = 'red';
      return;
    }
    
    // Save credentials to storage
    chrome.storage.local.set({ 
      username: username, 
      password: password 
    }, function() {
      statusMessage.textContent = 'Status: Credentials saved successfully';
      statusMessage.style.color = 'green';
      
      // Reset to normal status after 2 seconds
      setTimeout(() => {
        updateStatusMessage(autoLoginToggle.checked);
      }, 2000);
    });
  });
  
  // Save API keys button
  saveApiKeysButton.addEventListener('click', function() {
    // Save API settings to storage
    chrome.storage.local.set({ 
      enableGemini: enableGemini.checked,
      geminiApiKey: geminiApiKey.value.trim(),
      enableGroq: enableGroq.checked,
      groqApiKey: groqApiKey.value.trim()
    }, function() {
      statusMessage.textContent = 'Status: API keys saved successfully';
      statusMessage.style.color = 'green';
      
      // Reset to normal status after 2 seconds
      setTimeout(() => {
        updateStatusMessage(autoLoginToggle.checked);
      }, 2000);
    });
  });

  // Function to update status message
  function updateStatusMessage(isEnabled) {
    if (isEnabled) {
      statusMessage.textContent = 'Status: Auto Login Enabled';
      statusMessage.style.color = '#2196F3';
    } else {
      statusMessage.textContent = 'Status: Ready';
      statusMessage.style.color = 'black';
    }
  }
});

document.addEventListener('DOMContentLoaded', () => {
  // Load saved settings
  chrome.storage.local.get(['enableGemini', 'geminiApiKey'], (result) => {
    document.getElementById('enableGemini').checked = result.enableGemini || false;
    document.getElementById('geminiApiKey').value = result.geminiApiKey || '';
  });

  // Save settings
  document.getElementById('saveSettings').addEventListener('click', () => {
    const enableGemini = document.getElementById('enableGemini').checked;
    const geminiApiKey = document.getElementById('geminiApiKey').value;
    
    // Validate API key if Gemini is enabled
    if (enableGemini && !geminiApiKey) {
      showStatus('Please enter a Gemini API key', 'error');
      return;
    }

    // Save to storage
    chrome.storage.local.set({
      enableGemini,
      geminiApiKey
    }, () => {
      showStatus('Settings saved successfully!', 'success');
      
      // Notify content script that settings have changed
      chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
        if (tabs[0]) {
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'settingsUpdated'
          });
        }
      });
    });
  });
});

function showStatus(message, type) {
  const status = document.getElementById('status');
  status.textContent = message;
  status.className = `status ${type}`;
  status.style.display = 'block';
  
  // Hide after 3 seconds
  setTimeout(() => {
    status.style.display = 'none';
  }, 3000);
}