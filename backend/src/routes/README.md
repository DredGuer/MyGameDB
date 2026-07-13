# routes — Endpoints API REST

## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
5. [Index du Projet](#index-du-projet)
10. [API Endpoints](#api-endpoints)
13. [Troubleshooting](#troubleshooting)

## Fonctionnalités Principales

Un fichier par ressource métier. Chaque route mutante suit le même pattern : validation des entrées → requête SQLite préparée → `hub.broadcast(event, payload, req.clientId)` → réponse `{ data: ... }`. Les erreurs sont levées via `ApiError` (voir `../middleware/errorHandler.js`) et jamais catchées localement pour la mise en forme de la réponse.

## Index du Projet

```
routes/
├── families.routes.js
├── consoles.routes.js          # + périodes de possession console (toute plateforme physique/numérique)
├── games.routes.js             # fiche jeu (titre, rating, notes) ; plus de console_id direct
├── gamePlatforms.routes.js     # instances de possession jeu<->plateforme (hours, completed, dates)
├── genres.routes.js            # + association jeu<->genre, auto-détection LLM, /by-game agrégé
├── screenshots.routes.js       # upload multipart, stockage sur disque
├── covers.routes.js            # upload multipart jaquettes
├── settings.routes.js          # date de naissance
├── llmSettings.routes.js       # provider/modèle uniquement (jamais la clé API)
├── recommendations.routes.js   # génération, raffinement, feedback, historique
├── dashboard.routes.js         # agrégations statistiques
├── backup.routes.js            # export/import .sqlite, export Markdown
└── steam.routes.js             # statut + déclenchement de la synchronisation Steam
```

## API Endpoints

Référence complète et à jour : `/docs/api.md`.

⚠️ **Ordre de montage important dans `server.js`** : les routes imbriquées sous `/api/games/:gameId/...` (genres, screenshots, covers, platforms) sont montées **avant** la route `/api/games/:id` générique — nécessaire pour que `/auto-detect` (sur le sous-routeur genres) ne soit pas interprété comme une valeur de `:genreId` par une route déclarée avant elle sur le même routeur (voir le commentaire dans `genres.routes.js`).

**Modèle multi-plateforme** : un jeu (`games`) est une fiche unique (titre, rating, notes, jaquette). Sa présence sur une ou plusieurs plateformes (PS5, Switch, Steam, Mobile...) passe par `gamePlatforms.routes.js` (`/api/games/:gameId/platforms`) — chaque instance porte ses propres heures, statut "terminé", support (physique/dématérialisé) et périodes de possession. `GET /api/games?console_id=` reste le principal point d'entrée du frontend (une ligne par jeu ayant une instance sur cette plateforme) ; sans `console_id`, l'endpoint retourne une vue agrégée (heures cumulées toutes plateformes par jeu).

## Troubleshooting

- **`FOREIGN KEY constraint failed` inattendu sur une route imbriquée** : vérifier l'ordre de déclaration des routes sur le même routeur — une route paramétrée (`/:id`) déclarée avant une route littérale (`/action-specifique`) l'intercepte.
- **404 sur un endpoint qui existe** : vérifier le montage dans `server.js` (préfixe `app.use('/api/...', ...)`).
