const express = require('express');
const db = require('../db/connection');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const hub = require('../ws/hub');
const { callLLM } = require('../services/llm/llmClient');
const { buildInventoryMarkdown } = require('../services/markdownExport');
const { RECO_SYSTEM_PROMPT, REFINE_SYSTEM_PROMPT, RECO_TOOL_SCHEMA, RECO_CATEGORY_META } = require('../services/recommendationPrompts');

const router = express.Router();

function getRecommendations() {
    return db.prepare(`
        SELECT id, title, match_score, reason, info_url, category,
               user_feedback_score, user_disliked_style, user_already_done
        FROM recommendations ORDER BY match_score DESC
    `).all();
}

function getRecommendationHistoryMarkdown() {
    const rows = db.prepare('SELECT DISTINCT title, match_score FROM recommendation_history ORDER BY created_at DESC').all();
    if (rows.length === 0) return '';
    let md = '## Jeux déjà proposés lors de sessions précédentes (ne pas reproposer)\n\n';
    rows.forEach((r) => {
        md += `- ${r.title}${(r.match_score !== null && r.match_score !== undefined) ? ` (score ${r.match_score}%)` : ''}\n`;
    });
    return md;
}

function saveRecommendations(list) {
    db.prepare('DELETE FROM recommendations').run();
    const insertReco = db.prepare('INSERT INTO recommendations (title, match_score, reason, info_url, category) VALUES (?, ?, ?, ?, ?)');
    const insertHistory = db.prepare('INSERT INTO recommendation_history (title, match_score) VALUES (?, ?)');
    list.forEach((r) => {
        const category = RECO_CATEGORY_META[r.category] ? r.category : null;
        insertReco.run(r.title, r.match_score, r.reason || '', r.info_url || null, category);
        insertHistory.run(r.title, r.match_score);
    });
}

router.get('/', asyncHandler(async (req, res) => {
    res.json({ data: getRecommendations() });
}));

router.post('/generate', asyncHandler(async (req, res) => {
    const inventory = buildInventoryMarkdown();
    if (!inventory) throw new ApiError(400, 'VALIDATION_ERROR', 'Ta collection est vide : ajoute des jeux avant de demander des recommandations.');

    const history = getRecommendationHistoryMarkdown();
    const userContent = history ? `${inventory}\n\n${history}` : inventory;

    const result = await callLLM(RECO_SYSTEM_PROMPT, userContent, RECO_TOOL_SCHEMA);
    const list = result.recommendations || [];
    if (!Array.isArray(list) || list.length === 0) throw new ApiError(502, 'LLM_ERROR', "Le LLM n'a renvoyé aucune recommandation exploitable.");

    saveRecommendations(list);
    hub.broadcast('recommendations:generated', {}, req.clientId);
    res.json({ data: getRecommendations() });
}));

router.post('/refine', asyncHandler(async (req, res) => {
    const current = getRecommendations();
    if (current.length === 0) throw new ApiError(400, 'VALIDATION_ERROR', "Génère d'abord une liste de recommandations avant de l'affiner.");

    const inventory = buildInventoryMarkdown() || '';
    const history = getRecommendationHistoryMarkdown();
    const globalFeedback = (req.body.userNote || '').trim();

    let feedbackBlock = '## Jeux précédemment proposés et feedback utilisateur\n\n';
    current.forEach((r) => {
        const categoryLabel = RECO_CATEGORY_META[r.category] ? RECO_CATEGORY_META[r.category].label : '';
        const adjust = (r.user_feedback_score !== null && r.user_feedback_score !== undefined && r.user_feedback_score != 0)
            ? ` | Ajustement utilisateur : ${r.user_feedback_score > 0 ? '+' : ''}${r.user_feedback_score}%`
            : '';
        const flags = [
            r.user_disliked_style ? 'le style visuel déplaît à l\'utilisateur' : null,
            r.user_already_done ? 'déjà fait par l\'utilisateur (à exclure)' : null
        ].filter(Boolean).join(', ');
        feedbackBlock += `- **${r.title}** (${categoryLabel}, score initial ${r.match_score}%)${adjust}${flags ? ' | ' + flags : ''}\n`;
    });
    if (globalFeedback) {
        feedbackBlock += `\n## Précision libre de l'utilisateur\n${globalFeedback}\n`;
    }

    const userContent = `${inventory}\n\n${feedbackBlock}${history ? '\n\n' + history : ''}`;

    const result = await callLLM(REFINE_SYSTEM_PROMPT, userContent, RECO_TOOL_SCHEMA);
    const list = result.recommendations || [];
    if (!Array.isArray(list) || list.length === 0) throw new ApiError(502, 'LLM_ERROR', "Le LLM n'a renvoyé aucune recommandation exploitable.");

    saveRecommendations(list);
    hub.broadcast('recommendations:generated', {}, req.clientId);
    res.json({ data: getRecommendations() });
}));

router.put('/:id/feedback', asyncHandler(async (req, res) => {
    const ALLOWED_FIELDS = ['user_feedback_score', 'user_disliked_style', 'user_already_done'];
    const field = req.body.field;
    if (!ALLOWED_FIELDS.includes(field)) throw new ApiError(400, 'VALIDATION_ERROR', 'Champ de feedback invalide.');

    db.prepare(`UPDATE recommendations SET ${field} = ? WHERE id = ?`).run(req.body.value, req.params.id);
    hub.broadcast('recommendations:feedback-updated', { id: Number(req.params.id) }, req.clientId);
    res.status(204).end();
}));

router.get('/history', asyncHandler(async (req, res) => {
    const rows = db.prepare(`
        SELECT title, match_score, MIN(created_at) as first_seen
        FROM recommendation_history GROUP BY title ORDER BY first_seen DESC
    `).all();
    res.json({ data: rows });
}));

router.delete('/history', asyncHandler(async (req, res) => {
    db.prepare('DELETE FROM recommendation_history').run();
    hub.broadcast('recommendations:history-cleared', {}, req.clientId);
    res.status(204).end();
}));

module.exports = router;
