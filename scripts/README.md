# scripts — Scripts d'exploitation et de migration

## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
5. [Index du Projet](#index-du-projet)
6. [Démarrage Rapide](#démarrage-rapide)
13. [Troubleshooting](#troubleshooting)

## Fonctionnalités Principales

- `init-db.js` : applique `backend/src/db/schema.sql` sur le fichier pointé par `DB_PATH`. **Idempotent** (sûr à relancer) — appelé automatiquement au démarrage du serveur (`backend/src/server.js`). Détecte automatiquement une base encore au format "1 jeu = 1 console" et invoque `migrate-to-multi-platform.js` avant d'appliquer le schéma. Pré-remplit aussi le catalogue standard de familles/consoles (`default-catalog.js`) si `families` est vide.
- `default-catalog.js` : données du catalogue standard de familles/consoles (Sony, Nintendo, Microsoft, SEGA, Atari, PC, Mobile, Web...), utilisé uniquement par `init-db.js` sur une base tout juste créée — une base ayant déjà ses propres familles/consoles (même partiellement, y compris avec une formulation différente) n'est jamais modifiée.
- `migrate-to-multi-platform.js` : script de migration de données, auto-invoqué par `init-db.js` si nécessaire (peut aussi être lancé manuellement en CLI). Transforme le modèle "1 jeu = 1 console" (`games.console_id`) vers le modèle multi-plateforme (`game_platforms`, une instance par couple jeu+plateforme). **Idempotent** — no-op si déjà appliqué. Conserve l'ancienne table `game_ownership_periods` sous le nom `game_ownership_periods_deprecated` (filet de sécurité).
- `sanitize-existing-db.js` : script one-shot utilisé une seule fois lors de la migration v2.0.0 pour extraire une clé API stockée en clair dans une base issue de l'ancienne version front-end, l'écrire dans `.env`, puis la purger de la base.
- `migrate-images-to-disk.js` : script one-shot utilisé une seule fois lors de la migration v2.0.0 pour convertir les images base64 inline (ancien schéma) en fichiers sur disque (`storage/uploads/`).

## Index du Projet

```
scripts/
├── init-db.js                       # Récurrent — lancé à chaque démarrage du serveur
├── default-catalog.js               # Données du catalogue standard familles/consoles (base vide uniquement)
├── migrate-to-multi-platform.js     # Auto-invoqué par init-db.js si besoin ; idempotent
├── sanitize-existing-db.js          # One-shot — déjà exécuté lors de la migration v2.0.0
└── migrate-images-to-disk.js        # One-shot — déjà exécuté lors de la migration v2.0.0
```

## Démarrage Rapide

```bash
# Depuis la racine du projet (nécessite npm install préalable)
node scripts/init-db.js

# Pour forcer la migration multi-plateforme sur une base spécifique (normalement
# inutile, init-db.js s'en charge automatiquement) :
node scripts/migrate-to-multi-platform.js chemin/vers/base.sqlite
```

Les scripts one-shot historiques (`sanitize-existing-db.js`, `migrate-images-to-disk.js`) ne doivent normalement plus être relancés — ils documentent la migration passée et servent de référence si une situation similaire se reproduit (ex: import d'une ancienne sauvegarde front-end). `migrate-to-multi-platform.js` reste utile tant que des sauvegardes ou exports à l'ancien format peuvent être importés (voir `POST /api/backup/restore`).

## Troubleshooting

- **`Cannot find module 'better-sqlite3'`** : lancer les scripts depuis la racine du projet (le module est hoisté dans `node_modules/` à la racine via npm workspaces), pas depuis `scripts/` ou `backend/`.
