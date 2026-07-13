# scripts — Scripts d'exploitation et de migration

## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
5. [Index du Projet](#index-du-projet)
6. [Démarrage Rapide](#démarrage-rapide)
13. [Troubleshooting](#troubleshooting)

## Fonctionnalités Principales

- `init-db.js` : applique `backend/src/db/schema.sql` sur le fichier pointé par `DB_PATH`. **Idempotent** (sûr à relancer) — appelé automatiquement au démarrage du serveur (`backend/src/server.js`).
- `sanitize-existing-db.js` : script one-shot utilisé une seule fois lors de la migration v2.0.0 pour extraire une clé API stockée en clair dans une base issue de l'ancienne version front-end, l'écrire dans `.env`, puis la purger de la base.
- `migrate-images-to-disk.js` : script one-shot utilisé une seule fois lors de la migration v2.0.0 pour convertir les images base64 inline (ancien schéma) en fichiers sur disque (`storage/uploads/`).

## Index du Projet

```
scripts/
├── init-db.js                  # Récurrent — lancé à chaque démarrage du serveur
├── sanitize-existing-db.js     # One-shot — déjà exécuté lors de la migration v2.0.0
└── migrate-images-to-disk.js   # One-shot — déjà exécuté lors de la migration v2.0.0
```

## Démarrage Rapide

```bash
# Depuis la racine du projet (nécessite npm install préalable)
node scripts/init-db.js
```

Les deux scripts one-shot (`sanitize-existing-db.js`, `migrate-images-to-disk.js`) ne doivent normalement plus être relancés — ils documentent la migration passée et servent de référence si une situation similaire se reproduit (ex: import d'une ancienne sauvegarde front-end).

## Troubleshooting

- **`Cannot find module 'better-sqlite3'`** : lancer les scripts depuis la racine du projet (le module est hoisté dans `node_modules/` à la racine via npm workspaces), pas depuis `scripts/` ou `backend/`.
