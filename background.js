// Background script - runs when the extension is loaded/enabled

// Create a debug logging function that prepends timestamps
function debugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(data);
  }
}

// Listen for when the extension is first installed or updated
chrome.runtime.onInstalled.addListener(() => {
  debugLog('Visa Reschedule Assistant installed');
  // Initialize default settings
  chrome.storage.local.set({
    autoLoginEnabled: false
  });
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'toggleAutoLogin') {
    handleAutoLoginToggle(message.isEnabled);
  } else if (message.action === 'toggleAutoReschedule') {
    handleAutoRescheduleToggle(message.isEnabled);
  }
});

// Listen for tab updates to detect when we're on the visa scheduling site or atlas login page
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  // Only act if the page is fully loaded and URL matches
  if (changeInfo.status === 'complete' && tab.url) {
    const isVisaSite = tab.url.includes('usvisascheduling.com');
    const isAtlasLogin = tab.url.includes('atlasauth.b2clogin.com');

    if (isVisaSite || isAtlasLogin) {
      // Check if auto login or auto reschedule is enabled
      chrome.storage.local.get(['autoLoginEnabled', 'autoRescheduleEnabled'], (result) => {
        if (result.autoLoginEnabled || result.autoRescheduleEnabled) {
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

          // Only send login message if auto login is enabled
          if (result.autoLoginEnabled && (isAtlasLogin || (isVisaSite && tab.url.includes('login')))) {
            chrome.tabs.sendMessage(tabId, { action: 'performLogin' });
          }

          // Check for reschedule page if auto reschedule is enabled
          if (result.autoRescheduleEnabled && isVisaSite) {
            // Wait a bit longer for content script to initialize and page to fully load
            // This helps with cases where the reschedule link appears after a delay
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, { action: 'checkForReschedulePage' });
            }, 3000);

            // Add a second check after a longer delay to catch very delayed page loads
            setTimeout(() => {
              chrome.tabs.sendMessage(tabId, { action: 'checkForReschedulePage' });
            }, 8000);
          }
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
          debugLog('Created new tab for visa scheduling site');
        });
      }
    });
  }
}

// Function to handle auto reschedule toggle
function handleAutoRescheduleToggle(isEnabled) {
  if (isEnabled) {
    // Update settings
    chrome.storage.local.set({ autoRescheduleEnabled: true }, () => {
      debugLog('Auto reschedule enabled');

      // Check if there's already a tab with the visa scheduling site
      chrome.tabs.query({
        url: ['*://www.usvisascheduling.com/*']
      }, (tabs) => {
        if (tabs.length > 0) {
          // Site is already open, send message to the tab to check reschedule page
          chrome.tabs.sendMessage(tabs[0].id, { action: 'checkForReschedulePage' });

          // Send another check after a delay to handle delayed page loading
          setTimeout(() => {
            chrome.tabs.sendMessage(tabs[0].id, { action: 'checkForReschedulePage' });
          }, 5000);
        } else {
          // Open a new tab with the site if not already open
          chrome.tabs.create({ url: 'https://www.usvisascheduling.com/en-US/' }, (tab) => {
            // Tab creation callback - the content script will be auto-injected via the onUpdated listener
            debugLog('Created new tab for visa scheduling site');
          });
        }
      });
    });
  } else {
    // Update settings
    chrome.storage.local.set({ autoRescheduleEnabled: false }, () => {
      debugLog('Auto reschedule disabled');
    });
  }
}

// Function to upload file to Gemini
async function uploadToGemini(imageDataUrl, apiKey) {
  debugLog('Uploading file to Gemini');
  try {
    // First, upload the file
    const uploadUrl = `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${apiKey}`;
    const uploadHeaders = {
      'X-Goog-Upload-Command': 'start, upload, finalize',
      'X-Goog-Upload-Header-Content-Length': imageDataUrl.length,
      'X-Goog-Upload-Header-Content-Type': 'image/png',
      'Content-Type': 'application/json'
    };

    const uploadResponse = await fetch(uploadUrl, {
      method: 'POST',
      headers: uploadHeaders,
      body: JSON.stringify({
        file: {
          display_name: 'captcha.png'
        }
      }) + imageDataUrl
    });

    if (!uploadResponse.ok) {
      throw new Error(`Upload failed: ${uploadResponse.statusText}`);
    }

    const uploadResult = await uploadResponse.json();
    debugLog('File uploaded successfully:', uploadResult);
    return uploadResult.file.uri;
  } catch (error) {
    debugLog('Error uploading file to Gemini:', error);
    throw error;
  }
}

