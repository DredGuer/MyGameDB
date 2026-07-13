#!/usr/bin/env node
// Applique le schéma (backend/src/db/schema.sql) sur la base pointée par DB_PATH.
// Idempotent : sûr à relancer (CREATE TABLE IF NOT EXISTS, INSERT OR IGNORE).
// Appelé automatiquement au démarrage du serveur (voir backend/src/server.js).

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function initDb(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');

    const schemaPath = path.join(__dirname, '../backend/src/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    db.close();
    console.log(`Base initialisée/vérifiée : ${dbPath}`);
}

if (require.main === module) {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../bdd/collection.sqlite');
    initDb(dbPath);
}

module.exports = { initDb };
