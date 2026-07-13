# CLAUDE.md — Instructions permanentes du projet MyGameDB

Ce fichier contient des règles à respecter en permanence lors de tout travail sur ce projet. Elles s'appliquent à toute session future, pas seulement à celle qui les a écrites.

## Règles impératives

### 1. README.md dans chaque dossier et sous-dossier

Tout dossier contenant du code ou une responsabilité fonctionnelle propre (`backend/`, `backend/src/db/`, `backend/src/routes/`, `backend/src/services/`, `backend/src/ws/`, `frontend/`, `frontend/js/`, `storage/uploads/`, `scripts/`, `bdd/`, `docs/`, et tout nouveau sous-dossier créé par la suite) **doit** contenir un `README.md` à jour.

Chaque `README.md` doit utiliser cette table des matières standardisée, adaptée selon la pertinence pour le dossier concerné (une section non pertinente peut être omise, mais l'ordre des sections présentes doit être respecté) :

```markdown
## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
2. [Nouveautés](#nouveautés)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
4. [Screenshots](#screenshots)
5. [Index du Projet](#index-du-projet)
6. [Démarrage Rapide](#démarrage-rapide)
7. [Mise en Production](#mise-en-production)
8. [Architecture Complète](#architecture-complète)
9. [Stack Technique](#stack-technique)
10. [API Endpoints](#api-endpoints)
11. [Base de Données](#base-de-données)
12. [Configuration](#configuration)
13. [Troubleshooting](#troubleshooting)
```

**Après toute modification de code touchant un dossier, mettre à jour son `README.md` dans le même changement** (pas dans un commit séparé ultérieur). Un README qui décrit un comportement qui n'existe plus est pire que pas de README.

### 2. Arborescence du projet toujours à jour dans ce fichier

La section [Arborescence du Projet](#arborescence-du-projet) ci-dessous **doit** être maintenue à jour à chaque ajout, suppression ou déplacement de fichier/dossier structurant. Ne jamais laisser cette arborescence diverger de la réalité du dépôt.

### 3. Sécurité des données — ne jamais régresser

- **Ne jamais committer `bdd/*.sqlite`** (données réelles de l'utilisateur — famille de jeux, heures jouées, notes personnelles).
- **Ne jamais committer `.env`** (clés API réelles des fournisseurs LLM).
- **Ne jamais stocker de clé API en base de données.** La table `llm_settings` ne contient que des préférences (`llm_provider`, `llm_model_<provider>`), jamais de secret. Les clés vivent exclusivement dans les variables d'environnement (`LLM_API_KEY_GEMINI`, `LLM_API_KEY_CLAUDE`, `LLM_API_KEY_OPENAI`, `LLM_API_KEY_MISTRAL`).
- **Ne jamais renvoyer de clé API dans une réponse HTTP.** L'endpoint `GET /api/llm-settings` ne renvoie qu'un booléen `hasApiKey`, jamais la valeur.
- Avant tout commit, vérifier `git status` pour s'assurer qu'aucun fichier sensible n'est accidentellement inclus.

### 4. Branches

Tout travail de fonctionnalité se fait sur une branche dédiée (`feature/...`), jamais directement sur `master`/`main`.

### 5. Stack technique — ne pas dévier sans raison forte

La stack a été choisie pour sa simplicité et sa pérennité (voir `backend/README.md` § Stack Technique pour le détail et la justification). Ne pas introduire de framework/dépendance supplémentaire (build step frontend, ORM, etc.) sans que ce soit explicitement demandé — l'objectif reste une application simple à faire tourner en local via `docker compose up -d`, sans étape de compilation.

---

## Arborescence du Projet

*(Dernière mise à jour : 2026-07-13, refonte multi-plateforme + synchronisation Steam)*

```
.
├── CLAUDE.md                          # Ce fichier — instructions permanentes
├── README.md                          # Documentation principale du projet
├── CHANGELOG.md                       # Journal des versions
├── LICENSE                            # CC BY-NC 4.0
├── .gitignore
├── .dockerignore
├── .env.example                       # Template des variables d'environnement (commité)
├── .env                               # Variables réelles + clés API (JAMAIS commité)
├── Dockerfile                         # Image du backend (sert aussi le frontend)
├── docker-compose.yml                 # Orchestration du conteneur unique
├── package.json                       # Workspace racine (npm workspaces)
│
├── backend/                           # API REST + WebSocket + logique métier
│   ├── README.md
│   ├── package.json
│   └── src/
│       ├── server.js                  # Point d'entrée : Express + WebSocket + statiques + scheduler Steam
│       ├── db/
│       │   ├── README.md
│       │   └── schema.sql             # Schéma SQL, source de vérité (games/game_platforms/consoles/...)
│       │   └── connection.js          # Connexion SQLite (better-sqlite3) + reconnect()
│       ├── routes/                    # Un fichier par ressource API
│       │   ├── README.md
│       │   ├── families.routes.js
│       │   ├── consoles.routes.js     # Toute plateforme physique/numérique (PS5, Steam, Mobile...)
│       │   ├── games.routes.js        # Fiche jeu (titre, rating, notes) — plus de console_id direct
│       │   ├── gamePlatforms.routes.js  # Instances de possession jeu<->plateforme (hours, completed, dates)
│       │   ├── genres.routes.js
│       │   ├── screenshots.routes.js
│       │   ├── covers.routes.js
│       │   ├── settings.routes.js
│       │   ├── llmSettings.routes.js
│       │   ├── recommendations.routes.js
│       │   ├── dashboard.routes.js
│       │   ├── backup.routes.js
│       │   └── steam.routes.js        # Statut + déclenchement de la synchronisation Steam
│       ├── services/
│       │   ├── README.md
│       │   ├── llm/                   # Couche multi-fournisseurs LLM
│       │   │   ├── llmClient.js       # Routeur + gestion réglages/clés
│       │   │   ├── geminiProvider.js
│       │   │   ├── claudeProvider.js
│       │   │   ├── openaiProvider.js
│       │   │   ├── mistralProvider.js
│       │   │   └── jsonExtractor.js   # Parseur JSON tolérant (Gemini/OpenAI/Mistral)
│       │   ├── steam/                 # Synchronisation automatique de la bibliothèque Steam
│       │   │   ├── steamClient.js     # Appel HTTP pur à l'API Web Steam + lecture credentials
│       │   │   ├── steamSync.js       # Matching jeu<->plateforme + règle de conflit (max heures)
│       │   │   └── steamScheduler.js  # Déclenchement démarrage + périodique (setInterval)
│       │   ├── recommendationPrompts.js  # Prompts système + matrice 4/2/3
│       │   └── markdownExport.js      # Génération de l'inventaire Markdown (par jeu, sous-tableau plateformes)
│       ├── ws/
│       │   ├── README.md
│       │   └── hub.js                 # Registre de connexions + broadcast()
│       └── middleware/
│           ├── asyncHandler.js
│           └── errorHandler.js
│
├── frontend/                          # Client web (vanilla JS, aucun build step)
│   ├── README.md
│   ├── index.html                     # Structure HTML/CSS (Tailwind CDN)
│   └── js/
│       ├── api.js                     # Wrapper fetch centralisé vers l'API
│       ├── ws-client.js               # Connexion WebSocket + reconnexion + dispatch
│       ├── app.js                     # Rendu de l'UI + handlers CRUD + gestion multi-plateforme + sync Steam
│       └── llm-ui.js                  # Modales LLM + affichage recommandations
│
├── storage/
│   └── uploads/                       # Jaquettes et screenshots (fichiers, jamais en base64)
│       ├── README.md
│       ├── covers/
│       └── screenshots/
│
├── scripts/                           # Scripts d'exploitation / migration
│   ├── README.md
│   ├── init-db.js                     # Applique schema.sql (idempotent, migre auto si ancien format)
│   ├── migrate-to-multi-platform.js   # Migration 1 jeu=1 console -> game_platforms (idempotent)
│   ├── sanitize-existing-db.js        # Migration one-shot : extrait la clé API vers .env
│   └── migrate-images-to-disk.js      # Migration one-shot : base64 → fichiers sur disque
│
├── bdd/                                # Données réelles (JAMAIS commitées)
│   ├── README.md
│   ├── collection.sqlite               # Base de données de l'utilisateur (gitignored)
│   └── backups/                        # Sauvegardes manuelles horodatées (gitignored)
│
├── docs/                              # Documentation technique approfondie
│   ├── README.md
│   ├── api.md
│   ├── websocket.md
│   └── architecture.md
│
├── MyGameDB_Local_v5.html             # Ancienne version 100% front-end (conservée pour référence historique, remplacée par backend/ + frontend/)
└── Suavegarde de version/             # Historique de versions manuelles antérieures (ignoré par git)
```
