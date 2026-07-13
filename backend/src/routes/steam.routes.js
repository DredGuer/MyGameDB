const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const { triggerSync, getStatus } = require('../services/steam/steamScheduler');
const { hasSteamCredentials, fetchOwnedGames } = require('../services/steam/steamClient');

const router = express.Router();

router.get('/status', asyncHandler(async (req, res) => {
    res.json({ data: getStatus() });
}));

// Test de connexion léger : appelle l'API Steam en lecture seule (aucune
// écriture en base, contrairement à /sync) pour vérifier que STEAM_API_KEY/
// STEAM_ID sont valides et que Steam répond.
router.post('/test-connection', asyncHandler(async (req, res) => {
    if (!hasSteamCredentials()) {
        return res.json({ data: { success: false, message: 'STEAM_API_KEY et STEAM_ID ne sont pas configurés dans .env.' } });
    }

    const started = Date.now();
    try {
        const games = await fetchOwnedGames();
        res.json({ data: { success: true, gameCount: games.length, latencyMs: Date.now() - started } });
    } catch (e) {
        res.json({ data: { success: false, message: e.message, latencyMs: Date.now() - started } });
    }
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
