# bdd — Données réelles (jamais commitées)

## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
11. [Base de Données](#base-de-données)
13. [Troubleshooting](#troubleshooting)

## Fonctionnalités Principales

Ce dossier contient la base de données SQLite réelle de l'utilisateur (`collection.sqlite`) — collection de jeux, heures jouées, notes, préférences LLM. **Aucun fichier `.sqlite` de ce dossier n'est ni ne doit être commité dans git** (voir `.gitignore` : `bdd/*.sqlite`).

Seul `.gitkeep` est versionné, pour que le dossier existe dans le dépôt même sans donnée réelle.

## Base de Données

Le schéma appliqué à ce fichier est défini dans `backend/src/db/schema.sql` et appliqué automatiquement par `scripts/init-db.js` au démarrage du serveur si le fichier n'existe pas encore. Si le fichier existe déjà mais provient d'une version antérieure au modèle multi-plateforme (un jeu = une seule console), `init-db.js` invoque automatiquement `scripts/migrate-to-multi-platform.js` avant d'appliquer le schéma à jour — aucune étape manuelle requise.

Un dossier `backups/` (gitignored, jamais commité) peut contenir des copies de sauvegarde horodatées prises manuellement avant une opération sensible (migration de schéma, restauration).

## Troubleshooting

- **Le dossier est vide sur une nouvelle machine** : c'est normal et attendu — `docker compose up -d` (ou `node scripts/init-db.js`) crée automatiquement une base vide avec le schéma à jour et les genres par défaut.
- **Je veux restaurer mes données depuis une ancienne sauvegarde `.sqlite`** : utiliser le bouton "📂 Importer (.sqlite)" dans l'interface, qui appelle `POST /api/backup/restore` — remplace intégralement le contenu de `bdd/collection.sqlite`.
