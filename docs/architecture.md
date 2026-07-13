# Architecture — MyGameDB

## Vue d'ensemble

```
┌─────────────────────────────────────────────────────────────┐
│                     Conteneur Docker (unique)                │
│                                                                │
│   ┌────────────────────────────────────────────────────┐    │
│   │             Serveur Express (Node.js)                │    │
│   │                                                       │    │
│   │  /api/*        → Routes REST (backend/src/routes/)  │    │
│   │  /ws           → WebSocket (backend/src/ws/hub.js)  │    │
│   │  /              → Fichiers statiques (frontend/)     │    │
│   │  /uploads/*    → Fichiers statiques (storage/uploads)│    │
│   └──────────────┬─────────────────────┬─────────────────┘    │
│                  │                     │                       │
│         ┌────────▼────────┐   ┌────────▼─────────┐            │
│         │  bdd/collection  │   │ storage/uploads/  │            │
│         │  .sqlite          │   │ covers/           │            │
│         │  (volume monté)   │   │ screenshots/      │            │
│         └──────────────────┘   │ (volume monté)    │            │
│                                 └───────────────────┘            │
└─────────────────────────────────────────────────────────────┘
                          │
                          │ Appels sortants (au moment d'une
                          │ recommandation IA ou auto-détection
                          │ de style uniquement)
                          ▼
         ┌───────────────────────────────────────┐
         │  APIs LLM externes (Gemini / Claude /  │
         │  OpenAI / Mistral) — clé lue depuis .env│
         └───────────────────────────────────────┘

              ▲                              ▲
              │ HTTP + WebSocket             │ HTTP + WebSocket
              │                              │
      ┌───────┴───────┐              ┌───────┴───────┐
      │ Navigateur A   │              │ Navigateur B   │
      │ (PC)           │              │ (téléphone)    │
      └────────────────┘              └────────────────┘
```

## Pourquoi un seul conteneur

Le serveur Express sert à la fois l'API, le WebSocket et les fichiers statiques (frontend + uploads) sur le même port. Un reverse-proxy séparé (nginx, etc.) n'apporterait aucun bénéfice pour un usage local mono-utilisateur — pas de TLS multi-domaines, pas de répartition de charge nécessaire.

## Pourquoi SQLite plutôt que Postgres

Usage mono-utilisateur, volume de données modeste (quelques dizaines à centaines de jeux). Un fichier unique sur disque, sauvegardable par simple copie, monté en volume Docker, est largement suffisant et évite un service de base de données séparé à maintenir.

## Pourquoi les clés API LLM ne sont jamais en base

La base SQLite peut être exportée et partagée par l'utilisateur (fonctionnalité "💾 Sauvegarder la Base"). Si une clé API y était stockée, elle serait exposée à quiconque reçoit ce fichier. Les clés vivent donc exclusivement dans `.env`, jamais commité dans git, jamais renvoyé par l'API.

## Flux d'une requête mutante typique

1. Le client (`frontend/js/app.js`) appelle une fonction de `api.js`.
2. `api.js` fait un `fetch()` avec le header `X-Client-Id`.
3. La route Express correspondante valide, écrit en SQLite via `better-sqlite3`, puis appelle `hub.broadcast(event, payload, req.clientId)`.
4. Tous les clients WebSocket connectés (sauf celui portant le même `clientId`) reçoivent l'événement et rafraîchissent la portion concernée de leur affichage.
5. Le client émetteur, lui, a déjà mis à jour son affichage directement après la réponse HTTP de l'étape 2 — il ignore l'écho WebSocket de sa propre action.

## Décision de ne pas utiliser de framework frontend

Le fichier `index.html` + 4 modules JS suffisent pour la complexité de l'application (essentiellement des formulaires, des tableaux et des modales). Introduire React/Vue ajouterait une étape de build sans bénéfice proportionné, et compliquerait le déploiement Docker (image de build séparée, ou étape supplémentaire dans le Dockerfile).
