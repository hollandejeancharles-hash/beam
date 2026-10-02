# Beam

La roadmap produit de PULS : un espace de pilotage et un portail public pour construire la suite avec ses utilisateurs.

## Démarrer

Node.js **24 ou supérieur** requis (SQLite intégré à Node).

```sh
npm ci
npm run dev
```

- Administration : http://localhost:5173
- Roadmap publique : http://localhost:5173/roadmap

Le mode développement fonctionne localement sans clé et initialise neuf évolutions **fictives**, modifiables. Aucune métrique de vote n’est inventée. Les exemples ne sont pas chargés automatiquement en production.

## Fonctionnalités

- Gantt à l’accueil : initiatives, projets et features avec hiérarchie repliable.
- Dates précises, responsables, avancement, dépendance et horizons trimestriels estimés.
- Déplacement et redimensionnement des barres datées ; dates et avancement des parents calculés depuis leurs enfants en l’absence de dates propres.
- Kanban sur un écran distinct, en tableau ou liste, statuts À venir / En cours / Livré.
- Création, modification, suppression, changement de statut par glisser-déposer ou formulaire.
- Priorités, catégories, horizons et recherche ; tri par priorité ou popularité.
- Évolutions publiques ou internes, filtrées côté serveur.
- Portail public, votes anonymes réversibles et propositions d’idées.
- Boîte de suggestions avec conversion en évolution, vue des nouveautés livrées.
- Données persistées dans SQLite, formulaires accessibles au clavier, interface adaptative.

## Navigation et recherche

Le menu latéral utilise le composant TreeNav fourni, avec un repère animé et un accès aux initiatives/projets existants. Le bouton en haut à gauche le replie en une barre d’icônes (et le masque sur mobile) ; ce choix est conservé dans le navigateur. Les points du Gantt suivent le statut : gris À venir, ambre En cours, vert Livré.

La palette fournie s’ouvre avec **⌘K / Ctrl+K** ou la recherche. Elle retrouve les éléments, ouvre les écrans et combine les filtres type, état et priorité sous forme de chips, appliqués ensemble. Flèches et Entrée sélectionnent ; Retour arrière retire un choix ; Échap efface puis referme. Les composants sont dans `src/components/ui`, compilés en TSX par Vite et stylés avec Tailwind 4 (sans son reset global).

Le fond Beams fourni couvre les écrans administrateur et public. Il utilise un canvas adapté au viewport et au ratio de pixels, s’arrête dans un onglet caché et devient statique avec la réduction des animations. Les icônes Planification (CalendarDays), Intégrations (PlugZap) et les contrôles associés proviennent de Lucide Animated référencé sur 21st.dev.

## Intégrations produit

L’écran **Intégrations** configure le nom du produit et ses sources GitHub, Azure DevOps, Notion et Confluence Cloud. Les lectures à la demande alimentent une boîte de réception interne ; associez une information à une initiative/projet/feature ou créez une feature interne. Les mises à jour des sources préservent la planification Beam. Les connexions peuvent être mises en pause.

Les secrets sont configurés uniquement dans l’environnement serveur (`BEAM_GITHUB_TOKEN`, `BEAM_ADO_TOKEN`, `BEAM_NOTION_TOKEN`, `BEAM_CONFLUENCE_EMAIL`, `BEAM_CONFLUENCE_TOKEN`). Aucun compte n’est nécessaire pour préparer les liens ; GitHub public peut être lu sans token. Les autres lectures nécessitent leurs accès. Les logs complets sont ouverts dans l’outil d’origine. OAuth, webhooks et synchronisation automatique ne sont pas implémentés.

Voir [le périmètre, la configuration et l’architecture](docs/integrations.md). Les intégrations sont disponibles dans l’administration Node, pas sur GitHub Pages.

## Production

```sh
npm ci
npm run build
BEAM_ADMIN_TOKEN='<une longue clé aléatoire>' HOST=0.0.0.0 PORT=5173 npm start
```

