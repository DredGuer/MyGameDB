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
const COVERS_DIR = path.join(UPLOADS_PATH, 'covers');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 }
});

function assertSide(side) {
    if (side !== 'front' && side !== 'back') throw new ApiError(400, 'VALIDATION_ERROR', 'Côté de jaquette invalide (front|back attendu).');
}

router.put('/:side', upload.single('file'), asyncHandler(async (req, res) => {
    assertSide(req.params.side);
    if (!req.file) throw new ApiError(400, 'VALIDATION_ERROR', 'Aucun fichier reçu.');

    const gameId = req.params.gameId;
    const game = db.prepare('SELECT id FROM games WHERE id = ?').get(gameId);
    if (!game) throw new ApiError(404, 'NOT_FOUND', 'Jeu introuvable.');

    fs.mkdirSync(COVERS_DIR, { recursive: true });
    const ext = path.extname(req.file.originalname) || '.jpg';
    const filename = `${gameId}_${req.params.side}${ext}`;
    fs.writeFileSync(path.join(COVERS_DIR, filename), req.file.buffer);

    const column = req.params.side === 'front' ? 'cover_front' : 'cover_back';
    db.prepare(`UPDATE games SET ${column} = ? WHERE id = ?`).run(`covers/${filename}`, gameId);

    hub.broadcast('cover:updated', { id: Number(gameId) }, req.clientId);
    res.json({ data: { path: `covers/${filename}` } });
}));

router.delete('/:side', asyncHandler(async (req, res) => {
    assertSide(req.params.side);
    const gameId = req.params.gameId;
    const column = req.params.side === 'front' ? 'cover_front' : 'cover_back';

    const game = db.prepare(`SELECT ${column} as cover_path FROM games WHERE id = ?`).get(gameId);
    if (!game) throw new ApiError(404, 'NOT_FOUND', 'Jeu introuvable.');

    db.prepare(`UPDATE games SET ${column} = NULL WHERE id = ?`).run(gameId);
    if (game.cover_path) fs.unlink(path.join(UPLOADS_PATH, game.cover_path), () => {});

    hub.broadcast('cover:updated', { id: Number(gameId) }, req.clientId);
    res.status(204).end();
}));

module.exports = router;
