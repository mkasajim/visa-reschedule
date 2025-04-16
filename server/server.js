const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const fsSync = require('fs');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');
const robot = require('robotjs');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = 3000;
const TEMP_DIR = path.join(__dirname, 'temp');
const MAX_RETRIES = 3; // Maximum number of retries for captcha solving

// File to store saved mouse positions
const POSITIONS_FILE = path.join(__dirname, 'saved-positions.json');

// Store saved positions
let savedPositions = {};

/**
 * Refines captcha text to ensure it only contains uppercase letters and numbers
 * @param {string} text - The raw captcha text to refine
 * @returns {string} - The refined captcha text
 */
function refineCaptchaText(text) {
    if (!text) return '';

    // Step 1: Keep only alphanumeric characters (letters and numbers)
    // This preserves both uppercase and lowercase letters
    let refined = text.replace(/[^a-zA-Z0-9]/g, '');

    // Step 2: Convert all letters to uppercase
    // This converts any lowercase letters to uppercase rather than removing them
    refined = refined.toUpperCase();

    console.log('Refining captcha text:', { original: text, afterFiltering: refined });

    return refined;
}

/**
 * Validates if the captcha text meets our requirements
 * @param {string} text - The captcha text to validate
 * @returns {boolean} - Whether the text is valid
 */
function isValidCaptchaText(text) {
    if (!text) return false;

    // Check if text contains only uppercase letters and numbers
    // Note: At this point, all lowercase letters should have been converted to uppercase
    const isValid = /^[A-Z0-9]{4,8}$/.test(text);

    console.log('Validating captcha text:', { text, isValid, length: text.length });

    return isValid;
}

// Ensure temp directory exists
async function ensureTempDir() {
    try {
        await fs.mkdir(TEMP_DIR, { recursive: true });
    } catch (error) {
        console.error('Error creating temp directory:', error);
    }
}

// Save base64 image to temp file
async function saveBase64Image(base64Data) {
    const fileName = `captcha_${Date.now()}.png`;
    const filePath = path.join(TEMP_DIR, fileName);

    // Remove data:image/png;base64, prefix if present
    const base64Image = base64Data.replace(/^data:image\/\w+;base64,/, '');

    await fs.writeFile(filePath, base64Image, 'base64');
    return filePath;
}

/**
 * Solve captcha with retry mechanism
 * @param {string} imageData - Base64 image data
 * @param {string} apiKey - Gemini API key
 * @param {number} retryCount - Current retry count
 * @returns {Promise<{success: boolean, captchaText?: string, error?: string}>} - Result object
 */
