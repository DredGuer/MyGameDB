# services — Logique métier réutilisable

## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
5. [Index du Projet](#index-du-projet)
12. [Configuration](#configuration)
13. [Troubleshooting](#troubleshooting)

## Fonctionnalités Principales

- **`llm/`** : couche d'abstraction multi-fournisseurs (Gemini, Claude, OpenAI, Mistral). `llmClient.js` route vers le bon provider selon la préférence stockée en base et lit la clé API depuis les variables d'environnement — jamais depuis la base de données.
- **`recommendationPrompts.js`** : prompts système et schéma de tool-use pour la génération/raffinement de recommandations, structurés selon la matrice en 3 tiers (Cœur de Cible / Périphérique / Exotique, 4/2/3 jeux).
- **`markdownExport.js`** : génère l'inventaire complet en Markdown, réutilisé à la fois pour l'export utilisateur (`GET /api/backup/markdown`) et comme payload envoyé au LLM pour les recommandations. Un jeu multi-plateforme (ex: possédé sur PC et sur mobile) apparaît une seule fois, avec un sous-tableau listant chacune de ses instances de possession.
- **`steam/`** : synchronisation automatique et périodique de la bibliothèque Steam vers `game_platforms`. `steamClient.js` fait l'appel HTTP pur à l'API Web Steam (credentials lus uniquement depuis `STEAM_API_KEY`/`STEAM_ID`, jamais stockés en base). `steamSync.js` porte la logique de rattachement (matching par `steam_appid` puis par titre) et la règle de conflit `hours = max(actuel, steam)` — `completed` n'est jamais modifié par la sync. `steamScheduler.js` déclenche une sync au démarrage puis toutes les `STEAM_SYNC_INTERVAL_HOURS` heures (`setInterval` natif, pas de dépendance de type cron).

## Index du Projet

```
services/
├── llm/
│   ├── llmClient.js        # Routeur + lecture des réglages/clés
│   ├── geminiProvider.js
│   ├── claudeProvider.js
│   ├── openaiProvider.js
│   ├── mistralProvider.js
│   └── jsonExtractor.js    # Parseur JSON tolérant (texte entouré de markdown, etc.)
├── steam/
│   ├── steamClient.js      # Appel HTTP pur à l'API Web Steam + lecture credentials
│   ├── steamSync.js        # Matching jeu<->plateforme Steam + règle de conflit
│   └── steamScheduler.js   # Déclenchement au démarrage + périodique (setInterval)
├── recommendationPrompts.js
└── markdownExport.js
```

## Configuration

Les 4 clés API (`LLM_API_KEY_GEMINI`, `LLM_API_KEY_CLAUDE`, `LLM_API_KEY_OPENAI`, `LLM_API_KEY_MISTRAL`) sont lues via `process.env` au moment de l'appel dans `llmClient.js` — jamais mises en cache, jamais loguées.

`STEAM_API_KEY` et `STEAM_ID` (SteamID64) suivent le même principe : lus depuis `process.env` dans `steamClient.js`, jamais stockés en base ni renvoyés par l'API (`GET /api/steam/status` n'expose qu'un booléen `configured`). `STEAM_SYNC_INTERVAL_HOURS` (défaut 6) contrôle la fréquence de la synchronisation périodique.

## Troubleshooting

- **"Aucune clé API configurée pour \<provider\>"** : ajouter la variable correspondante dans `.env` à la racine, puis redémarrer le serveur (les variables d'environnement ne sont lues qu'au démarrage du processus Node).
- **Réponse LLM illisible / JSON invalide** : `jsonExtractor.js` tente un parse direct, puis un bloc ```` ```json ```` , puis le premier objet `{...}` équilibré. Si les trois échouent, l'erreur remonte telle quelle — vérifier le prompt système ou le fournisseur utilisé (Claude passe par tool-use forcé et ne devrait normalement jamais échouer ce parsing).
- **Le bouton "Synchroniser Steam" n'apparaît pas dans l'UI** : vérifier que `STEAM_API_KEY` et `STEAM_ID` sont bien renseignés dans `.env` puis que le serveur a été redémarré — `GET /api/steam/status` doit renvoyer `configured: true`.
- **Les heures d'un jeu Steam ne se mettent jamais à jour** : comportement normal si la valeur Steam est inférieure ou égale à celle déjà en base (règle du max, jamais de décrément automatique) — vérifier `last_synced_at` sur l'instance pour confirmer qu'une sync a bien eu lieu.
