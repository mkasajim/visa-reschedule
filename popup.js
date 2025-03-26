document.addEventListener('DOMContentLoaded', function() {
  // Get DOM elements
  const autoLoginToggle = document.getElementById('autoLoginToggle');
  const autoRescheduleToggle = document.getElementById('autoRescheduleToggle');
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

  const saveSecurityQAButton = document.getElementById('saveSecurityQA');

  // Load saved state
  chrome.storage.local.get(
    [
      'autoLoginEnabled', 
      'autoRescheduleEnabled',
      'username', 
      'password', 
      'enableGemini', 
      'geminiApiKey', 
      'enableGroq', 
      'groqApiKey'
    ], 
    function(result) {
      // Set toggle states
      autoLoginToggle.checked = result.autoLoginEnabled || false;
      autoRescheduleToggle.checked = result.autoRescheduleEnabled || false;
      
      // Set saved credentials
      usernameInput.value = result.username || '';
      passwordInput.value = result.password || '';
      
      // Set API settings
      enableGemini.checked = result.enableGemini || false;
      geminiApiKey.value = result.geminiApiKey || '';
      enableGroq.checked = result.enableGroq || false;
      groqApiKey.value = result.groqApiKey || '';
      
      updateStatusMessage(result.autoLoginEnabled, result.autoRescheduleEnabled);
    }
  );

  // Toggle event listener for auto login
  autoLoginToggle.addEventListener('change', function() {
    const isLoginEnabled = autoLoginToggle.checked;
    const isRescheduleEnabled = autoRescheduleToggle.checked;
    
    // Save to storage
    chrome.storage.local.set({ autoLoginEnabled: isLoginEnabled }, function() {
      updateStatusMessage(isLoginEnabled, isRescheduleEnabled);
      
      // Notify background script about the toggle change
      chrome.runtime.sendMessage({ 
        action: 'toggleAutoLogin', 
        isEnabled: isLoginEnabled 
      });
    });
  });

  // Toggle event listener for auto reschedule
  autoRescheduleToggle.addEventListener('change', function() {
    const isLoginEnabled = autoLoginToggle.checked;
    const isRescheduleEnabled = autoRescheduleToggle.checked;
    
    // Save to storage
    chrome.storage.local.set({ autoRescheduleEnabled: isRescheduleEnabled }, function() {
      updateStatusMessage(isLoginEnabled, isRescheduleEnabled);
      
      // Notify background script about the toggle change
      chrome.runtime.sendMessage({ 
        action: 'toggleAutoReschedule', 
        isEnabled: isRescheduleEnabled 
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
        updateStatusMessage(autoLoginToggle.checked, autoRescheduleToggle.checked);
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
        updateStatusMessage(autoLoginToggle.checked, autoRescheduleToggle.checked);
      }, 2000);
    });
  });

  // Load saved security questions
  chrome.storage.local.get(['securityQA'], function(result) {
    if (result.securityQA) {
      const questions = document.querySelectorAll('.security-question');
      const answers = document.querySelectorAll('.security-answer');
      result.securityQA.forEach((qa, index) => {
        if (questions[index] && answers[index]) {
          questions[index].value = qa.question || '';
          answers[index].value = qa.answer || '';
        }
      });
    }
  });

  // Save security questions button
  saveSecurityQAButton.addEventListener('click', function() {
    const questions = document.querySelectorAll('.security-question');
    const answers = document.querySelectorAll('.security-answer');
    
    const securityQA = Array.from(questions).map((q, index) => ({
      question: q.value.trim(),
      answer: answers[index].value.trim()
    })).filter(qa => qa.question && qa.answer);

    if (securityQA.length === 0) {
      statusMessage.textContent = 'Status: Please enter at least one question and answer';
      statusMessage.style.color = 'red';
      return;
    }

    // Save to storage
    chrome.storage.local.set({ securityQA }, function() {
      statusMessage.textContent = 'Status: Security Q&A saved successfully';
      statusMessage.style.color = 'green';
      
      setTimeout(() => {
        updateStatusMessage(autoLoginToggle.checked, autoRescheduleToggle.checked);
      }, 2000);
    });
  });

  // Function to update status message
  function updateStatusMessage(isLoginEnabled, isRescheduleEnabled) {
    if (isLoginEnabled && isRescheduleEnabled) {
      statusMessage.textContent = 'Status: Auto Login & Reschedule Enabled';
      statusMessage.style.color = '#2196F3';
    } else if (isLoginEnabled) {
      statusMessage.textContent = 'Status: Auto Login Enabled';
      statusMessage.style.color = '#2196F3';
    } else if (isRescheduleEnabled) {
      statusMessage.textContent = 'Status: Auto Reschedule Enabled';
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