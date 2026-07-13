#!/usr/bin/env node
// Script à usage unique : migre une base au schéma "1 jeu = 1 console"
// (games.console_id direct) vers le nouveau modèle multi-plateforme
// (1 jeu = N instances de possession via game_platforms).
//
// Ce qu'il fait :
//   1. Vérifie l'idempotence (colonne games.console_id encore présente ?).
//      Si absente, la migration a déjà été appliquée : no-op.
//   2. Crée game_platforms et game_platform_ownership_periods si besoin.
//   3. Copie chaque jeu existant (console_id, hours, completed,
//      platform_type, date_completed) vers une instance game_platforms
//      (source='manuel'), en conservant la relation 1:1 historique.
//   4. Migre game_ownership_periods vers game_platform_ownership_periods
//      via le mapping game_id -> game_platform.id construit à l'étape 3.
//   5. Recrée la table games sans les colonnes migrées (les id sont
//      préservés, donc screenshots/game_genres restent valides).
//   6. Renomme game_ownership_periods en game_ownership_periods_deprecated
//      (filet de sécurité, pas de suppression).
//
// Usage :
//   node scripts/migrate-to-multi-platform.js [chemin-vers-base.sqlite]
//   (par défaut : DB_PATH ou bdd/collection.sqlite)
//
// Peut aussi être appelé programmatiquement (voir scripts/init-db.js) via
// runMigration(db) sur une connexion better-sqlite3 déjà ouverte.

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

function needsMigration(db) {
    const columns = db.prepare("PRAGMA table_info(games)").all();
    return columns.some((c) => c.name === 'console_id');
}

// Exécute la migration sur une connexion déjà ouverte. Retourne un résumé,
// ou null si la migration n'était pas nécessaire (idempotence).
//
// PRAGMA foreign_keys est désactivé puis restauré autour de la migration :
// avec les FK actives, le DROP TABLE games (étape de reconstruction de la
// table sans les colonnes migrées) déclenche du CASCADE implicite sur
// game_platforms.game_id et vide silencieusement les lignes qu'on vient d'y
// insérer. Le pragma ne peut pas être togglé DANS la transaction (no-op
// silencieux en SQLite), d'où le désactiver avant de l'ouvrir.
function runMigration(db) {
    if (!needsMigration(db)) {
        return null;
    }

    const fkWasOn = db.pragma('foreign_keys', { simple: true }) === 1;
    if (fkWasOn) db.pragma('foreign_keys = OFF');

    const summary = { gamesMigrated: 0, instancesCreated: 0, periodsMigrated: 0 };

    const migrate = db.transaction(() => {
        db.exec(`
            CREATE TABLE IF NOT EXISTS game_platforms (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_id INTEGER NOT NULL,
                console_id INTEGER NOT NULL,
                hours INTEGER NOT NULL DEFAULT 0,
                completed INTEGER NOT NULL DEFAULT 0,
                platform_type TEXT NOT NULL DEFAULT 'Physique',
                date_added TEXT DEFAULT (date('now')),
                date_completed TEXT,
                source TEXT NOT NULL DEFAULT 'manuel',
                steam_appid INTEGER,
                last_synced_at TEXT,
                FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
                FOREIGN KEY (console_id) REFERENCES consoles(id) ON DELETE CASCADE,
                UNIQUE (game_id, console_id)
            );
            CREATE INDEX IF NOT EXISTS idx_game_platforms_game ON game_platforms(game_id);
            CREATE INDEX IF NOT EXISTS idx_game_platforms_console ON game_platforms(console_id);

            CREATE TABLE IF NOT EXISTS game_platform_ownership_periods (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                game_platform_id INTEGER NOT NULL,
                date_start TEXT,
                date_end TEXT,
                FOREIGN KEY (game_platform_id) REFERENCES game_platforms(id) ON DELETE CASCADE
            );
            CREATE INDEX IF NOT EXISTS idx_gpop_game_platform ON game_platform_ownership_periods(game_platform_id);
        `);

        const oldGames = db.prepare(`
            SELECT id, console_id, hours, completed, platform_type, date_added, date_completed
            FROM games
        `).all();

        const insertInstance = db.prepare(`
            INSERT INTO game_platforms
                (game_id, console_id, hours, completed, platform_type, date_added, date_completed, source)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'manuel')
        `);

        const gameIdToPlatformId = {};
        oldGames.forEach((g) => {
            const info = insertInstance.run(
                g.id, g.console_id, g.hours, g.completed, g.platform_type, g.date_added, g.date_completed
            );
            gameIdToPlatformId[g.id] = info.lastInsertRowid;
            summary.gamesMigrated += 1;
            summary.instancesCreated += 1;
        });

        const ownershipTableExists = db.prepare(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='game_ownership_periods'"
        ).get();

        if (ownershipTableExists) {
            const oldPeriods = db.prepare(
                'SELECT game_id, date_start, date_end FROM game_ownership_periods'
            ).all();

            const insertPeriod = db.prepare(`
                INSERT INTO game_platform_ownership_periods (game_platform_id, date_start, date_end)
                VALUES (?, ?, ?)
            `);

            oldPeriods.forEach((p) => {
                const platformId = gameIdToPlatformId[p.game_id];
                if (!platformId) return; // jeu orphelin, ne devrait pas arriver
                insertPeriod.run(platformId, p.date_start, p.date_end);
                summary.periodsMigrated += 1;
            });

            db.exec('ALTER TABLE game_ownership_periods RENAME TO game_ownership_periods_deprecated');
        }

        // Recrée `games` sans les colonnes migrées. SQLite ne garantit
        // ALTER TABLE ... DROP COLUMN que depuis 3.35 : on suit le pattern
        // standard (table temporaire + copie + swap) pour rester portable
        // quelle que soit la version de SQLite embarquée par better-sqlite3.
        db.exec(`
            CREATE TABLE games_new (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                rating INTEGER,
                notes TEXT DEFAULT '',
                date_added TEXT DEFAULT (date('now')),
                cover_front TEXT,
                cover_back TEXT
            );
            INSERT INTO games_new (id, title, rating, notes, date_added, cover_front, cover_back)
                SELECT id, title, rating, notes, date_added, cover_front, cover_back FROM games;
            DROP TABLE games;
            ALTER TABLE games_new RENAME TO games;
        `);
    });

    try {
        migrate();
    } finally {
        if (fkWasOn) db.pragma('foreign_keys = ON');
    }
    return summary;
}

function main() {
    const projectRoot = path.resolve(__dirname, '..');
    const dbPath = process.argv[2]
        ? path.resolve(projectRoot, process.argv[2])
        : (process.env.DB_PATH || path.join(projectRoot, 'bdd', 'collection.sqlite'));

    if (!fs.existsSync(dbPath)) {
        console.error(`Fichier introuvable : ${dbPath}`);
        process.exit(1);
    }

    const db = new Database(dbPath);
    db.pragma('foreign_keys = ON');

    const summary = runMigration(db);

    db.close();

    if (summary === null) {
        console.log('Migration déjà appliquée, rien à faire.');
    } else {
        console.log('Migration terminée :');
        console.log(`  - ${summary.gamesMigrated} jeu(x) migré(s)`);
        console.log(`  - ${summary.instancesCreated} instance(s) de plateforme créée(s)`);
        console.log(`  - ${summary.periodsMigrated} période(s) de possession migrée(s)`);
        console.log("  - Ancienne table game_ownership_periods renommée en game_ownership_periods_deprecated");
    }
}

if (require.main === module) {
    main();
}

module.exports = { needsMigration, runMigration };
