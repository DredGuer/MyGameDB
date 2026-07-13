// Wrapper fetch centralisé vers l'API backend. Remplace tous les accès directs
// sql.js (db.exec/db.run) de l'ancienne version front-end.

// Identifiant unique de cet onglet/navigateur, envoyé sur chaque requête mutante
// pour permettre au client émetteur de s'auto-ignorer sur l'écho WebSocket
// (voir ws-client.js).
const CLIENT_ID = (() => {
    let id = sessionStorage.getItem('mygamedb_client_id');
    if (!id) {
        id = crypto.randomUUID();
        sessionStorage.setItem('mygamedb_client_id', id);
    }
    return id;
})();

class ApiError extends Error {
    constructor(message, code, status) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

async function apiFetch(method, path, body) {
    const res = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json', 'X-Client-Id': CLIENT_ID },
        body: body !== undefined ? JSON.stringify(body) : undefined
    });

    if (res.status === 204) return null;

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
        const err = payload?.error || { message: `Erreur HTTP ${res.status}`, code: 'UNKNOWN' };
        throw new ApiError(err.message, err.code, res.status);
    }
    return payload.data;
}

async function apiUpload(method, path, formData) {
    const res = await fetch(path, {
        method,
        headers: { 'X-Client-Id': CLIENT_ID },
        body: formData
    });

    if (res.status === 204) return null;

    const payload = await res.json().catch(() => null);
    if (!res.ok) {
        const err = payload?.error || { message: `Erreur HTTP ${res.status}`, code: 'UNKNOWN' };
        throw new ApiError(err.message, err.code, res.status);
    }
    return payload.data;
}

const api = {
    // Familles
    getFamilies: () => apiFetch('GET', '/api/families'),
    createFamily: (name) => apiFetch('POST', '/api/families', { name }),
    updateFamily: (id, name) => apiFetch('PUT', `/api/families/${id}`, { name }),
    deleteFamily: (id) => apiFetch('DELETE', `/api/families/${id}`),

    // Consoles
    getConsoles: () => apiFetch('GET', '/api/consoles'),
    createConsole: (name, familyId) => apiFetch('POST', '/api/consoles', { name, family_id: familyId }),
    updateConsole: (id, name, familyId) => apiFetch('PUT', `/api/consoles/${id}`, { name, family_id: familyId }),
    deleteConsole: (id) => apiFetch('DELETE', `/api/consoles/${id}`),
    getConsoleOwnershipPeriods: (id) => apiFetch('GET', `/api/consoles/${id}/ownership-periods`),
    addConsoleOwnershipPeriod: (id, dateStart, dateEnd) => apiFetch('POST', `/api/consoles/${id}/ownership-periods`, { date_start: dateStart, date_end: dateEnd }),
    deleteConsoleOwnershipPeriod: (periodId) => apiFetch('DELETE', `/api/consoles/ownership-periods/${periodId}`),

    // Jeux
    getGames: (params = {}) => {
        const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v !== undefined && v !== ''));
        const query = qs.toString();
        return apiFetch('GET', `/api/games${query ? '?' + query : ''}`);
    },
    getGame: (id) => apiFetch('GET', `/api/games/${id}`),
    createGame: (data) => apiFetch('POST', '/api/games', data),
    updateGame: (id, data) => apiFetch('PUT', `/api/games/${id}`, data),
    deleteGame: (id) => apiFetch('DELETE', `/api/games/${id}`),
    getGameOwnershipPeriods: (id) => apiFetch('GET', `/api/games/${id}/ownership-periods`),
    addGameOwnershipPeriod: (id, dateStart, dateEnd) => apiFetch('POST', `/api/games/${id}/ownership-periods`, { date_start: dateStart, date_end: dateEnd }),
    deleteGameOwnershipPeriod: (periodId) => apiFetch('DELETE', `/api/games/ownership-periods/${periodId}`),

    // Genres
    getGenres: () => apiFetch('GET', '/api/genres'),
    getGenresByGame: () => apiFetch('GET', '/api/genres/by-game'),
    createGenre: (name) => apiFetch('POST', '/api/genres', { name }),
    deleteGenre: (id) => apiFetch('DELETE', `/api/genres/${id}`),
    getGameGenres: (gameId) => apiFetch('GET', `/api/games/${gameId}/genres`),
    addGameGenre: (gameId, genreId) => apiFetch('POST', `/api/games/${gameId}/genres/${genreId}`),
    removeGameGenre: (gameId, genreId) => apiFetch('DELETE', `/api/games/${gameId}/genres/${genreId}`),
    autoDetectGenre: (gameId) => apiFetch('POST', `/api/games/${gameId}/genres/auto-detect`),

    // Screenshots
    getScreenshots: (gameId) => apiFetch('GET', `/api/games/${gameId}/screenshots`),
    addScreenshot: (gameId, file, title, description) => {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('title', title || '');
        fd.append('description', description || '');
        return apiUpload('POST', `/api/games/${gameId}/screenshots`, fd);
    },
    updateScreenshot: (id, title, description) => apiFetch('PUT', `/api/screenshots/${id}`, { title, description }),
    deleteScreenshot: (id) => apiFetch('DELETE', `/api/screenshots/${id}`),

    // Jaquettes
    uploadCover: (gameId, side, file) => {
        const fd = new FormData();
        fd.append('file', file);
        return apiUpload('PUT', `/api/games/${gameId}/covers/${side}`, fd);
    },
    deleteCover: (gameId, side) => apiFetch('DELETE', `/api/games/${gameId}/covers/${side}`),

    // Réglages
    getBirthdate: () => apiFetch('GET', '/api/settings/birthdate'),
    setBirthdate: (value) => apiFetch('PUT', '/api/settings/birthdate', { value }),

    // Réglages LLM
    getLlmSettings: () => apiFetch('GET', '/api/llm-settings'),
    setLlmSettings: (provider, model) => apiFetch('PUT', '/api/llm-settings', { provider, model }),

    // Recommandations
    getRecommendations: () => apiFetch('GET', '/api/recommendations'),
    generateRecommendations: () => apiFetch('POST', '/api/recommendations/generate'),
    refineRecommendations: (userNote) => apiFetch('POST', '/api/recommendations/refine', { userNote }),
    updateRecommendationFeedback: (id, field, value) => apiFetch('PUT', `/api/recommendations/${id}/feedback`, { field, value }),
    getRecommendationHistory: () => apiFetch('GET', '/api/recommendations/history'),
    clearRecommendationHistory: () => apiFetch('DELETE', '/api/recommendations/history'),

    // Dashboard
    getDashboardStats: () => apiFetch('GET', '/api/dashboard/stats'),
    getFamilyBreakdown: () => apiFetch('GET', '/api/dashboard/breakdown/families'),
    getGenreBreakdown: () => apiFetch('GET', '/api/dashboard/breakdown/genres'),
    getAgeGenreAnalysis: () => apiFetch('GET', '/api/dashboard/age-genre-analysis'),

    // Backup
    exportSqliteUrl: () => '/api/backup/sqlite',
    exportMarkdownUrl: () => '/api/backup/markdown',
    restoreBackup: (file) => {
        const fd = new FormData();
        fd.append('file', file);
        return apiUpload('POST', '/api/backup/restore', fd);
    }
};
