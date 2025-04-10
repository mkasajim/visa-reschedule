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

// Add custom styles to the page for our notifications
function injectCustomStyles() {
  const styleElement = document.createElement('style');
  styleElement.textContent = `
    .visa-reschedule-notification {
      position: fixed !important;
      top: 10px !important;
      right: 10px !important;
      background: rgba(0, 0, 0, 0.85) !important;
      color: white !important;
      padding: 15px !important;
      border-radius: 5px !important;
      z-index: 2147483647 !important; /* Maximum z-index value */
      font-size: 14px !important;
      max-width: 300px !important;
      box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3) !important;
      font-family: Arial, sans-serif !important;
      animation: fadeIn 0.3s ease-in-out !important;
      overflow: visible !important;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-10px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .visa-reschedule-notification button {
      position: absolute !important;
      top: 5px !important;
      right: 5px !important;
      background: none !important;
      border: none !important;
      color: white !important;
      cursor: pointer !important;
      font-size: 14px !important;
      padding: 0 !important;
      margin: 0 !important;
    }

    .visa-reschedule-notification button:hover {
      color: #ccc !important;
    }
  `;
  document.head.appendChild(styleElement);
  debugLog('Injected custom styles for notifications');
}

// Inject our custom styles on page load
injectCustomStyles();

