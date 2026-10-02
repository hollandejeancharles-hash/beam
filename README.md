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

- Roadmap en tableau ou liste, statuts À venir / En cours / Livré.
- Création, modification, suppression, changement de statut par glisser-déposer ou formulaire.
- Priorités, catégories, horizons et recherche ; tri par priorité ou popularité.
- Évolutions publiques ou internes, filtrées côté serveur.
- Portail public, votes anonymes réversibles et propositions d’idées.
- Boîte de suggestions avec conversion en évolution, vue des nouveautés livrées.
- Données persistées dans SQLite, formulaires accessibles au clavier, interface adaptative.

## Production

```sh
npm ci
npm run build
BEAM_ADMIN_TOKEN='<une longue clé aléatoire>' HOST=0.0.0.0 PORT=5173 npm start
```

Le serveur refuse de démarrer en production sans `BEAM_ADMIN_TOKEN`. L’administration demande cette clé, conservée uniquement dans le stockage de session du navigateur. Utiliser un hébergement Node avec disque persistant et HTTPS devant le serveur. Le chemin public partageable est `/roadmap` sur le domaine choisi ; une adresse localhost ne peut pas être partagée à distance.

Variables : `BEAM_ADMIN_TOKEN`, `HOST` (127.0.0.1 par défaut), `PORT` (5173), `BEAM_DB` (`data/beam.sqlite`), `BEAM_SEED=true` (exemples optionnels, initialisés une seule fois). Le répertoire parent d’un chemin personnalisé doit exister. Sauvegarder SQLite avec une procédure compatible avec le mode WAL (base et journaux, ou sauvegarde SQLite).

Les votes identifient un navigateur via un cookie HttpOnly, SameSite=Lax, Secure en production : ils ne constituent pas une vérification d’identité. La limitation de requêtes est locale au processus et à l’adresse de connexion ; derrière un proxy, prévoir aussi une protection adaptée au niveau du proxy. Cette première version utilise une clé administrateur partagée, sans comptes individuels ni intégration automatique au CMS PULS. Les horizons proposés sont T4 2026 à T2 2027.

## Vérification

```sh
npm test
npm run build
```

Les tests couvrent la confidentialité des évolutions internes, l’authentification, les validations, les votes, les suggestions, la suppression et l’initialisation unique des exemples. Le test HTTP lance un serveur isolé sur le port 5184 avec une base temporaire.

## Architecture

React + Vite pour l’interface ; Node HTTP + SQLite pour l’API et le stockage. Pas de service tiers requis. Les polices DM Sans et Manrope sont chargées via Google Fonts, avec repli sur les polices système. Logo vectoriel Beam original, icônes Lucide.

Un `Dockerfile` est fourni pour un hébergement conteneurisé. Monter un volume persistant sur `/app/data`, fournir `BEAM_ADMIN_TOKEN` à l’exécution et terminer HTTPS au niveau du proxy. La construction Docker n’a pas été exécutée dans cet environnement. Le workflow GitHub vérifie les tests et la compilation à chaque push et pull request.

## GitHub Pages

`npm run build:pages` produit un portail **public en lecture seule**, accessible sous `/beam/`. Le workflow `pages.yml` le publie à chaque mise à jour de `main` (Pages doit utiliser la source **GitHub Actions** dans les réglages du dépôt).

GitHub Pages n’exécute pas Node/SQLite. Sur cette version, les boutons d’administration, de vote et de suggestion sont donc absents ; recherche, filtres, vues et détails fonctionnent. L’application complète reste disponible avec `npm run dev` ou sur un hébergement Node.

Pour actualiser le portail : modifier les évolutions dans Beam localement, exécuter `npm run export:roadmap`, relire `public/roadmap.json`, puis envoyer ce fichier sur `main`. L’export ne conserve que les champs autorisés des évolutions publiques et n’inclut jamais la base SQLite ni les données de visiteur. On peut aussi modifier directement `public/roadmap.json` sur GitHub. Une évolution rendue interne localement disparaît du portail seulement après un nouvel export et déploiement ; les données précédemment publiées restent dans l’historique Git.

Pour disposer de votes, suggestions et modifications synchronisés sur le site hébergé par Pages, il faudra connecter un serveur ou une base de données externe avec authentification adaptée.
