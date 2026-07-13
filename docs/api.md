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

| Méthode | Chemin | Body / Query | Description |
|---|---|---|---|
| GET | `/api/games` | query: `search`, `completed` (0/1), `sort` (`title`\|`hours`\|`rating`\|`date_added`), `console_id` | Liste filtrée |
| GET | `/api/games/:id` | — | Détail d'un jeu |
| POST | `/api/games` | `{ console_id, title, hours, completed, platform_type, allowDuplicate? }` | Création (409 si doublon titre+console, sauf `allowDuplicate: true`) |
| PUT | `/api/games/:id` | `{ title, hours, completed, platform_type, rating, notes, date_completed }` | Modification |
| DELETE | `/api/games/:id` | — | Suppression (cascade screenshots, genres, périodes + fichiers disque) |
| GET/POST | `/api/games/:id/ownership-periods` | `{ date_start, date_end }` | Périodes de possession |
| DELETE | `/api/games/ownership-periods/:periodId` | — | Suppression d'une période |

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
