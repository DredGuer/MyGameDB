# Backend — MyGameDB

API REST + WebSocket + logique métier (base de données, LLM, uploads).

## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
2. [Nouveautés](#nouveautés)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
5. [Index du Projet](#index-du-projet)
6. [Démarrage Rapide](#démarrage-rapide)
7. [Mise en Production](#mise-en-production)
8. [Architecture Complète](#architecture-complète)
9. [Stack Technique](#stack-technique)
10. [API Endpoints](#api-endpoints)
11. [Base de Données](#base-de-données)
12. [Configuration](#configuration)
13. [Troubleshooting](#troubleshooting)

## Nouveautés

Backend introduit lors de la migration v2.0.0 : remplace l'ancienne architecture 100% front-end (sql.js/localStorage) par une vraie API servie en continu, avec base SQLite persistée sur disque et synchronisation temps réel via WebSocket.

## Fonctionnalités Principales

- CRUD complet : familles, consoles, jeux, genres/tags, périodes de possession.
- Upload de jaquettes et screenshots, stockés en fichiers sur disque (`storage/uploads/`).
- Recommandations IA multi-fournisseurs (Gemini, Claude, OpenAI, Mistral) avec matrice en 3 tiers.
- Dashboard d'agrégations statistiques calculées à la volée en SQL.
- Export/import de la base `.sqlite` et export Markdown de l'inventaire.
- Diffusion d'événements temps réel via WebSocket après chaque mutation.

## Index du Projet

```
backend/
├── package.json
└── src/
    ├── server.js           # Point d'entrée
    ├── db/                 # Connexion + schéma SQLite
    ├── routes/             # Un fichier par ressource API REST
    ├── services/           # LLM, export Markdown
    ├── ws/                 # Hub WebSocket (broadcast d'événements)
    └── middleware/         # Gestion d'erreurs, wrapper async
```

Voir aussi la section "Arborescence du Projet" dans `/CLAUDE.md` pour la vue d'ensemble complète du dépôt.

## Démarrage Rapide

Le backend n'est normalement pas lancé seul mais via Docker Compose (voir racine du projet). Pour le lancer directement en développement :

```bash
# Depuis la racine du projet
npm install
DB_PATH="$(pwd)/bdd/collection.sqlite" UPLOADS_PATH="$(pwd)/storage/uploads" PORT=3000 node backend/src/server.js
```

Le serveur applique automatiquement le schéma (`scripts/init-db.js`) au démarrage si la base n'existe pas encore, puis sert l'API sur `http://localhost:3000` et le frontend sur la même origine.

## Mise en Production

Voir le `README.md` racine du projet — l'usage prévu est `docker compose up -d`, qui construit l'image et démarre le conteneur avec `restart: unless-stopped`.

## Architecture Complète

Le serveur Express expose trois choses sur le même port :
1. L'API REST (`/api/*`)
2. Le WebSocket (`/ws`, upgrade de connexion sur le même serveur HTTP)
3. Les fichiers statiques (le frontend dans `frontend/`, et les uploads dans `storage/uploads/` via `/uploads/*`)

Chaque route mutante (POST/PUT/DELETE) suit le pattern : validation → écriture SQLite → `hub.broadcast(event, payload, req.clientId)` → réponse JSON. Le `clientId` permet au client à l'origine de l'action de s'auto-ignorer sur l'écho WebSocket (voir `frontend/js/ws-client.js`).

## Stack Technique

| Composant | Choix | Pourquoi |
|---|---|---|
| Runtime | Node.js 22 LTS | Support long terme, `fetch` natif |
| Framework HTTP | Express 4.x | Stable, très documenté, zéro surprise |
| Driver SQLite | better-sqlite3 | API synchrone adaptée à un fichier local mono-utilisateur |
| WebSocket | `ws` | Léger, pas besoin des extras de Socket.IO pour un canal unique |
| Upload | multer 2.x | Standard Express, version corrigée des CVE connues sur la branche 1.x |
| Env | dotenv | Chargement standard de `.env` |

Aucun ORM, aucun framework de validation lourd : le volume de logique métier ne le justifie pas. Requêtes SQL préparées directement via `better-sqlite3`.

## API Endpoints

Référence complète dans `/docs/api.md`. Résumé par ressource :

| Ressource | Base path |
|---|---|
| Familles | `/api/families` |
| Consoles | `/api/consoles` (+ `/ownership-periods`) |
| Jeux | `/api/games` (+ `/ownership-periods`) |
| Genres | `/api/genres`, `/api/games/:gameId/genres` |
| Screenshots | `/api/games/:gameId/screenshots`, `/api/screenshots/:id` |
| Jaquettes | `/api/games/:gameId/covers/:side` |
| Réglages | `/api/settings/birthdate` |
| Réglages LLM | `/api/llm-settings` |
| Recommandations | `/api/recommendations` |
| Dashboard | `/api/dashboard` |
| Sauvegarde | `/api/backup` |

## Base de Données

SQLite, fichier unique (`bdd/collection.sqlite`), schéma défini dans `src/db/schema.sql`. Voir `src/db/README.md` pour le détail des tables.

## Configuration

Variables d'environnement (voir `.env.example` à la racine) :

| Variable | Rôle |
|---|---|
| `PORT` | Port d'écoute (défaut 3000) |
| `DB_PATH` | Chemin du fichier SQLite |
| `UPLOADS_PATH` | Dossier de stockage des jaquettes/screenshots |
| `LLM_API_KEY_GEMINI`, `_CLAUDE`, `_OPENAI`, `_MISTRAL` | Clés API des fournisseurs LLM (optionnelles, jamais en base) |

## Troubleshooting

- **`Cannot find module 'better-sqlite3'`** : le module est hoisté à la racine via npm workspaces — lancer les commandes depuis la racine du projet, pas depuis `backend/`.
- **Erreur de compilation native au build Docker** : vérifier que l'image de base reste `node:22-bookworm-slim` (glibc) — alpine (musl) nécessite des paquets de build supplémentaires pour `better-sqlite3`.
- **"Aucune clé API configurée"** lors d'une recommandation IA : ajouter la clé dans `.env` (`LLM_API_KEY_<PROVIDER>`) puis redémarrer le serveur/conteneur — les clés ne sont pas rechargées à chaud.
