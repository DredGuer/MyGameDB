# Référence API REST — MyGameDB

Format de réponse uniforme :
- Succès : `{ "data": ... }`
- Erreur : `{ "error": { "message": "...", "code": "..." } }` avec code HTTP correspondant (400/404/409/500/502).

Toute requête mutante (POST/PUT/DELETE) peut porter un header `X-Client-Id` (UUID) — utilisé pour que le client émetteur s'auto-ignore sur l'écho WebSocket de sa propre action.

## Familles

| Méthode | Chemin | Body | Description |
|---|---|---|---|
| GET | `/api/families` | — | Liste triée par nom |
| POST | `/api/families` | `{ name }` | Création |
| PUT | `/api/families/:id` | `{ name }` | Modification |
| DELETE | `/api/families/:id` | — | Suppression (cascade consoles → jeux) |

## Consoles

| Méthode | Chemin | Body | Description |
|---|---|---|---|
| GET | `/api/consoles` | — | Liste avec jointure famille |
| POST | `/api/consoles` | `{ name, family_id }` | Création |
| PUT | `/api/consoles/:id` | `{ name, family_id }` | Modification |
| DELETE | `/api/consoles/:id` | — | Suppression (cascade jeux) |
| GET | `/api/consoles/:id/ownership-periods` | — | Périodes de possession |
| POST | `/api/consoles/:id/ownership-periods` | `{ date_start, date_end }` | Ajout d'une période |
| DELETE | `/api/consoles/ownership-periods/:periodId` | — | Suppression d'une période |

## Jeux

Un jeu (`games`) est une fiche unique (titre, rating, notes, jaquette). Sa présence sur une ou
plusieurs plateformes (PS5, Switch, Steam, Mobile...) est représentée par des **instances de
possession** séparées — voir § Plateformes d'un jeu ci-dessous. C'est ce qui permet à un même jeu
(ex: Waven) d'être possédé à la fois sur PC et sur mobile avec des heures/statuts distincts.

