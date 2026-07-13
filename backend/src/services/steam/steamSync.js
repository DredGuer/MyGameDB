// Logique de synchronisation de la bibliothèque Steam vers game_platforms.
// Séparée de steamClient.js (accès HTTP pur) pour rester testable indépendamment.
const db = require('../../db/connection');
const { fetchOwnedGames } = require('./steamClient');
const hub = require('../../ws/hub');

const STEAM_FAMILY_NAME = 'PC';
const STEAM_CONSOLE_NAME = 'Steam';

function getOrCreateSteamConsoleId() {
    db.prepare('INSERT OR IGNORE INTO families (name) VALUES (?)').run(STEAM_FAMILY_NAME);
    const family = db.prepare('SELECT id FROM families WHERE name = ?').get(STEAM_FAMILY_NAME);

    db.prepare('INSERT OR IGNORE INTO consoles (family_id, name) VALUES (?, ?)').run(family.id, STEAM_CONSOLE_NAME);
    const console_ = db.prepare('SELECT id FROM consoles WHERE name = ?').get(STEAM_CONSOLE_NAME);
    return console_.id;
}

// Applique un jeu Steam à la base : matching par steam_appid en priorité (clé
// stable), sinon par titre (rattache à un jeu déjà existant sur une autre
// plateforme), sinon création d'un nouveau jeu + instance.
// Règle de conflit : hours = max(actuel, steam) — jamais de décrément
// automatique ; completed n'est JAMAIS modifié par la sync (100% manuel).
function applySteamGame(steamGame, steamConsoleId) {
    const hours = Math.round((steamGame.playtime_forever || 0) / 60);

    const byAppId = db.prepare('SELECT * FROM game_platforms WHERE steam_appid = ?').get(steamGame.appid);
    if (byAppId) {
        if (hours > byAppId.hours) {
            db.prepare(`
                UPDATE game_platforms SET hours = ?, source = 'steam-sync', last_synced_at = datetime('now')
                WHERE id = ?
            `).run(hours, byAppId.id);
            return { action: 'updated', gameId: byAppId.game_id, platformInstanceId: byAppId.id };
        }
        db.prepare(`UPDATE game_platforms SET last_synced_at = datetime('now') WHERE id = ?`).run(byAppId.id);
        return { action: 'skipped', gameId: byAppId.game_id, platformInstanceId: byAppId.id };
    }

    const existingGame = db.prepare('SELECT id FROM games WHERE title = ? COLLATE NOCASE').get(steamGame.name);

    const createInstance = db.transaction((gameId) => {
        const info = db.prepare(`
            INSERT INTO game_platforms (game_id, console_id, hours, completed, platform_type, date_added, source, steam_appid, last_synced_at)
            VALUES (?, ?, ?, 0, 'Dématérialisé', date('now'), 'steam-sync', ?, datetime('now'))
        `).run(gameId, steamConsoleId, hours, steamGame.appid);
        return info.lastInsertRowid;
    });

    if (existingGame) {
        const platformInstanceId = createInstance(existingGame.id);
        return { action: 'created', gameId: existingGame.id, platformInstanceId };
    }

    const createGameAndInstance = db.transaction(() => {
        const gameInfo = db.prepare(`INSERT INTO games (title, date_added) VALUES (?, date('now'))`).run(steamGame.name);
        const platformInstanceId = createInstance(gameInfo.lastInsertRowid);
        return { gameId: gameInfo.lastInsertRowid, platformInstanceId };
    });

    const { gameId, platformInstanceId } = createGameAndInstance();
    return { action: 'created', gameId, platformInstanceId };
}

async function runSync() {
    const steamConsoleId = getOrCreateSteamConsoleId();
    const games = await fetchOwnedGames();

    const report = { created: 0, updated: 0, skipped: 0, errors: 0 };
    let anyChange = false;

    games.forEach((steamGame) => {
        try {
            const result = applySteamGame(steamGame, steamConsoleId);
            report[result.action] += 1;
            if (result.action !== 'skipped') anyChange = true;
        } catch (e) {
            report.errors += 1;
        }
    });

    if (anyChange) {
        hub.broadcast('game:platform-changed', { source: 'steam-sync' }, null);
    }

    return report;
}

module.exports = { runSync, getOrCreateSteamConsoleId, applySteamGame };
