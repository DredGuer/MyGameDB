// Instances de possession d'un jeu par plateforme (montées dans server.js sous
// /api/games/:gameId/platforms, AVANT /api/games générique). Un jeu peut avoir
// 0 à N instances (ex: Waven possédé à la fois sur PC et sur mobile) ; chaque
// instance porte ses propres heures, statut "terminé", support et dates.
const express = require('express');
const db = require('../db/connection');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const hub = require('../ws/hub');

const router = express.Router({ mergeParams: true });

router.get('/', asyncHandler(async (req, res) => {
    const rows = db.prepare(`
        SELECT gp.id, gp.game_id, gp.console_id, c.name as console_name,
               gp.hours, gp.completed, gp.platform_type, gp.date_added, gp.date_completed,
               gp.source, gp.steam_appid, gp.last_synced_at
        FROM game_platforms gp
        JOIN consoles c ON c.id = gp.console_id
        WHERE gp.game_id = ?
        ORDER BY c.name ASC
    `).all(req.params.gameId);
    res.json({ data: rows });
}));

router.post('/', asyncHandler(async (req, res) => {
    const { console_id, hours, completed, platform_type } = req.body;
    if (!console_id) throw new ApiError(400, 'VALIDATION_ERROR', 'La plateforme est requise.');

    const game = db.prepare('SELECT id FROM games WHERE id = ?').get(req.params.gameId);
    if (!game) throw new ApiError(404, 'NOT_FOUND', 'Jeu introuvable.');

    let info;
    try {
        info = db.prepare(`
            INSERT INTO game_platforms (game_id, console_id, hours, completed, platform_type, date_added)
            VALUES (?, ?, ?, ?, ?, date('now'))
        `).run(req.params.gameId, console_id, hours || 0, completed ? 1 : 0, platform_type || 'Physique');
    } catch (e) {
        if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') {
            throw new ApiError(409, 'CONFLICT', 'Ce jeu est déjà rattaché à cette plateforme.');
        }
        throw e;
    }

    hub.broadcast('game:platform-changed', { gameId: Number(req.params.gameId), platformInstanceId: info.lastInsertRowid }, req.clientId);
    res.status(201).json({ data: db.prepare('SELECT * FROM game_platforms WHERE id = ?').get(info.lastInsertRowid) });
}));

router.put('/:platformInstanceId', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM game_platforms WHERE id = ? AND game_id = ?').get(req.params.platformInstanceId, req.params.gameId);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Instance de plateforme introuvable.');

    const hours = req.body.hours ?? existing.hours;
    const completed = req.body.completed !== undefined ? (req.body.completed ? 1 : 0) : existing.completed;
    const platform_type = req.body.platform_type ?? existing.platform_type;
    let date_completed = req.body.date_completed ?? existing.date_completed;
    if (completed && !date_completed) date_completed = new Date().toISOString().split('T')[0];
    if (!completed) date_completed = null;

    db.prepare(`
        UPDATE game_platforms SET hours=?, completed=?, platform_type=?, date_completed=?
        WHERE id=?
    `).run(hours, completed, platform_type, date_completed, req.params.platformInstanceId);

    hub.broadcast('game:platform-changed', { gameId: Number(req.params.gameId), platformInstanceId: Number(req.params.platformInstanceId) }, req.clientId);
    res.json({ data: db.prepare('SELECT * FROM game_platforms WHERE id = ?').get(req.params.platformInstanceId) });
}));

router.delete('/:platformInstanceId', asyncHandler(async (req, res) => {
    const info = db.prepare('DELETE FROM game_platforms WHERE id = ? AND game_id = ?').run(req.params.platformInstanceId, req.params.gameId);
    if (info.changes === 0) throw new ApiError(404, 'NOT_FOUND', 'Instance de plateforme introuvable.');

    hub.broadcast('game:platform-changed', { gameId: Number(req.params.gameId), platformInstanceId: Number(req.params.platformInstanceId) }, req.clientId);
    res.status(204).end();
}));

// --- Périodes de possession de l'instance (remplace /api/games/:id/ownership-periods) ---

router.get('/:platformInstanceId/ownership-periods', asyncHandler(async (req, res) => {
    const periods = db.prepare(
        'SELECT id, date_start, date_end FROM game_platform_ownership_periods WHERE game_platform_id = ? ORDER BY date_start ASC'
    ).all(req.params.platformInstanceId);
    res.json({ data: periods });
}));

router.post('/:platformInstanceId/ownership-periods', asyncHandler(async (req, res) => {
    const { date_start, date_end } = req.body;
    if (!date_start) throw new ApiError(400, 'VALIDATION_ERROR', "La date d'acquisition est requise.");

    const info = db.prepare(
        'INSERT INTO game_platform_ownership_periods (game_platform_id, date_start, date_end) VALUES (?, ?, ?)'
    ).run(req.params.platformInstanceId, date_start, date_end || null);

    hub.broadcast('game:platform-changed', { gameId: Number(req.params.gameId), platformInstanceId: Number(req.params.platformInstanceId) }, req.clientId);
    res.status(201).json({ data: { id: info.lastInsertRowid, date_start, date_end: date_end || null } });
}));

router.delete('/ownership-periods/:periodId', asyncHandler(async (req, res) => {
    const period = db.prepare('SELECT game_platform_id FROM game_platform_ownership_periods WHERE id = ?').get(req.params.periodId);
    if (!period) throw new ApiError(404, 'NOT_FOUND', 'Période introuvable.');

    db.prepare('DELETE FROM game_platform_ownership_periods WHERE id = ?').run(req.params.periodId);
    hub.broadcast('game:platform-changed', { gameId: Number(req.params.gameId), platformInstanceId: period.game_platform_id }, req.clientId);
    res.status(204).end();
}));

module.exports = router;
