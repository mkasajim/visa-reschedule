/**
 * CAPTCHA Service to handle solving image and audio CAPTCHAs using Gemini and Groq APIs
 */

// Debug logging function
function captchaDebugLog(message, data = null) {
  const timestamp = new Date().toISOString();
  const logMessage = `[${timestamp}] [CAPTCHA-SERVICE] ${message}`;
  console.log(logMessage);
  if (data) {
    console.log(data);
  }
}

// In-browser implementation of Gemini API for image CAPTCHA
class GeminiService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.API_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-vision:generateContent';
    captchaDebugLog('GeminiService initialized', { apiKeyProvided: !!apiKey });
  }

  /**
   * Solve image CAPTCHA using Gemini Vision API
   * @param {string} imageDataUrl - Base64 image data
   * @returns {Promise<string>} - Solved CAPTCHA text
   */
  async solveCaptcha(imageDataUrl) {
    try {
      if (!this.apiKey) {
        throw new Error('Gemini API key not provided');
      }

      captchaDebugLog('Starting Gemini CAPTCHA solving...');

      // Extract base64 data from data URL
      const base64Data = imageDataUrl.split(',')[1];
      captchaDebugLog('Extracted base64 data from image', { dataLength: base64Data.length });
      
      // Prepare the request payload for Gemini
      const payload = {
        contents: [
          {
            parts: [
              {
                text: "Give the text in the image like this:\n{captcha: text}\n\nThe text should not contain any space"
              },
              {
                inline_data: {
                  mime_type: "image/png",
                  data: base64Data
                }
              }
            ]
          }
        ],
        generation_config: {
          temperature: 0,
          top_p: 0.95,
          top_k: 40,
          max_output_tokens: 8192,
          response_mime_type: "application/json"
        }
      };

      // Make the API request to Gemini
      captchaDebugLog('Sending request to Gemini API...');
      const response = await fetch(`${this.API_URL}?key=${this.apiKey}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        captchaDebugLog('Gemini API returned error', { 
          status: response.status, 
          statusText: response.statusText,
          errorText: errorText 
        });
        throw new Error(`Gemini API error: ${response.status} ${errorText}`);
      }

      captchaDebugLog('Received successful response from Gemini API');
      const result = await response.json();
      captchaDebugLog('Parsed JSON response', { result });
      
      // Extract CAPTCHA text from JSON response
      let captchaText = '';
      
      if (result.candidates && result.candidates.length > 0) {
        const content = result.candidates[0].content;
        if (content && content.parts && content.parts.length > 0) {
          const text = content.parts[0].text;
          captchaDebugLog('Extracted text from Gemini response', { text });
          
          // Try to parse JSON from the response text
          try {
            // Look for JSON-like structure in the text
            const jsonMatch = text.match(/\{.*\}/s);
            if (jsonMatch) {
              const jsonText = jsonMatch[0];
              captchaDebugLog('Found JSON structure in response', { jsonText });
              const jsonData = JSON.parse(jsonText);
              captchaText = jsonData.captcha;
              captchaDebugLog('Extracted captcha text from JSON', { captchaText });
            } else {
              // If no JSON found, extract alphanumeric text
              captchaDebugLog('No JSON structure found, extracting alphanumeric text');
              const alphanumeric = text.replace(/[^a-zA-Z0-9]/g, '');
              captchaText = alphanumeric;
              captchaDebugLog('Extracted alphanumeric text', { captchaText });
            }
          } catch (err) {
            captchaDebugLog('Error parsing Gemini response', { 
              error: err.toString(), 
              stack: err.stack 
            });
            // Extract alphanumeric text as a fallback
            const alphanumeric = text.replace(/[^a-zA-Z0-9]/g, '');
            captchaText = alphanumeric;
            captchaDebugLog('Fallback to alphanumeric extraction', { captchaText });
          }
        }
      }

      captchaDebugLog('Final CAPTCHA text from Gemini', { captchaText });
      return captchaText;
    } catch (error) {
      captchaDebugLog('Error in Gemini CAPTCHA solving', { 
        error: error.toString(), 
        stack: error.stack 
      });
      return null;
    }
  }
}

// In-browser implementation for audio CAPTCHA using external API
class GroqService {
  constructor(apiKey) {
    this.apiKey = apiKey;
    // Since Groq doesn't offer audio APIs directly usable in browser,
    // we'll have to use a proxy server or alternative approach
    this.API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
    captchaDebugLog('GroqService initialized', { apiKeyProvided: !!apiKey });
  }
  
  /**
   * This function would typically send audio data to your backend
   * which would then use Groq for processing. Browser extensions
   * can't directly use Groq's Node.js SDK.
   * 
   * @param {Blob} audioBlob - Audio data
   * @returns {Promise<string>} - Transcribed text
   */
  async solveAudioCaptcha(audioBlob) {
    try {
      if (!this.apiKey) {
        throw new Error('Groq API key not provided');
      }
      
      captchaDebugLog('Starting Groq audio CAPTCHA solving...', { 
        audioSize: audioBlob.size, 
        audioType: audioBlob.type 
      });
      
      // This is a browser-compatible method that might work with some APIs
      // but real implementation would require a backend proxy
      const formData = new FormData();
      formData.append('file', audioBlob, 'captcha.wav');
      formData.append('model', 'whisper-large-v3-turbo');
      formData.append('response_format', 'verbose_json');
      
      captchaDebugLog('Sending request to Groq API...');
      const response = await fetch(this.API_URL, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
        },
        body: formData
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        captchaDebugLog('Groq API returned error', { 
          status: response.status, 
          statusText: response.statusText,
          errorText: errorText 
        });
        throw new Error(`Groq API error: ${response.status} ${errorText}`);
      }
      
      captchaDebugLog('Received successful response from Groq API');
      const result = await response.json();
      captchaDebugLog('Parsed JSON response', { result });
      
      // Get the transcribed text
      let transcribedText = '';
      if (result && result.text) {
        captchaDebugLog('Raw transcription from Groq', { text: result.text });
        // Clean up the text (remove spaces, punctuation, etc.)
        transcribedText = result.text.replace(/\s+/g, '').replace(/[^\w]/g, '');
        captchaDebugLog('Cleaned transcription', { transcribedText });
      } else {
        captchaDebugLog('No text found in Groq response', { result });
      }
      
      return transcribedText;
    } catch (error) {
      captchaDebugLog('Error in Groq audio CAPTCHA solving', { 
        error: error.toString(), 
        stack: error.stack 
      });
      return null;
    }
  }
}

/**
 * Main CAPTCHA service that uses the appropriate API based on CAPTCHA type and user settings
 */
class CaptchaService {
  constructor() {
    this.geminiService = null;
    this.groqService = null;
    captchaDebugLog('CaptchaService initialized');
    this.loadSettings();
  }
  
  /**
   * Load API settings from storage
   */
  async loadSettings() {
    captchaDebugLog('Loading API settings from storage...');
    return new Promise((resolve) => {
      chrome.storage.local.get([
        'enableGemini', 
        'geminiApiKey', 
        'enableGroq', 
        'groqApiKey'
      ], (result) => {
        captchaDebugLog('API settings loaded', { 
          enableGemini: result.enableGemini, 
          geminiKeyProvided: !!result.geminiApiKey,
          enableGroq: result.enableGroq,
          groqKeyProvided: !!result.groqApiKey
        });
        
        if (result.enableGemini && result.geminiApiKey) {
          this.geminiService = new GeminiService(result.geminiApiKey);
          captchaDebugLog('Gemini service initialized');
        } else {
          captchaDebugLog('Gemini service not initialized - missing settings');
        }
        
        if (result.enableGroq && result.groqApiKey) {
          this.groqService = new GroqService(result.groqApiKey);
          captchaDebugLog('Groq service initialized');
        } else {
          captchaDebugLog('Groq service not initialized - missing settings');
        }
        
        resolve();
      });
    });
  }
  
  /**
   * Solve image CAPTCHA
   * @param {string} imageDataUrl - Base64 image data
   * @returns {Promise<string>} - Solved CAPTCHA text
   */
  async solveImageCaptcha(imageDataUrl) {
    captchaDebugLog('Starting image CAPTCHA solving...');
    await this.loadSettings();
    
    if (this.geminiService) {
      captchaDebugLog('Using Gemini service for image CAPTCHA');
      return await this.geminiService.solveCaptcha(imageDataUrl);
    } else {
      captchaDebugLog('Gemini service not available');
    }
    
    return null;
  }
  
  /**
   * Solve audio CAPTCHA
   * @param {Blob} audioBlob - Audio data
   * @returns {Promise<string>} - Transcribed text
   */
  async solveAudioCaptcha(audioBlob) {
    captchaDebugLog('Starting audio CAPTCHA solving...');
    await this.loadSettings();
    
    if (this.groqService) {
      captchaDebugLog('Using Groq service for audio CAPTCHA');
      return await this.groqService.solveAudioCaptcha(audioBlob);
    } else {
      captchaDebugLog('Groq service not available');
    }
    
    return null;
  }
}

// Export the service
window.CaptchaService = new CaptchaService();