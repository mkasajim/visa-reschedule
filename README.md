# Visa Reschedule Assistant

A Chrome extension to automate login to usvisascheduling.com and find available appointment dates.

## Features

- Automated login with saved credentials
- Handles redirection to atlasauth.b2clogin.com for authentication
- Auto-detection of login page and security questions
- Automatic reschedule date finding within a specified date range
- Intelligent detection of reschedule links even when delayed loading
- Simple toggle switches to enable/disable automation features
- Optional CAPTCHA solving with Gemini (for image) and Groq (for audio)
- Debug logging with CAPTCHA image/audio saving
- Desktop notifications when available dates are found

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" at the top right
4. Click "Load unpacked" and select the folder containing the extension files
5. The extension should now appear in your Chrome toolbar

## Usage

1. Click on the extension icon in your Chrome toolbar to open the popup
2. Enter your usvisascheduling.com username and password, then click "Save"
3. (Optional) Enter your Gemini and/or Groq API keys to enable automatic CAPTCHA solving
4. Set your desired appointment date range using the "From" and "To" month selectors
5. Toggle the "Enable Auto Login" switch to enable automatic login
6. Toggle the "Enable Auto Reschedule" switch to enable automatic date finding
7. The extension will:
   - Open the visa scheduling site (if not already open)
   - Automatically log in (if enabled)
   - Navigate to the reschedule page (even if the link appears after a delay)
   - Search for available dates within your specified range
   - Automatically select the earliest available date if found

## Main Dashboard Detection

The extension has been improved to reliably detect the main dashboard page even when elements load with delays:

1. It can detect the dashboard page by the presence of the "Notes and Instructions" header
2. It continuously monitors for DOM changes to find the reschedule link when it appears
3. A notification will be displayed while waiting for the reschedule link to appear
4. After finding the link, it will automatically navigate to the reschedule page

This ensures the extension works even when page elements load asynchronously or are delayed.

## Date Range Selection

The extension includes a date range selector that allows you to:

1. Specify the earliest month you'd accept for an appointment
2. Specify the latest month you'd accept for an appointment
3. The extension will automatically navigate through months in the calendar and look for any available dates
4. When an available date is found, it will:
   - Display a notification
   - Automatically select that date
   - Show a confirmation message on the page

If no dates are available in your selected range, you'll receive a notification.

## CAPTCHA Solving

This extension supports two methods for automatic CAPTCHA solving:

- **Image CAPTCHA**: Using Google's Gemini API
- **Audio CAPTCHA**: Using Groq's Whisper API implementation

To enable these features:
1. Obtain API keys from [Google AI Studio](https://makersuite.google.com/) for Gemini and [Groq](https://console.groq.com/) for Groq
2. Enter these API keys in the extension popup
3. Toggle the corresponding checkbox(es) to enable the service(s)

If the automatic CAPTCHA solving fails or if no API keys are provided, you will need to solve CAPTCHAs manually.

## Debug Capabilities

The extension includes comprehensive debugging features:

1. **Detailed Logging**: All operations are logged with timestamps in the browser console, making it easy to track the login and CAPTCHA solving process.

2. **CAPTCHA Image and Audio Saving**: 
   - Whenever a CAPTCHA is encountered, the image and audio files are automatically saved to your Downloads folder.
   - Files are named with a sequential counter (e.g., `captcha_image_1.png`, `captcha_audio_1.wav`).
   - You can use these saved files to test and debug CAPTCHA solving issues.

3. **Extension Storage**:
   - CAPTCHA images and audio are also stored in the extension's local storage for reference.
   - This data can be viewed in the Chrome DevTools under the "Application" tab > "Storage" > "Local Storage".

To access logs and debug information:
1. Open Chrome DevTools (F12 or Right-click > Inspect)
2. Go to the "Console" tab
3. Filter logs by typing "[CAPTCHA-SERVICE]" or timestamp format to focus on specific parts of the process

## Notes

- This extension handles the redirection from usvisascheduling.com to atlasauth.b2clogin.com for authentication.
- API calls for CAPTCHA solving go directly from your browser to the respective API services. No intermediate servers are used.
- Your API keys and login credentials are stored locally in your browser's storage and are never sent to any third-party servers except the official API endpoints.
- Security questions must be answered manually for security reasons.

## Disclaimer

This extension is provided for educational purposes only. Use at your own risk. The author is not responsible for any issues that may arise from using this extension.

## License

MIT