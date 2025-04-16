document.addEventListener('DOMContentLoaded', function() {
  // Clean up when popup is closed
  window.addEventListener('unload', function() {
    // Clear any tracking intervals
    if (mouseTrackingInterval) {
      clearInterval(mouseTrackingInterval);
      mouseTrackingInterval = null;
    }

    // Remove any event listeners
    document.removeEventListener('click', saveMousePositionOnClick);
  });
  // Get DOM elements
  const autoLoginToggle = document.getElementById('autoLoginToggle');
  const autoRescheduleToggle = document.getElementById('autoRescheduleToggle');
  const autoSubmitToggle = document.getElementById('autoSubmitToggle');
  const autoCloudflareToggle = document.getElementById('autoCloudflareToggle');
  const useNativeMouseAutomationToggle = document.getElementById('useNativeMouseAutomationToggle');
  const nativeMouseAutomationControls = document.getElementById('nativeMouseAutomationControls');
  const trackMousePosition = document.getElementById('trackMousePosition');
  const positionInstructions = document.getElementById('positionInstructions');
  const currentMousePosition = document.getElementById('currentMousePosition');
  const savedPositionInfo = document.getElementById('savedPositionInfo');
  const manualXCoord = document.getElementById('manualXCoord');
  const manualYCoord = document.getElementById('manualYCoord');
  const saveManualCoordinates = document.getElementById('saveManualCoordinates');
  const statusMessage = document.getElementById('statusMessage');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');
  const saveButton = document.getElementById('saveCredentials');

  // Mouse tracking state
  let isTrackingMouse = false;
  let mouseTrackingInterval = null;

  // Date range elements
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const saveDateRangeButton = document.getElementById('saveDateRange');

  // API keys elements
  const enableGemini = document.getElementById('enableGemini');
  const geminiApiKey = document.getElementById('geminiApiKey');
  const enableGroq = document.getElementById('enableGroq');
  const groqApiKey = document.getElementById('groqApiKey');
  const saveApiKeysButton = document.getElementById('saveApiKeys');

  const saveSecurityQAButton = document.getElementById('saveSecurityQA');

  // Export/Import elements
  const exportSettingsButton = document.getElementById('exportSettings');
  const importSettingsInput = document.getElementById('importSettings');

  // Load saved state
  chrome.storage.local.get(
    [
      'autoLoginEnabled',
      'autoRescheduleEnabled',
      'autoSubmitEnabled',
      'autoCloudflareEnabled',
      'useNativeMouseAutomation',
      'cloudflareCheckboxPosition',
      'username',
      'password',
      'enableGemini',
      'geminiApiKey',
      'enableGroq',
      'groqApiKey',
      'startDate',
      'endDate'
    ],
    function(result) {
      // Set toggle states
      autoLoginToggle.checked = result.autoLoginEnabled || false;
      autoRescheduleToggle.checked = result.autoRescheduleEnabled || false;
      autoSubmitToggle.checked = result.autoSubmitEnabled || false;
      autoCloudflareToggle.checked = result.autoCloudflareEnabled || false;
      useNativeMouseAutomationToggle.checked = result.useNativeMouseAutomation || false;

      // Show/hide native mouse automation controls
      nativeMouseAutomationControls.style.display = result.useNativeMouseAutomation ? 'block' : 'none';

      // Update saved position info
      if (result.cloudflareCheckboxPosition) {
        savedPositionInfo.textContent = `Saved position: X=${result.cloudflareCheckboxPosition.x}, Y=${result.cloudflareCheckboxPosition.y}`;
      } else {
        savedPositionInfo.textContent = 'No position saved yet';
      }

      // Set saved credentials
      usernameInput.value = result.username || '';
      passwordInput.value = result.password || '';

      // Set date range values
      startDateInput.value = result.startDate || '';
      endDateInput.value = result.endDate || '';

      // Set API settings
      enableGemini.checked = result.enableGemini || false;
      geminiApiKey.value = result.geminiApiKey || '';
      enableGroq.checked = result.enableGroq || false;
      groqApiKey.value = result.groqApiKey || '';

      updateStatusMessage(result.autoLoginEnabled, result.autoRescheduleEnabled);
    }
  );

  // Set minimum date values
  const today = new Date();
  const currentMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
  startDateInput.min = currentMonth;
  endDateInput.min = currentMonth;

  // Start date change event
  startDateInput.addEventListener('change', function() {
    // Update end date minimum to be >= start date
    if (startDateInput.value) {
      endDateInput.min = startDateInput.value;
      // If end date is earlier than start date, update it
      if (endDateInput.value && endDateInput.value < startDateInput.value) {
        endDateInput.value = startDateInput.value;
      }
    }
  });

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

  // Toggle event listener for auto submit
  autoSubmitToggle.addEventListener('change', function() {
    const isSubmitEnabled = autoSubmitToggle.checked;

    // Save to storage
    chrome.storage.local.set({ autoSubmitEnabled: isSubmitEnabled }, function() {
      // Update status message
      if (isSubmitEnabled) {
        statusMessage.textContent = 'Status: Auto Submit Enabled';
        statusMessage.style.color = '#2196F3';

        // Reset to normal status after 2 seconds
        setTimeout(() => {
          updateStatusMessage(autoLoginToggle.checked, autoRescheduleToggle.checked);
        }, 2000);
      }
    });
  });

  // Toggle event listener for auto Cloudflare checkbox
  autoCloudflareToggle.addEventListener('change', function() {
    const isCloudflareEnabled = autoCloudflareToggle.checked;

    // Save to storage
    chrome.storage.local.set({ autoCloudflareEnabled: isCloudflareEnabled }, function() {
      // Update status message
      statusMessage.textContent = `Status: Auto Cloudflare Checkbox ${isCloudflareEnabled ? 'Enabled' : 'Disabled'}`;
      statusMessage.style.color = '#2196F3';

      // Notify background script about the toggle change
      chrome.runtime.sendMessage({
        action: 'toggleAutoCloudflare',
        isEnabled: isCloudflareEnabled
      });

      // Reset to normal status after 2 seconds
      setTimeout(() => {
        updateStatusMessage(autoLoginToggle.checked, autoRescheduleToggle.checked);
      }, 2000);
    });
  });

  // Toggle event listener for native mouse automation
  useNativeMouseAutomationToggle.addEventListener('change', function() {
    const isNativeMouseAutomationEnabled = useNativeMouseAutomationToggle.checked;

    // Show/hide native mouse automation controls
    nativeMouseAutomationControls.style.display = isNativeMouseAutomationEnabled ? 'block' : 'none';

    // Save to storage
    chrome.storage.local.set({ useNativeMouseAutomation: isNativeMouseAutomationEnabled }, function() {
      // Update status message
      statusMessage.textContent = `Status: Native Mouse Automation ${isNativeMouseAutomationEnabled ? 'Enabled' : 'Disabled'}`;
      statusMessage.style.color = '#2196F3';

      // Reset to normal status after 2 seconds
      setTimeout(() => {
        updateStatusMessage(autoLoginToggle.checked, autoRescheduleToggle.checked);
      }, 2000);
    });
  });

  // Track mouse position button
  trackMousePosition.addEventListener('click', function() {
    if (!isTrackingMouse) {
      // Start tracking mouse position
      isTrackingMouse = true;
      trackMousePosition.textContent = 'Click at Cloudflare Checkbox Position';
      trackMousePosition.style.backgroundColor = '#ff9800';
      positionInstructions.textContent = 'Move your mouse to the Cloudflare checkbox position and click to save it.';
      currentMousePosition.style.display = 'block';

      // Start interval to get current mouse position via background script
      mouseTrackingInterval = setInterval(() => {
        chrome.runtime.sendMessage({ action: 'startTrackingMousePosition' }, function(response) {
          if (response && response.success && response.position) {
            currentMousePosition.textContent = `Current position: X=${response.position.x}, Y=${response.position.y}`;
          } else {
            console.error('Error getting mouse position:', response ? response.error : 'No response');
            currentMousePosition.textContent = 'Error getting mouse position';
          }
        });
      }, 100); // Update every 100ms

      // Update status message
      statusMessage.textContent = 'Status: Tracking mouse position. Click at the Cloudflare checkbox.';
      statusMessage.style.color = '#ff9800';

      // Request delayed position save when popup closes
      chrome.runtime.sendMessage({
        action: 'saveMousePositionDelayed',
        name: 'cloudflareCheckbox',
        delayMs: 3000 // 3 seconds delay to give user time to click
      }, function(response) {
        if (response && response.success) {
          console.log('Requested delayed position save:', response);
        } else {
          console.error('Error requesting delayed position save:', response ? response.error : 'No response');
        }
      });

      // Show instructions to user
      alert('Position your mouse over the Cloudflare checkbox and click it. The position will be saved automatically.');
    } else {
      // Stop tracking mouse position
      stopMouseTracking();
    }
  });

  // Function to stop mouse tracking
  function stopMouseTracking() {
    isTrackingMouse = false;
    trackMousePosition.textContent = 'Start Tracking Mouse Position';
    trackMousePosition.style.backgroundColor = '#2196F3';
    positionInstructions.textContent = 'Click the button below to start tracking mouse position. Then click at the Cloudflare checkbox location to save it.';
    currentMousePosition.style.display = 'none';

    // Clear the tracking interval
    if (mouseTrackingInterval) {
      clearInterval(mouseTrackingInterval);
      mouseTrackingInterval = null;
    }

    // Notify background script to stop tracking
    chrome.runtime.sendMessage({ action: 'stopTrackingMousePosition' });
  }

  // Check for saved position on load
  chrome.storage.local.get(['cloudflareCheckboxPosition'], function(result) {
    if (result.cloudflareCheckboxPosition) {
      savedPositionInfo.textContent = `Saved position: X=${result.cloudflareCheckboxPosition.x}, Y=${result.cloudflareCheckboxPosition.y}`;

      // Populate manual coordinate fields with saved values
      manualXCoord.value = result.cloudflareCheckboxPosition.x;
      manualYCoord.value = result.cloudflareCheckboxPosition.y;
    } else {
      savedPositionInfo.textContent = 'No position saved yet';
    }
  });

  // Save manual coordinates button
  saveManualCoordinates.addEventListener('click', function() {
    const x = parseInt(manualXCoord.value);
    const y = parseInt(manualYCoord.value);

    if (isNaN(x) || isNaN(y)) {
      statusMessage.textContent = 'Status: Please enter valid X and Y coordinates';
      statusMessage.style.color = 'red';
      return;
    }

    const position = { x, y };

    // Save the position in Chrome storage
    chrome.storage.local.set({ cloudflareCheckboxPosition: position }, function() {
      // Update saved position info
      savedPositionInfo.textContent = `Saved position: X=${position.x}, Y=${position.y}`;

      // Update status message
      statusMessage.textContent = 'Status: Manual coordinates saved successfully';
      statusMessage.style.color = 'green';

      // Reset to normal status after 2 seconds
      setTimeout(() => {
        updateStatusMessage(autoLoginToggle.checked, autoRescheduleToggle.checked);
      }, 2000);

      // Also save to server if possible
      fetch('http://localhost:3000/mouse/save-position', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          name: 'cloudflareCheckbox',
          position: position
        })
      })
      .then(response => response.json())
      .then(data => {
        console.log('Saved manual coordinates to server:', data);
      })
      .catch(error => {
        console.error('Error saving manual coordinates to server:', error);
        // This is non-critical, so we don't show an error message to the user
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

  // Save date range button
  saveDateRangeButton.addEventListener('click', function() {
    const startDate = startDateInput.value.trim();
    const endDate = endDateInput.value.trim();

    if (!startDate || !endDate) {
      statusMessage.textContent = 'Status: Please enter both start and end dates';
      statusMessage.style.color = 'red';
      return;
    }

    // Validate dates (end date must be >= start date)
    if (endDate < startDate) {
      statusMessage.textContent = 'Status: End date must be after start date';
      statusMessage.style.color = 'red';
      return;
    }

    // Save date range to storage
    chrome.storage.local.set({
      startDate: startDate,
      endDate: endDate
    }, function() {
      statusMessage.textContent = 'Status: Date range saved successfully';
      statusMessage.style.color = 'green';

      // Reset to normal status after 2 seconds
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

  // Export settings button
  exportSettingsButton.addEventListener('click', function() {
    // Get all settings from storage
    chrome.storage.local.get(null, function(items) {
      // Convert settings to JSON string
      const settingsJSON = JSON.stringify(items, null, 2);

      // Create a blob with the JSON data
      const blob = new Blob([settingsJSON], {type: 'application/json'});

      // Create a download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `visa_reschedule_settings_${new Date().toISOString().slice(0, 10)}.json`;

      // Trigger download
      document.body.appendChild(a);
      a.click();

      // Clean up
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      // Show success message
      statusMessage.textContent = 'Status: Settings exported successfully';
      statusMessage.style.color = 'green';

      // Reset status after 2 seconds
      setTimeout(() => {
        updateStatusMessage(autoLoginToggle.checked, autoRescheduleToggle.checked);
      }, 2000);
    });
  });

  // Import settings
  importSettingsInput.addEventListener('change', function(event) {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();

    reader.onload = function(e) {
      try {
        // Parse the JSON data
        const settings = JSON.parse(e.target.result);

        // Validate the settings object
        if (!settings || typeof settings !== 'object') {
          throw new Error('Invalid settings file format');
        }

        // Save all settings to storage
        chrome.storage.local.set(settings, function() {
          // Update UI with imported settings
          if (settings.username) usernameInput.value = settings.username;
          if (settings.password) passwordInput.value = settings.password;

          if (settings.autoLoginEnabled !== undefined) autoLoginToggle.checked = settings.autoLoginEnabled;
          if (settings.autoRescheduleEnabled !== undefined) autoRescheduleToggle.checked = settings.autoRescheduleEnabled;
          if (settings.autoSubmitEnabled !== undefined) autoSubmitToggle.checked = settings.autoSubmitEnabled;
          if (settings.autoCloudflareEnabled !== undefined) autoCloudflareToggle.checked = settings.autoCloudflareEnabled;
          if (settings.useNativeMouseAutomation !== undefined) {
            useNativeMouseAutomationToggle.checked = settings.useNativeMouseAutomation;
            nativeMouseAutomationControls.style.display = settings.useNativeMouseAutomation ? 'block' : 'none';
          }

          // Update saved position info if it exists
          if (settings.cloudflareCheckboxPosition) {
            savedPositionInfo.textContent = `Saved position: X=${settings.cloudflareCheckboxPosition.x}, Y=${settings.cloudflareCheckboxPosition.y}`;
          }

          if (settings.startDate) startDateInput.value = settings.startDate;
          if (settings.endDate) endDateInput.value = settings.endDate;

          if (settings.enableGemini !== undefined) enableGemini.checked = settings.enableGemini;
          if (settings.geminiApiKey) geminiApiKey.value = settings.geminiApiKey;
          if (settings.enableGroq !== undefined) enableGroq.checked = settings.enableGroq;
          if (settings.groqApiKey) groqApiKey.value = settings.groqApiKey;

          // Update security questions if they exist
          if (settings.securityQA && Array.isArray(settings.securityQA)) {
            const questions = document.querySelectorAll('.security-question');
            const answers = document.querySelectorAll('.security-answer');

            settings.securityQA.forEach((qa, index) => {
              if (questions[index] && answers[index]) {
                questions[index].value = qa.question || '';
                answers[index].value = qa.answer || '';
              }
            });
          }

          // Show success message
          statusMessage.textContent = 'Status: Settings imported successfully';
          statusMessage.style.color = 'green';

          // Update status message based on imported settings
          setTimeout(() => {
            updateStatusMessage(autoLoginToggle.checked, autoRescheduleToggle.checked);
          }, 2000);
        });
      } catch (error) {
        // Show error message
        statusMessage.textContent = `Status: Error importing settings - ${error.message}`;
        statusMessage.style.color = 'red';

        // Reset status after 3 seconds
        setTimeout(() => {
          updateStatusMessage(autoLoginToggle.checked, autoRescheduleToggle.checked);
        }, 3000);
      }

      // Reset the file input
      importSettingsInput.value = '';
    };

    reader.onerror = function() {
      statusMessage.textContent = 'Status: Error reading the settings file';
      statusMessage.style.color = 'red';

      // Reset status after 3 seconds
      setTimeout(() => {
        updateStatusMessage(autoLoginToggle.checked, autoRescheduleToggle.checked);
      }, 3000);

      // Reset the file input
      importSettingsInput.value = '';
    };

    // Read the file as text
    reader.readAsText(file);
  });
});
