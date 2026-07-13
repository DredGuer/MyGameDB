# Journal des Mises à Jour

## [2.0.0] - 2026-07-13 — Migration backend Docker + synchronisation temps réel

### Ajouté
- **Backend Node.js/Express** avec base SQLite persistée sur disque (`bdd/collection.sqlite`), indépendante de tout navigateur.
- **API REST complète** couvrant familles, consoles, jeux, genres, screenshots, jaquettes, réglages, recommandations IA et dashboard.
- **Synchronisation temps réel multi-appareils via WebSocket** : toute modification faite sur un appareil/onglet apparaît instantanément sur tous les autres appareils connectés, sans rechargement de page.
- **Conteneurisation Docker** (`docker compose up -d`) : l'application tourne en service permanent local, accessible depuis n'importe quel navigateur via `http://localhost:3000`.
- Jaquettes et screenshots désormais stockés en fichiers sur disque (`storage/uploads/`) au lieu de base64 inline en base — allège la base et les échanges réseau.
- Indicateur visuel de statut de connexion temps réel (point vert/rouge) dans l'en-tête.
- Reconnexion WebSocket automatique avec backoff progressif en cas de coupure réseau.

### Changé
- **Sécurité des clés API LLM** : les clés (Gemini, Claude, OpenAI, Mistral) ne sont plus jamais stockées en base de données ni exposées via l'API. Elles vivent exclusivement dans le fichier `.env` du serveur, jamais commité dans git.
- Les appels aux fournisseurs LLM sont désormais effectués côté serveur (au lieu du navigateur), supprimant le besoin du header CORS spécial `anthropic-dangerous-direct-browser-access`.
- La modale "⚙️ Configurer l'IA" ne permet plus de saisir une clé API — uniquement le choix du fournisseur et du modèle (la clé se configure via `.env` + redémarrage du serveur).

### Migré
- Toutes les données existantes de l'ancienne version (sql.js/localStorage) ont été migrées vers le nouveau schéma SQLite serveur, avec extraction sécurisée de la clé API précédemment stockée en clair dans la base.

## [1.x] - Versions antérieures

Historique de l'application front-end 100% autonome (fichier HTML unique, SQLite embarqué via sql.js, persistance en `localStorage` du navigateur) — voir les commits antérieurs à cette version pour le détail des fonctionnalités introduites (styles de jeu, dates de possession, analyse par âge, recommandations IA multi-fournisseurs, matrice de recommandation en 3 tiers, historique des recommandations).