// Function to solve captcha
async function solveCaptchaWithGemini(imageDataUrl, apiKey) {
  debugLog('Starting captcha solving process with Gemini');
  try {
    // Upload the image
    const fileUri = await uploadToGemini(imageDataUrl, apiKey);

    // Generate content
    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash-lite:generateContent?key=${apiKey}`;
    const generateResponse = await fetch(generateUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                fileData: {
                  fileUri: fileUri,
                  mimeType: "image/png"
                }
              },
              {
                text: "Give the text in the image like this:\n[\n  {\n    \"captcha\": \"M8VAO\"\n  }\n]\n\nThe text should not contain any space"
              }
            ]
          }
        ],
        generationConfig: {
          temperature: 1,
          topK: 40,
          topP: 0.95,
          maxOutputTokens: 8192,
          responseMimeType: "text/plain"
        }
      })
    });

    if (!generateResponse.ok) {
      throw new Error(`Generate content failed: ${generateResponse.statusText}`);
    }

    const generateResult = await generateResponse.json();
    debugLog('Received response from Gemini:', generateResult);

    const responseText = generateResult.candidates[0].content.parts[0].text;
    const captchaMatch = responseText.match(/"captcha":\s*"([^"]+)"/);

    if (captchaMatch) {
      debugLog('Successfully extracted captcha text:', captchaMatch[1]);
      return captchaMatch[1];
    }

    debugLog('Failed to extract captcha text from response');
    return null;
  } catch (error) {
    debugLog('Error solving captcha with Gemini:', error);
    return null;
  }
}

// Listen for messages from content script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'solveCaptcha') {
    debugLog('Received solveCaptcha message:', {
      apiKey: message.apiKey ? message.apiKey.substring(0, 10) + '...' : 'missing',
      imageDataUrl: message.imageDataUrl ? 'present' : 'missing'
    });

    if (!message.apiKey || !message.imageDataUrl) {
      debugLog('Missing required data for captcha solving');
      sendResponse({ success: false, error: 'Missing required data' });
      return true;
    }

    // Solve the captcha
    solveCaptchaWithGemini(message.imageDataUrl, message.apiKey)
      .then(captchaText => {
        debugLog('Captcha solving completed:', { success: true, captchaText });
        sendResponse({ success: true, captchaText });
      })
      .catch(error => {
        debugLog('Captcha solving failed:', { success: false, error: error.message });
        sendResponse({ success: false, error: error.message });
      });

    return true; // Will respond asynchronously
  } else if (message.action === 'foundAvailableDate') {
    // Log when an available date is found
    debugLog('Available date found:', message.date);

    // Show a notification to the user
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'Visa Appointment Available!',
      message: `An available appointment date was found: ${message.date}`,
      priority: 2
    });

    return true;
  } else if (message.action === 'noAvailableDates') {
    // Log when no available dates are found
    debugLog('No available dates found in date range:', message.range);

    // Show a notification to the user
    chrome.notifications.create({
      type: 'basic',
      iconUrl: 'icon128.png',
      title: 'No Visa Appointments Available',
      message: `No available appointments found between ${message.range.start} and ${message.range.end}`,
      priority: 1
    });

    return true;
  } else if (message.action === 'saveDebugContent') {
    // Handle saving debug content
    debugLog('Received debug content for saving:', {
      filename: message.filename,
      dateFound: message.dateFound,
      contentLength: message.content ? message.content.length : 0
    });

    try {
      // Create a blob with the HTML content
      const blob = new Blob([message.content], { type: 'text/html' });

      // Create a download URL
      const url = URL.createObjectURL(blob);

      // Create a download item
      chrome.downloads.download({
        url: url,
        filename: message.filename,
        saveAs: false
      }, (downloadId) => {
        if (chrome.runtime.lastError) {
          debugLog('Error saving debug content:', chrome.runtime.lastError);
        } else {
          debugLog('Debug content saved successfully with download ID:', downloadId);
        }

        // Clean up the URL object
        URL.revokeObjectURL(url);
      });
    } catch (error) {
      debugLog('Error processing debug content:', error);
    }

    return true;
  }
});