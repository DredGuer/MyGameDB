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

// Applique la règle de conflit (hours = max(actuel, steam), jamais de
// décrément, completed jamais touché) à une instance existante et la marque
// comme synchronisée depuis Steam.
function applyConflictRule(instance, hours, steamAppId) {
    if (hours > instance.hours) {
        db.prepare(`
            UPDATE game_platforms SET hours = ?, source = 'steam-sync', steam_appid = ?, last_synced_at = datetime('now')
            WHERE id = ?
        `).run(hours, steamAppId, instance.id);
        return 'updated';
    }
    db.prepare(`UPDATE game_platforms SET steam_appid = ?, last_synced_at = datetime('now') WHERE id = ?`).run(steamAppId, instance.id);
    return 'skipped';
}

// Applique un jeu Steam à la base : matching par steam_appid en priorité (clé
// stable), sinon par titre (rattache à un jeu déjà existant sur une autre
// plateforme), sinon création d'un nouveau jeu + instance. Si le jeu a déjà
// une instance sur la console Steam (ex: créée manuellement avant toute sync,
// sans steam_appid renseigné), on la retrouve et la met à jour plutôt que de
// tenter une 2e instance sur la même console (violerait UNIQUE(game_id, console_id)).
// Règle de conflit : hours = max(actuel, steam) — jamais de décrément
// automatique ; completed n'est JAMAIS modifié par la sync (100% manuel).
function applySteamGame(steamGame, steamConsoleId) {
    const hours = Math.round((steamGame.playtime_forever || 0) / 60);

    const byAppId = db.prepare('SELECT * FROM game_platforms WHERE steam_appid = ?').get(steamGame.appid);
    if (byAppId) {
        const action = applyConflictRule(byAppId, hours, steamGame.appid);
        return { action, gameId: byAppId.game_id, platformInstanceId: byAppId.id };
    }

    const existingGame = db.prepare('SELECT id FROM games WHERE title = ? COLLATE NOCASE').get(steamGame.name);

    if (existingGame) {
        const existingSteamInstance = db.prepare(
            'SELECT * FROM game_platforms WHERE game_id = ? AND console_id = ?'
        ).get(existingGame.id, steamConsoleId);

        if (existingSteamInstance) {
            const action = applyConflictRule(existingSteamInstance, hours, steamGame.appid);
            return { action, gameId: existingGame.id, platformInstanceId: existingSteamInstance.id };
        }

        const info = db.prepare(`
            INSERT INTO game_platforms (game_id, console_id, hours, completed, platform_type, date_added, source, steam_appid, last_synced_at)
            VALUES (?, ?, ?, 0, 'Dématérialisé', date('now'), 'steam-sync', ?, datetime('now'))
        `).run(existingGame.id, steamConsoleId, hours, steamGame.appid);
        return { action: 'created', gameId: existingGame.id, platformInstanceId: info.lastInsertRowid };
    }

    const createGameAndInstance = db.transaction(() => {
        const gameInfo = db.prepare(`INSERT INTO games (title, date_added) VALUES (?, date('now'))`).run(steamGame.name);
        const platformInfo = db.prepare(`
            INSERT INTO game_platforms (game_id, console_id, hours, completed, platform_type, date_added, source, steam_appid, last_synced_at)
            VALUES (?, ?, ?, 0, 'Dématérialisé', date('now'), 'steam-sync', ?, datetime('now'))
        `).run(gameInfo.lastInsertRowid, steamConsoleId, hours, steamGame.appid);
        return { gameId: gameInfo.lastInsertRowid, platformInstanceId: platformInfo.lastInsertRowid };
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
            console.error(`Sync Steam : échec sur "${steamGame.name}" (appid ${steamGame.appid}) :`, e.message);
            report.errors += 1;
        }
    });

    if (anyChange) {
        hub.broadcast('game:platform-changed', { source: 'steam-sync' }, null);
    }

    return report;
}

module.exports = { runSync, getOrCreateSteamConsoleId, applySteamGame };
