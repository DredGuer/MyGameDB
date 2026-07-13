const express = require('express');
const db = require('../db/connection');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const hub = require('../ws/hub');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
    const families = db.prepare('SELECT id, name FROM families ORDER BY name ASC').all();
    res.json({ data: families });
}));

router.post('/', asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'Le nom est requis.');

    const info = db.prepare('INSERT INTO families (name) VALUES (?)').run(name.trim());
    const family = db.prepare('SELECT id, name FROM families WHERE id = ?').get(info.lastInsertRowid);

    hub.broadcast('family:created', { id: family.id }, req.clientId);
    res.status(201).json({ data: family });
}));

router.put('/:id', asyncHandler(async (req, res) => {
    const { name } = req.body;
    if (!name || !name.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'Le nom est requis.');

    const info = db.prepare('UPDATE families SET name = ? WHERE id = ?').run(name.trim(), req.params.id);
    if (info.changes === 0) throw new ApiError(404, 'NOT_FOUND', 'Famille introuvable.');

    hub.broadcast('family:updated', { id: Number(req.params.id) }, req.clientId);
    res.json({ data: db.prepare('SELECT id, name FROM families WHERE id = ?').get(req.params.id) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
    const info = db.prepare('DELETE FROM families WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw new ApiError(404, 'NOT_FOUND', 'Famille introuvable.');

    hub.broadcast('family:deleted', { id: Number(req.params.id) }, req.clientId);
    res.status(204).end();
}));

module.exports = router;
