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

    const clauses = [];
    const params = [];
    if (console_id) { clauses.push('console_id = ?'); params.push(console_id); }
    if (search) { clauses.push('LOWER(title) LIKE ?'); params.push(`%${search.toLowerCase()}%`); }
    if (completed === '0' || completed === '1') { clauses.push('completed = ?'); params.push(Number(completed)); }

    const orderClause = sort === 'hours' ? 'hours DESC'
        : sort === 'rating' ? 'rating DESC'
        : sort === 'date_added' ? 'date_added DESC'
        : 'title ASC';

    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const games = db.prepare(`
        SELECT id, console_id, title, hours, completed, platform_type, rating, notes,
               date_added, date_completed, cover_front, cover_back
        FROM games ${where} ORDER BY ${orderClause}
    `).all(...params);

    res.json({ data: games });
}));

router.get('/:id', asyncHandler(async (req, res) => {
    const game = db.prepare(`
        SELECT id, console_id, title, hours, completed, platform_type, rating, notes,
               date_added, date_completed, cover_front, cover_back
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

    const dup = db.prepare('SELECT id FROM games WHERE console_id = ? AND title = ? COLLATE NOCASE').get(console_id, title.trim());
    if (dup && !req.body.allowDuplicate) {
        throw new ApiError(409, 'CONFLICT', 'Ce jeu existe déjà sur cette console.');
    }

    const info = db.prepare(`
        INSERT INTO games (console_id, title, hours, completed, platform_type, date_added)
        VALUES (?, ?, ?, ?, ?, date('now'))
    `).run(console_id, title.trim(), hours || 0, completed ? 1 : 0, platform_type || 'Physique');

    hub.broadcast('game:created', { id: info.lastInsertRowid, console_id: Number(console_id) }, req.clientId);
    res.status(201).json({ data: db.prepare('SELECT * FROM games WHERE id = ?').get(info.lastInsertRowid) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Jeu introuvable.');

    const title = (req.body.title ?? existing.title).trim();
    if (!title) throw new ApiError(400, 'VALIDATION_ERROR', 'Le titre ne peut pas être vide.');

    const hours = req.body.hours ?? existing.hours;
    const completed = req.body.completed ? 1 : 0;
    const platform_type = req.body.platform_type ?? existing.platform_type;
    const rating = req.body.rating === '' || req.body.rating === undefined ? existing.rating : req.body.rating;
    const notes = req.body.notes ?? existing.notes;
    let date_completed = req.body.date_completed ?? existing.date_completed;
    if (completed && !date_completed) date_completed = new Date().toISOString().split('T')[0];
    if (!completed) date_completed = null;

    db.prepare(`
        UPDATE games SET title=?, hours=?, completed=?, platform_type=?, rating=?, notes=?, date_completed=?
        WHERE id=?
    `).run(title, hours, completed, platform_type, rating, notes, date_completed, req.params.id);

    hub.broadcast('game:updated', { id: Number(req.params.id), console_id: existing.console_id }, req.clientId);
    res.json({
        data: db.prepare('SELECT * FROM games WHERE id = ?').get(req.params.id),
        justCompleted: !existing.completed && completed === 1
    });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
    const game = db.prepare('SELECT console_id, cover_front, cover_back FROM games WHERE id = ?').get(req.params.id);
    if (!game) throw new ApiError(404, 'NOT_FOUND', 'Jeu introuvable.');

    const screenshots = db.prepare('SELECT image_path FROM screenshots WHERE game_id = ?').all(req.params.id);
    db.prepare('DELETE FROM games WHERE id = ?').run(req.params.id);

    [game.cover_front, game.cover_back, ...screenshots.map(s => s.image_path)].forEach((relPath) => {
        if (!relPath) return;
        const fullPath = path.join(UPLOADS_PATH, relPath);
        fs.unlink(fullPath, () => {}); // best-effort, pas bloquant si déjà absent
    });

    hub.broadcast('game:deleted', { id: Number(req.params.id), console_id: game.console_id }, req.clientId);
    res.status(204).end();
}));

// --- Périodes de possession jeu ---

router.get('/:id/ownership-periods', asyncHandler(async (req, res) => {
    const periods = db.prepare(
        'SELECT id, date_start, date_end FROM game_ownership_periods WHERE game_id = ? ORDER BY date_start ASC'
    ).all(req.params.id);
    res.json({ data: periods });
}));

router.post('/:id/ownership-periods', asyncHandler(async (req, res) => {
    const { date_start, date_end } = req.body;
    if (!date_start) throw new ApiError(400, 'VALIDATION_ERROR', "La date d'acquisition est requise.");

    const info = db.prepare(
        'INSERT INTO game_ownership_periods (game_id, date_start, date_end) VALUES (?, ?, ?)'
    ).run(req.params.id, date_start, date_end || null);

    hub.broadcast('game:updated', { id: Number(req.params.id) }, req.clientId);
    res.status(201).json({ data: { id: info.lastInsertRowid, date_start, date_end: date_end || null } });
}));

router.delete('/ownership-periods/:periodId', asyncHandler(async (req, res) => {
    const period = db.prepare('SELECT game_id FROM game_ownership_periods WHERE id = ?').get(req.params.periodId);
    if (!period) throw new ApiError(404, 'NOT_FOUND', 'Période introuvable.');

    db.prepare('DELETE FROM game_ownership_periods WHERE id = ?').run(req.params.periodId);
    hub.broadcast('game:updated', { id: period.game_id }, req.clientId);
    res.status(204).end();
}));

module.exports = router;
