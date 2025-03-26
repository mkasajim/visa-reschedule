const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const { GoogleGenerativeAI } = require('@google/generative-ai');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const PORT = 3000;
const TEMP_DIR = path.join(__dirname, 'temp');

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

app.post('/solve-captcha', async (req, res) => {
    try {
        const { imageData, apiKey } = req.body;
        
        if (!imageData || !apiKey) {
            return res.status(400).json({ 
                success: false, 
                error: 'Missing image data or API key' 
            });
        }

        // Save image to temp file
        const imagePath = await saveBase64Image(imageData);
        console.log('Saved image to:', imagePath);

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
                text: "Give the text in the image like this:\n[\n  {\n    \"captcha\": captchaText\n  }\n]\n\nThe text should not contain any space"
            }
        ]);

        // Clean up temp file
        await fs.unlink(imagePath);

        const response = result.response;
        console.log('Gemini response:', response.text());

        // Extract captcha text
        const captchaMatch = response.text().match(/"captcha":\s*"([^"]+)"/);
        if (captchaMatch) {
            return res.json({ 
                success: true, 
                captchaText: captchaMatch[1] 
            });
        }

        return res.json({ 
            success: false, 
            error: 'Could not extract captcha text from response' 
        });

    } catch (error) {
        console.error('Error solving captcha:', error);
        return res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// Start server
ensureTempDir().then(() => {
    app.listen(PORT, () => {
        console.log(`Server running on http://localhost:${PORT}`);
    });
});
