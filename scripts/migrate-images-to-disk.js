#!/usr/bin/env node
// Migration à usage unique : convertit les images stockées en base64 inline
// (ancien schéma front-end : games.cover_front/cover_back, screenshots.image_data)
// en fichiers sur disque (storage/uploads/covers/, storage/uploads/screenshots/),
// et met à jour les colonnes pour qu'elles pointent vers ces fichiers.
//
// Usage : node scripts/migrate-images-to-disk.js
// (utilise DB_PATH et UPLOADS_PATH de l'environnement, ou les chemins par défaut)

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const projectRoot = path.join(__dirname, '..');
const dbPath = process.env.DB_PATH || path.join(projectRoot, 'bdd', 'collection.sqlite');
const uploadsPath = process.env.UPLOADS_PATH || path.join(projectRoot, 'storage', 'uploads');

function dataUrlToBuffer(dataUrl) {
    const match = /^data:image\/(\w+);base64,(.+)$/.exec(dataUrl);
    if (!match) return null;
    return { ext: match[1] === 'jpeg' ? 'jpg' : match[1], buffer: Buffer.from(match[2], 'base64') };
}

function main() {
    if (!fs.existsSync(dbPath)) {
        console.error(`Base introuvable : ${dbPath}`);
        process.exit(1);
    }

    const coversDir = path.join(uploadsPath, 'covers');
    const screenshotsDir = path.join(uploadsPath, 'screenshots');
    fs.mkdirSync(coversDir, { recursive: true });
    fs.mkdirSync(screenshotsDir, { recursive: true });

    const db = new Database(dbPath);
    db.pragma('foreign_keys = OFF'); // désactivé le temps de la migration, pas de contrainte à risque ici

    // --- Jaquettes ---
    const games = db.prepare('SELECT id, cover_front, cover_back FROM games').all();
    let coversConverted = 0;
    games.forEach(({ id, cover_front, cover_back }) => {
        ['front', 'back'].forEach((side) => {
            const value = side === 'front' ? cover_front : cover_back;
            if (!value || !value.startsWith('data:')) return; // déjà un chemin, ou vide
            const decoded = dataUrlToBuffer(value);
            if (!decoded) return;
            const filename = `${id}_${side}.${decoded.ext}`;
            fs.writeFileSync(path.join(coversDir, filename), decoded.buffer);
            const relPath = `covers/${filename}`;
            db.prepare(`UPDATE games SET cover_${side} = ? WHERE id = ?`).run(relPath, id);
            coversConverted++;
        });
    });

    // --- Screenshots : renomme la colonne image_data -> image_path si nécessaire ---
    const columns = db.prepare("PRAGMA table_info(screenshots)").all().map(c => c.name);
    if (columns.includes('image_data') && !columns.includes('image_path')) {
        db.exec('ALTER TABLE screenshots ADD COLUMN image_path TEXT');
    }

    const screenshots = db.prepare('SELECT id, image_data FROM screenshots').all();
    let screenshotsConverted = 0;
    screenshots.forEach(({ id, image_data }) => {
        if (!image_data || !image_data.startsWith('data:')) return;
        const decoded = dataUrlToBuffer(image_data);
        if (!decoded) return;
        const filename = `${id}.${decoded.ext}`;
        fs.writeFileSync(path.join(screenshotsDir, filename), decoded.buffer);
        const relPath = `screenshots/${filename}`;
        db.prepare('UPDATE screenshots SET image_path = ? WHERE id = ?').run(relPath, id);
        screenshotsConverted++;
    });

    db.pragma('foreign_keys = ON');
    db.close();

    console.log(`Jaquettes converties : ${coversConverted}`);
    console.log(`Screenshots convertis : ${screenshotsConverted}`);
    console.log('Migration terminée. La colonne image_data (obsolète) peut rester en base sans effet — non lue par le backend.');
}

main();