Le serveur refuse de démarrer en production sans `BEAM_ADMIN_TOKEN`. L’administration demande cette clé, conservée uniquement dans le stockage de session du navigateur. Utiliser un hébergement Node avec disque persistant et HTTPS devant le serveur. Le chemin public partageable est `/roadmap` sur le domaine choisi ; une adresse localhost ne peut pas être partagée à distance.

Variables : `BEAM_ADMIN_TOKEN`, `HOST` (127.0.0.1 par défaut), `PORT` (5173), `BEAM_DB` (`data/beam.sqlite`), `BEAM_SEED=true` (exemples optionnels, initialisés une seule fois). Le répertoire parent d’un chemin personnalisé doit exister. Sauvegarder SQLite avec une procédure compatible avec le mode WAL (base et journaux, ou sauvegarde SQLite).

Les votes identifient un navigateur via un cookie HttpOnly, SameSite=Lax, Secure en production : ils ne constituent pas une vérification d’identité. La limitation de requêtes est locale au processus et à l’adresse de connexion ; derrière un proxy, prévoir aussi une protection adaptée au niveau du proxy. Cette première version utilise une clé administrateur partagée, sans comptes individuels ni intégration automatique au CMS PULS. Les horizons acceptent les trimestres de 2000 à 2099.

## Vérification

```sh
npm test
npm run build
```

Les tests couvrent la confidentialité des évolutions internes, l’authentification, les validations de dates, la migration des données, la hiérarchie, les dépendances, les calculs de planning, les votes, les suggestions, la suppression et l’initialisation unique des exemples. Le test HTTP lance un serveur isolé sur le port 5184 avec une base temporaire.

## Architecture

