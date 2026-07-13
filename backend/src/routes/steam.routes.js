const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const { triggerSync, getStatus } = require('../services/steam/steamScheduler');

const router = express.Router();

router.get('/status', asyncHandler(async (req, res) => {
    res.json({ data: getStatus() });
}));

router.post('/sync', asyncHandler(async (req, res) => {
    try {
        const report = await triggerSync();
        res.json({ data: report });
    } catch (e) {
        if (e.code === 'STEAM_NO_CREDENTIALS') throw new ApiError(400, 'STEAM_NO_CREDENTIALS', e.message);
        if (e.code === 'STEAM_API_ERROR') throw new ApiError(502, 'STEAM_API_ERROR', e.message);
        throw e;
    }
}));

module.exports = router;
