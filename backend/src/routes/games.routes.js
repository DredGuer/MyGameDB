const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db/connection');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const hub = require('../ws/hub');

const router = express.Router();
const UPLOADS_PATH = process.env.UPLOADS_PATH || path.join(__dirname, '../../../storage/uploads');

router.get('/', asyncHandler(async (req, res) => {
    const { search, completed, sort, console_id } = req.query;

    if (console_id) {
        // Vue par plateforme (usage principal du frontend) : une ligne par jeu
        // ayant une instance sur cette console, avec les champs de l'instance.
        const clauses = ['gp.console_id = ?'];
        const params = [console_id];
        if (search) { clauses.push('LOWER(g.title) LIKE ?'); params.push(`%${search.toLowerCase()}%`); }
        if (completed === '0' || completed === '1') { clauses.push('gp.completed = ?'); params.push(Number(completed)); }

        const orderClause = sort === 'hours' ? 'gp.hours DESC'
            : sort === 'rating' ? 'g.rating DESC'
            : sort === 'date_added' ? 'gp.date_added DESC'
            : 'g.title ASC';

        const games = db.prepare(`
            SELECT g.id, g.title, g.rating, g.notes, g.date_added, g.cover_front, g.cover_back,
                   gp.id as game_platform_id, gp.console_id, gp.hours, gp.completed,
                   gp.platform_type, gp.date_completed
            FROM games g
            JOIN game_platforms gp ON gp.game_id = g.id
            WHERE ${clauses.join(' AND ')}
            ORDER BY ${orderClause}
        `).all(...params);

        return res.json({ data: games });
    }

    // Vue globale (pas de filtre plateforme) : une ligne par jeu, agrégée
    // toutes plateformes confondues (heures cumulées, complété si au moins
    // une instance l'est).
    const clauses = [];
    const params = [];
    if (search) { clauses.push('LOWER(g.title) LIKE ?'); params.push(`%${search.toLowerCase()}%`); }
    if (completed === '0' || completed === '1') { clauses.push('agg.completed = ?'); params.push(Number(completed)); }

    const orderClause = sort === 'hours' ? 'agg.hours DESC'
        : sort === 'rating' ? 'g.rating DESC'
        : sort === 'date_added' ? 'g.date_added DESC'
        : 'g.title ASC';

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const games = db.prepare(`
        SELECT g.id, g.title, g.rating, g.notes, g.date_added, g.cover_front, g.cover_back,
               agg.hours, agg.completed
        FROM games g
        JOIN (
            SELECT game_id, SUM(hours) as hours, MAX(completed) as completed
            FROM game_platforms GROUP BY game_id
        ) agg ON agg.game_id = g.id
        ${where} ORDER BY ${orderClause}
    `).all(...params);

    res.json({ data: games });
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const game = db.prepare(`
        SELECT id, title, rating, notes, date_added, cover_front, cover_back
        FROM games WHERE id = ?
    `).get(req.params.id);
    if (!game) throw new ApiError(404, 'NOT_FOUND', 'Jeu introuvable.');
    res.json({ data: game });
}));

router.post('/', asyncHandler(async (req, res) => {
    const { console_id, title, hours, completed, platform_type } = req.body;
    if (!console_id || !title || !title.trim()) {
        throw new ApiError(400, 'VALIDATION_ERROR', 'La console et le titre sont requis.');
    }

    const dup = db.prepare('SELECT id FROM games WHERE title = ? COLLATE NOCASE').get(title.trim());
    if (dup && !req.body.allowDuplicate) {
        throw new ApiError(409, 'CONFLICT', 'Ce jeu existe déjà. Ajoute plutôt cette plateforme à la fiche existante.');
    }

    const createGameAndInstance = db.transaction(() => {
        const gameInfo = db.prepare(`
            INSERT INTO games (title, date_added) VALUES (?, date('now'))
        `).run(title.trim());

        const platformInfo = db.prepare(`
            INSERT INTO game_platforms (game_id, console_id, hours, completed, platform_type, date_added)
            VALUES (?, ?, ?, ?, ?, date('now'))
        `).run(gameInfo.lastInsertRowid, console_id, hours || 0, completed ? 1 : 0, platform_type || 'Physique');

        return { gameId: gameInfo.lastInsertRowid, platformInstanceId: platformInfo.lastInsertRowid };
    });

    const { gameId, platformInstanceId } = createGameAndInstance();

    hub.broadcast('game:created', { id: gameId, console_id: Number(console_id), platformInstanceId }, req.clientId);
    res.status(201).json({ data: db.prepare('SELECT * FROM games WHERE id = ?').get(gameId) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Jeu introuvable.');

    const title = (req.body.title ?? existing.title).trim();
    if (!title) throw new ApiError(400, 'VALIDATION_ERROR', 'Le titre ne peut pas être vide.');

    const rating = req.body.rating === '' || req.body.rating === undefined ? existing.rating : req.body.rating;
    const notes = req.body.notes ?? existing.notes;

    db.prepare(`
        UPDATE games SET title=?, rating=?, notes=?
        WHERE id=?
    `).run(title, rating, notes, req.params.id);

    hub.broadcast('game:updated', { id: Number(req.params.id) }, req.clientId);
    res.json({ data: db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
    const game = db.prepare('SELECT cover_front, cover_back FROM games WHERE id = ?').get(req.params.id);
    if (!game) throw new ApiError(404, 'NOT_FOUND', 'Jeu introuvable.');

    const screenshots = db.prepare('SELECT image_path FROM screenshots WHERE game_id = ?').all(req.params.id);
    db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);

    [game.cover_front, game.cover_back, ...screenshots.map(s => s.image_path)].forEach((relPath) => {
        if (!relPath) return;
        const fullPath = path.join(UPLOADS_PATH, relPath);
        fs.unlink(fullPath, () => {}); // best-effort, pas bloquant si déjà absent
    });

    hub.broadcast('game:deleted', { id: Number(req.params.id) }, req.clientId);
    res.status(204).end();
}));

module.exports = router;