React + Vite pour l’interface ; Node HTTP + SQLite pour l’API et le stockage. Pas de service tiers requis. La police Inter est chargée via Google Fonts, avec repli sur les polices système. Logo vectoriel Beam original, icônes Lucide et composants Lucide Animated (pqoqubbw), référencés sur [21st.dev](https://21st.dev/community/icons/animated). Les composants animés et leur licence MIT sont conservés dans `src/icons/vendor`. Les animations sont déclenchées par le contrôle complet au survol, au focus et au clic, et désactivées si le système demande de réduire les animations.

Un `Dockerfile` est fourni pour un hébergement conteneurisé. Monter un volume persistant sur `/app/data`, fournir `BEAM_ADMIN_TOKEN` à l’exécution et terminer HTTPS au niveau du proxy. La construction Docker n’a pas été exécutée dans cet environnement. Le workflow GitHub vérifie les tests et la compilation à chaque push et pull request.

## GitHub Pages

`npm run build:pages` produit un portail **public en lecture seule**, accessible sous `/beam/`. Le workflow `pages.yml` le publie à chaque mise à jour de `main` (Pages doit utiliser la source **GitHub Actions** dans les réglages du dépôt).

GitHub Pages n’exécute pas Node/SQLite. Sur cette version, les boutons d’administration, de vote et de suggestion sont donc absents ; recherche, filtres, vues et détails fonctionnent. L’application complète reste disponible avec `npm run dev` ou sur un hébergement Node.

Pour actualiser le portail : modifier les évolutions dans Beam localement, exécuter `npm run export:roadmap`, relire `public/roadmap.json`, puis envoyer ce fichier sur `main`. L’export ne conserve que les champs autorisés des évolutions publiques et n’inclut jamais la base SQLite ni les données de visiteur. On peut aussi modifier directement `public/roadmap.json` sur GitHub. Une évolution rendue interne localement disparaît du portail seulement après un nouvel export et déploiement ; les données précédemment publiées restent dans l’historique Git.

Pour disposer de votes, suggestions et modifications synchronisés sur le site hébergé par Pages, il faudra connecter un serveur ou une base de données externe avec authentification adaptée.

### Notes privées

Le bouton **Noter** reste disponible sur tous les écrans de l’espace administrateur. **⌘⇧N / Ctrl⇧N** ouvre la capture ; **⌘Entrée / CtrlEntrée** enregistre et laisse le champ prêt pour la note suivante. Fermer la capture conserve le brouillon dans ce navigateur.

Le carnet **Notes** propose une liste chronologique compacte, les vues « À suivre » et « À examiner », des filtres de sujets extraits automatiquement, la recherche, la correction du texte et du classement, la clôture et l’archivage réversible. Les notes sont enregistrées dans SQLite et protégées par l’accès administrateur. Elles ne sont jamais incluses dans la roadmap publique ou dans l’export GitHub Pages.

L’interprétation actuelle repose sur des règles locales transparentes : intentions courantes en français, noms après certains verbes, `@personne`, `#sujet`, aujourd’hui/demain, jours de semaine et dates `AAAA-MM-JJ`, rapprochement des titres de roadmap. Un jour de semaine désigne sa prochaine occurrence. Une note ambiguë reste une note ; les propositions sont modifiables. Aucun appel à un service IA, aucune notification programmée et aucune modification automatique de la roadmap. GitHub Pages reste la vitrine publique ; le carnet nécessite le serveur Beam.

### Lanceur Mac : Dock et barre de menus

`python3 scripts/macos/build-launcher.py` construit `../outputs/Beam.app` avec le logo Beam. Un clic ouvre la roadmap locale dans une fenêtre Mac dédiée, sans onglets ni barre d’adresse, et démarre le serveur si nécessaire. La barre de menus propose « Ouvrir Beam », « Ouvrir les notes » et « Quitter Beam ». Pour le garder dans le Dock, glissez `Beam.app` dans la partie Applications du Dock.

Le lanceur conserve la base `data/beam.sqlite` du dépôt et écoute exclusivement sur `127.0.0.1:5173`. Il nécessite Node.js 24 et les dépendances du dépôt déjà installées. Il ne modifie pas le Dock, les réglages macOS ou les éléments d’ouverture de session. Quitter le lanceur arrête uniquement le serveur qu’il a lui-même démarré ; il laisse un serveur préexistant fonctionner. En cas de problème, consulter `data/launcher.log`.

L’app peut être déplacée, mais le chemin du dépôt et celui de Node sont enregistrés lors de sa construction : reconstruisez le lanceur après avoir déplacé le dépôt ou changé l’installation Node. Compilation native avec les outils Apple existants ; signature ad hoc locale, sans distribution ni notarisation.

La fenêtre utilise WebKit et conserve ses données de navigation localement. Les notes et la roadmap retrouvent la même base SQLite. Fermer la fenêtre garde Beam disponible dans la barre de menus ; cliquer dans le Dock la réaffiche sans recharger la page. Les liens externes et le portail partagé ouvrent le navigateur habituel. Les raccourcis Copier/Coller et ceux de Beam restent disponibles.

Un clic gauche sur l’icône Beam dans la barre de menus affiche la fenêtre existante et ouvre directement la capture rapide, avec le curseur dans le champ. Le clic droit conserve le menu (roadmap, carnet et quitter). Le clic ne change pas l’écran courant et conserve le brouillon. Si un autre dialogue est ouvert, fermez-le avant de demander la capture.

### IA locale pour les notes et features

L’assistant **Ministral 3 8B / Ollama** organise automatiquement les notes et prépare des propositions de roadmap avec leurs sources. Les notes acceptent des images, captures et PDF analysés localement. Les nouvelles notes sont enregistrées sans attendre l’analyse ; aucun changement de roadmap n’est appliqué sans validation. Depuis les détails d’un élément, l’assistant analyse ses notes et sources associées. Voir [installation, confidentialité et limites](docs/local-ai.md).

### Espace vierge et archives

Les données de démonstration ne sont chargées que si `BEAM_SEED=true` est explicitement défini. Les éléments et suggestions peuvent être archivés, restaurés depuis **Voir les archives**, ou supprimés définitivement après confirmation. Les éléments archivés sont exclus du portail public et de son export GitHub Pages.

### Sujets vivants

Dans Notes, les **Sujets vivants** regroupent les notes (avec leur analyse et le texte des pièces jointes) et les informations importées du produit. Le moteur local regroupe les sources en arrière-plan quand l’assistant est actif, par lots bornés. Les correspondances incertaines sont indiquées **À examiner**. Une source importée répétée à la même URL ne compte qu’une fois.

Ouvrir un sujet pour lire sa synthèse, ses questions et ses sources datées, puis l’associer à une feature ou préparer une nouvelle feature interne. Le menu **Organiser ce sujet** permet de renommer/fusionner ; le sélecteur de chaque source permet de la déplacer ou la retirer. Les corrections de rattachement sont conservées. Les sujets restent privés et ne changent pas les priorités ou la roadmap automatiquement.

### Profil utilisateur

Cliquer sur l’avatar en bas du menu pour modifier le nom affiché, le rôle, l’email facultatif et la photo. La photo est recadrée au centre, redimensionnée et stockée dans le profil privé SQLite. Sans photo, Beam affiche les initiales du nom. Ce profil local ne crée pas de compte et n’est jamais exporté vers GitHub Pages.

### Ordre personnalisé du Gantt

Glisser la poignée à gauche d’une ligne pour la placer avant ou après un autre élément du même parent. Les enfants restent sous leur parent. L’ordre est conservé dans SQLite et retrouvé avec le tri **Ordre personnalisé** ; un déplacement réactive automatiquement ce tri. Au clavier, placer le focus sur la poignée puis utiliser **Alt + ↑ / ↓**. Le déplacement des barres continue de modifier les dates.

### Kanban animé

Les cartes se déplacent entre les états et se réordonnent dans chaque colonne, avec une carte flottante et un emplacement animé. Un clic ouvre le détail ; le bouton en pied de colonne crée un élément dans cet état. Au clavier : Entrée ouvre, Espace sélectionne, les flèches déplacent, Espace valide, Échap annule. Les gestes respectent la préférence de réduction des animations.

L’ordre du Kanban est sauvegardé séparément du Gantt, sans modifier les rattachements. Les filtres préservent les éléments masqués. Le portail public et les archives restent en consultation. Adaptation du composant fourni, sans ses données de démonstration.

### Rapprochement automatique des sources

Quand l’assistant local est actif, Beam rapproche les notes et pièces jointes (texte des PDF, puis synthèse locale des pièces visuelles) ainsi que les tickets, PR et documents importés avec les initiatives, projets et features existants. Le serveur traite les sources nouvelles ou modifiées par petits lots, toutes les minutes. Une modification du titre, de la description ou du rattachement d’un élément relance aussi le rapprochement. Aucun cloud n’intervient.

Un lien précis est associé automatiquement, avec une justification et un extrait vérifié dans le contenu fourni. Un rapprochement ambigu apparaît dans « À vérifier » et reste exclu de l’analyse tant qu’il n’est pas confirmé. Vous pouvez confirmer ou écarter un lien dans le détail de l’élément ou de la source. Les corrections manuelles sont conservées. Le bouton « Analyser » recherche les sources pertinentes avant de préparer ses propositions : aucune association préalable n’est nécessaire. Seules les propositions de modification de roadmap attendent une validation.

Le rapprochement local est borné à 12 sources par lot et à un contexte de 52 000 caractères. Une roadmap dépassant à elle seule 42 000 caractères signale sa limite plutôt que tronquer silencieusement ses éléments. Les liens, extraits et notes restent privés et sont exclus de GitHub Pages.

### Progression des analyses locales

Le cercle de progression accompagne les notes, à droite de l’heure, les analyses dans les panneaux, les éléments du Gantt et du Kanban, ainsi que les sources et les sujets vivants. Un repère discret dans la barre supérieure permet de suivre une analyse depuis un autre écran. Les animations respectent la réduction des mouvements.

Le suivi provient du serveur et des réponses Ollama reçues en continu : préparation, analyse locale, vérification et enregistrement. Le cercle représente les étapes réellement terminées (sur quatre), pas une estimation du temps restant. Pendant la génération, un mouvement signale que le calcul continue ; le détail indique l’étape, la durée écoulée et le volume de réponse effectivement reçu. Ollama ne donne pas de pourcentage fiable avant la fin de la génération, donc Beam n’en invente pas. Les analyses interrompues conservent leur état d’erreur et ne passent jamais à 100 %. Le suivi reste privé.
