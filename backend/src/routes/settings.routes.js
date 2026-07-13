const express = require('express');
const db = require('../db/connection');
const asyncHandler = require('../middleware/asyncHandler');
const hub = require('../ws/hub');

const router = express.Router();

router.get('/birthdate', asyncHandler(async (req, res) => {
    const row = db.prepare("SELECT value FROM app_settings WHERE key = 'birthdate'").get();
    res.json({ data: { value: row ? row.value : null } });
}));

router.put('/birthdate', asyncHandler(async (req, res) => {
    const { value } = req.body;
    db.prepare("DELETE FROM app_settings WHERE key = 'birthdate'").run();
    if (value) {
        db.prepare("INSERT INTO app_settings (key, value) VALUES ('birthdate', ?)").run(value);
    }
    hub.broadcast('settings:updated', { key: 'birthdate' }, req.clientId);
    res.json({ data: { value: value || null } });
}));

module.exports = router;
