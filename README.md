# 🎮 MyGameDB

Gestionnaire de collection de jeux vidéo **100% local**, sans backend ni installation. Tout tient dans un seul fichier HTML : `MyGameDB_Local_v5.html`.

## Fonctionnement

- Base de données SQLite exécutée directement dans le navigateur ([sql.js](https://github.com/sql-js/sql.js)).
- Les données sont persistées automatiquement dans le `localStorage` du navigateur.
- Aucune donnée n'est envoyée à un serveur, sauf pour la fonctionnalité de recommandation IA (voir plus bas), qui envoie ta collection à un fournisseur de LLM externe si tu l'active volontairement.

## Utilisation

Ouvre simplement `MyGameDB_Local_v5.html` dans un navigateur moderne (Chrome, Firefox, Safari, Edge). Aucune installation, aucun serveur requis.

### Fonctionnalités principales

- Organisation par Famille (ex: Nintendo) → Console (ex: Switch) → Jeu.
- Suivi des heures jouées, du statut (en cours / terminé), de la note, des styles/genres (tags combinables).
- Jaquettes et screenshots par jeu.
- Dates de possession (jeux et consoles), avec analyse "styles de jeu par tranche d'âge" si tu renseignes ta date de naissance.
- Export de l'inventaire en Markdown (`.md`) ou de la base complète en `.sqlite`.
- Import d'une base `.sqlite` précédemment exportée.

## Recommandations par IA

L'application peut interroger un LLM (Google Gemini, Anthropic Claude, OpenAI ChatGPT ou Mistral AI) pour te proposer 10 jeux personnalisés à partir de ta collection, avec un score de correspondance et une explication.

### Configurer une clé API

1. Clique sur **⚙️ Configurer l'IA** (au-dessus de la section "Recommandations IA").
2. Choisis un fournisseur et colle ta clé API. Un modèle par défaut est proposé, modifiable.
3. Clique sur **Enregistrer**.

Où obtenir une clé API :

| Fournisseur | Où l'obtenir |
|---|---|
| Google Gemini | [aistudio.google.com/apikey](https://aistudio.google.com/apikey) — offre un tier gratuit généreux |
| Anthropic Claude | [console.anthropic.com](https://console.anthropic.com/) |
| OpenAI ChatGPT | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |
| Mistral AI | [console.mistral.ai](https://console.mistral.ai/) |

⚠️ **La clé API est stockée en clair dans le `localStorage` de ton navigateur**, comme le reste des données de l'application (il n'y a pas de backend pour la protéger autrement). C'est adapté à un usage strictement personnel, sur un ordinateur qui t'appartient. Ne l'utilise pas sur un poste partagé ou public, et révoque la clé depuis la console du fournisseur si besoin.

### Utiliser les recommandations

1. Clique sur **✨ Recommander** : l'application envoie ton inventaire (titres, styles, heures, notes) au LLM configuré et affiche 10 jeux suggérés sous forme de cartes, avec un score de correspondance coloré (vert ≥70%, ambre 40-69%, rouge <40%).
2. Pour chaque jeu, tu peux :
   - ajuster le score avec un curseur,
   - cocher "le style visuel me déplaît",
   - cocher "déjà fait".
3. Tu peux aussi ajouter une précision libre en langage naturel dans la zone de texte (ex : *"le jeu à 88% a l'air cool mais les combats en temps réel me stressent en ce moment"*).
4. Clique sur **🔄 Affiner** : le LLM reçoit tes retours et propose une nouvelle liste recalibrée en conséquence.

### Auto-détection de style

Dans la fiche d'édition d'un jeu, le bouton **🤖 Auto-détecter le style** demande au LLM de déduire le(s) style(s) du jeu à partir de son titre (et de sa console), en réutilisant en priorité les styles déjà présents dans ta base.

## Sauvegarde de tes données

- **Export Markdown (.md)** : lisible par un humain, pratique pour partager ou archiver l'inventaire (n'inclut pas les images).
- **Export SQLite (.sqlite)** : sauvegarde complète, incluant jaquettes et screenshots. À faire régulièrement, surtout si l'app t'avertit que le stockage local commence à être volumineux.

## Licence

Ce projet est distribué sous licence **[CC BY-NC 4.0](LICENSE)** (Creative Commons Attribution - Pas d'Utilisation Commerciale). Utilisation et modification libres et gratuites, à condition de créditer l'auteur original ; toute utilisation commerciale est interdite sans accord préalable.
