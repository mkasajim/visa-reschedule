// Content script - runs in the context of the web page

// Create a debug logging function that prepends timestamps
function debugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(data);
  }
}

// Ensure captcha debug directory exists in extension storage
let captchaCounter = 0;
chrome.storage.local.get(['captchaCounter'], (result) => {
  captchaCounter = result.captchaCounter || 0;
});

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'performLogin') {
    debugLog('Login action received');
    // Check if we're already logged in
    if (!isOnLoginPage()) {
      debugLog('Already logged in or not on login page');
      // Check if on security questions page
      if (isOnSecurityQuestionsPage()) {
        debugLog('On security questions page, handling security questions');
        handleSecurityQuestions();
      }
      return;
    }
    
    // If we're on the login page, perform login
    performLogin();
  }
});

// Auto-execute when loaded on the visa scheduling site
checkAndHandlePage();

// Function to check the current page and handle accordingly
function checkAndHandlePage() {
  // Give the page some time to fully load
  setTimeout(() => {
    // Check if auto login is enabled
    chrome.storage.local.get(['autoLoginEnabled'], (result) => {
      if (result.autoLoginEnabled) {
        if (isOnLoginPage()) {
          debugLog('On login page, performing login');
          performLogin();
        } else if (isOnSecurityQuestionsPage()) {
          debugLog('On security questions page, handling security questions');
          handleSecurityQuestions();
        }
      } else {
        debugLog('Auto login disabled, doing nothing');
      }
    });
  }, 2000);
}

// Function to check if we're on the login page
function isOnLoginPage() {
  const isAtlasLogin = window.location.hostname.includes('atlasauth.b2clogin.com');
  const usernameField = document.getElementById('signInName');
  const passwordField = document.getElementById('password');
  const captchaImage = document.getElementById('captchaImage');
  
  return isAtlasLogin && usernameField && passwordField && captchaImage;
}

// Function to check if we're on the security questions page
function isOnSecurityQuestionsPage() {
  const isAtlasLogin = window.location.hostname.includes('atlasauth.b2clogin.com');
  const form = document.getElementById('attributeVerification');
  const questions = document.querySelectorAll('#attributeList p.textInParagraph');
  const answers = document.querySelectorAll('#attributeList input[type="password"]');
  
  return isAtlasLogin && form && questions.length > 0 && answers.length > 0;
}

// Function to perform login
function performLogin() {
  debugLog('Starting login process');
  
  // Get saved credentials
  chrome.storage.local.get(['username', 'password'], async (result) => {
    if (!result.username || !result.password) {
      debugLog('No saved credentials found', { error: true });
      return;
    }
    
    try {
      // Get form elements
      const usernameField = document.getElementById('signInName');
      const passwordField = document.getElementById('password');
      const captchaInput = document.getElementById('extension_atlasCaptchaResponse');
      const signInButton = document.getElementById('continue');
      
      if (!usernameField || !passwordField || !captchaInput || !signInButton) {
        debugLog('Could not find login form elements', { error: true });
        return;
      }
      
      // Clear fields using JavaScript to avoid autofill issues
      clearFormFields(usernameField, passwordField);
      
      // Fill in the form
      usernameField.value = result.username;
      passwordField.value = result.password;
      
      // Handle CAPTCHA
      const captchaText = await solveCaptcha();
      if (captchaText) {
        debugLog('Solved CAPTCHA:', captchaText);
        captchaInput.value = captchaText;
        
        // Submit form
        signInButton.click();
        
        // Check result after submission
        setTimeout(() => {
          if (isOnLoginPage()) {
            // Check for CAPTCHA error
            const captchaError = document.getElementById('claimVerificationServerError');
            if (captchaError && captchaError.style.display !== 'none') {
              debugLog('CAPTCHA validation failed, trying again', { error: true });
              const refreshButton = document.getElementById('captchaRefreshImage');
              if (refreshButton) {
                refreshButton.click();
                setTimeout(() => performLogin(), 2000);
              }
            }
          } else if (isOnSecurityQuestionsPage()) {
            debugLog('Successfully reached security questions page');
            handleSecurityQuestions();
          }
        }, 5000);
      } else {
        debugLog('Failed to solve CAPTCHA', { error: true });
        // Display a message to inform the user that manual CAPTCHA entry is required
        showManualCaptchaNotification();
      }
    } catch (error) {
      debugLog('Login process error:', { error: error.toString(), stack: error.stack });
    }
  });
}

// Function to clear form fields
function clearFormFields(usernameField, passwordField) {
  // Using executeScript to manipulate form directly
  usernameField.value = '';
  passwordField.value = '';
  
  // Prevent autofill
  usernameField.setAttribute('autocomplete', 'off');
  passwordField.setAttribute('autocomplete', 'off');
}

// Function to show notification for manual CAPTCHA entry
function showManualCaptchaNotification() {
  // Display a message to inform the user
  const statusElement = document.createElement('div');
  statusElement.style.cssText = 'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; padding: 10px; border-radius: 5px; z-index: 10000;';
  statusElement.textContent = '⚠️ CAPTCHA must be solved manually. Please enter the CAPTCHA text.';
  document.body.appendChild(statusElement);
  
  // Remove the notification after 8 seconds
  setTimeout(() => {
    if (statusElement.parentNode) {
      statusElement.parentNode.removeChild(statusElement);
    }
  }, 8000);
}

