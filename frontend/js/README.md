# js — Modules JavaScript du frontend

## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
5. [Index du Projet](#index-du-projet)
8. [Architecture Complète](#architecture-complète)
13. [Troubleshooting](#troubleshooting)

## Fonctionnalités Principales

Quatre fichiers chargés séquentiellement (balises `<script>` classiques, pas de modules ES, pas de bundler) :

1. `api.js` — doit être chargé en premier (définit `CLIENT_ID` et l'objet global `api`).
2. `ws-client.js` — dépend de `CLIENT_ID` (défini dans `api.js`).
3. `llm-ui.js` — dépend de `api`, `openModal`/`closeModal`/`escapeHtml` (définis dans `app.js`, donc **chargé avant** `app.js` mais les fonctions qu'il utilise sont hissées par le navigateur au moment de l'exécution effective des handlers, pas au chargement). Contient aussi `openConnectionsStatusModal()` — modale unique affichant l'état des connexions LLM et Steam, avec test à la demande (`POST /api/llm-settings/test-connection`, `POST /api/steam/test-connection`) sans jamais exposer de clé/credential.
4. `app.js` — dernier chargé, appelle `initApp()` à la fin du fichier pour démarrer l'application.

## Index du Projet

```
js/
├── api.js          # Wrapper fetch() + CLIENT_ID
├── ws-client.js     # WebSocket + reconnexion + dispatch
├── llm-ui.js        # Modales LLM + recommandations
└── app.js           # Rendu principal + handlers CRUD + point d'entrée (initApp)
```

## Architecture Complète

Aucun state management formel : chaque mutation déclenche un nouvel appel à `render()` (ou à une sous-fonction ciblée) qui re-fetch les données nécessaires et régénère le HTML correspondant. Ce choix est délibéré — cohérent avec le pattern déjà en place dans l'ancienne version front-end, et suffisant pour le volume de données d'un usage personnel.

**Modèle multi-plateforme** (`app.js`) : `gamesCache` est indexé par `game_platform_id` (identifiant d'instance de possession), pas par `game.id` — un même jeu peut apparaître sous plusieurs cartes-consoles (ex: Waven sur PC et sur mobile), et un cache indexé par jeu écraserait la première entrée. `editGame(platformInstanceId)` résout le `gameId` réel depuis le cache pour charger la fiche jeu (titre, rating, notes, genres, screenshots), tandis que les heures/statut/support affichés et modifiables dans la section "Plateformes possédées" de la modale restent scopés à l'instance cliquée.

**Tri par console et accordéon** (`app.js`) : chaque carte-console propose son propre sélecteur de tri (`consoleSortOverrides`, map `console_id -> valeur`, persistée dans `localStorage`) qui surcharge le tri global (`sortBy`) uniquement pour cette console — utile pour comparer par exemple les jeux Switch par note tout en gardant les jeux Steam triés par heures. Chaque carte est aussi repliable/dépliable (clic sur l'en-tête, `collapsedConsoles` un `Set` de `console_id` également persisté) pour alléger l'affichage quand la collection couvre beaucoup de plateformes.

## Troubleshooting

- **`api is not defined` / `CLIENT_ID is not defined`** : vérifier l'ordre des balises `<script>` dans `index.html` — `api.js` doit toujours être chargé en premier.
- **Un handler `onclick` inline échoue silencieusement** : ouvrir la console navigateur, la plupart des fonctions sont `async` et une exception non catchée dans un handler `onclick` n'interrompt pas la page mais logue l'erreur.
