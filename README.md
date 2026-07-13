# 🎮 MyGameDB

Gestionnaire de collection de jeux vidéo, avec backend local et synchronisation temps réel entre tous tes appareils.

## Table des Matières

1. [Journal des Mises à Jour](CHANGELOG.md)
2. [Nouveautés v2.0.0 — Backend Docker + synchronisation temps réel](#nouveautés-v200--backend-docker--synchronisation-temps-réel)
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

## Nouveautés v2.0.0 — Backend Docker + synchronisation temps réel

L'application n'est plus un simple fichier HTML avec une base SQLite enfermée dans un navigateur (localStorage). Elle tourne désormais en **service permanent local via Docker**, avec :

- Une base de données SQLite **sur disque**, indépendante de tout navigateur — plus de perte de données en changeant de Chrome vers Firefox, ou en vidant le cache.
- Un accès via `http://localhost:3000` depuis n'importe quel navigateur de la machine (et du réseau local).
- **Synchronisation en temps réel** : ouvre l'app sur ton PC et ton téléphone en même temps — coche "Terminé" sur l'un, ça se met à jour instantanément sur l'autre, sans recharger la page.
- Les clés API des fournisseurs LLM ne transitent plus jamais par le navigateur ni la base de données — elles restent dans un fichier `.env` local, jamais partagé.

Voir [CHANGELOG.md](CHANGELOG.md) pour le détail complet.

## Fonctionnalités Principales

- Organisation par Famille (ex: Nintendo) → Console/Plateforme (ex: Switch, Steam, Mobile) → Jeu.
- **Un jeu peut être possédé sur plusieurs plateformes** (ex: un jeu à la fois sur PC et sur mobile) : chaque plateforme a ses propres heures jouées et statut, la fiche jeu (titre, note, notes, jaquette) reste unique et partagée.
- Suivi des heures jouées, du statut (en cours / terminé), de la note, des styles/genres (tags combinables).
- Jaquettes et screenshots par jeu (stockés en fichiers, pas en base64).
- Dates de possession (par jeu+plateforme, et par console), avec analyse "styles de jeu par tranche d'âge" si tu renseignes ta date de naissance.
- **Synchronisation automatique de ta bibliothèque Steam** (optionnelle) : import et mise à jour périodique des jeux possédés et du temps de jeu, sans jamais écraser une correction manuelle (les heures ne peuvent qu'augmenter).
- Export de l'inventaire en Markdown (`.md`) ou de la base complète en `.sqlite`, import d'une sauvegarde `.sqlite`.
- **Recommandations IA** (Gemini, Claude, ChatGPT ou Mistral au choix) : 9 jeux personnalisés répartis en 3 tiers — 🔥 Cœur de Cible (valeurs sûres), 🌤️ Périphérique (qui testent tes limites), 🌀 Exotique Hors Cadre (rupture assumée) — avec boucle de feedback et affinement itératif.
- **Auto-détection de style** d'un jeu via IA, à partir de son titre.
- **Synchronisation temps réel multi-appareils** via WebSocket.

## Index du Projet

Voir la section "Arborescence du Projet" dans [CLAUDE.md](CLAUDE.md) pour la vue d'ensemble complète et toujours à jour du dépôt. Résumé :

```
backend/    # API REST + WebSocket + logique métier (Node.js/Express)
frontend/   # Client web (HTML/CSS/JS vanilla, aucun build step)
storage/    # Jaquettes et screenshots uploadés (fichiers, jamais en base)
scripts/    # Scripts d'initialisation et de migration de la base
bdd/        # Données réelles de l'utilisateur (jamais commitées)
docs/       # Documentation technique (API, WebSocket, architecture)
```

## Démarrage Rapide

Prérequis : [Docker](https://www.docker.com/) et Docker Compose.

```bash
# 1. Copier le template de configuration
cp .env.example .env

# 2. (Optionnel) Renseigner une ou plusieurs clés API LLM dans .env
#    LLM_API_KEY_GEMINI=... / LLM_API_KEY_CLAUDE=... / etc.

# 3. Lancer l'application
docker compose up -d

# 4. Ouvrir dans un navigateur
open http://localhost:3000
```

L'application tourne désormais en arrière-plan (`restart: unless-stopped`). Pour l'arrêter : `docker compose down`. Pour voir les logs : `docker compose logs -f`.

## Mise en Production

Ce projet est conçu pour un usage **local personnel** (un service qui tourne en permanence sur ta propre machine, accessible sur ton réseau local) — il n'y a pas de déploiement cloud prévu ni de configuration TLS/domaine. Pour l'exposer au-delà de ton réseau local, ajoute toi-même un reverse proxy avec authentification (hors du périmètre de ce projet).

## Architecture Complète

Voir [docs/architecture.md](docs/architecture.md) pour le schéma complet des flux (conteneur unique servant API + WebSocket + fichiers statiques, volumes Docker pour la base et les uploads, appels sortants vers les fournisseurs LLM).

## Stack Technique

| Composant | Choix |
|---|---|
| Runtime | Node.js 22 LTS |
| Framework HTTP | Express 4.x |
| Base de données | SQLite (`better-sqlite3`) |
| Temps réel | WebSocket (`ws`) |
| Frontend | HTML/CSS/JS vanilla, Tailwind CDN, aucun build step |
| Conteneurisation | Docker + Docker Compose (conteneur unique) |

Détails et justifications dans [backend/README.md](backend/README.md).

## API Endpoints

Référence complète : [docs/api.md](docs/api.md).

## Base de Données

SQLite, fichier unique (`bdd/collection.sqlite`, monté en volume Docker). Schéma défini dans `backend/src/db/schema.sql`. Voir [backend/src/db/README.md](backend/src/db/README.md).

## Configuration

Toute la configuration passe par le fichier `.env` (copié depuis `.env.example`) :

| Variable | Rôle | Obligatoire |
|---|---|---|
| `PORT` | Port d'écoute | Non (défaut 3000) |
| `DB_PATH` | Chemin du fichier SQLite | Non (défaut fourni par Docker Compose) |
| `UPLOADS_PATH` | Dossier des jaquettes/screenshots | Non (défaut fourni par Docker Compose) |
| `LLM_API_KEY_GEMINI` | Clé API Google Gemini | Non — requis seulement pour utiliser ce fournisseur |
| `LLM_API_KEY_CLAUDE` | Clé API Anthropic Claude | Non — idem |
| `LLM_API_KEY_OPENAI` | Clé API OpenAI | Non — idem |
| `LLM_API_KEY_MISTRAL` | Clé API Mistral AI | Non — idem |
| `STEAM_API_KEY` | Clé API Steam ([steamcommunity.com/dev/apikey](https://steamcommunity.com/dev/apikey)) | Non — requis seulement pour la synchronisation Steam |
| `STEAM_ID` | SteamID64 (identifiant numérique à 17 chiffres, pas le pseudo) | Non — idem |
| `STEAM_SYNC_INTERVAL_HOURS` | Fréquence de la synchronisation automatique | Non (défaut 6h) |

Où obtenir une clé API :

| Fournisseur | Où l'obtenir |
|---|---|
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — offre un tier gratuit généreux |
| Anthropic Claude | [console.anthropic.com](https://console.anthropic.com/) |
| OpenAI ChatGPT | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Mistral AI | [console.mistral.ai](https://console.mistral.ai/) |

⚠️ **Après avoir modifié `.env`, redémarre le conteneur** (`docker compose restart`) pour que la nouvelle clé soit prise en compte — elle n'est lue qu'au démarrage du serveur, jamais stockée en base de données ni renvoyée par l'API.

Dans l'application, le bouton **⚙️ Configurer l'IA** permet uniquement de choisir le fournisseur actif et le modèle — pas la clé, qui reste toujours côté fichier `.env`.

## Troubleshooting

- **Le conteneur ne démarre pas** : `docker compose logs` pour voir l'erreur exacte.
- **Mes données de l'ancienne version (fichier `MyGameDB_Local_v5.html`) ont disparu** : elles n'ont pas disparu, mais elles vivaient dans le `localStorage` de ton navigateur — la nouvelle version utilise une vraie base sur disque. Si besoin, exporte l'ancienne base depuis l'ancien fichier HTML puis importe-la via **📂 Importer (.sqlite)** dans la nouvelle version.
- **Aucune clé API configurée pour un fournisseur** : voir la section [Configuration](#configuration) ci-dessus.
- Pour les problèmes spécifiques au backend, au frontend ou à la base de données, voir le README du dossier concerné (chacun a sa propre section Troubleshooting).

## Licence

Ce projet est distribué sous licence **[CC BY-NC 4.0](LICENSE)** (Creative Commons Attribution - Pas d'Utilisation Commerciale). Utilisation et modification libres et gratuites, à condition de créditer l'auteur original ; toute utilisation commerciale est interdite sans accord préalable.
