# ws — Hub WebSocket (synchronisation temps réel)

## Table des Matières

1. [Journal des Mises à Jour](/CHANGELOG.md)
3. [Fonctionnalités Principales](#fonctionnalités-principales)
5. [Index du Projet](#index-du-projet)
8. [Architecture Complète](#architecture-complète)
13. [Troubleshooting](#troubleshooting)

## Fonctionnalités Principales

Diffuse un événement à tous les clients connectés dès qu'une mutation réussit côté API — c'est ce qui permet à deux onglets/appareils ouverts simultanément sur l'application de rester synchronisés sans rechargement manuel.

## Index du Projet

```
ws/
└── hub.js   # Registre de connexions (Set) + broadcast(event, payload, originClientId)
```

## Architecture Complète

Canal unique (`/ws`), pas de "rooms" : usage mono-utilisateur multi-appareils, tous les clients connectés reçoivent tous les événements. Chaque message porte `{ type, data, originClientId, ts }` — `originClientId` permet au client à l'origine de l'action de s'ignorer lui-même (il a déjà mis à jour son propre affichage après la réponse HTTP).

Voir `/docs/websocket.md` pour la liste complète des types d'événements et le contrat de chaque payload.

## Troubleshooting

- **Un client ne reçoit jamais d'événement** : vérifier que la connexion WebSocket est bien établie (`wss.on('connection', ...)` dans `hub.js` doit avoir été appelé — voir les logs serveur).
- **Un client reçoit ses propres événements en double** : vérifier que le header `X-Client-Id` est bien envoyé sur les requêtes mutantes côté frontend (`frontend/js/api.js`) et que la comparaison `originClientId === CLIENT_ID` fonctionne côté `ws-client.js`.
