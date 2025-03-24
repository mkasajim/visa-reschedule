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
          debugLog('Created new tab for visa scheduling site');
        });
      }
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
  }
});