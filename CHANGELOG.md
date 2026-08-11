# Journal des Mises à Jour

## [3.0.0] - 2026-08-11 — Multi-plateforme, synchronisation Steam et identité visuelle

### Ajouté
- **Modèle multi-plateforme** : un jeu est désormais une fiche unique pouvant être possédée sur plusieurs plateformes (ex: Waven sur PC et sur mobile), chaque instance portant ses propres heures, statut et support. Migration automatique et idempotente des bases existantes (`scripts/migrate-to-multi-platform.js`).
- **Synchronisation automatique de la bibliothèque Steam** (optionnelle, `STEAM_API_KEY`/`STEAM_ID` dans `.env`) : import et mise à jour périodique des jeux possédés, avec règle de conflit "les heures ne peuvent qu'augmenter" et statut "terminé" toujours laissé au contrôle manuel.
- **Catalogue standard de familles/consoles** pré-rempli automatiquement sur une base tout juste créée (Sony, Nintendo, Microsoft, SEGA, Atari, PC, Mobile, Web...), sans jamais toucher à une base existante.
- **Modale "🔌 État des connexions"** : test à la demande de la connexion IA et Steam (appel réel, pas juste vérification de présence de clé).
- **Modale "🗄️ Mon matériel"** : toutes les consoles groupées par famille avec leur historique complet de possession (dates, modèle, numéro de série, type d'acquisition) en un seul endroit.
- **Type d'acquisition** (achat / prêt / location, optionnel) sur les périodes de possession, pour les consoles et pour chaque plateforme d'un jeu — la gestion des dates de possession par plateforme d'un jeu, jusque-là absente de l'interface, est également ajoutée.
- **Modèle et numéro de série** (optionnels) sur les périodes de possession console — utile pour distinguer une console rachetée dans une variante différente.
- **Tri individuel par console** (Titre/Heures/Note/Date), indépendant du tri global, et **accordéon repliable** par carte-console — préférences mémorisées entre sessions.
- **Recommandations IA dans une modale dédiée**, plus large que la modale générique d'édition, pour la grille de cartes en 3 tiers.
- **Identité visuelle propre** : palette maison (encre teinté violet, accent violet, touche or) à la place des couleurs Tailwind par défaut, police Space Mono pour les chiffres clés, tuile héro "Heures totales" avec pastille "🎮 En ce moment" (dernière instance jeu+plateforme touchée), liseré de statut sur chaque ligne de jeu.

### Corrigé
- La liste des périodes de possession (console et jeu) ne se mettait pas à jour visuellement après ajout/suppression — plusieurs appels à `render()` n'étaient pas attendus avant de rouvrir la modale d'édition.
- Un crash de synchronisation Steam se produisait quand un jeu existait déjà manuellement sur la console "Steam" avant toute synchronisation.
- Le repli/dépli d'une carte-console faisait remonter la page en haut (glitch visuel de scroll).

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