async function solveCaptchaWithRetry(imageData, apiKey, retryCount = 0) {
    try {
        // Save image to temp file
        const imagePath = await saveBase64Image(imageData);
        console.log(`Attempt #${retryCount + 1} - Saved image to:`, imagePath);

        // Initialize Gemini
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

        // Read the image file
        const imageBytes = await fs.readFile(imagePath);

        // Create chat session
        const result = await model.generateContent([
            {
                inlineData: {
                    data: imageBytes.toString('base64'),
                    mimeType: "image/png"
                }
            },
            {
                text: "You are a CAPTCHA solving assistant. Your task is to identify the text in the image.\n\nRules:\n1. The response MUST be in valid JSON format.\n2. The text should not contain any spaces.\n3. Include only LETTERS and NUMBERS (no special characters).\n4. Return ONLY the JSON object, nothing else.\n\nGive the text in the image like this:\n{\n  \"captcha\": \"ABCD123\"\n}\n\nNote: If you see lowercase letters, you can include them. They will be automatically converted to uppercase."
            }
        ]);

        // Clean up temp file
        await fs.unlink(imagePath);

        const response = result.response;
        const responseText = response.text();
        console.log(`Attempt #${retryCount + 1} - Gemini response:`, responseText);

        // Extract captcha text
        // First try to parse as JSON
        try {
            // Look for JSON-like structure in the text
            const jsonMatch = responseText.match(/\{.*\}/s);
            if (jsonMatch) {
                const jsonText = jsonMatch[0];
                console.log(`Attempt #${retryCount + 1} - Found JSON structure:`, jsonText);

                try {
                    const jsonData = JSON.parse(jsonText);
                    if (jsonData.captcha) {
                        const refinedCaptcha = refineCaptchaText(jsonData.captcha);
                        console.log(`Attempt #${retryCount + 1} - Successfully parsed JSON with captcha:`, jsonData.captcha);
                        console.log(`Attempt #${retryCount + 1} - Refined captcha text:`, refinedCaptcha);

                        if (isValidCaptchaText(refinedCaptcha)) {
                            return {
                                success: true,
                                captchaText: refinedCaptcha
                            };
                        } else {
                            console.log(`Attempt #${retryCount + 1} - Refined captcha text is invalid:`, refinedCaptcha);
                        }
                    }
                } catch (jsonError) {
                    console.log(`Attempt #${retryCount + 1} - Error parsing JSON:`, jsonError.message);
                }
            }
        } catch (error) {
            console.log(`Attempt #${retryCount + 1} - Error in JSON extraction:`, error.message);
        }

        // Fallback to regex pattern
        const captchaMatch = responseText.match(/"captcha":\s*"([^"]+)"/);
        if (captchaMatch) {
            const refinedCaptcha = refineCaptchaText(captchaMatch[1]);
            console.log(`Attempt #${retryCount + 1} - Extracted captcha via regex:`, captchaMatch[1]);
            console.log(`Attempt #${retryCount + 1} - Refined captcha text:`, refinedCaptcha);

            if (isValidCaptchaText(refinedCaptcha)) {
                return {
                    success: true,
                    captchaText: refinedCaptcha
                };
            } else {
                console.log(`Attempt #${retryCount + 1} - Refined captcha text is invalid:`, refinedCaptcha);
            }
        }

        // Try to extract alphanumeric text as fallback
        console.log(`Attempt #${retryCount + 1} - No JSON structure found, trying to extract alphanumeric text`);
        // Keep all letters (both uppercase and lowercase) and numbers
        let alphanumeric = responseText.replace(/[^a-zA-Z0-9]/g, '');
        if (alphanumeric && alphanumeric.length > 0 && alphanumeric.length <= 8) {
            const refinedCaptcha = refineCaptchaText(alphanumeric);
            console.log(`Attempt #${retryCount + 1} - Extracted alphanumeric text:`, alphanumeric);
            console.log(`Attempt #${retryCount + 1} - Refined captcha text:`, refinedCaptcha);

            if (isValidCaptchaText(refinedCaptcha)) {
                return {
                    success: true,
                    captchaText: refinedCaptcha
                };
            } else {
                console.log(`Attempt #${retryCount + 1} - Refined captcha text is invalid:`, refinedCaptcha);
            }
        }

        // Check if we should retry
        if (retryCount < MAX_RETRIES - 1) {
            console.log(`Non-JSON response received. Retrying (${retryCount + 1}/${MAX_RETRIES}) after delay...`);
            // Add a delay before retrying (1 second * retry count)
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return await solveCaptchaWithRetry(imageData, apiKey, retryCount + 1);
        }

        return {
            success: false,
            error: 'Could not extract captcha text from response after multiple attempts'
        };
    } catch (error) {
        console.error(`Attempt #${retryCount + 1} - Error solving captcha:`, error);

        // Check if we should retry
        if (retryCount < MAX_RETRIES - 1) {
            console.log(`Error occurred. Retrying (${retryCount + 1}/${MAX_RETRIES}) after delay...`);
            // Add a delay before retrying (1 second * retry count)
            await new Promise(resolve => setTimeout(resolve, 1000 * (retryCount + 1)));
            return await solveCaptchaWithRetry(imageData, apiKey, retryCount + 1);
        }

        return {
            success: false,
            error: error.message
        };
    }
}

