const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const db = require('../db/connection');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const hub = require('../ws/hub');

const router = express.Router({ mergeParams: true });
const UPLOADS_PATH = process.env.UPLOADS_PATH || path.join(__dirname, '../../../storage/uploads');
const SCREENSHOTS_DIR = path.join(UPLOADS_PATH, 'screenshots');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 } // 8 Mo, cohérent avec un screenshot compressé
});

router.get('/', asyncHandler(async (req, res) => {
    const rows = db.prepare(
        'SELECT id, title, description, image_path, position FROM screenshots WHERE game_id = ? ORDER BY position ASC, id ASC'
    ).all(req.params.gameId);
    res.json({ data: rows });
}));

router.post('/', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'VALIDATION_ERROR', 'Aucun fichier reçu.');

    const gameId = req.params.gameId;
    const posRow = db.prepare('SELECT COALESCE(MAX(position), -1) + 1 as next FROM screenshots WHERE game_id = ?').get(gameId);
    const position = posRow.next;

    const ext = path.extname(req.file.originalname) || '.jpg';
    fs.mkdirSync(SCREENSHOTS_DIR, { recursive: true });

    const info = db.prepare(
        "INSERT INTO screenshots (game_id, title, description, image_path, position) VALUES (?, ?, ?, '', ?)"
    ).run(gameId, req.body.title || '', req.body.description || '', position);

    const filename = `${info.lastInsertRowid}${ext}`;
    fs.writeFileSync(path.join(SCREENSHOTS_DIR, filename), req.file.buffer);
    db.prepare('UPDATE screenshots SET image_path = ? WHERE id = ?').run(`screenshots/${filename}`, info.lastInsertRowid);

    hub.broadcast('screenshot:created', { id: info.lastInsertRowid, game_id: Number(gameId) }, req.clientId);
    res.status(201).json({ data: db.prepare('SELECT * FROM screenshots WHERE id = ?').get(info.lastInsertRowid) });
}));

module.exports = router;

// --- Routes mono-ressource (montées séparément sous /api/screenshots) ---
const singleRouter = express.Router();

singleRouter.put('/:id', asyncHandler(async (req, res) => {
    const { title, description } = req.body;
    const info = db.prepare('UPDATE screenshots SET title = ?, description = ? WHERE id = ?').run(title || '', description || '', req.params.id);
    if (info.changes === 0) throw new ApiError(404, 'NOT_FOUND', 'Screenshot introuvable.');

    const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(req.params.id);
    hub.broadcast('screenshot:updated', { id: Number(req.params.id), game_id: screenshot.game_id }, req.clientId);
    res.json({ data: screenshot });
}));

singleRouter.delete('/:id', asyncHandler(async (req, res) => {
    const screenshot = db.prepare('SELECT * FROM screenshots WHERE id = ?').get(req.params.id);
    if (!screenshot) throw new ApiError(404, 'NOT_FOUND', 'Screenshot introuvable.');

    db.prepare('DELETE FROM screenshots WHERE id = ?').run(req.params.id);
    if (screenshot.image_path) fs.unlink(path.join(UPLOADS_PATH, screenshot.image_path), () => {});

    hub.broadcast('screenshot:deleted', { id: Number(req.params.id), game_id: screenshot.game_id }, req.clientId);
    res.status(204).end();
}));

module.exports.singleRouter = singleRouter;
