const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const Database = require('better-sqlite3');
const db = require('../db/connection');
const asyncHandler = require('../middleware/asyncHandler');
const { ApiError } = require('../middleware/errorHandler');
const hub = require('../ws/hub');
const { buildInventoryMarkdown } = require('../services/markdownExport');

const router = express.Router();
const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../bdd/collection.sqlite');

const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 100 * 1024 * 1024 }
});

router.get('/sqlite', asyncHandler(async (req, res) => {
    db.pragma('wal_checkpoint(TRUNCATE)'); // s'assure que le fichier sur disque est à jour (mode WAL)
    res.download(DB_PATH, 'ma_collection_jeux.sqlite');
}));

router.get('/markdown', asyncHandler(async (req, res) => {
    const md = buildInventoryMarkdown();
    if (md === null) throw new ApiError(400, 'VALIDATION_ERROR', 'Ta collection est vide.');

    res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="mon_inventaire_jeux.md"');
    res.send(md);
}));

// Remplacement total de la base à partir d'un fichier .sqlite uploadé.
// Validation minimale : vérifie que les tables attendues existent avant de
// remplacer le fichier en place (évite d'écraser la base avec un fichier
// corrompu ou sans rapport).
router.post('/restore', upload.single('file'), asyncHandler(async (req, res) => {
    if (!req.file) throw new ApiError(400, 'VALIDATION_ERROR', 'Aucun fichier reçu.');

    const tmpPath = path.join(path.dirname(DB_PATH), `.restore-tmp-${Date.now()}.sqlite`);
    fs.writeFileSync(tmpPath, req.file.buffer);

    let candidate;
    try {
        candidate = new Database(tmpPath, { readonly: true });
        candidate.prepare('SELECT id FROM families LIMIT 1').get();
        candidate.prepare('SELECT id FROM consoles LIMIT 1').get();
        candidate.prepare('SELECT id FROM games LIMIT 1').get();
        candidate.close();
    } catch (e) {
        fs.unlinkSync(tmpPath);
        throw new ApiError(400, 'VALIDATION_ERROR', "Le fichier n'est pas une base de données SQLite valide pour cette application.");
    }

    db.close();
    fs.renameSync(tmpPath, DB_PATH);
    db.reconnect();

    hub.broadcast('db:restored', {}, req.clientId);
    res.json({ data: { restored: true } });
}));

module.exports = router;
