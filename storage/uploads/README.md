# storage/uploads — Fichiers images (jaquettes, screenshots)

## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
5. [Index du Projet](#index-du-projet)
12. [Configuration](#configuration)
13. [Troubleshooting](#troubleshooting)

## Fonctionnalités Principales

Stocke les jaquettes (`covers/`) et screenshots (`screenshots/`) uploadés par l'utilisateur, en fichiers bruts sur disque. Servi statiquement par le backend via `/uploads/*` (voir `backend/src/server.js`).

Ce dossier remplace l'ancien stockage en base64 inline dans les colonnes SQLite (`games.cover_front`/`cover_back`, `screenshots.image_data`) — évite de gonfler la base de données et les payloads JSON de l'API.

## Index du Projet

```
storage/uploads/
├── covers/          # {gameId}_{front|back}.{ext}
└── screenshots/     # {screenshotId}.{ext}
```

## Configuration

Chemin configurable via la variable d'environnement `UPLOADS_PATH` (défaut : `/app/storage/uploads` en conteneur Docker, monté en volume depuis `./storage/uploads` sur la machine hôte — voir `docker-compose.yml`).

## Troubleshooting

- **Images perdues après `docker compose down` puis `up`** : vérifier que le volume `./storage/uploads:/app/storage/uploads` est bien déclaré dans `docker-compose.yml` (il l'est par défaut).
- **Ce dossier ne doit jamais être commité avec du contenu réel** : voir `.gitignore` (`storage/uploads/covers/*` et `storage/uploads/screenshots/*` sont ignorés, seuls les `.gitkeep` sont versionnés).
