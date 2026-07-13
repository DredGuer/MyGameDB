// Erreur métier typée : les routes lèvent `new ApiError(404, 'NOT_FOUND', "...")`
// pour un contrôle précis du code HTTP et du code d'erreur renvoyés au client.
class ApiError extends Error {
    constructor(status, code, message) {
        super(message);
        this.status = status;
        this.code = code;
    }
}

// Traduit les erreurs SQLite courantes (contrainte UNIQUE, contrainte FK) en
// réponses HTTP propres, sans exposer de détail interne au client.
function mapSqliteError(err) {
    if (err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
        return new ApiError(409, 'CONFLICT', 'Cet élément existe déjà.');
    }
    if (err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') {
        return new ApiError(400, 'VALIDATION_ERROR', 'Référence invalide (élément parent introuvable).');
    }
    return null;
}

function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
    const mapped = err instanceof ApiError ? err : (mapSqliteError(err) || err);

    if (mapped instanceof ApiError) {
        return res.status(mapped.status).json({ error: { message: mapped.message, code: mapped.code } });
    }

    console.error('[unhandled error]', err);
    res.status(500).json({ error: { message: 'Erreur interne du serveur.', code: 'INTERNAL' } });
}

module.exports = { ApiError, errorHandler };
