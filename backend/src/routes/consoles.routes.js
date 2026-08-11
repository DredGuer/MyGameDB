const express = require('express');
const db = require('../db/connection');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const hub = require('../ws/hub');

const router = express.Router();

router.get('/', asyncHandler(async (req, res) => {
    const consoles = db.prepare(`
        SELECT c.id, c.name, c.family_id, f.name as family_name
        FROM consoles c JOIN families f ON c.family_id = f.id
        ORDER BY f.name ASC, c.name ASC
    `).all();
    res.json({ data: consoles });
}));

router.post('/', asyncHandler(async (req, res) => {
    const { name, family_id } = req.body;
    if (!name || !name.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'Le nom est requis.');
    if (!family_id) throw new ApiError(400, 'VALIDATION_ERROR', 'La famille est requise.');

    const info = db.prepare('INSERT INTO consoles (family_id, name) VALUES (?, ?)').run(family_id, name.trim());
    hub.broadcast('console:created', { id: info.lastInsertRowid }, req.clientId);
    res.status(201).json({ data: db.prepare('SELECT id, name, family_id FROM consoles WHERE id = ?').get(info.lastInsertRowid) });
}));

router.put('/:id', asyncHandler(async (req, res) => {
    const { name, family_id } = req.body;
    if (!name || !name.trim()) throw new ApiError(400, 'VALIDATION_ERROR', 'Le nom est requis.');
    if (!family_id) throw new ApiError(400, 'VALIDATION_ERROR', 'La famille est requise.');

    const info = db.prepare('UPDATE consoles SET name = ?, family_id = ? WHERE id = ?').run(name.trim(), family_id, req.params.id);
    if (info.changes === 0) throw new ApiError(404, 'NOT_FOUND', 'Console introuvable.');

    hub.broadcast('console:updated', { id: Number(req.params.id) }, req.clientId);
    res.json({ data: db.prepare('SELECT id, name, family_id FROM consoles WHERE id = ?').get(req.params.id) });
}));

router.delete('/:id', asyncHandler(async (req, res) => {
    const info = db.prepare('DELETE FROM consoles WHERE id = ?').run(req.params.id);
    if (info.changes === 0) throw new ApiError(404, 'NOT_FOUND', 'Console introuvable.');

    hub.broadcast('console:deleted', { id: Number(req.params.id) }, req.clientId);
    res.status(204).end();
}));

// --- Périodes de possession console ---

// Requête agrégée unique (anti N+1) : toutes les périodes de toutes les
// consoles d'un coup, groupées par famille — sert la vue "Mon matériel"
// sans avoir à faire un appel par console.
router.get('/ownership-periods/all', asyncHandler(async (req, res) => {
    const rows = db.prepare(`
        SELECT c.id as console_id, c.name as console_name, f.name as family_name,
               p.id, p.date_start, p.date_end, p.model, p.serial_number
        FROM consoles c
        JOIN families f ON f.id = c.family_id
        LEFT JOIN console_ownership_periods p ON p.console_id = c.id
        ORDER BY f.name ASC, c.name ASC, p.date_start ASC
    `).all();

    const byConsole = {};
    rows.forEach((r) => {
        if (!byConsole[r.console_id]) {
            byConsole[r.console_id] = { console_id: r.console_id, console_name: r.console_name, family_name: r.family_name, periods: [] };
        }
        if (r.id) {
            byConsole[r.console_id].periods.push({
                id: r.id, date_start: r.date_start, date_end: r.date_end,
                model: r.model, serial_number: r.serial_number
            });
        }
    });

    res.json({ data: Object.values(byConsole) });
}));

router.get('/:id/ownership-periods', asyncHandler(async (req, res) => {
    const periods = db.prepare(
        'SELECT id, date_start, date_end, model, serial_number FROM console_ownership_periods WHERE console_id = ? ORDER BY date_start ASC'
    ).all(req.params.id);
    res.json({ data: periods });
}));

router.post('/:id/ownership-periods', asyncHandler(async (req, res) => {
    const { date_start, date_end, model, serial_number } = req.body;
    if (!date_start) throw new ApiError(400, 'VALIDATION_ERROR', "La date d'acquisition est requise.");

    const info = db.prepare(
        'INSERT INTO console_ownership_periods (console_id, date_start, date_end, model, serial_number) VALUES (?, ?, ?, ?, ?)'
    ).run(req.params.id, date_start, date_end || null, (model || '').trim() || null, (serial_number || '').trim() || null);

    hub.broadcast('console:updated', { id: Number(req.params.id) }, req.clientId);
    res.status(201).json({
        data: {
            id: info.lastInsertRowid, date_start, date_end: date_end || null,
            model: (model || '').trim() || null, serial_number: (serial_number || '').trim() || null
        }
    });
}));

router.delete('/ownership-periods/:periodId', asyncHandler(async (req, res) => {
    const period = db.prepare('SELECT console_id FROM console_ownership_periods WHERE id = ?').get(req.params.periodId);
    if (!period) throw new ApiError(404, 'NOT_FOUND', 'Période introuvable.');

    db.prepare('DELETE FROM console_ownership_periods WHERE id = ?').run(req.params.periodId);
    hub.broadcast('console:updated', { id: period.console_id }, req.clientId);
    res.status(204).end();
}));

module.exports = router;
