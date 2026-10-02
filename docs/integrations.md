# Connexions produit dans Beam

Beam suit un produit par espace. Son nom est configurable dans Intégrations. Un produit peut avoir plusieurs dépôts, projets ADO et espaces documentaires. Les connexions sont indépendantes des initiatives, projets et features : une information peut être associée à plusieurs éléments du Gantt.

## Flux

API des outils → lecture serveur → informations normalisées en SQLite → boîte de réception → association ou création d’une feature interne → décision éditoriale → export public autorisé.

Les informations externes sont des preuves et du contexte. La source garde la propriété de son état ; Beam garde celle de la planification, de la priorité, de la visibilité et du statut produit. Fermer un ticket ou fusionner une PR ne signifie pas nécessairement livrer une feature. Aucun changement automatique de ces champs n’est appliqué.

## Sources prises en charge

| Source | Périmètre | Informations |
| --- | --- | --- |
| GitHub | Dépôt github.com | Issues, PR, releases, commits, exécutions Actions et liens vers leurs logs |
| Azure DevOps | Projet dev.azure.com | Work items et leur type, PR, builds, numéro de build et liens vers les logs |
| Notion | Page explicitement configurée et ses sous-pages | Titre, date de modification, extraits des blocs de premier niveau |
| Confluence Cloud | Espace identifié par son ID numérique | Pages, version et extrait du contenu storage |

Les tickets ADO conservent leur type (Epic, Feature, etc.) comme métadonnée. Leur transformation en initiative ou projet est une décision dans Beam. Les builds ADO ne représentent pas les releases classiques Azure Release Management : celles-ci ne sont pas encore importées. Les logs complets sont ouverts dans leur outil ; Beam n’archive pas leurs fichiers bruts. Notion ne parcourt pas les blocs imbriqués, les vues de bases ou les liens vers d’autres espaces.

## Accès

Ajouter une source dans l’administration ne transmet pas de secret. Les accès se configurent dans l’environnement du serveur :

- `BEAM_GITHUB_TOKEN` : optionnel pour les dépôts publics. Pour les privés, utiliser un token limité aux dépôts nécessaires et aux droits de lecture Contents, Issues, Pull requests et Actions.
- `BEAM_ADO_TOKEN` : token avec Work Items, Code et Build en lecture.
- `BEAM_NOTION_TOKEN` : connexion avec lecture du contenu ; partager explicitement la page racine avec cette connexion.
- `BEAM_CONFLUENCE_EMAIL` et `BEAM_CONFLUENCE_TOKEN` : compte limité à la lecture du périmètre nécessaire.

Ces valeurs sont partagées entre les sources d’un même fournisseur dans cette installation. Elles ne sont ni enregistrées dans SQLite, ni retournées à l’interface, ni exportées dans Pages. En production, les routes sources, informations, liens et historique exigent l’authentification administrateur de Beam. Le produit public expose uniquement son nom.

## API Beam

- GET /api/admin/sources, /api/admin/signals, /api/admin/sync-runs
- POST /api/admin/sources : provider, label, url, scope (ID d’espace Confluence)
- PATCH /api/admin/sources/:id : enabled (mise en pause sans effacement)
- POST /api/admin/sources/:id/sync : lecture à la demande
- POST /api/admin/signals/:id/link : item_id, remove optionnel
- POST /api/admin/signals/:id/promote : création interne, idempotente si déjà associée
- GET /api/admin/product et /api/public/product ; PATCH /api/admin/product : name

## Stockage et fiabilité

`signals` déduplique par source + type + identifiant externe. Une nouvelle lecture actualise le titre, le corps, l’état et la date de la source sans modifier les liens ni les choix roadmap. L’import d’une source est transactionnel : un échec de l’API conserve le dernier import réussi. `sync_runs` conserve le résultat et le compte d’informations lues. Les exécutions interrompues par un redémarrage sont signalées comme erreurs. Une source ne peut être lue deux fois simultanément dans le même processus.

Les lectures sont bornées : jusqu’à 300 éléments par collection paginée GitHub/Confluence, 100 exécutions Actions, 100 tickets/PR/builds ADO, 10 pages Notion et 300 blocs directs par page ; 40 appels maximum, 15 secondes par appel, 5 Mo par réponse. L’interface indique les imports partiels. Aucune exhaustivité historique n’est promise. Les objets disparus de la source restent dans l’historique local et ne sont pas automatiquement supprimés.

Les destinations réseau sont dérivées des fournisseurs autorisés, les redirections refusées et les extraits traités comme texte. Les erreurs techniques ne restituent pas les messages arbitraires des serveurs distants. GitHub Pages reçoit uniquement `roadmap.json` avec les champs publics autorisés et `product.json` avec le nom ; la boîte de réception et les journaux de synchronisation ne sont jamais exportés automatiquement. Si une information est copiée dans une feature puis explicitement publiée, son titre et sa description font partie de cette feature publique.

## Choix et prochaines extensions

Cette version utilise des lectures à la demande et une configuration serveur pour fonctionner avec le serveur SQLite existant. Elle n’utilise pas OAuth, webhooks, synchronisation planifiée ou écriture vers les outils sources. Pour plusieurs équipes, reprendre l’authentification (comptes, rôles), ajouter OAuth avec secrets chiffrés par connexion, une file de synchronisation et des curseurs persistants, puis webhooks signés avec reprise et déduplication. Pour de gros volumes, indexer les informations et paginer l’API Beam ; pour plusieurs serveurs, remplacer le verrou mémoire et SQLite par une coordination durable.

## Références API

- [GitHub Actions](https://docs.github.com/en/rest/actions/workflow-runs)
- [Azure DevOps WIQL](https://learn.microsoft.com/en-us/rest/api/azure/devops/wit/wiql?view=azure-devops-rest-7.1)
- [Notion : enfants des blocs](https://developers.notion.com/reference/get-block-children)
- [Confluence Cloud : pages](https://developer.atlassian.com/cloud/confluence/rest/v2/api-group-page/)
