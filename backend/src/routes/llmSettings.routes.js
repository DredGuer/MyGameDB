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

// Test de connexion réel : envoie un prompt minimal au fournisseur actuellement
// configuré et vérifie qu'il répond correctement — pas juste que la clé est
// présente (hasApiKey ne garantit pas qu'elle soit valide/non expirée/quota
// épuisé). Réutilise callLLM() donc teste toujours le provider actif, cohérent
// avec ce que /generate utilisera réellement.
router.post('/test-connection', asyncHandler(async (req, res) => {
    const provider = llmClient.getCurrentProvider();

    if (!llmClient.hasApiKeyFor(provider)) {
        return res.json({ data: { success: false, provider, message: `Aucune clé API configurée pour "${provider}".` } });
    }

    const started = Date.now();
    const testSchema = {
        name: 'submit_ping',
        description: 'Confirme la réception.',
        input_schema: { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] }
    };

    try {
        await llmClient.callLLM('Réponds STRICTEMENT en JSON {"ok": true}.', 'Ping de test de connexion.', testSchema);
        res.json({ data: { success: true, provider, model: llmClient.getModelFor(provider), latencyMs: Date.now() - started } });
    } catch (e) {
        res.json({ data: { success: false, provider, message: e.message, latencyMs: Date.now() - started } });
    }
}));

module.exports = router;
