#!/usr/bin/env node
// Applique le schéma (backend/src/db/schema.sql) sur la base pointée par DB_PATH.
// Idempotent : sûr à relancer (CREATE TABLE IF NOT EXISTS, INSERT OR IGNORE).
// Appelé automatiquement au démarrage du serveur (voir backend/src/server.js).
//
// Si la base est encore à l'ancien format "1 jeu = 1 console" (games.console_id
// présent), la migration vers le modèle multi-plateforme (scripts/migrate-to-
// multi-platform.js) est appliquée automatiquement AVANT le schéma courant,
// pour qu'un démarrage sur une base existante migre sans étape manuelle.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { needsMigration, runMigration } = require('./migrate-to-multi-platform');
const { DEFAULT_CATALOG } = require('./default-catalog');

// Ajoute les colonnes manquantes aux tables de périodes de possession si
// elles existaient déjà sans elles (base créée avant leur introduction).
// CREATE TABLE IF NOT EXISTS ne modifie jamais une table existante, d'où ces
// ALTER TABLE explicites et idempotents (vérifie PRAGMA table_info avant).
function migrateOwnershipPeriodsColumns(db) {
    const addColumnsIfMissing = (table, columnDefs) => {
        const existing = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
        Object.entries(columnDefs).forEach(([name, type]) => {
            if (!existing.includes(name)) {
                db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${type}`);
            }
        });
    };

    // Volet financier commun aux deux tables de périodes (prix d'achat/vente,
    // interlocuteur et son type, notes libres). Tout est nullable : une période
    // existante reste valide telle quelle, sans valeur par défaut à inventer.
    const FINANCIAL_COLUMNS = {
        purchase_price: 'REAL',
        purchase_from: 'TEXT',
        purchase_from_type: 'TEXT',
        sale_price: 'REAL',
        sale_to: 'TEXT',
        sale_to_type: 'TEXT',
        purchase_notes: 'TEXT'
    };

    addColumnsIfMissing('console_ownership_periods', {
        model: 'TEXT', serial_number: 'TEXT', acquisition_type: 'TEXT', ...FINANCIAL_COLUMNS
    });
    addColumnsIfMissing('game_platform_ownership_periods', { acquisition_type: 'TEXT', ...FINANCIAL_COLUMNS });
}

// Pré-remplit familles + consoles UNIQUEMENT si families est vide (nouvelle
// base) — jamais sur une base ayant déjà ses propres noms (ex: "Playstation 1"
// au lieu de "PlayStation"), pour ne jamais créer de doublon conceptuel.
function seedDefaultCatalog(db) {
    const familiesCount = db.prepare('SELECT COUNT(*) as c FROM families').get().c;
    if (familiesCount > 0) return false;

    const insertFamily = db.prepare('INSERT INTO families (name) VALUES (?)');
    const insertConsole = db.prepare('INSERT INTO consoles (family_id, name) VALUES (?, ?)');

    const seed = db.transaction(() => {
        Object.entries(DEFAULT_CATALOG).forEach(([familyName, consoleNames]) => {
            const info = insertFamily.run(familyName);
            consoleNames.forEach((consoleName) => insertConsole.run(info.lastInsertRowid, consoleName));
        });
    });
    seed();
    return true;
}

function initDb(dbPath) {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');

    if (needsMigration(db)) {
        const summary = runMigration(db); // gère elle-même le pragma foreign_keys pendant la migration
        console.log(`Migration multi-plateforme appliquée : ${summary.gamesMigrated} jeu(x), ${summary.instancesCreated} instance(s), ${summary.periodsMigrated} période(s).`);
    }

    const schemaPath = path.join(__dirname, '../backend/src/db/schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    db.exec(schema);

    migrateOwnershipPeriodsColumns(db);

    if (seedDefaultCatalog(db)) {
        console.log('Catalogue standard de familles/consoles pré-rempli (base vide détectée).');
    }

    db.close();
    console.log(`Base initialisée/vérifiée : ${dbPath}`);
}

if (require.main === module) {
    const dbPath = process.env.DB_PATH || path.join(__dirname, '../bdd/collection.sqlite');
    initDb(dbPath);
}

module.exports = { initDb };
