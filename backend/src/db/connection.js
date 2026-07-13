const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '../../../bdd/collection.sqlite');

function open() {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });
    const instance = new Database(DB_PATH);
    instance.pragma('foreign_keys = ON');
    instance.pragma('journal_mode = WAL');
    return instance;
}

let instance = open();

// Proxy transparent : tout le code fait `db.prepare(...)`, `db.pragma(...)`, etc.
// comme avec une connexion better-sqlite3 normale. Seule différence : `reconnect()`
// permet de remplacer l'instance sous-jacente après un remplacement de fichier
// sur disque (restauration de sauvegarde), sans que les modules qui ont déjà
// fait `const db = require('./connection')` gardent une référence périmée.
const db = new Proxy({}, {
    get(target, prop) {
        if (prop === 'reconnect') {
            return () => {
                try { instance.close(); } catch (e) { /* déjà fermée */ }
                instance = open();
            };
        }
        const value = instance[prop];
        return typeof value === 'function' ? value.bind(instance) : value;
    }
});

module.exports = db;
