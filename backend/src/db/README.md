# db — Connexion et schéma SQLite

## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
5. [Index du Projet](#index-du-projet)
11. [Base de Données](#base-de-données)
13. [Troubleshooting](#troubleshooting)

## Fonctionnalités Principales

- `connection.js` : ouvre la connexion `better-sqlite3` vers le fichier pointé par `DB_PATH`, active `PRAGMA foreign_keys` et le mode `WAL`. Expose un proxy avec une méthode `reconnect()` utilisée après une restauration de sauvegarde (voir `routes/backup.routes.js`).
- `schema.sql` : DDL complet (tables, contraintes, seed des genres par défaut), source de vérité appliquée par `scripts/init-db.js`.

## Index du Projet

```
db/
├── connection.js   # Connexion partagée (singleton via proxy)
└── schema.sql       # DDL + seed
```

## Base de Données

Tables : `families`, `consoles`, `games`, `screenshots`, `app_settings`, `genres`, `game_genres`, `game_ownership_periods`, `console_ownership_periods`, `llm_settings` (préférences uniquement, jamais de clé API), `recommendations`, `recommendation_history`.

Différences notables par rapport à l'ancien schéma front-end :
- `games.cover_front` / `cover_back` et `screenshots.image_path` stockent un **chemin de fichier relatif** (ex: `covers/12_front.jpg`) au lieu d'un data URL base64 inline.
- `llm_settings` ne contient plus de colonnes `llm_api_key_*` — les clés vivent dans les variables d'environnement du serveur.

## Troubleshooting

- **`FOREIGN KEY constraint failed`** : vérifier que l'entité parente (console, jeu, genre) existe bien avant l'insertion — les contraintes FK sont actives (`PRAGMA foreign_keys = ON`).
- **Modifications non persistées après un `docker compose down`** : vérifier que le volume `./bdd:/app/bdd` est bien monté dans `docker-compose.yml`.
