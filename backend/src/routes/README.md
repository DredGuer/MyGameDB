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
├── consoles.routes.js          # + périodes de possession console
├── games.routes.js             # + périodes de possession jeu
├── genres.routes.js            # + association jeu<->genre, auto-détection LLM, /by-game agrégé
├── screenshots.routes.js       # upload multipart, stockage sur disque
├── covers.routes.js            # upload multipart jaquettes
├── settings.routes.js          # date de naissance
├── llmSettings.routes.js       # provider/modèle uniquement (jamais la clé API)
├── recommendations.routes.js   # génération, raffinement, feedback, historique
├── dashboard.routes.js         # agrégations statistiques
└── backup.routes.js            # export/import .sqlite, export Markdown
```

## API Endpoints

Référence complète et à jour : `/docs/api.md`.

⚠️ **Ordre de montage important dans `server.js`** : les routes imbriquées sous `/api/games/:gameId/...` (genres, screenshots, covers) sont montées **avant** la route `/api/games/:id` générique — nécessaire pour que `/auto-detect` (sur le sous-routeur genres) ne soit pas interprété comme une valeur de `:genreId` par une route déclarée avant elle sur le même routeur (voir le commentaire dans `genres.routes.js`).

## Troubleshooting

- **`FOREIGN KEY constraint failed` inattendu sur une route imbriquée** : vérifier l'ordre de déclaration des routes sur le même routeur — une route paramétrée (`/:id`) déclarée avant une route littérale (`/action-specifique`) l'intercepte.
- **404 sur un endpoint qui existe** : vérifier le montage dans `server.js` (préfixe `app.use('/api/...', ...)`).
