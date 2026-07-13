-- Schéma de la base MyGameDB (backend).
-- Source de vérité du schéma, appliqué par scripts/init-db.js sur une base vide.
-- Différences volontaires par rapport à l'ancien schéma front-end (sql.js) :
--   - cover_front / cover_back stockent désormais un chemin de fichier relatif
--     (ex: "covers/12_front.jpg") au lieu d'un data URL base64 inline.
--   - llm_settings ne stocke plus jamais de clé API (voir .env / LLM_API_KEY_*).

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS families (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS consoles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    family_id INTEGER NOT NULL,
    name TEXT UNIQUE NOT NULL,
    FOREIGN KEY (family_id) REFERENCES families(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS games (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    console_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    hours INTEGER NOT NULL DEFAULT 0,
    completed INTEGER NOT NULL DEFAULT 0,
    platform_type TEXT NOT NULL DEFAULT 'Physique',
    rating INTEGER,
    notes TEXT DEFAULT '',
    date_added TEXT DEFAULT (date('now')),
    date_completed TEXT,
    cover_front TEXT,
    cover_back TEXT,
    FOREIGN KEY (console_id) REFERENCES consoles(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS screenshots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    title TEXT DEFAULT '',
    description TEXT DEFAULT '',
    image_path TEXT NOT NULL,
    position INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS genres (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT UNIQUE NOT NULL
);

CREATE TABLE IF NOT EXISTS game_genres (
    game_id INTEGER NOT NULL,
    genre_id INTEGER NOT NULL,
    PRIMARY KEY (game_id, genre_id),
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE,
    FOREIGN KEY (genre_id) REFERENCES genres(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS game_ownership_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    game_id INTEGER NOT NULL,
    date_start TEXT,
    date_end TEXT,
    FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS console_ownership_periods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    console_id INTEGER NOT NULL,
    date_start TEXT,
    date_end TEXT,
    FOREIGN KEY (console_id) REFERENCES consoles(id) ON DELETE CASCADE
);

-- Préférences LLM uniquement (provider choisi, modèle par fournisseur).
-- Les clés API vivent exclusivement dans les variables d'environnement.
CREATE TABLE IF NOT EXISTS llm_settings (
    key TEXT PRIMARY KEY,
    value TEXT
);

CREATE TABLE IF NOT EXISTS recommendations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    match_score INTEGER NOT NULL,
    reason TEXT,
    info_url TEXT,
    category TEXT,
    user_feedback_score INTEGER,
    user_disliked_style INTEGER DEFAULT 0,
    user_already_done INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS recommendation_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    match_score INTEGER,
    created_at TEXT DEFAULT (datetime('now'))
);

INSERT OR IGNORE INTO genres (name) VALUES
    ('Action'), ('Aventure'), ('RPG'), ('Stratégie'), ('FPS'),
    ('Plateforme'), ('Sport'), ('Course'), ('Simulation'), ('Puzzle'),
    ('Party Game'), ('Survie/Horreur'), ('MOBA'), ('MMO'), ('Rythme/Musical');
