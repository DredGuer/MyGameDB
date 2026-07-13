# Contrat WebSocket — MyGameDB

Endpoint : `ws://<host>/ws` (upgrade sur le même port que l'API HTTP).

## Format des messages

```json
{
  "type": "game:updated",
  "data": { "id": 42, "console_id": 3 },
  "originClientId": "uuid-du-client-emetteur",
  "ts": 1752421200000
}
```

- `type` : identifie l'événement (`resource:action`).
- `data` : payload minimal (généralement juste des IDs) — le client concerné refait un `GET` ciblé pour récupérer les données à jour, plutôt que de recevoir l'objet complet.
- `originClientId` : si égal au `CLIENT_ID` du client courant (généré une fois par session dans `sessionStorage`), le client doit **ignorer** l'événement — il a déjà mis à jour son propre affichage après la réponse HTTP de sa propre action.

## Liste des événements

| Événement | Émis quand | `data` |
|---|---|---|
| `family:created` / `family:updated` / `family:deleted` | Mutation sur une famille | `{ id }` |
| `console:created` / `console:updated` / `console:deleted` | Mutation sur une console (inclut les périodes de possession) | `{ id }` |
| `game:created` / `game:updated` / `game:deleted` | Mutation sur un jeu (inclut les périodes de possession) | `{ id, console_id }` |
| `genre:created` / `genre:deleted` | Mutation sur un genre | `{ id }` |
| `game:genre-changed` | Association/dissociation genre↔jeu, ou auto-détection | `{ id }` (id du jeu) |
| `screenshot:created` / `screenshot:updated` / `screenshot:deleted` | Mutation sur un screenshot | `{ id, game_id }` |
| `cover:updated` | Upload/suppression d'une jaquette | `{ id }` (id du jeu) |
| `settings:updated` | Modification d'un réglage (ex: date de naissance) | `{ key }` |
| `recommendations:generated` | Génération ou raffinement réussi | `{}` |
| `recommendations:feedback-updated` | Mise à jour d'un feedback de recommandation | `{ id }` |
| `recommendations:history-cleared` | Historique vidé | `{}` |
| `db:restored` | Restauration d'une sauvegarde `.sqlite` | `{}` — le client doit recharger la page entièrement |

## Reconnexion côté client

`frontend/js/ws-client.js` implémente un backoff : 1s → 2s → 4s → 8s → plafond 15s. À la reconnexion réussie, un `render()` complet est déclenché par précaution (rattrape tout événement manqué pendant la coupure, plus simple qu'un système de replay par numéro de séquence).
