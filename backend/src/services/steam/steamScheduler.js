// Planifie la synchronisation Steam périodique via setInterval natif — pas de
// dépendance type node-cron pour un besoin aussi simple (cohérent avec
// l'absence de dépendances lourdes du projet, voir CLAUDE.md).
const { hasSteamCredentials } = require('./steamClient');
const { runSync } = require('./steamSync');

const DEFAULT_INTERVAL_HOURS = 6;

let lastSyncAt = null;
let lastSyncReport = null;
let lastSyncError = null;

function getStatus() {
    return {
        configured: hasSteamCredentials(),
        lastSyncAt,
        lastSyncReport,
        lastSyncError
    };
}

async function triggerSync() {
    try {
        lastSyncReport = await runSync();
        lastSyncAt = new Date().toISOString();
        lastSyncError = null;
        return lastSyncReport;
    } catch (e) {
        lastSyncError = e.message;
        throw e;
    }
}

// Démarre la sync au boot (non bloquante) puis toutes les N heures. No-op
// silencieux si les credentials Steam ne sont pas configurés.
function start() {
    if (!hasSteamCredentials()) return;

    const intervalHours = parseFloat(process.env.STEAM_SYNC_INTERVAL_HOURS) || DEFAULT_INTERVAL_HOURS;

    triggerSync().catch((e) => console.error('Synchronisation Steam initiale échouée :', e.message));

    setInterval(() => {
        triggerSync().catch((e) => console.error('Synchronisation Steam périodique échouée :', e.message));
    }, intervalHours * 60 * 60 * 1000);
}

module.exports = { start, triggerSync, getStatus };