// Listen for messages from the background script
chrome.runtime.onMessage.addListener((message) => {
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
  } else if (message.action === 'checkForReschedulePage') {
    debugLog('Check for reschedule page action received');

    // Check if we're already on the reschedule page
    if (isOnReschedulePage()) {
      debugLog('Already on reschedule page, handling it');
      handleReschedulePage();
    } else if (isOnMainDashboardPage()) {
      debugLog('On main dashboard page, looking for reschedule link');
      handleMainDashboardPage();
    } else {
      debugLog('Not on main dashboard or reschedule page, no action taken');
    }
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
        } else if (isOnReschedulePage()) {
          debugLog('On reschedule page with calendar, checking for available dates');
          handleReschedulePage();
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
  const notesHeader = document.querySelector('h2.font-serif-xl');
  const notesHeaderText = notesHeader ? notesHeader.textContent.trim() : '';
  const hasNotesAndInstructions = notesHeaderText.includes('Notes and Instructions');

  // More detailed debugging
  debugLog('Checking for main dashboard page elements:');
  debugLog('- Is usvisascheduling.com domain: ' + isVisaSchedulingDomain);
  debugLog('- Sidebar exists: ' + (sidebarElement ? 'Yes' : 'No'));
  debugLog('- Has Notes and Instructions header: ' + (hasNotesAndInstructions ? 'Yes' : 'No'));

  // If on usvisascheduling.com domain, we primarily look for sidebar or notes header
  if (isVisaSchedulingDomain && (sidebarElement || hasNotesAndInstructions)) {
    debugLog('✅ Detected main dashboard page on usvisascheduling.com');
    return true;
  } else {
    debugLog('⛔ Not on main dashboard page');
    return false;
  }
}

// Function to check if we're on the reschedule page with calendar
function isOnReschedulePage() {
  const datepicker = document.getElementById('datepicker');
  const hasDatepicker = datepicker && datepicker.classList.contains('hasDatepicker');

  debugLog('Checking for reschedule page elements:');
  debugLog('- Datepicker exists: ' + (datepicker ? 'Yes' : 'No'));
  debugLog('- Has hasDatepicker class: ' + (hasDatepicker ? 'Yes' : 'No'));

  return datepicker && hasDatepicker;
}

// Function to handle the main dashboard page
function handleMainDashboardPage() {
  debugLog('Handling main dashboard page');

  // Check for auto-reschedule option
  chrome.storage.local.get(['autoRescheduleEnabled'], (result) => {
    debugLog('Auto-reschedule setting: ' + (result.autoRescheduleEnabled ? 'Enabled' : 'Disabled'));

    if (result.autoRescheduleEnabled) {
      debugLog('Auto-reschedule is enabled, looking for reschedule link');

      // Start watching for the reschedule link if not already watching
      if (!window._rescheduleWatcherActive) {
        watchForRescheduleLink();
      }
    } else {
      debugLog('Auto-reschedule is disabled, not clicking on reschedule link');
    }
  });
}

// Watch for the appearance of the reschedule link
function watchForRescheduleLink() {
  // Set a flag to prevent multiple watchers
  window._rescheduleWatcherActive = true;

  debugLog('Starting watcher for reschedule link');
  showNotification('⏱️ Watching for reschedule link to appear...', 10000, true);

  // Store the last observed DOM state to detect changes
  let lastDomState = document.body.innerHTML.length;

  // Check periodically for changes and reschedule link
  const watchInterval = setInterval(() => {
    // Check for DOM changes
    const currentDomState = document.body.innerHTML.length;
    const domChanged = Math.abs(currentDomState - lastDomState) > 50; // Threshold to detect meaningful changes

    if (domChanged) {
      debugLog('Detected DOM change, checking for reschedule link');
      lastDomState = currentDomState;
    }

    // Find sidebar and reschedule link
    const sidebarElement = document.getElementById('atlas-sidebar');

    // First try to find the link by its ID in the sidebar
    let rescheduleLink = null;
    if (sidebarElement) {
      rescheduleLink = sidebarElement.querySelector('#reschedule_appointment');
    }

    // If sidebar exists but reschedule link not found by ID, try other selectors
    if (sidebarElement && !rescheduleLink) {
      // Try finding by the href containing reschedule=true
      rescheduleLink = sidebarElement.querySelector('a[href*="reschedule=true"]');

      // Try finding by text content containing "Reschedule"
      if (!rescheduleLink) {
        const allLinks = sidebarElement.querySelectorAll('a');
        for (const link of allLinks) {
          if (link.textContent.includes('Reschedule')) {
            rescheduleLink = link;
            break;
          }
        }
      }
    }

    // If reschedule link is found, click on it
    if (rescheduleLink) {
      debugLog('✅ Found reschedule link after waiting:', {
        id: rescheduleLink.id || 'no-id',
        href: rescheduleLink.href || 'no-href',
        text: rescheduleLink.textContent || 'no-text'
      });

      clearInterval(watchInterval);
      window._rescheduleWatcherActive = false;
      showNotification('🔄 Found reschedule link, navigating to reschedule page...');

      // Click with a delay to ensure stability
      setTimeout(() => {
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
    } else if (domChanged) {
      debugLog('DOM changed but reschedule link not found yet, continuing to watch');
    }
  }, 3000); // Check every 3 seconds

  // Set a timeout to stop watching after 5 minutes to prevent indefinite watching
  setTimeout(() => {
    if (window._rescheduleWatcherActive) {
      clearInterval(watchInterval);
      window._rescheduleWatcherActive = false;
      debugLog('⛔ Stopped watching for reschedule link after timeout (5 minutes)');
      showNotification('⚠️ Could not find reschedule link after waiting 5 minutes');
    }
  }, 5 * 60 * 1000);
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

function showNotification(message, duration = 8000, isPersistent = false) {
  // Remove any existing notifications first
  const existingNotifications = document.querySelectorAll('.visa-reschedule-notification');
  existingNotifications.forEach(notification => {
    if (notification.parentNode) {
      notification.parentNode.removeChild(notification);
    }
  });

  // Create notification element
  const statusElement = document.createElement('div');
  statusElement.className = 'visa-reschedule-notification';

  // Add an icon based on message type
  let icon = '🔄';
  if (message.includes('✅')) icon = '✅';
  if (message.includes('⚠️')) icon = '⚠️';
  if (message.includes('⏱️')) icon = '⏱️';
  if (message.includes('🔍')) icon = '🔍';

  statusElement.innerHTML = `<div style="font-weight: bold; margin-bottom: 5px;">${icon} Visa Reschedule Assistant</div>${message}`;

  // Add close button if persistent
  if (isPersistent) {
    const closeButton = document.createElement('button');
    closeButton.textContent = '✕';
    closeButton.addEventListener('click', () => {
      if (statusElement.parentNode) {
        statusElement.parentNode.removeChild(statusElement);
      }
    });
    statusElement.appendChild(closeButton);
  }

  document.body.appendChild(statusElement);

  // Remove the notification after specified duration unless it's persistent
  if (!isPersistent) {
    setTimeout(() => {
      if (statusElement.parentNode) {
        statusElement.parentNode.removeChild(statusElement);
      }
    }, duration);
  }

  // Log the notification
  debugLog(`Notification shown: ${message}`);

  return statusElement;
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

// Function to handle the reschedule page with calendar
function handleReschedulePage() {
  debugLog('Handling reschedule page with calendar');

  // Set up periodic calendar state logging for debugging
  setupPeriodicCalendarLogging();

  // Check if auto-reschedule is enabled
  chrome.storage.local.get(['autoRescheduleEnabled', 'startDate', 'endDate'], (result) => {
    if (!result.autoRescheduleEnabled) {
      debugLog('Auto-reschedule is disabled, not checking for available dates');
      return;
    }

    debugLog('Auto-reschedule is enabled, checking for dates in desired range');

    // Parse desired date range
    const startDate = result.startDate ? new Date(result.startDate) : null;
    const endDate = result.endDate ? new Date(result.endDate) : null;

    if (!startDate || !endDate) {
      debugLog('Missing date range settings', { error: true });
      showNotification('⚠️ Please set desired appointment date range in extension settings');
      return;
    }

    debugLog('Desired date range:', {
      start: startDate.toISOString().substring(0, 7), // YYYY-MM format
      end: endDate.toISOString().substring(0, 7)
    });

    // Start the process to check and navigate calendar
    processCalendar(startDate, endDate);
  });
}

// Function to process the calendar and find available dates
async function processCalendar(startDate, endDate) {
  debugLog('Processing calendar to find available dates');

  // Get current displayed month/year from datepicker
  const currentMonthSelect = document.querySelector('.ui-datepicker-month');
  const currentYearSelect = document.querySelector('.ui-datepicker-year');

  if (!currentMonthSelect || !currentYearSelect) {
    debugLog('Cannot find month/year selectors in datepicker', { error: true });
    showNotification('⚠️ Cannot access calendar selectors');
    return;
  }

  // Get current month and year values
  const currentMonth = parseInt(currentMonthSelect.value, 10);
  const currentYear = parseInt(currentYearSelect.value, 10);
  debugLog('Current calendar display:', { month: currentMonth + 1, year: currentYear });

  // Check if we need to navigate to start date first
  const startYear = startDate.getFullYear();
  const startMonth = startDate.getMonth(); // 0-based

  // If current displayed month/year is before our desired start date, navigate to start date
  if (currentYear < startYear || (currentYear === startYear && currentMonth < startMonth)) {
    debugLog('Navigating to start date:', { month: startMonth + 1, year: startYear });
    // Navigate to the start date
    await navigateToDate(startMonth, startYear);
  }

  // Start iterating through months to find available dates
  await findAvailableDates(startDate, endDate);
}

// Function to check if the calendar has fully loaded and updated
async function isCalendarFullyLoaded() {
  return new Promise((resolve) => {
    // Check if the calendar table exists
    const calendarTable = document.querySelector('.ui-datepicker-calendar');
    if (!calendarTable) {
      debugLog('Calendar table not found during load check');
      resolve(false);
      return;
    }

    // Check if any cells have been populated
    const allCells = calendarTable.querySelectorAll('td');
    if (allCells.length === 0) {
      debugLog('No calendar cells found during load check');
      resolve(false);
      return;
    }

    // Check if any green days are present (if they should be)
    // This is a more reliable indicator that the calendar has fully loaded with available dates
    const greenDays = calendarTable.querySelectorAll('td.greenday');
    const redDays = calendarTable.querySelectorAll('td.redday');

    // If we have either green or red days, the calendar has likely loaded its availability data
    if (greenDays.length > 0 || redDays.length > 0) {
      debugLog(`Calendar appears fully loaded with ${greenDays.length} green days and ${redDays.length} red days`);
      resolve(true);
      return;
    }

    // If we have cells but no colored days, the calendar might still be loading
    // Check if we have any date cells with content
    const dateCells = calendarTable.querySelectorAll('td:not(.ui-datepicker-other-month)');
    if (dateCells.length > 0) {
      debugLog(`Calendar has ${dateCells.length} date cells but no colored days yet`);
      resolve(false);
      return;
    }

    // Default to assuming not fully loaded
    debugLog('Calendar load state unclear, assuming not fully loaded');
    resolve(false);
  });
}

// Function to navigate to a specific month/year in the datepicker
async function navigateToDate(targetMonth, targetYear) {
  return new Promise(async (resolve) => {
    const monthSelect = document.querySelector('.ui-datepicker-month');
    const yearSelect = document.querySelector('.ui-datepicker-year');

    if (!monthSelect || !yearSelect) {
      debugLog('Cannot find month/year selectors for navigation', { error: true });
      resolve(false);
      return;
    }

    // Log the current state before navigation
    const currentMonth = parseInt(monthSelect.value, 10);
    const currentYear = parseInt(yearSelect.value, 10);
    debugLog('Current calendar state before navigation:', { month: currentMonth + 1, year: currentYear });

    // Set month and year values
    monthSelect.value = targetMonth;
    yearSelect.value = targetYear;

    // Trigger change events to update datepicker
    monthSelect.dispatchEvent(new Event('change'));
    yearSelect.dispatchEvent(new Event('change'));

    // Log the calendar state immediately after setting values
    debugLog('Calendar values set to:', { month: targetMonth + 1, year: targetYear });

    // Wait for datepicker to start updating (initial wait)
    await new Promise(r => setTimeout(r, 1000));

    // Check if the calendar has updated to the correct month/year
    const updatedMonth = parseInt(monthSelect.value, 10);
    const updatedYear = parseInt(yearSelect.value, 10);

    if (updatedMonth !== targetMonth || updatedYear !== targetYear) {
      debugLog('Calendar did not update to target month/year', {
        expected: { month: targetMonth + 1, year: targetYear },
        actual: { month: updatedMonth + 1, year: updatedYear }
      });

      // Try again with a direct click approach
      debugLog('Trying alternative navigation approach');
      monthSelect.value = targetMonth;
      yearSelect.value = targetYear;

      // Use click instead of change event
      const changeEvent = new MouseEvent('change', { bubbles: true });
      monthSelect.dispatchEvent(changeEvent);
      yearSelect.dispatchEvent(changeEvent);

      // Wait longer for the calendar to update
      await new Promise(r => setTimeout(r, 1500));
    }

    // Wait for the calendar to fully load with a timeout
    let attempts = 0;
    const maxAttempts = 5;
    const checkInterval = 500; // Check every 500ms

    const checkCalendarLoaded = async () => {
      attempts++;
      const isLoaded = await isCalendarFullyLoaded();

      if (isLoaded) {
        debugLog(`Calendar fully loaded after ${attempts} attempts`);
        // Log the calendar state after successful navigation
        logCalendarState();
        resolve(true);
        return;
      }

      if (attempts >= maxAttempts) {
        debugLog(`Calendar did not fully load after ${maxAttempts} attempts, proceeding anyway`);
        // Log the calendar state even if not fully loaded
        logCalendarState();
        resolve(true);
        return;
      }

      debugLog(`Calendar not fully loaded yet, attempt ${attempts}/${maxAttempts}`);
      setTimeout(checkCalendarLoaded, checkInterval);
    };

    // Start checking if the calendar is fully loaded
    checkCalendarLoaded();
  });
}

// Helper function to format date in a human-readable format
function formatDateHumanReadable(date) {
  if (!date) return '';

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const day = date.getDate();
  const month = monthNames[date.getMonth()];
  const year = date.getFullYear();

  return `${month} ${day}, ${year}`;
}

// Function to find available dates within the specified range
async function findAvailableDates(startDate, endDate) {
  debugLog('Starting search for available dates in range');

  // Show persistent notification that we're searching
  const searchingNotification = showNotification('🔍 Searching for available dates in the selected range...', 0, true);

  // Current date we're checking
  let currentCheckDate = new Date(startDate);
  currentCheckDate.setDate(1); // Start at the 1st of the month

  // End date's last day of month
  const lastDayEndDate = new Date(endDate.getFullYear(), endDate.getMonth() + 1, 0);
  debugLog('End boundary:', { date: lastDayEndDate.toISOString().split('T')[0] });

  // Flags to track if we found any available dates
  let foundAvailableDate = false;
  let foundDateInRange = false;

  // While the current month/year we're checking is within our desired range
  while (currentCheckDate <= lastDayEndDate) {
    debugLog('Checking month:', {
      month: currentCheckDate.getMonth() + 1,
      year: currentCheckDate.getFullYear()
    });

    // Navigate to the month we want to check
    await navigateToDate(currentCheckDate.getMonth(), currentCheckDate.getFullYear());

    // Look for any available dates in the current month
    let availableDate = findAvailableDateInCurrentMonth();

    // If no available date found on first attempt, try again after a short delay
    // This helps with cases where the calendar hasn't fully loaded yet
    if (!availableDate) {
      debugLog('No available dates found on first attempt, waiting and trying again...');
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Log the calendar state again
      logCalendarState();

      // Try again
      availableDate = findAvailableDateInCurrentMonth();

      if (availableDate) {
        debugLog('Found available date on second attempt!');
      }
    }

    if (availableDate) {
      const formattedDate = availableDate.toISOString().split('T')[0];
      const humanReadableDate = formatDateHumanReadable(availableDate);
      debugLog('✅ Found available date:', humanReadableDate);

      // Save the HTML content of the page for debugging
      savePageContentForDebug(formattedDate);

      // Verify this date is within our desired range
      // Create a new date object with time set to midnight for proper comparison
      const dateToCompare = new Date(availableDate.getFullYear(), availableDate.getMonth(), availableDate.getDate());
      const startDateMidnight = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());

      // For the end date, we need to use the last day of the month, not the first day
      // Get the last day of the month specified in endDate
      const endMonth = endDate.getMonth();
      const endYear = endDate.getFullYear();
      // Create a date for the last day of the month
      // This creates a date object for the last day of the specified month
      const endDateMidnight = new Date(endYear, endMonth + 1, 0);

      // Add one day to endDateMidnight to include the end date in the range (inclusive comparison)
      endDateMidnight.setDate(endDateMidnight.getDate() + 1);

      const isInRange = dateToCompare >= startDateMidnight && dateToCompare < endDateMidnight;
      debugLog('Date in range check:', {
        date: humanReadableDate,
        startDate: formatDateHumanReadable(startDate),
        endDate: formatDateHumanReadable(endDate),
        endDateLastDay: formatDateHumanReadable(new Date(endYear, endMonth + 1, 0)),
        isInRange: isInRange
      });

      // Always report found dates, even if outside the range
      foundAvailableDate = true;
      if (isInRange) {
        foundDateInRange = true;
      }

      // Remove the searching notification if it exists
      if (searchingNotification && searchingNotification.parentNode) {
        searchingNotification.parentNode.removeChild(searchingNotification);
      }

      // Show notification with download button
      const notificationElement = showNotification(`✅ Found available date: ${humanReadableDate}${isInRange ? '' : ' (outside preferred range)'}`, 30000);

      // Add a download button to the notification
      // const downloadButton = document.createElement('button');
      // downloadButton.textContent = '⬇️ Download HTML';
      // downloadButton.style.cssText = 'display: block; margin-top: 10px; padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;';
      // downloadButton.addEventListener('click', () => {
      //   // Create a manual download of the current page
      //   const htmlContent = document.documentElement.outerHTML;
      //   const blob = new Blob([htmlContent], { type: 'text/html' });
      //   const url = URL.createObjectURL(blob);
      //   const link = document.createElement('a');
      //   link.href = url;
      //   link.download = `visa_page_manual_download_${formattedDate}_${new Date().toISOString().replace(/[:.]/g, '-')}.html`;
      //   document.body.appendChild(link);
      //   link.click();
      //   document.body.removeChild(link);
      //   URL.revokeObjectURL(url);
      // });

      // // Add the button to the notification
      // if (notificationElement) {
      //   notificationElement.appendChild(downloadButton);
      // }

      // Notify background script about the found date
      chrome.runtime.sendMessage({
        action: 'foundAvailableDate',
        date: formattedDate
      });

      // Only proceed to click and select time if the date is within the desired range
      if (isInRange) {
        // Remove the searching notification if it exists
        if (searchingNotification && searchingNotification.parentNode) {
          searchingNotification.parentNode.removeChild(searchingNotification);
        }

        // Show notification with download button
        const notificationElement = showNotification(`✅ Found available date: ${humanReadableDate}`, 30000);

        // Add a download button to the notification
        // const downloadButton = document.createElement('button');
        // downloadButton.textContent = '⬇️ Download HTML';
        // downloadButton.style.cssText = 'display: block; margin-top: 10px; padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;';
        // downloadButton.addEventListener('click', () => {
        //   // Create a manual download of the current page
        //   const htmlContent = document.documentElement.outerHTML;
        //   const blob = new Blob([htmlContent], { type: 'text/html' });
        //   const url = URL.createObjectURL(blob);
        //   const link = document.createElement('a');
        //   link.href = url;
        //   link.download = `visa_page_manual_download_${formattedDate}_${new Date().toISOString().replace(/[:.]/g, '-')}.html`;
        //   document.body.appendChild(link);
        //   link.click();
        //   document.body.removeChild(link);
        //   URL.revokeObjectURL(url);
        // });

        // // Add the button to the notification
        // if (notificationElement) {
        //   notificationElement.appendChild(downloadButton);
        // }

        // Notify background script about the found date
        chrome.runtime.sendMessage({
          action: 'foundAvailableDate',
          date: formattedDate
        });

        // Click on the available date
        const dateElement = getDateElement(availableDate.getDate());
        if (dateElement) {
          debugLog('Clicking on available date');
          dateElement.click();

          // Wait for time selection to appear
          await waitForTimeSelection();

          // Check if time selection appeared
          const timeSelectionExists = document.querySelector('#time_select tbody tr');
          if (timeSelectionExists) {
            debugLog('Time selection menu appeared successfully');
            // Select the first available time slot
            const timeSlot = document.querySelector('#time_select input[type="radio"]');
            if (timeSlot) {
              // Get time slot details for notification
              const timeSlotRow = timeSlot.closest('tr');
              const timeText = timeSlotRow ? timeSlotRow.querySelector('td:nth-child(2)').textContent.trim() : '';
              const dateText = timeSlotRow ? timeSlotRow.querySelector('td:nth-child(1)').textContent.trim() : formattedDate;

              debugLog('Selecting time slot:', { id: timeSlot.id, time: timeText, date: dateText });
              timeSlot.click();

              // Save the HTML content again after time slot selection
              savePageContentForDebug(`${formattedDate}_time_${timeText.replace(/[: ]/g, '-')}`);

              // Update notification with time slot information and instruct user to submit manually
              // If dateText is in ISO format, try to convert it to human-readable format
              let displayDate = dateText;
              if (dateText.match(/^\d{4}-\d{2}-\d{2}$/)) {
                const dateObj = new Date(dateText);
                if (!isNaN(dateObj.getTime())) {
                  displayDate = formatDateHumanReadable(dateObj);
                }
              }
              // Check if auto-submit is enabled
              chrome.storage.local.get(['autoSubmitEnabled'], (result) => {
                const autoSubmitEnabled = result.autoSubmitEnabled || false;

                // Show different notification based on auto-submit setting
                let notificationMessage = `✅ Selected appointment: ${displayDate} at ${timeText}`;

                if (autoSubmitEnabled) {
                  notificationMessage += '\n\nAuto-submit is enabled. Submitting automatically...';
                } else {
                  notificationMessage += '\n\nPlease review and click the Submit button manually.';
                }

                const notificationElement = showNotification(notificationMessage, 30000);

                // If auto-submit is enabled, click the submit button
                if (autoSubmitEnabled) {
                  // Wait a moment to allow the UI to update and the submit button to become enabled
                  setTimeout(() => {
                    const submitButton = document.getElementById('submitbtn');
                    if (submitButton && !submitButton.disabled) {
                      debugLog('Auto-submit is enabled, clicking submit button');
                      submitButton.click();
                    } else if (submitButton && submitButton.disabled) {
                      debugLog('Submit button is disabled, cannot auto-submit', { error: true });
                      showNotification('⚠️ Cannot auto-submit: Submit button is disabled. Please check and submit manually.', 15000);
                    } else {
                      debugLog('Submit button not found, cannot auto-submit', { error: true });
                      showNotification('⚠️ Cannot auto-submit: Submit button not found. Please submit manually.', 15000);
                    }
                  }, 2000); // Wait 2 seconds before attempting to click submit
                }
              });

              // Add a download button to the notification
              // const downloadButton = document.createElement('button');
              // downloadButton.textContent = '⬇️ Download HTML';
              // downloadButton.style.cssText = 'display: block; margin-top: 10px; padding: 5px 10px; background: #4CAF50; color: white; border: none; border-radius: 3px; cursor: pointer;';
              // downloadButton.addEventListener('click', () => {
              //   // Create a manual download of the current page
              //   const htmlContent = document.documentElement.outerHTML;
              //   const blob = new Blob([htmlContent], { type: 'text/html' });
              //   const url = URL.createObjectURL(blob);
              //   const link = document.createElement('a');
              //   link.href = url;
              //   link.download = `visa_page_time_selected_${dateText.replace(/[\/:]/g, '-')}_${timeText.replace(/[: ]/g, '-')}_${new Date().toISOString().replace(/[:.]/g, '-')}.html`;
              //   document.body.appendChild(link);
              //   link.click();
              //   document.body.removeChild(link);
              //   URL.revokeObjectURL(url);
              // });

              // // Add the button to the notification
              // if (notificationElement) {
              //   notificationElement.appendChild(downloadButton);
              // }

              foundAvailableDate = true;
              break;
            } else {
              debugLog('No time slots available in the selection menu');
              showNotification('⚠️ No time slots available for this date. Continuing search...', 5000);
              continue;
            }
          } else {
            debugLog('Time selection menu did not appear, date may no longer be available');
            showNotification('⚠️ Selected date appears to be no longer available. Continuing search...', 5000);
            // Continue searching for other dates
            continue;
          }
        } else {
          debugLog('Could not find date element to click', { day: availableDate.getDate() });
        }
      } else {
        debugLog('Found date is outside desired range, continuing search');
      }
    }

    // If we didn't find a date, move to the next month
    currentCheckDate.setMonth(currentCheckDate.getMonth() + 1);

    // If we've gone beyond our end date, break the loop
    if (currentCheckDate > lastDayEndDate) {
      debugLog('Reached end of desired date range without finding available dates');
      break;
    }

    // Use the next month button as an alternative navigation method
    if (isNextMonthAvailable()) {
      debugLog('Using next month button for navigation');
      clickNextMonth();
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // If we didn't find any dates at all, or found dates but none in the preferred range
  if (!foundAvailableDate) {
    debugLog('No available dates found in the calendar');

    // Remove the searching notification if it exists
    if (searchingNotification && searchingNotification.parentNode) {
      searchingNotification.parentNode.removeChild(searchingNotification);
    }

    showNotification('⚠️ No available appointment dates found in the calendar', 15000);

    // Click on the "Visa Application Home" link when no dates are found
    clickVisaApplicationHomeLink(false);
  } else if (!foundDateInRange) {
    debugLog('Found available dates, but none within the preferred range');

    // Remove the searching notification if it exists
    if (searchingNotification && searchingNotification.parentNode) {
      searchingNotification.parentNode.removeChild(searchingNotification);
    }

    // Show a notification that dates are available but outside the preferred range
    const startMonthName = startDate.toLocaleString('default', { month: 'long' });
    const endMonthName = endDate.toLocaleString('default', { month: 'long' });
    showNotification(`⚠️ Available dates found, but outside your preferred range (${startMonthName} to ${endMonthName} ${endDate.getFullYear()})`, 15000);

    // Notify background script about dates found outside range
    chrome.runtime.sendMessage({
      action: 'datesFoundOutsideRange',
      range: {
        start: startDate.toISOString().split('T')[0],
        end: endDate.toISOString().split('T')[0]
      }
    });

    // Also click on the "Visa Application Home" link when dates are outside preferred range
    clickVisaApplicationHomeLink(true);
  }
}

// Function to find any available date in the currently displayed month
function findAvailableDateInCurrentMonth() {
  // Get current month and year from datepicker for logging
  const monthElement = document.querySelector('.ui-datepicker-month');
  const yearElement = document.querySelector('.ui-datepicker-year');
  const currentMonth = monthElement ? parseInt(monthElement.value, 10) + 1 : 'unknown'; // +1 for display (1-based)
  const currentYear = yearElement ? parseInt(yearElement.value, 10) : 'unknown';

  console.log(`Checking for available dates in current calendar view: ${currentMonth}/${currentYear}`);

  // Log the entire calendar table for debugging
  const calendarTable = document.querySelector('.ui-datepicker-calendar');
  if (calendarTable) {
    console.log('Calendar table HTML:', calendarTable.outerHTML);
  } else {
    console.log('Calendar table not found');
    return null; // Return null if calendar table not found
  }

  // Log all calendar cells for debugging
  logAllCalendarCells();

  // Make sure the calendar has cells before proceeding
  const allCells = calendarTable.querySelectorAll('td');
  if (allCells.length === 0) {
    debugLog('No calendar cells found, calendar may not be fully loaded');
    return null;
  }

  // First, look specifically for cells with greenday class as this is the most reliable indicator
  const greenDateCells = document.querySelectorAll('.ui-datepicker-calendar td.greenday');

  if (greenDateCells.length > 0) {
    debugLog(`Found ${greenDateCells.length} green dates`);
    console.log('=== AVAILABLE DATES (greenday cells) ===');

    // Log all available dates with their data attributes for debugging
    const availableDates = [];

    greenDateCells.forEach((cell, index) => {
      // Extract data attributes directly from the cell
      const dataMonth = cell.getAttribute('data-month');
      const dataYear = cell.getAttribute('data-year');
      const anchor = cell.querySelector('a');
      const dataDate = anchor ? anchor.getAttribute('data-date') || anchor.textContent.trim() : null;

      // Create a date object using the data attributes
      let dateObj = null;
      if (dataMonth !== null && dataYear !== null && dataDate !== null) {
        // Note: data-month is 0-based in the UI (0 = January)
        dateObj = new Date(parseInt(dataYear, 10), parseInt(dataMonth, 10), parseInt(dataDate, 10));
        const humanReadableDate = formatDateHumanReadable(dateObj);
        availableDates.push({
          index,
          cell: cell.outerHTML,
          dataMonth,
          dataYear,
          dataDate,
          dateObj,
          formattedDate: dateObj.toISOString().split('T')[0],
          humanReadableDate
        });

        console.log(`Available date ${index + 1}: ${humanReadableDate}`, {
          'data-month': parseInt(dataMonth, 10) + 1, // Convert to 1-based for display
          'data-year': dataYear,
          'data-date': dataDate,
          'cell HTML': cell.outerHTML
        });
      } else {
        console.log(`Could not extract complete date data from cell ${index + 1}:`, {
          'data-month': dataMonth,
          'data-year': dataYear,
          'data-date': dataDate,
          'cell HTML': cell.outerHTML
        });
      }
    });

    console.log('All available dates:', availableDates);

    // Return the first available date
    if (availableDates.length > 0) {
      if (availableDates[0].dateObj) {
        console.log('Returning date from availableDates array:', availableDates[0].formattedDate);
        return availableDates[0].dateObj;
      } else {
        console.log('dateObj missing in first available date, using formattedDate:', availableDates[0]);
      }
    }

    // Fallback to the old method if data attributes didn't work
    return extractDateFromCell(greenDateCells[0]);
  }

  // If no greenday cells found, try other selectors
  // Look for cells that are neither disabled nor red (available)
  const availableDateCells = document.querySelectorAll('.ui-datepicker-calendar td:not(.ui-datepicker-unselectable):not(.ui-state-disabled):not(.redday)');
  if (availableDateCells.length > 0) {
    debugLog(`Found ${availableDateCells.length} potential available dates`);
    return extractDateFromCell(availableDateCells[0]);
  }

  // Look for any cell that has a class containing "available"
  const availableCells = document.querySelectorAll('.ui-datepicker-calendar td[class*="available"]');
  if (availableCells.length > 0) {
    debugLog(`Found ${availableCells.length} available-class dates`);
    return extractDateFromCell(availableCells[0]);
  }

  // No available dates found
  debugLog('No available dates found in current month');
  return null;
}

// Helper function to extract date from a calendar cell
function extractDateFromCell(cell) {
  if (!cell) return null;

  // First try to use data attributes directly from the cell (most reliable)
  const dataMonth = cell.getAttribute('data-month');
  const dataYear = cell.getAttribute('data-year');
  const anchor = cell.querySelector('a');
  const dataDate = anchor ? anchor.getAttribute('data-date') || anchor.textContent.trim() : null;

  // If we have all data attributes, use them to create the date
  if (dataMonth !== null && dataYear !== null && dataDate !== null) {
    const month = parseInt(dataMonth, 10);
    const year = parseInt(dataYear, 10);
    const day = parseInt(dataDate, 10);

    if (!isNaN(month) && !isNaN(year) && !isNaN(day)) {
      const date = new Date(year, month, day);
      const humanReadableDate = formatDateHumanReadable(date);
      console.log('Extracted date from data attributes:', {
        day,
        month: month + 1, // Display 1-based month for readability
        monthName: date.toLocaleString('default', { month: 'long' }),
        year,
        humanReadable: humanReadableDate,
        full: date.toISOString(),
        cell: cell.outerHTML
      });
      return date;
    }
  }

  // Fallback to the old method if data attributes didn't work
  console.log('Falling back to traditional date extraction method');

  // Get the date from the cell
  const dateElement = cell.querySelector('a') || cell.querySelector('.ui-state-default');
  if (!dateElement) {
    console.log('No date element found in cell', { cell: cell.outerHTML });
    return null;
  }

  const dateText = dateElement.textContent.trim();
  const dateNum = parseInt(dateText, 10);

  if (isNaN(dateNum)) {
    console.log('Invalid date number', { text: dateText });
    return null;
  }

  // Get current month and year from datepicker
  const monthElement = document.querySelector('.ui-datepicker-month');
  const yearElement = document.querySelector('.ui-datepicker-year');

  if (!monthElement || !yearElement) {
    console.log('Month or year element not found');
    return null;
  }

  const currentMonth = parseInt(monthElement.value, 10);
  const currentYear = parseInt(yearElement.value, 10);

  if (isNaN(currentMonth) || isNaN(currentYear)) {
    console.log('Invalid month or year', { month: monthElement.value, year: yearElement.value });
    return null;
  }

  // Create a Date object for the available date
  const date = new Date(currentYear, currentMonth, dateNum);
  const humanReadableDate = formatDateHumanReadable(date);
  console.log('Extracted date using traditional method:', {
    day: dateNum,
    month: currentMonth + 1,
    monthName: date.toLocaleString('default', { month: 'long' }),
    year: currentYear,
    humanReadable: humanReadableDate,
    full: date.toISOString(),
    cell: cell.outerHTML
  });
  return date;
}

// Helper function to get a date element by day number
function getDateElement(day) {
  console.log('Looking for date element with day:', day);

  // First try to find in greenday cells using data-date attribute (most reliable)
  const greenCells = document.querySelectorAll('.ui-datepicker-calendar td.greenday');
  console.log(`Found ${greenCells.length} greenday cells`);

  for (const cell of greenCells) {
    // Try to get the date from data-date attribute first
    const anchor = cell.querySelector('a');
    const dataDate = anchor ? anchor.getAttribute('data-date') : null;

    // If data-date exists, use it
    if (dataDate !== null && parseInt(dataDate, 10) === day) {
      console.log('Found date element in greenday cell using data-date attribute', {
        'data-date': dataDate,
        'cell HTML': cell.outerHTML
      });
      return anchor;
    }

    // Otherwise fall back to text content
    const element = anchor || cell.querySelector('.ui-state-default');
    if (element && parseInt(element.textContent.trim(), 10) === day) {
      console.log('Found date element in greenday cell using text content', {
        'text': element.textContent.trim(),
        'cell HTML': cell.outerHTML
      });
      return element;
    }
  }

  // Then try all date elements
  const dateElements = document.querySelectorAll('.ui-datepicker-calendar .ui-state-default');
  console.log(`Found ${dateElements.length} date elements in calendar`);

  for (const element of dateElements) {
    // Try data-date attribute first
    const dataDate = element.getAttribute('data-date');
    let dayNum = dataDate !== null ? parseInt(dataDate, 10) : parseInt(element.textContent.trim(), 10);

    if (dayNum === day) {
      // Check if this element is in a clickable (non-disabled) cell
      const parentCell = element.closest('td');
      if (parentCell && !parentCell.classList.contains('ui-state-disabled') && !parentCell.classList.contains('ui-datepicker-unselectable')) {
        console.log('Found clickable date element', {
          'day': dayNum,
          'element HTML': element.outerHTML,
          'parent cell HTML': parentCell.outerHTML
        });
        return element;
      }
    }
  }

  console.log('Could not find clickable date element for day:', day);
  return null;
}

// Function to check if next month navigation is available
function isNextMonthAvailable() {
  const nextButton = document.querySelector('.ui-datepicker-next');
  return nextButton && !nextButton.classList.contains('ui-state-disabled');
}

// Function to click the next month button
function clickNextMonth() {
  const nextButton = document.querySelector('.ui-datepicker-next');
  if (nextButton) {
    nextButton.click();
    debugLog('Clicked next month button');
    return true;
  }
  return false;
}

// Function to click on the "Visa Application Home" link when no available dates are found
function clickVisaApplicationHomeLink(datesOutsideRange = false) {
  debugLog('Attempting to click on Visa Application Home link');

  // Find the link using the selector from the HTML structure
  const homeLink = document.querySelector('li.link a[title="Visa Application Home"]');

  if (homeLink) {
    debugLog('Found Visa Application Home link, clicking it');

    // Show different messages depending on whether dates were found outside range or no dates at all
    if (datesOutsideRange) {
      showNotification('🔄 Dates found outside preferred range. Returning to Visa Application Home...', 8000);
    } else {
      showNotification('🔄 No available dates found. Returning to Visa Application Home...', 8000);
    }

    // Add a small delay before clicking to ensure notification is visible
    setTimeout(() => {
      try {
        homeLink.click();
        debugLog('Successfully clicked on Visa Application Home link');
      } catch (error) {
        debugLog('Error clicking on Visa Application Home link:', { error: error.toString() });
        // Try direct navigation as fallback
        if (homeLink.href) {
          window.location.href = homeLink.href;
          debugLog('Navigating directly to Visa Application Home URL');
        } else {
          // Last resort - navigate to root
          window.location.href = '/';
          debugLog('Navigating to root URL as fallback');
        }
      }
    }, 1500);

    return true;
  } else {
    debugLog('Could not find Visa Application Home link');
    showNotification('⚠️ Could not find Home link to navigate back', 8000);
    return false;
  }
}

// Set up periodic logging of calendar state for debugging
function setupPeriodicCalendarLogging() {
  // Check if we already have a logging interval set up
  if (window._calendarLoggingInterval) {
    clearInterval(window._calendarLoggingInterval);
  }

  if (window._calendarInitialLoggingInterval) {
    clearInterval(window._calendarInitialLoggingInterval);
  }

  // Log immediately
  logCalendarState();

  // Set up more frequent logging for the first 10 seconds (initial load period)
  // This helps catch the transition when the calendar first loads with available dates
  let initialLogCount = 0;
  window._calendarInitialLoggingInterval = setInterval(() => {
    initialLogCount++;
    logCalendarState('INITIAL_LOAD');

    // Stop the frequent logging after 10 attempts (about 10 seconds)
    if (initialLogCount >= 10) {
      clearInterval(window._calendarInitialLoggingInterval);
      debugLog('Completed initial frequent calendar logging');
    }
  }, 1000); // Log every 1 second initially

  // Then set up periodic logging every 30 seconds for ongoing monitoring
  window._calendarLoggingInterval = setInterval(() => {
    logCalendarState('PERIODIC');
  }, 30000); // 30 seconds

  console.log('Set up periodic calendar logging: every 1 second for first 10 seconds, then every 30 seconds');
}

// Function to log the current state of the calendar
function logCalendarState(logType = 'STANDARD') {
  const timestamp = new Date().toISOString();
  console.log(`\n=== CALENDAR STATE LOG [${timestamp}] [${logType}] ===`);

  // Log current month/year
  const monthElement = document.querySelector('.ui-datepicker-month');
  const yearElement = document.querySelector('.ui-datepicker-year');
  const currentMonthIndex = monthElement ? parseInt(monthElement.value, 10) : -1;
  const currentYear = yearElement ? parseInt(yearElement.value, 10) : 'unknown';

  // Get month name instead of number
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const currentMonthName = currentMonthIndex >= 0 ? monthNames[currentMonthIndex] : 'unknown';

  console.log(`Current calendar view: ${currentMonthName} ${currentYear}`);

  // Log green day cells
  const greenDayCells = document.querySelectorAll('.ui-datepicker-calendar td.greenday');
  console.log(`Number of greenday cells: ${greenDayCells.length}`);

  if (greenDayCells.length > 0) {
    Array.from(greenDayCells).forEach((cell, index) => {
      const dataMonth = cell.getAttribute('data-month');
      const dataYear = cell.getAttribute('data-year');
      const anchor = cell.querySelector('a');
      const dataDate = anchor ? anchor.getAttribute('data-date') || anchor.textContent.trim() : null;

      console.log(`Greenday cell ${index + 1}:`, {
        'data-month': dataMonth,
        'data-year': dataYear,
        'data-date': dataDate,
        'cell HTML': cell.outerHTML
      });
    });
  }

  // Log all calendar cells
  logAllCalendarCells();

  console.log(`=== END CALENDAR STATE LOG [${timestamp}] [${logType}] ===\n`);
}

// Function to log all calendar cells for detailed debugging
function logAllCalendarCells() {
  console.log('=== LOGGING ALL CALENDAR CELLS ===');

  const calendarTable = document.querySelector('.ui-datepicker-calendar');
  if (!calendarTable) {
    console.log('Calendar table not found for cell logging');
    return;
  }

  // Get all cells in the calendar
  const allCells = calendarTable.querySelectorAll('td');
  console.log(`Total calendar cells: ${allCells.length}`);

  // Log each cell with its attributes and classes
  Array.from(allCells).forEach((cell, index) => {
    const classes = Array.from(cell.classList);
    const dataMonth = cell.getAttribute('data-month');
    const dataYear = cell.getAttribute('data-year');
    const anchor = cell.querySelector('a');
    const dataDate = anchor ? anchor.getAttribute('data-date') || anchor.textContent.trim() : null;
    const isGreenDay = cell.classList.contains('greenday');
    const isRedDay = cell.classList.contains('redday');
    const isDisabled = cell.classList.contains('ui-state-disabled') || cell.classList.contains('ui-datepicker-unselectable');

    console.log(`Cell ${index + 1}:`, {
      classes,
      'data-month': dataMonth,
      'data-year': dataYear,
      'data-date': dataDate,
      isGreenDay,
      isRedDay,
      isDisabled,
      'cell HTML': cell.outerHTML
    });
  });

  console.log('=== END OF CALENDAR CELLS LOG ===');
}

// Function to save the page content for debugging
function savePageContentForDebug(dateFound) {
  try {
    console.log('Saving page content for debugging...');

    // Get the complete HTML of the page
    let htmlContent = document.documentElement.outerHTML;

    // Log the first 1000 characters to console for immediate viewing
    console.log('Page HTML preview (first 1000 chars):', htmlContent.substring(0, 1000));

    // Create a timestamp for the filename
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `visa_page_with_date_${dateFound}_${timestamp}.html`;

    // Create a debug info section to add to the HTML
    let debugInfo = `
    <!-- ===== DEBUG INFORMATION ===== -->
    <style>
      #debug-toggle-button {
        position: fixed;
        top: 10px;
        right: 10px;
        background: #4CAF50;
        color: white;
        border: none;
        padding: 10px 15px;
        border-radius: 5px;
        cursor: pointer;
        z-index: 9999;
        font-weight: bold;
      }
      #debug-toggle-button:hover {
        background: #45a049;
      }
      #visa-reschedule-debug-info {
        font-family: Arial, sans-serif;
        padding: 20px;
        background: #f9f9f9;
        border: 1px solid #ddd;
        margin: 20px;
        border-radius: 5px;
      }
      #visa-reschedule-debug-info table {
        width: 100%;
        border-collapse: collapse;
        margin: 15px 0;
      }
      #visa-reschedule-debug-info th, #visa-reschedule-debug-info td {
        border: 1px solid #ddd;
        padding: 8px;
        text-align: left;
      }
      #visa-reschedule-debug-info th {
        background-color: #f2f2f2;
      }
      #visa-reschedule-debug-info tr:nth-child(even) {
        background-color: #f9f9f9;
      }
    </style>
    <button id="debug-toggle-button" onclick="document.getElementById('visa-reschedule-debug-info').style.display = document.getElementById('visa-reschedule-debug-info').style.display === 'none' ? 'block' : 'none';">Toggle Debug Info</button>
    <div id="visa-reschedule-debug-info" style="display:none;">
      <h2>Visa Reschedule Debug Information</h2>
      <p><strong>Date Found:</strong> ${dateFound}</p>
      <p><strong>Timestamp:</strong> ${new Date().toISOString()}</p>

      <h3>Calendar State</h3>
    `;

    // Add current month/year information
    const monthElement = document.querySelector('.ui-datepicker-month');
    const yearElement = document.querySelector('.ui-datepicker-year');
    const currentMonthIndex = monthElement ? parseInt(monthElement.value, 10) : -1;
    const currentYear = yearElement ? parseInt(yearElement.value, 10) : 'unknown';

    // Get month name instead of number
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December'
    ];
    const currentMonthName = currentMonthIndex >= 0 ? monthNames[currentMonthIndex] : 'unknown';

    debugInfo += `
      <p>Current Calendar View: ${currentMonthName} ${currentYear}</p>
    `;

    // Add calendar table information
    const calendarTable = document.querySelector('.ui-datepicker-calendar');
    if (calendarTable) {
      debugInfo += `
      <h4>Calendar Table</h4>
      <div class="debug-calendar-table">
        ${calendarTable.outerHTML}
      </div>
      `;
      console.log('Calendar table at time of date detection:', calendarTable.outerHTML);
    }

    // Add green day cells information
    const greenDayCells = document.querySelectorAll('.ui-datepicker-calendar td.greenday');
    debugInfo += `
      <h4>Green Day Cells (${greenDayCells.length})</h4>
      <ul>
    `;
    console.log(`Number of greenday cells at time of detection: ${greenDayCells.length}`);

    Array.from(greenDayCells).forEach((cell, index) => {
      const dataMonth = cell.getAttribute('data-month');
      const dataYear = cell.getAttribute('data-year');
      const anchor = cell.querySelector('a');
      const dataDate = anchor ? anchor.getAttribute('data-date') || anchor.textContent.trim() : null;

      debugInfo += `
        <li>
          <p>Green Day Cell ${index + 1}:</p>
          <ul>
            <li>data-month: ${dataMonth}</li>
            <li>data-year: ${dataYear}</li>
            <li>data-date: ${dataDate}</li>
            <li>HTML: ${cell.outerHTML.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</li>
          </ul>
        </li>
      `;
      console.log(`Greenday cell ${index + 1}:`, cell.outerHTML);
    });

    debugInfo += `
      </ul>
    `;

    // Add all calendar cells information
    const allCells = document.querySelectorAll('.ui-datepicker-calendar td');
    debugInfo += `
      <h4>All Calendar Cells (${allCells.length})</h4>
      <table border="1" style="border-collapse: collapse;">
        <tr>
          <th>Cell #</th>
          <th>Classes</th>
          <th>data-month</th>
          <th>data-year</th>
          <th>data-date</th>
          <th>Is Green Day</th>
          <th>Is Red Day</th>
          <th>Is Disabled</th>
        </tr>
    `;

    Array.from(allCells).forEach((cell, index) => {
      const classes = Array.from(cell.classList).join(', ');
      const dataMonth = cell.getAttribute('data-month');
      const dataYear = cell.getAttribute('data-year');
      const anchor = cell.querySelector('a');
      const dataDate = anchor ? anchor.getAttribute('data-date') || anchor.textContent.trim() : null;
      const isGreenDay = cell.classList.contains('greenday');
      const isRedDay = cell.classList.contains('redday');
      const isDisabled = cell.classList.contains('ui-state-disabled') || cell.classList.contains('ui-datepicker-unselectable');

      debugInfo += `
        <tr>
          <td>${index + 1}</td>
          <td>${classes}</td>
          <td>${dataMonth || 'N/A'}</td>
          <td>${dataYear || 'N/A'}</td>
          <td>${dataDate || 'N/A'}</td>
          <td>${isGreenDay ? 'Yes' : 'No'}</td>
          <td>${isRedDay ? 'Yes' : 'No'}</td>
          <td>${isDisabled ? 'Yes' : 'No'}</td>
        </tr>
      `;
    });

    debugInfo += `
      </table>

      <h3>Time Selection Information</h3>
    `;

    // Add time selection information if available
    const timeSelectionTable = document.querySelector('#time_select');
    if (timeSelectionTable) {
      debugInfo += `
      <h4>Time Selection Table</h4>
      <div class="debug-time-selection">
        ${timeSelectionTable.outerHTML}
      </div>
      `;
    } else {
      debugInfo += `
      <p>No time selection table found at the time of detection.</p>
      `;
    }

    // Add page URL
    debugInfo += `
      <h3>Page Information</h3>
      <p><strong>URL:</strong> ${window.location.href}</p>
      <p><strong>Generated:</strong> ${new Date().toISOString()}</p>
    </div>
    <!-- ===== END DEBUG INFORMATION ===== -->
    `;

    // Insert the debug info before the closing body tag
    htmlContent = htmlContent.replace('</body>', `${debugInfo}</body>`);

    // Send the content to background script for saving
    chrome.runtime.sendMessage({
      action: 'saveDebugContent',
      content: htmlContent,
      filename: filename,
      dateFound: dateFound
    });

    console.log('Page content saved for debugging with enhanced debug information');
  } catch (error) {
    console.error('Error saving page content:', error);
  }
}

// Function to wait for time selection to appear
async function waitForTimeSelection() {
  debugLog('Waiting for time selection menu to appear');

  // Wait for up to 5 seconds for the time selection to appear
  const maxWaitTime = 5000; // 5 seconds
  const checkInterval = 200; // Check every 200ms
  const maxAttempts = maxWaitTime / checkInterval;

  let attempts = 0;

  return new Promise(resolve => {
    const checkTimeSelection = () => {
      attempts++;
      const timeSelectionExists = document.querySelector('#time_select tbody tr');

      if (timeSelectionExists) {
        debugLog(`Time selection appeared after ${attempts * checkInterval}ms`);
        resolve(true);
        return;
      }

      if (attempts >= maxAttempts) {
        debugLog('Timed out waiting for time selection menu');
        resolve(false);
        return;
      }

      setTimeout(checkTimeSelection, checkInterval);
    };

    // Start checking
    checkTimeSelection();
  });
}

