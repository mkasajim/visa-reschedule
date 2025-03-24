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

// Initialize captcha counter from storage
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
          debugLog('On verification page, processing verification');
          processSensitiveVerification();
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
            debugLog('Successfully reached verification page');
            processSensitiveVerification();
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

async function processSensitiveVerification() {
  debugLog('Processing verification questions');
  
  // Get the form and questions using more robust selectors
  const form = document.getElementById('attributeVerification');
  const questionElements = document.querySelectorAll('#attributeList p.textInParagraph');
  const answerFields = document.querySelectorAll('#attributeList input[type="password"]');
  const continueButton = document.querySelector('#attributeVerification #continue');
  
  if (!form || !questionElements.length || !answerFields.length || !continueButton) {
    debugLog('Could not find verification form elements', { error: true });
    return false;
  }
  
  // Get username
  const usernameField = document.querySelector('#signInNameReadOnly');
  if (!usernameField) {
    debugLog('Could not find username field', { error: true });
    return false;
  }
  
  const username = usernameField.value;
  debugLog('Processing verification for user:', username);

  // Get saved security Q&A
  const result = await new Promise(resolve => {
    chrome.storage.local.get(['securityQA'], resolve);
  });

  if (!result.securityQA || !result.securityQA.length) {
    debugLog('No saved verification data found');
    showNotification('⚠️ No saved verification answers found. Please answer manually.');
    return false;
  }

  // Extract current questions - use aria-label like in the Python example
  const currentQuestions = Array.from(questionElements).map(el => 
    el.getAttribute('aria-label') || el.textContent.trim()
  );
  debugLog('Current questions:', currentQuestions);

  // Try to match and fill answers - track questions answered
  let answeredCount = 0;
  
  currentQuestions.forEach((currentQ, index) => {
    // Find exact matching saved question
    const matchingQA = result.securityQA.find(qa => 
      qa.question === currentQ
    );

    if (matchingQA && answerFields[index]) {
      debugLog('Found exact matching question:', currentQ);
      // Clear the field first before setting value
      answerFields[index].value = '';
      answerFields[index].value = matchingQA.answer;
      answeredCount++;
    }
  });

  if (answeredCount === currentQuestions.length) {
    debugLog('All verification questions answered automatically');
    showNotification('✅ Verification questions filled automatically');
    // Submit after a delay
    return new Promise(resolve => {
      setTimeout(() => {
        continueButton.click();
        resolve(true);
      }, 1000);
    });
  } else {
    debugLog(`Partially answered verification questions (${answeredCount}/${currentQuestions.length})`);
    showNotification('⚠️ Could not match all questions. Please verify and complete manually.');
    return false;
  }
}

function showNotification(message, duration = 8000) {
  const statusElement = document.createElement('div');
  statusElement.style.cssText = 'position: fixed; top: 10px; right: 10px; background: rgba(0,0,0,0.7); color: white; padding: 10px; border-radius: 5px; z-index: 10000;';
  statusElement.textContent = message;
  document.body.appendChild(statusElement);
  
  setTimeout(() => {
    if (statusElement.parentNode) {
      statusElement.parentNode.removeChild(statusElement);
    }
  }, duration);
}

// Function to extract and log security questions
function extractSecurityQuestions() {
  const username = document.querySelector('#signInNameReadOnly')?.value || 'Unknown';
  debugLog(`Detected security questions for user: ${username}`);
  
  // Get all paragraph elements with class 'textInParagraph'
  const questionElements = document.querySelectorAll('#attributeList p.textInParagraph');
  // Get all password input fields
  const answerFields = document.querySelectorAll('#attributeList input[type="password"]');
  
  if (!questionElements.length || !answerFields.length) {
    debugLog('Could not find security questions or answer fields', { error: true });
    return [];
  }

  // Extract questions and their current values
  const questions = Array.from(questionElements).map((el, index) => {
    const question = el.textContent.trim();
    const answer = answerFields[index] ? answerFields[index].value : '';
    
    return {
      question,
      answer,
      elementId: el.id,
      answerFieldId: answerFields[index] ? answerFields[index].id : null
    };
  });

  debugLog('Extracted security questions:', questions);
  return questions;
}

// Function to handle security questions
function handleSecurityQuestions() {
  debugLog('Handling security questions');
  const username = document.querySelector('#signInNameReadOnly')?.value || 'Unknown';
  debugLog('Detected security questions for user:', username);
  
  // Extract and log the security questions
  const questions = extractSecurityQuestions();
  if (questions && questions.length > 0) {
    debugLog('Found security questions:', questions);
    
    // Now also call processSensitiveVerification to attempt auto-fill
    processSensitiveVerification();
  } else {
    debugLog('No security questions found or extraction failed');
    showNotification('⚠️ Security questions must be answered manually for security reasons.');
  }
}