app.post('/solve-captcha', async (req, res) => {
    try {
        const { imageData, apiKey } = req.body;

        if (!imageData || !apiKey) {
            return res.status(400).json({
                success: false,
                error: 'Missing image data or API key'
            });
        }

        // Use the retry mechanism to solve the captcha
        const result = await solveCaptchaWithRetry(imageData, apiKey);
        return res.json(result);

    } catch (error) {
        console.error('Unexpected error in solve-captcha endpoint:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Endpoint to save captcha image for debugging
app.post('/save-captcha', async (req, res) => {
    try {
        const { imageData } = req.body;

        if (!imageData) {
            return res.status(400).json({
                success: false,
                error: 'Missing image data'
            });
        }

        // Save image to temp file
        const imagePath = await saveBase64Image(imageData);
        console.log('Saved captcha image for debugging:', imagePath);

        return res.json({
            success: true,
            filePath: imagePath
        });
    } catch (error) {
        console.error('Error saving captcha image:', error);
        return res.status(500).json({
            success: false,
            error: error.message
        });
    }
});

// Load saved positions from file if it exists
function loadSavedPositions() {
    try {
        if (fsSync.existsSync(POSITIONS_FILE)) {
            const data = fsSync.readFileSync(POSITIONS_FILE, 'utf8');
            savedPositions = JSON.parse(data);
            console.log('Loaded saved positions:', savedPositions);
        }
    } catch (err) {
        console.error('Error loading saved positions:', err);
    }
}

// Save positions to file
function savePositionsToFile() {
    try {
        fsSync.writeFileSync(POSITIONS_FILE, JSON.stringify(savedPositions, null, 2));
        console.log('Saved positions to file');
    } catch (err) {
        console.error('Error saving positions to file:', err);
    }
}

// Mouse automation endpoints

// Endpoint to get current mouse position
app.get('/mouse/position', (req, res) => {
    const mousePos = robot.getMousePos();
    console.log('Current mouse position:', mousePos);
    res.json(mousePos);
});

// Endpoint to save a position with a name
app.post('/mouse/save-position', (req, res) => {
    const { name, position } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Position name is required' });
    }

    // If position is provided, use it; otherwise, use current mouse position
    let positionToSave;
    if (position && typeof position.x === 'number' && typeof position.y === 'number') {
        positionToSave = position;
        console.log(`Using provided position for "${name}":`, positionToSave);
    } else {
        positionToSave = robot.getMousePos();
        console.log(`Using current mouse position for "${name}":`, positionToSave);
    }

    savedPositions[name] = positionToSave;
    savePositionsToFile();

    console.log(`Saved position "${name}":`, positionToSave);
    res.json({ success: true, position: positionToSave });
});

// Endpoint to save current position after a delay
app.post('/mouse/save-position-delayed', (req, res) => {
    const { name, delayMs = 2000 } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Position name is required' });
    }

    // Send immediate response to prevent client waiting
    res.json({ success: true, message: `Will save position after ${delayMs}ms delay` });

    // Wait for the specified delay
    setTimeout(() => {
        try {
            const mousePos = robot.getMousePos();
            savedPositions[name] = mousePos;
            savePositionsToFile();

            console.log(`Saved position "${name}" after ${delayMs}ms delay:`, mousePos);
        } catch (err) {
            console.error(`Error saving position after delay:`, err);
        }
    }, delayMs);
});

// Endpoint to get all saved positions
app.get('/mouse/saved-positions', (req, res) => {
    res.json(savedPositions);
});

// Endpoint to click at a saved position
app.post('/mouse/click-saved', (req, res) => {
    const { name, button = 'left', double = false } = req.body;

    if (!name) {
        return res.status(400).json({ error: 'Position name is required' });
    }

    const position = savedPositions[name];
    if (!position) {
        return res.status(404).json({ error: `No saved position with name "${name}"` });
    }

    // Save current mouse position to restore later
    const currentPos = robot.getMousePos();

    // Move to the saved position
    robot.moveMouse(position.x, position.y);

    // Perform the click
    if (double) {
        robot.mouseClick(button);
        setTimeout(() => {
            robot.mouseClick(button);
        }, 100);
    } else {
        robot.mouseClick(button);
    }

    console.log(`Clicked at saved position "${name}":`, position);

    // Optional: Move mouse back to original position
    setTimeout(() => {
        robot.moveMouse(currentPos.x, currentPos.y);
    }, 200);

    res.json({ success: true });
});

// Endpoint to click at a specific position
app.post('/mouse/click', (req, res) => {
    const { x, y, button = 'left', double = false } = req.body;

    if (x === undefined || y === undefined) {
        return res.status(400).json({ error: 'Coordinates (x, y) are required' });
    }

    // Save current mouse position to restore later
    const currentPos = robot.getMousePos();

    // Move to the specified position
    robot.moveMouse(x, y);

    // Perform the click
    if (double) {
        robot.mouseClick(button);
        setTimeout(() => {
            robot.mouseClick(button);
        }, 100);
    } else {
        robot.mouseClick(button);
    }

    console.log(`Clicked at position (${x}, ${y})`);

    // Optional: Move mouse back to original position
    setTimeout(() => {
        robot.moveMouse(currentPos.x, currentPos.y);
    }, 200);

    res.json({ success: true });
});

// Endpoint to delete a saved position
app.delete('/mouse/position/:name', (req, res) => {
    const { name } = req.params;

    if (!savedPositions[name]) {
        return res.status(404).json({ error: `No saved position with name "${name}"` });
    }

    delete savedPositions[name];
    savePositionsToFile();

    console.log(`Deleted saved position "${name}"`);
    res.json({ success: true });
});

// Start server
ensureTempDir().then(() => {
    // Load saved positions
    loadSavedPositions();

    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
        console.log('Available endpoints:');
        console.log('- POST /solve-captcha - Solve captcha with Gemini');
        console.log('- POST /save-captcha - Save captcha image for debugging');
        console.log('- GET /mouse/position - Get current mouse position');
        console.log('- POST /mouse/save-position - Save current position with a name');
        console.log('- GET /mouse/saved-positions - Get all saved positions');
        console.log('- POST /mouse/click-saved - Click at a saved position');
        console.log('- POST /mouse/click - Click at specific coordinates');
        console.log('- DELETE /mouse/position/:name - Delete a saved position');
    });
});
