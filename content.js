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
        } else if (isOnMainDashboardPage()) {
          debugLog('On main dashboard page, checking for reschedule option');
          handleMainDashboardPage();
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

// Function to check if we're on the main dashboard page after login
function isOnMainDashboardPage() {
  // Check for the main Dashboard elements specifically for usvisascheduling.com
  const isVisaSchedulingDomain = window.location.hostname.includes('usvisascheduling.com');
  const sidebarElement = document.getElementById('atlas-sidebar');
  const appointmentCard = document.getElementById('appointment-card');
  
  // More detailed debugging
  debugLog('Checking for main dashboard page elements:');
  debugLog('- Is usvisascheduling.com domain: ' + isVisaSchedulingDomain);
  debugLog('- Sidebar exists: ' + (sidebarElement ? 'Yes' : 'No'));
  debugLog('- Appointment card exists: ' + (appointmentCard ? 'Yes' : 'No'));
  
  // If on usvisascheduling.com domain, we primarily look for sidebar
  if (isVisaSchedulingDomain && sidebarElement) {
    debugLog('✅ Detected main dashboard page on usvisascheduling.com');
    return true;
  } else if (appointmentCard && sidebarElement) {
    // Fallback for other domains
    debugLog('✅ Detected main dashboard page');
    return true;
  } else {
    debugLog('⛔ Not on main dashboard page');
    return false;
  }
}

// Function to handle the main dashboard page
function handleMainDashboardPage() {
  debugLog('Handling main dashboard page');
  
  // Check for auto-reschedule option
  chrome.storage.local.get(['autoRescheduleEnabled'], (result) => {
    debugLog('Auto-reschedule setting: ' + (result.autoRescheduleEnabled ? 'Enabled' : 'Disabled'));
    
    if (result.autoRescheduleEnabled) {
      debugLog('Auto-reschedule is enabled, looking for reschedule link');
      
      // On usvisascheduling.com, we know the exact ID and path from the provided HTML
      const isVisaSchedulingDomain = window.location.hostname.includes('usvisascheduling.com');
      debugLog('Is usvisascheduling.com domain: ' + isVisaSchedulingDomain);
      
      if (isVisaSchedulingDomain) {
        // Try to find the exact reschedule link as shown in the provided HTML
        const rescheduleLink = document.querySelector('#atlas-sidebar a#reschedule_appointment');
        
        if (rescheduleLink) {
          debugLog('✅ Found reschedule link by exact ID:', {
            id: rescheduleLink.id,
            href: rescheduleLink.href,
            text: rescheduleLink.textContent
          });
          
          showNotification('🔄 Automatically navigating to reschedule page...');
          
          // Click with a small delay to ensure the page is fully loaded
          setTimeout(() => {
            debugLog('Clicking reschedule link');
            try {
              rescheduleLink.click();
              debugLog('Clicked reschedule link successfully');
            } catch (error) {
              debugLog('Error clicking link, trying direct navigation:', error);
              if (rescheduleLink.href) {
                window.location.href = rescheduleLink.href;
              }
            }
          }, 1000);
          return;
        } else {
          // Try alternative selector for usvisascheduling.com
          debugLog('Could not find link by #reschedule_appointment ID, trying fallback selectors');
          
          // Try to find the link that contains "Reschedule Appointment" text
          const sidebarLinks = document.querySelectorAll('#atlas-sidebar li a');
          debugLog(`Found ${sidebarLinks.length} links in the sidebar`);
          
          // Look for the link with 'Reschedule Appointment' text or href containing 'reschedule=true'
          let matchingLink = null;
          for (let i = 0; i < sidebarLinks.length; i++) {
            const link = sidebarLinks[i];
            debugLog(`Examining link ${i}:`, {
              id: link.id,
              href: link.href,
              text: link.textContent
            });
            
            if (link.textContent.includes('Reschedule Appointment') || 
                link.href.includes('reschedule=true')) {
              matchingLink = link;
              break;
            }
          }
          
          if (matchingLink) {
            debugLog('✅ Found matching reschedule link:', {
              id: matchingLink.id,
              href: matchingLink.href,
              text: matchingLink.textContent
            });
            
            showNotification('🔄 Found reschedule link, clicking now...');
            setTimeout(() => {
              try {
                matchingLink.click();
              } catch (error) {
                debugLog('Error clicking link, trying direct navigation:', error);
                if (matchingLink.href) {
                  window.location.href = matchingLink.href;
                }
              }
            }, 1000);
            return;
          }
        }
      }
      
      // Fallback to more general selectors
      debugLog('⛔ Specific selectors failed, trying broader search');
      
      // First, try finding by ID (exact match from the HTML)
      let rescheduleLink = document.querySelector('#reschedule_appointment');
      
      // If not found by ID, try finding by the sidebar structure from the user's HTML
      if (!rescheduleLink) {
        debugLog('Link not found by ID, trying to find in sidebar structure');
        
        // Try to find in the sidebar based on the user's HTML structure
        const sidebarLinks = document.querySelectorAll('#atlas-sidebar li a');
        debugLog(`Found ${sidebarLinks.length} links in the sidebar`);
        
        // Log all sidebar links for debugging
        Array.from(sidebarLinks).forEach((link, index) => {
          debugLog(`Sidebar link ${index}:`, {
            id: link.id,
            href: link.href,
            text: link.textContent
          });
        });
        
        // Find the one that matches reschedule
        rescheduleLink = Array.from(sidebarLinks).find(link => {
          return link.id === 'reschedule_appointment' || 
                 link.textContent.toLowerCase().includes('reschedule') ||
                 (link.href && link.href.toLowerCase().includes('reschedule'));
        });
        
        if (rescheduleLink) {
          debugLog('Found reschedule link in sidebar:', {
            id: rescheduleLink.id,
            href: rescheduleLink.href,
            text: rescheduleLink.textContent
          });
        }
      }
      
      // Add more detailed debugging about the link
      if (rescheduleLink) {
        debugLog('✅ Found reschedule link:', {
          id: rescheduleLink.id,
          href: rescheduleLink.href,
          text: rescheduleLink.textContent,
          visible: rescheduleLink.offsetParent !== null
        });
        
        showNotification('🔄 Automatically navigating to reschedule page...');
        
        // Click with a small delay to ensure the page is fully loaded
        setTimeout(() => {
          debugLog('Attempting to click on reschedule link');
          try {
            // Try direct click
            rescheduleLink.click();
            debugLog('Clicked reschedule link');
            
            // Check if click was successful after a short delay
            setTimeout(() => {
              debugLog('Current URL after click attempt: ' + window.location.href);
            }, 2000);
          } catch (error) {
            debugLog('Error clicking reschedule link:', error);
            
            // Try alternate methods if direct click fails
            debugLog('Trying alternate click method');
            const clickEvent = new MouseEvent('click', {
              bubbles: true,
              cancelable: true,
              view: window
            });
            rescheduleLink.dispatchEvent(clickEvent);
            
            // If that fails, try navigating directly
            setTimeout(() => {
              if (rescheduleLink.href) {
                debugLog('Trying direct navigation to: ' + rescheduleLink.href);
                window.location.href = rescheduleLink.href;
              }
            }, 500);
          }
        }, 1000);
      } else {
        debugLog('⛔ Reschedule link not found by ID or in sidebar, trying broader search');
        
        // Try broader selectors - any link with reschedule in text or href
        const allLinks = document.querySelectorAll('a');
        debugLog(`Found ${allLinks.length} total links on the page`);
        
        let rescheduleLinks = Array.from(allLinks).filter(link => 
          link.textContent.toLowerCase().includes('reschedule') || 
          (link.href && link.href.toLowerCase().includes('reschedule'))
        );
        
        if (rescheduleLinks.length > 0) {
          debugLog('Found alternative reschedule links:', rescheduleLinks.map(l => ({
            id: l.id, 
            href: l.href, 
            text: l.textContent
          })));
          
          // Click the first match
          showNotification('🔄 Found reschedule link by text, clicking now...');
          setTimeout(() => {
            rescheduleLinks[0].click();
          }, 1000);
        } else {
          // Log all links for debugging
          debugLog('All links on the page for debugging:', Array.from(allLinks).map(l => ({
            id: l.id,
            href: l.href || '',
            text: l.textContent.substring(0, 30) // Truncate text to keep log manageable
          })));
          
          debugLog('⛔ Could not find any reschedule link', { error: true });
          showNotification('⚠️ Could not find the reschedule link');
        }
      }
    } else {
      debugLog('Auto-reschedule is disabled, not clicking on reschedule link');
    }
  });
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

// Function to check if we're on a visa-related page
function checkIfVisaPage() {
  // Check if we're on the usvisascheduling.com domain directly
  const isVisaSchedulingDomain = window.location.hostname.includes('usvisascheduling.com');
  
  if (isVisaSchedulingDomain) {
    debugLog('✅ Detected usvisascheduling.com domain directly');
    return true;
  }
  
  // Look for common elements that would indicate we're on a visa scheduling site
  const possibleVisaPageIndicators = [
    document.getElementById('atlas-sidebar'),
    document.querySelector('.usa-sidenav'),
    document.querySelector('a[href*="reschedule"]'),
    document.querySelector('a[id*="reschedule"]'),
    // Check if any h2 contains "Visa" text (can't use :contains in querySelector)
    Array.from(document.querySelectorAll('h2')).some(el => el.textContent.includes('Visa')),
    document.getElementById('appointment-card')
  ];
  
  const isVisaPage = possibleVisaPageIndicators.some(el => el !== null && el !== false);
  debugLog('Visa page detection result: ' + (isVisaPage ? 'Yes' : 'No'));
  
  return isVisaPage;
}