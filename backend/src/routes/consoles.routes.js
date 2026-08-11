const express = require('express');
const db = require('../db/connection');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const hub = require('../ws/hub');
const { FINANCIAL_FIELDS, extractFinancials, financialValues } = require('../services/ownershipFinancials');

const router = express.Router();

// Colonnes renvoyées pour une période console (colonnes de base + volet
// financier), factorisées pour que GET liste, GET détail et écritures
// restent toujours d'accord sur le même jeu de champs.
const CONSOLE_PERIOD_COLUMNS = [
    'id', 'date_start', 'date_end', 'model', 'serial_number', 'acquisition_type', ...FINANCIAL_FIELDS
].join(', ');

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
               p.id, p.date_start, p.date_end, p.model, p.serial_number, p.acquisition_type,
               p.purchase_price, p.purchase_from, p.purchase_from_type,
               p.sale_price, p.sale_to, p.sale_to_type, p.purchase_notes
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
                model: r.model, serial_number: r.serial_number, acquisition_type: r.acquisition_type,
                purchase_price: r.purchase_price, purchase_from: r.purchase_from, purchase_from_type: r.purchase_from_type,
                sale_price: r.sale_price, sale_to: r.sale_to, sale_to_type: r.sale_to_type,
                purchase_notes: r.purchase_notes
            });
        }
    });

    res.json({ data: Object.values(byConsole) });
}));

router.get('/:id/ownership-periods', asyncHandler(async (req, res) => {
    const periods = db.prepare(
        `SELECT ${CONSOLE_PERIOD_COLUMNS} FROM console_ownership_periods WHERE console_id = ? ORDER BY date_start ASC`
    ).all(req.params.id);
    res.json({ data: periods });
}));

router.post('/:id/ownership-periods', asyncHandler(async (req, res) => {
    const { date_start, date_end, model, serial_number, acquisition_type } = req.body;
    if (!date_start) throw new ApiError(400, 'VALIDATION_ERROR', "La date d'acquisition est requise.");

    const financials = extractFinancials(req.body);
    const info = db.prepare(`
        INSERT INTO console_ownership_periods
            (console_id, date_start, date_end, model, serial_number, acquisition_type, ${FINANCIAL_FIELDS.join(', ')})
        VALUES (?, ?, ?, ?, ?, ?, ${FINANCIAL_FIELDS.map(() => '?').join(', ')})
    `).run(
        req.params.id, date_start, date_end || null,
        (model || '').trim() || null, (serial_number || '').trim() || null, acquisition_type || null,
        ...financialValues(financials)
    );

    hub.broadcast('console:updated', { id: Number(req.params.id) }, req.clientId);
    res.status(201).json({
        data: db.prepare(`SELECT ${CONSOLE_PERIOD_COLUMNS} FROM console_ownership_periods WHERE id = ?`).get(info.lastInsertRowid)
    });
}));

// Mise à jour d'une période existante — indispensable pour le volet financier :
// le prix de vente et l'acheteur ne sont connus qu'au moment de la revente,
// bien après la création de la période d'achat.
router.put('/ownership-periods/:periodId', asyncHandler(async (req, res) => {
    const existing = db.prepare('SELECT * FROM console_ownership_periods WHERE id = ?').get(req.params.periodId);
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Période introuvable.');

    const date_start = req.body.date_start ?? existing.date_start;
    if (!date_start) throw new ApiError(400, 'VALIDATION_ERROR', "La date d'acquisition est requise.");

    const financials = extractFinancials(req.body);
    db.prepare(`
        UPDATE console_ownership_periods
        SET date_start = ?, date_end = ?, model = ?, serial_number = ?, acquisition_type = ?,
            ${FINANCIAL_FIELDS.map((f) => `${f} = ?`).join(', ')}
        WHERE id = ?
    `).run(
        date_start,
        req.body.date_end ?? existing.date_end ?? null,
        (req.body.model ?? existing.model ?? '').trim() || null,
        (req.body.serial_number ?? existing.serial_number ?? '').trim() || null,
        req.body.acquisition_type ?? existing.acquisition_type ?? null,
        ...financialValues(financials),
        req.params.periodId
    );

    hub.broadcast('console:updated', { id: existing.console_id }, req.clientId);
    res.json({ data: db.prepare(`SELECT ${CONSOLE_PERIOD_COLUMNS} FROM console_ownership_periods WHERE id = ?`).get(req.params.periodId) });
}));

router.delete('/ownership-periods/:periodId', asyncHandler(async (req, res) => {
    const period = db.prepare('SELECT console_id FROM console_ownership_periods WHERE id = ?').get(req.params.periodId);
    if (!period) throw new ApiError(404, 'NOT_FOUND', 'Période introuvable.');

    db.prepare('DELETE FROM console_ownership_periods WHERE id = ?').run(req.params.periodId);
    hub.broadcast('console:updated', { id: period.console_id }, req.clientId);
    res.status(204).end();
}));

module.exports = router;
