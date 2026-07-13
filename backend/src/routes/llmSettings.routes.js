const express = require('express');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const llmClient = require('../services/llm/llmClient');

const router = express.Router();
const PROVIDERS = ['gemini', 'claude', 'openai', 'mistral'];

// Ne renvoie JAMAIS de clé API — uniquement un booléen indiquant si le fournisseur
// courant a une clé configurée côté serveur (.env).
router.get('/', asyncHandler(async (req, res) => {
    const provider = llmClient.getCurrentProvider();
    res.json({
        data: {
            provider,
            model: llmClient.getModelFor(provider),
            hasApiKey: llmClient.hasApiKeyFor(provider),
            availableProviders: PROVIDERS.map(p => ({ provider: p, hasApiKey: llmClient.hasApiKeyFor(p) }))
        }
    });
}));

// Ne permet de modifier QUE le fournisseur choisi et le modèle — jamais la clé
// API (celle-ci se configure exclusivement via le fichier .env + redémarrage).
router.put('/', asyncHandler(async (req, res) => {
    const { provider, model } = req.body;
    if (!PROVIDERS.includes(provider)) throw new ApiError(400, 'VALIDATION_ERROR', 'Fournisseur invalide.');

    llmClient.setLlmSetting('llm_provider', provider);
    llmClient.setLlmSetting('llm_model_' + provider, model || llmClient.DEFAULT_MODELS[provider]);

    res.json({
        data: {
            provider,
            model: llmClient.getModelFor(provider),
            hasApiKey: llmClient.hasApiKeyFor(provider)
        }
    });
}));

module.exports = router;
