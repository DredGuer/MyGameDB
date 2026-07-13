// Couche d'abstraction multi-fournisseurs, portée depuis l'ancien frontend
// (MyGameDB_Local_v5.html). Différence clé : les clés API viennent désormais
// de process.env (jamais stockées en base ni exposées via l'API HTTP).
const db = require('../../db/connection');
const { callGemini } = require('./geminiProvider');
const { callClaude } = require('./claudeProvider');
const { callOpenAI } = require('./openaiProvider');
const { callMistral } = require('./mistralProvider');

const DEFAULT_MODELS = {
    gemini: 'gemini-2.5-flash',
    claude: 'claude-opus-4-8',
    openai: 'gpt-4o-mini',
    mistral: 'mistral-small-latest'
};

const ENV_KEYS = {
    gemini: 'LLM_API_KEY_GEMINI',
    claude: 'LLM_API_KEY_CLAUDE',
    openai: 'LLM_API_KEY_OPENAI',
    mistral: 'LLM_API_KEY_MISTRAL'
};

function getLlmSetting(key) {
    const row = db.prepare('SELECT value FROM llm_settings WHERE key = ?').get(key);
    return row ? row.value : null;
}

function setLlmSetting(key, value) {
    db.prepare('DELETE FROM llm_settings WHERE key = ?').run(key);
    if (value !== null && value !== undefined && value !== '') {
        db.prepare('INSERT INTO llm_settings (key, value) VALUES (?, ?)').run(key, value);
    }
}

function getCurrentProvider() {
    return getLlmSetting('llm_provider') || 'gemini';
}

function getModelFor(provider) {
    return getLlmSetting('llm_model_' + provider) || DEFAULT_MODELS[provider];
}

function hasApiKeyFor(provider) {
    return Boolean(process.env[ENV_KEYS[provider]]);
}

async function callLLM(systemPrompt, userContent, toolSchema) {
    const provider = getCurrentProvider();
    const apiKey = process.env[ENV_KEYS[provider]];
    if (!apiKey) {
        const err = new Error(`Aucune clé API configurée pour "${provider}". Renseigne ${ENV_KEYS[provider]} dans le fichier .env puis redémarre le serveur.`);
        err.code = 'LLM_NO_API_KEY';
        throw err;
    }
    const model = getModelFor(provider);

    switch (provider) {
        case 'gemini': return callGemini(apiKey, model, systemPrompt, userContent);
        case 'claude': return callClaude(apiKey, model, systemPrompt, userContent, toolSchema);
        case 'openai': return callOpenAI(apiKey, model, systemPrompt, userContent);
        case 'mistral': return callMistral(apiKey, model, systemPrompt, userContent);
        default: throw new Error('Fournisseur LLM inconnu : ' + provider);
    }
}

module.exports = {
    callLLM,
    getLlmSetting,
    setLlmSetting,
    getCurrentProvider,
    getModelFor,
    hasApiKeyFor,
    DEFAULT_MODELS
};
