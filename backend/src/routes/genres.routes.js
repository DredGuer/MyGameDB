const express = require('express');
const db = require('../db/connection');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const hub = require('../ws/hub');
const { callLLM } = require('../services/llm/llmClient');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
    const genres = db.prepare(`
        SELECT g.id, g.name, COUNT(gg.game_id) as usage_count
        FROM genres g LEFT JOIN game_genres gg ON gg.genre_id = g.id
        GROUP BY g.id ORDER BY g.name ASC
    `).all();
    res.json({ data: genres });
}));

// Requête agrégée unique (anti N+1) : renvoie { [gameId]: ["Style1", "Style2"] }
// pour tous les jeux d'un coup — évite au frontend de faire une requête genres
// par ligne de jeu affichée.
router.get('/by-game', asyncHandler(async (req, res) => {
    const rows = db.prepare('SELECT gg.game_id, g.name FROM game_genres gg JOIN genres g ON g.id = gg.genre_id ORDER BY g.name ASC').all();
    const map = {};
    rows.forEach(({ game_id, name }) => {
        (map[game_id] ||= []).push(name);
    });
    res.json({ data: map });
}));

router.post('/', asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'Le nom est requis.');

    const info = db.prepare('INSERT INTO genres (name) VALUES (?)').run(name.trim());
    hub.broadcast('genre:created', { id: info.lastInsertRowid }, req.clientId);
    res.status(201).json({ data: { id: info.lastInsertRowid, name: name.trim() } });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
    const info = db.prepare('DELETE FROM genres WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw new ApiError(404, 'NOT_FOUND', 'Style introuvable.');

    hub.broadcast('genre:deleted', { id: Number(req.params.id) }, req.clientId);
    res.status(204).end();
}));

module.exports = router;

// --- Association jeu <-> genre (montées séparément dans server.js sous /api/games) ---
const gameGenresRouter = express.Router({ mergeParams: true });

gameGenresRouter.get('/', asyncHandler(async (req, res) => {
    const genreIds = db.prepare('SELECT genre_id FROM game_genres WHERE game_id = ?').all(req.params.gameId).map(r => r.genre_id);
    res.json({ data: genreIds });
}));

// IMPORTANT : cette route doit être déclarée AVANT `POST /:genreId` ci-dessous,
// sinon Express matche "auto-detect" comme valeur de :genreId (échec FK garanti).
// Déduit automatiquement le(s) style(s) d'un jeu via le LLM configuré, à partir
// de son titre et de sa console (équivalent serveur de l'ancien autoDetectGenre()).
gameGenresRouter.post('/auto-detect', asyncHandler(async (req, res) => {
    const game = db.prepare(`
        SELECT g.id, g.title,
               (SELECT GROUP_CONCAT(c.name, ', ') FROM game_platforms gp JOIN consoles c ON c.id = gp.console_id WHERE gp.game_id = g.id) as console_names
        FROM games g WHERE g.id = ?
    `).get(req.params.gameId);
    if (!game) throw new ApiError(404, 'NOT_FOUND', 'Jeu introuvable.');

    const existingGenres = db.prepare('SELECT name FROM genres ORDER BY name ASC').all().map(r => r.name);

    const systemPrompt = `Tu es un expert en catégorisation de jeux vidéo. On te donne un titre de jeu et éventuellement ses plateformes. Réponds STRICTEMENT en JSON de la forme {"genres": ["Style1", "Style2"]} en choisissant en priorité parmi les styles déjà existants dans la base : ${existingGenres.join(', ') || '(aucun pour le moment)'}. Si aucun style existant ne convient bien, tu peux proposer un nouveau style court et générique (1-2 mots).`;
    const userContent = `Titre du jeu : ${game.title}${game.console_names ? `\nPlateformes : ${game.console_names}` : ''}`;
    const toolSchema = {
        name: 'submit_genres',
        description: 'Soumets la liste des styles de jeu détectés.',
        input_schema: {
            type: 'object',
            properties: { genres: { type: 'array', items: { type: 'string' } } },
            required: ['genres']
        }
    };

    const result = await callLLM(systemPrompt, userContent, toolSchema);
    const genres = result.genres || [];
    if (!Array.isArray(genres) || genres.length === 0) throw new ApiError(502, 'LLM_ERROR', "Le LLM n'a proposé aucun style.");

    const appliedGenres = [];
    genres.forEach((name) => {
        const trimmed = String(name).trim();
        if (!trimmed) return;
        try { db.prepare('INSERT INTO genres (name) VALUES (?)').run(trimmed); } catch (e) { /* existe déjà */ }
        const genre = db.prepare('SELECT id, name FROM genres WHERE name = ? COLLATE NOCASE').get(trimmed);
        if (genre) {
            try { db.prepare('INSERT INTO game_genres (game_id, genre_id) VALUES (?, ?)').run(req.params.gameId, genre.id); } catch (e) { /* déjà taggé */ }
            appliedGenres.push(genre);
        }
    });

    hub.broadcast('game:genre-changed', { id: Number(req.params.gameId) }, req.clientId);
    res.json({ data: appliedGenres });
}));

gameGenresRouter.post('/:genreId', asyncHandler(async (req, res) => {
    try {
        db.prepare('INSERT INTO game_genres (game_id, genre_id) VALUES (?, ?)').run(req.params.gameId, req.params.genreId);
    } catch (e) {
        if (e.code !== 'SQLITE_CONSTRAINT_PRIMARYKEY') throw e; // déjà associé : idempotent
    }
    hub.broadcast('game:genre-changed', { id: Number(req.params.gameId) }, req.clientId);
    res.status(204).end();
}));

gameGenresRouter.delete('/:genreId', asyncHandler(async (req, res) => {
    db.prepare('DELETE FROM game_genres WHERE game_id = ? AND genre_id = ?').run(req.params.gameId, req.params.genreId);
    hub.broadcast('game:genre-changed', { id: Number(req.params.gameId) }, req.clientId);
    res.status(204).end();
}));

module.exports.gameGenresRouter = gameGenresRouter;
