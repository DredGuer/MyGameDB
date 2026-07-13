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
- **`markdownExport.js`** : génère l'inventaire complet en Markdown, réutilisé à la fois pour l'export utilisateur (`GET /api/backup/markdown`) et comme payload envoyé au LLM pour les recommandations.

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
├── recommendationPrompts.js
└── markdownExport.js
```

## Configuration

Les 4 clés API (`LLM_API_KEY_GEMINI`, `LLM_API_KEY_CLAUDE`, `LLM_API_KEY_OPENAI`, `LLM_API_KEY_MISTRAL`) sont lues via `process.env` au moment de l'appel dans `llmClient.js` — jamais mises en cache, jamais loguées.

## Troubleshooting

- **"Aucune clé API configurée pour \<provider\>"** : ajouter la variable correspondante dans `.env` à la racine, puis redémarrer le serveur (les variables d'environnement ne sont lues qu'au démarrage du processus Node).
- **Réponse LLM illisible / JSON invalide** : `jsonExtractor.js` tente un parse direct, puis un bloc ```` ```json ```` , puis le premier objet `{...}` équilibré. Si les trois échouent, l'erreur remonte telle quelle — vérifier le prompt système ou le fournisseur utilisé (Claude passe par tool-use forcé et ne devrait normalement jamais échouer ce parsing).