// Function to solve CAPTCHA
async function solveCaptcha() {
  try {
    debugLog('Attempting to solve CAPTCHA');
    
    // Increment captcha counter to use as unique ID for saved files
    captchaCounter++;
    chrome.storage.local.set({ captchaCounter: captchaCounter });
    
    // Try image CAPTCHA with Gemini
    const imageResult = await tryImageCaptcha();
    if (imageResult) {
      debugLog('Successfully solved image CAPTCHA:', imageResult);
      return imageResult;
    }
    
    debugLog('CAPTCHA solving failed', { error: true });
    return null;
  } catch (error) {
    debugLog('Error solving CAPTCHA:', { error: error.toString(), stack: error.stack });
    return null;
  }
}

// Function to save file to downloads
async function saveToDisk(dataUrl, filename) {
  try {
    // Create a download link
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = filename;
    
    // Append to document, click and remove
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Log success
    debugLog(`File saved to disk: ${filename}`);
    return true;
  } catch (error) {
    debugLog(`Error saving file to disk: ${filename}`, { 
      error: error.toString(), 
      stack: error.stack 
    });
    return false;
  }
}

// Function to store file in extension storage
async function storeInExtensionStorage(key, data) {
  return new Promise((resolve) => {
    const storageObj = {};
    storageObj[key] = data;
    chrome.storage.local.set(storageObj, () => {
      debugLog(`Data stored in extension storage with key: ${key}`);
      resolve(true);
    });
  });
}

// Function to try solving CAPTCHA with image
async function tryImageCaptcha() {
  try {
    debugLog('Trying image CAPTCHA...');
    
    // Get the CAPTCHA image
    const captchaImage = document.getElementById('captchaImage');
    if (!captchaImage) {
      debugLog('CAPTCHA image not found', { error: true });
      return null;
    }
    
    debugLog('CAPTCHA image found, converting to data URL...');
    
    // Convert CAPTCHA image to data URL
    const imageDataUrl = await captchaImageToDataUrl(captchaImage);
    if (!imageDataUrl) {
      debugLog('Failed to convert CAPTCHA image to data URL', { error: true });
      return null;
    }
    
    debugLog('Successfully converted CAPTCHA image to data URL');

    // Get Gemini API key from storage
    const settings = await new Promise((resolve) => {
      chrome.storage.local.get(['geminiApiKey'], resolve);
    });

    if (!settings.geminiApiKey) {
      debugLog('Gemini API key not found', { error: true });
      return null;
    }

    // Send request to local server
    debugLog('Sending request to local server...');
    const response = await fetch('http://localhost:3000/solve-captcha', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        imageData: imageDataUrl,
        apiKey: settings.geminiApiKey
      })
    });

    const result = await response.json();
    
    if (result.success) {
      debugLog('Successfully solved captcha:', result.captchaText);
      return result.captchaText;
    } else {
      debugLog('Failed to solve captcha:', result.error);
      return null;
    }
  } catch (error) {
    debugLog('Error trying image CAPTCHA:', { 
      error: error.toString(), 
      stack: error.stack 
    });
    return null;
  }
}

// Function to convert CAPTCHA image to data URL
async function captchaImageToDataUrl(imageElement) {
  return new Promise((resolve) => {
    try {
      debugLog('Drawing image to canvas...');
      const canvas = document.createElement('canvas');
      canvas.width = imageElement.naturalWidth || imageElement.width;
      canvas.height = imageElement.naturalHeight || imageElement.height;
      
      debugLog('Image dimensions:', { 
        width: canvas.width, 
        height: canvas.height 
      });
      
      const ctx = canvas.getContext('2d');
      ctx.drawImage(imageElement, 0, 0);
      
      const dataUrl = canvas.toDataURL('image/png');
      debugLog('Successfully created data URL from image');
      resolve(dataUrl);
    } catch (error) {
      debugLog('Error converting image to data URL:', { 
        error: error.toString(), 
        stack: error.stack 
      });
      resolve(null);
    }
  });
}

// Function to handle security questions
function handleSecurityQuestions() {
  debugLog('Handling security questions');
  
  // Get the form and questions
  const form = document.getElementById('attributeVerification');
  const questions = document.querySelectorAll('#attributeList p.textInParagraph');
  const answerFields = document.querySelectorAll('#attributeList input[type="password"]');
  const continueButton = document.querySelector('#attributeVerification #continue');
  
  if (!form || !questions.length || !answerFields.length || !continueButton) {
    debugLog('Could not find security questions form elements', { error: true });
    return;
  }
  
  // Get username
  const usernameField = document.querySelector('#signInNameReadOnly');
  if (!usernameField) {
    debugLog('Could not find username field', { error: true });
    return;
  }
  
  const username = usernameField.value;
  debugLog('Detected security questions for user:', username);
  
  // Display a message to inform the user
  const statusElement = document.createElement('div');
  statusElement.style.cssText = 'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; padding: 10px; border-radius: 5px; z-index: 10000;';
  statusElement.textContent = '⚠️ Security questions must be answered manually for security reasons.';
  document.body.appendChild(statusElement);
  
  // Remove the notification after 8 seconds
  setTimeout(() => {
    if (statusElement.parentNode) {
      statusElement.parentNode.removeChild(statusElement);
    }
  }, 8000);
}