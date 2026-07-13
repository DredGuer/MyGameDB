# Frontend — MyGameDB

Client web servi par le backend Express. Vanilla JS, aucun framework, aucune étape de build.

## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
2. [Nouveautés](#nouveautés)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
5. [Index du Projet](#index-du-projet)
6. [Démarrage Rapide](#démarrage-rapide)
8. [Architecture Complète](#architecture-complète)
9. [Stack Technique](#stack-technique)
12. [Configuration](#configuration)
13. [Troubleshooting](#troubleshooting)

## Nouveautés

Migration depuis l'ancien fichier unique `MyGameDB_Local_v5.html` (SQLite embarqué via sql.js) vers un client API découpé en 4 modules JS, avec synchronisation temps réel via WebSocket.

## Fonctionnalités Principales

Identiques à l'ancienne version front-end : gestion de familles/consoles/jeux, styles de jeu combinables, jaquettes et screenshots, dates de possession, dashboard avec analyse par tranche d'âge, recommandations IA en 3 tiers, export/import. Nouveauté : mise à jour en temps réel quand un autre onglet/appareil modifie les données.

## Index du Projet

```
frontend/
├── index.html          # Structure HTML/CSS (Tailwind CDN) — identique visuellement à l'ancienne version
└── js/
    ├── api.js           # Wrapper fetch() centralisé vers l'API backend
    ├── ws-client.js     # Connexion WebSocket, reconnexion automatique, dispatch d'événements
    ├── app.js           # Logique de rendu (render()) et handlers CRUD
    └── llm-ui.js        # Modales de configuration LLM et affichage des recommandations
```

## Démarrage Rapide

Ce dossier n'est pas lancé seul — il est servi statiquement par le backend Express (voir `backend/src/server.js`, `app.use(express.static(FRONTEND_PATH))`). Démarrer l'application via `docker compose up -d` à la racine, puis ouvrir `http://localhost:3000`.

## Architecture Complète

Chaque fonction qui faisait autrefois une requête SQL directe (`db.exec`/`db.run` via sql.js) fait maintenant un appel `fetch()` via le wrapper `api.js`. Le rendu HTML (templates de cartes, modales) reste inchangé — seule la source des données a changé.

`ws-client.js` écoute les événements broadcastés par le backend et déclenche un `render()` (ou une section ciblée comme `renderRecommendations()`) à leur réception, sauf si l'événement provient du client courant lui-même (évite un double-rafraîchissement après une action locale).

## Stack Technique

HTML/CSS (Tailwind via CDN) + JavaScript vanilla (ES2020+, `async`/`await`, `fetch`, `WebSocket` natifs). Aucun bundler, aucun transpileur — les fichiers sont servis tels quels.

## Configuration

Aucune configuration côté frontend : l'URL de l'API est toujours relative à l'origine courante (`fetch('/api/...')`), donc l'application fonctionne sans changement quel que soit le port/domaine sur lequel le backend est exposé.

## Troubleshooting

- **Page blanche / erreurs dans la console** : vérifier que le backend est bien démarré et sert `frontend/` (`docker compose logs` ou `docker compose ps`).
- **Le point de statut (haut de page) reste rouge** : le WebSocket n'arrive pas à se connecter — vérifier que le port du backend est bien accessible et qu'aucun proxy/pare-feu ne bloque les connexions `Upgrade: websocket`.
- **Une modification faite sur un autre appareil n'apparaît pas** : vérifier la connexion WebSocket (point vert/rouge) ; en cas de coupure prolongée, recharger la page force un rafraîchissement complet.