| Méthode | Chemin | Body / Query | Description |
|---|---|---|---|
| GET | `/api/games` | query: `search`, `completed` (0/1), `sort` (`title`\|`hours`\|`rating`\|`date_added`), `console_id` | Avec `console_id` : une ligne par jeu ayant une instance sur cette plateforme (champs d'instance inclus). Sans `console_id` : vue agrégée, une ligne par jeu avec heures cumulées toutes plateformes et `completed` = au moins une instance terminée |
| GET | `/api/games/:id` | — | Détail de la fiche jeu (titre, rating, notes, jaquette) — sans le détail des instances, voir `/platforms` |
| POST | `/api/games` | `{ console_id, title, hours, completed, platform_type, allowDuplicate? }` | Crée le jeu **et** sa première instance de possession (transaction). 409 si un jeu de même titre existe déjà, sauf `allowDuplicate: true` |
| PUT | `/api/games/:id` | `{ title, rating, notes }` | Modification de la fiche jeu uniquement (heures/statut/support passent par `/platforms/:id`) |
| DELETE | `/api/games/:id` | — | Suppression (cascade instances de plateforme, screenshots, genres + fichiers disque) |

### Plateformes d'un jeu

| Méthode | Chemin | Body | Description |
|---|---|---|---|
| GET | `/api/games/:gameId/platforms` | — | Liste des instances de possession du jeu (une par plateforme) |
| POST | `/api/games/:gameId/platforms` | `{ console_id, hours, completed, platform_type }` | Ajoute une plateforme à un jeu existant (409 si déjà rattaché à cette plateforme) |
| PUT | `/api/games/:gameId/platforms/:platformInstanceId` | `{ hours, completed, platform_type, date_completed }` | Modifie une instance (heures, statut, support, date de complétion) |
| DELETE | `/api/games/:gameId/platforms/:platformInstanceId` | — | Retire cette plateforme du jeu (cascade périodes de possession de l'instance) |
| GET/POST | `/api/games/:gameId/platforms/:platformInstanceId/ownership-periods` | `{ date_start, date_end }` | Périodes de possession de cette instance |
| DELETE | `/api/games/:gameId/platforms/ownership-periods/:periodId` | — | Suppression d'une période |

## Genres

| Méthode | Chemin | Body | Description |
|---|---|---|---|
| GET | `/api/genres` | — | Liste avec comptage d'usage |
| GET | `/api/genres/by-game` | — | Map agrégée `{ [gameId]: [genreName, ...] }` (anti N+1) |
| POST | `/api/genres` | `{ name }` | Création |
| DELETE | `/api/genres/:id` | — | Suppression (cascade associations) |
| GET | `/api/games/:gameId/genres` | — | Liste des `genre_id` associés à un jeu |
| POST | `/api/games/:gameId/genres/:genreId` | — | Associer (idempotent) |
| DELETE | `/api/games/:gameId/genres/:genreId` | — | Dissocier |
| POST | `/api/games/:gameId/genres/auto-detect` | — | Déduit le(s) style(s) via le LLM configuré |

## Screenshots

| Méthode | Chemin | Body | Description |
|---|---|---|---|
| GET | `/api/games/:gameId/screenshots` | — | Liste triée par position |
| POST | `/api/games/:gameId/screenshots` | multipart: `file`, `title`, `description` | Upload |
| PUT | `/api/screenshots/:id` | `{ title, description }` | Modification légende |
| DELETE | `/api/screenshots/:id` | — | Suppression (ligne + fichier) |

## Jaquettes

| Méthode | Chemin | Body | Description |
|---|---|---|---|
| PUT | `/api/games/:gameId/covers/:side` (`side` = `front`\|`back`) | multipart: `file` | Upload/remplacement |
| DELETE | `/api/games/:gameId/covers/:side` | — | Suppression |

Fichiers servis statiquement via `GET /uploads/covers/:filename` et `GET /uploads/screenshots/:filename`.

## Réglages

| Méthode | Chemin | Body | Description |
|---|---|---|---|
| GET | `/api/settings/birthdate` | — | `{ value: "YYYY-MM-DD" \| null }` |
| PUT | `/api/settings/birthdate` | `{ value }` | Modification |

## Réglages LLM

| Méthode | Chemin | Body | Description |
|---|---|---|---|
| GET | `/api/llm-settings` | — | `{ provider, model, hasApiKey, availableProviders }` — ne renvoie jamais la clé |
| PUT | `/api/llm-settings` | `{ provider, model }` | Change le fournisseur/modèle actif — **ne permet pas de définir une clé API** (voir `.env`) |
| POST | `/api/llm-settings/test-connection` | — | Envoie un prompt minimal au fournisseur actuellement configuré et vérifie la réponse. `{ success, provider, model, latencyMs }` ou `{ success: false, message }` |

## Recommandations

| Méthode | Chemin | Body | Description |
|---|---|---|---|
| GET | `/api/recommendations` | — | Liste courante (9 jeux, 3 catégories) |
| POST | `/api/recommendations/generate` | — | Génère une nouvelle liste via le LLM |
| POST | `/api/recommendations/refine` | `{ userNote }` | Raffine à partir du feedback utilisateur |
| PUT | `/api/recommendations/:id/feedback` | `{ field, value }` (`field` ∈ `user_feedback_score`\|`user_disliked_style`\|`user_already_done`) | Met à jour un feedback |
| GET | `/api/recommendations/history` | — | Historique permanent groupé par titre |
| DELETE | `/api/recommendations/history` | — | Vide l'historique |

## Dashboard

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/api/dashboard/stats` | Heures totales, % complétion, jeu le plus chronophage, poids de la base |
| GET | `/api/dashboard/breakdown/families` | Heures par famille |
| GET | `/api/dashboard/breakdown/genres` | Heures/comptage par genre |
| GET | `/api/dashboard/age-genre-analysis` | Analyse "styles par tranche d'âge" (nécessite une date de naissance renseignée) |

## Sauvegarde

| Méthode | Chemin | Body | Description |
|---|---|---|---|
| GET | `/api/backup/sqlite` | — | Télécharge le fichier `.sqlite` courant |
| GET | `/api/backup/markdown` | — | Génère et télécharge l'inventaire en Markdown |
| POST | `/api/backup/restore` | multipart: `file` | Remplace intégralement la base (validation basique du schéma) |

## Steam

| Méthode | Chemin | Description |
|---|---|---|
| GET | `/api/steam/status` | `{ configured, lastSyncAt, lastSyncReport, lastSyncError }` — ne renvoie jamais la clé API ni le SteamID |
| POST | `/api/steam/sync` | Déclenche une synchronisation immédiate, renvoie `{ created, updated, skipped, errors }` |
| POST | `/api/steam/test-connection` | Appelle l'API Steam en lecture seule (aucune écriture en base) pour vérifier les credentials. `{ success, gameCount, latencyMs }` ou `{ success: false, message }` |

Synchronisation aussi déclenchée automatiquement au démarrage du serveur puis toutes les `STEAM_SYNC_INTERVAL_HOURS` heures (voir `.env.example`), si `STEAM_API_KEY`/`STEAM_ID` sont configurés.
