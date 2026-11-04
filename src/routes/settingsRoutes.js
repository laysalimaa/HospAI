const express = require('express');
const router = express.Router();
const Database = require('../db/database');

// GET settings
router.get('/', (req, res) => {
  try {
    const settings = Database.getSettings();
    // Mask API key for security if present
    const masked = { ...settings };
    if (masked.gemini_api_key && masked.gemini_api_key.length > 8) {
      masked.gemini_api_key_masked = masked.gemini_api_key.slice(0, 4) + '...' + masked.gemini_api_key.slice(-4);
    }
    res.json({ success: true, data: masked });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT update settings
router.put('/', (req, res) => {
  try {
    const body = req.body;
    for (const [key, value] of Object.entries(body)) {
      Database.updateSetting(key, String(value));
    }
    res.json({ success: true, data: Database.getSettings() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

module.exports = router;

