# Beam

Beam est un espace de pilotage produit : organisez vos initiatives, projets et features dans un Gantt ou un Kanban, capturez vos notes et collaborez avec votre équipe. L’assistant IA tourne sur votre Mac ; la roadmap et les demandes peuvent être partagées via Supabase.

## Installer Beam sur Mac

**[⬇ Télécharger Beam pour Mac — Apple Silicon](https://github.com/hollandejeancharles-hash/beam/releases/download/v2.0.0-beta.38/Beam-AppleSilicon.dmg)** · [Notes de version](https://github.com/hollandejeancharles-hash/beam/releases/tag/v2.0.0-beta.38)

Mac **M1 ou plus récent**, **macOS 14+**. Pour l’IA locale, **16 Go de mémoire ou plus** sont recommandés. Aucun terminal, Node.js ou outil de développement à installer : le package contient Beam, Node et le moteur Ollama.

**Cette bêta n’est pas notarisée par Apple. macOS peut bloquer la première ouverture et afficher un avertissement.** Téléchargez uniquement depuis ce dépôt officiel, si vous faites confiance à cette source.

1. Téléchargez et ouvrez **Beam-AppleSilicon.dmg**.
2. Glissez **Beam.app** dans **Applications**, puis ouvrez-la.
3. Si macOS bloque Beam, fermez l’avertissement, puis allez dans **Réglages Système → Confidentialité et sécurité → Ouvrir quand même**. Confirmez l’ouverture si demandé. Ne désactivez pas les protections générales de macOS.
4. Suivez l’accueil pour renseigner votre profil, créer un workspace ou rejoindre celui de votre équipe.
5. Si vous souhaitez utiliser l’IA, téléchargez le modèle depuis les réglages du workspace : environ **6 Go** supplémentaires. Le téléchargement est explicite et nécessite Internet.

[Guide d’installation et de mise à jour](docs/installation-mac.md) · [Procédure officielle Apple](https://support.apple.com/fr-fr/102445)

Pour garder Beam dans le Dock, ouvrez-la depuis Applications, puis choisissez **Options → Garder dans le Dock**. L’icône de la barre de menus permet de capturer une note dans une petite fenêtre dédiée, agrandissable en carnet.

## Ce que vous pouvez faire

- **Planification** : Gantt avec initiatives, projets et features imbriqués, dates cibles ou engagements, dépendances, déplacement des éléments, scénarios et aperçu des impacts.
- **Détails des éléments** : résumé fixe, couleurs de statut et de priorité, onglets Vue d’ensemble, Sources, Décisions et Activité, accès direct aux points proposés par l’assistant.
- **Kanban** : écran distinct pour suivre les statuts et réorganiser les éléments par glisser-déposer.
- **Notes** : carnet privé en pleine largeur, avec dossiers, liste des notes et éditeur dans trois colonnes, capture rapide, titres et mise en forme, listes à cocher, tableaux, images visibles dans les notes et PDF, dossiers intelligents issus des sujets, classement dans plusieurs dossiers, renommage, fusion et masquage ; regroupements proposés par l’assistant local.
- **Demandes** : qualifier les retours, assigner un responsable, clarifier, différer, refuser, regrouper les doublons ou préparer une feature avec son contexte.
- **Assistant local** : proposer des liens entre sources et roadmap, faire ressortir les décisions et signaler les contradictions. Les changements de roadmap nécessitent une validation.
- **Intégrations** : informations GitHub, Azure DevOps, Notion et Confluence ; mentions Slack et Teams vers Demandes après configuration des applications.
- **Publications** : préparer avec l’IA des release notes orientées utilisateurs à partir des commits d’une version GitHub, puis relire et publier.
- **Recherche** : retrouver les éléments, notes, demandes et informations disponibles dans votre workspace avec **⌘K / Ctrl+K**.
- **Workspaces** : plusieurs espaces, profils, invitations, présence, commentaires, historique des modifications et sauvegardes locales.

Les intégrations nécessitent leurs autorisations propres. Slack et Teams ne sont pas connectés automatiquement à l’installation : [guide de configuration](docs/conversation-intake.md). Cette version importe le message mentionnant Beam dans les canaux autorisés, sans lire tout l’historique.

## Travailler en équipe

Depuis le sélecteur du workspace, choisissez **Inviter des personnes**. Connectez-vous ou créez votre compte, partagez le workspace si nécessaire et créez un lien d’invitation avec le rôle **Modifier** ou **Consulter**.

Votre collègue installe Beam, ouvre le lien reçu et choisit **Ouvrir dans Beam → Rejoindre le workspace**. Le lien peut aussi être collé dans **Rejoindre un workspace**, depuis le sélecteur.

Le Gantt, le Kanban et les demandes du workspace partagé sont synchronisés via Supabase. Les notes personnelles, pièces jointes, jetons et analyses IA restent locaux ; seul un extrait de note volontairement envoyé dans Demandes est partagé. Les messages adressés à Beam via les canaux Slack/Teams autorisés sont partagés avec les membres du workspace. Internet est nécessaire pour consulter et modifier les données partagées ; les écritures sont bloquées hors connexion.

[Configuration de Supabase et limites de la collaboration](supabase/README.md)

## Vos données et les mises à jour

Le package autonome conserve vos données dans `~/Library/Application Support/Beam/data`. Elles ne sont pas incluses dans l’installateur et ne sont pas effacées quand vous remplacez l’app.

Depuis la bêta 35, choisissez **Beam → Rechercher une mise à jour…** dans le menu Mac, ou **Réglages du workspace → Installation → Mettre à jour Beam**. Beam télécharge et vérifie le paquet officiel, puis propose **Installer et relancer**. L’app doit être dans Applications, avec un accès en écriture. La version précédente et une sauvegarde des données sont conservées ; le menu Beam permet de revenir à cette version. macOS peut demander une nouvelle autorisation d’ouverture. Exportez régulièrement vos sauvegardes.

Pour transmettre Beam à vos collègues, partagez **[la page du dépôt](https://github.com/hollandejeancharles-hash/beam#installer-beam-sur-mac)** : le bouton de téléchargement en haut pointe vers la version publiée indiquée, avec les instructions d’installation. Envoyez ensuite votre lien d’invitation au workspace.

## Sécurité locale

L’application Mac authentifie les accès administratifs avec une clé aléatoire par lancement, transmise aux fenêtres dans un cookie HTTPOnly. Le serveur local refuse les noms d’hôte inattendus et les origines tierces. Les sessions Supabase sont conservées dans le Trousseau macOS ; les anciennes sessions SQLite sont migrées après confirmation de leur enregistrement sécurisé.

Les notes et pièces jointes restent dans la base locale : Beam ne chiffre pas toute cette base. Le chiffrement du disque dépend des réglages de macOS, notamment FileVault. Le mode de développement est distinct du package Mac sécurisé. Pour utiliser les connexions en développement sur Mac, construisez le lanceur et définissez `BEAM_KEYCHAIN_HELPER` avec le chemin de `../outputs/Beam.app/Contents/MacOS/BeamSecureStore`.

## Roadmap publique

Beam peut publier une roadmap et des annonces orientées utilisateurs. GitHub Pages sert une vitrine **en lecture seule**, distincte de l’application Mac ; il n’héberge pas votre carnet, l’IA ou le serveur collaboratif.

Pour le déploiement de ce dépôt : `npm run export:roadmap` exporte uniquement les champs publics dans `public/roadmap.json` et `public/publications.json`. Relisez ces fichiers avant de les envoyer sur `main`. Le workflow Pages les publie si la source Pages du dépôt est configurée sur **GitHub Actions**. Un retrait nécessite un nouvel export et déploiement ; les anciens contenus restent dans l’historique Git.

## Développer Beam

Cette section concerne uniquement les personnes qui souhaitent travailler sur le code. **Elle n’est pas nécessaire pour installer l’application Mac.**

Node.js **24+** est requis pour SQLite intégré.

```sh
npm ci
npm run dev
```

Administration : `http://localhost:5173` · Portail public : `http://localhost:5173/roadmap`.

Un nouveau workspace démarre vide. Les exemples sont optionnels avec `BEAM_SEED=true`.

```sh
npm test
npm run build
```

React + Vite pour l’interface ; Node HTTP + SQLite pour le stockage local ; Supabase pour la collaboration ; Ollama pour le modèle local. Les icônes animées et leur licence MIT sont conservées dans `src/icons/vendor`.

### Construire le package Mac

```sh
python3 scripts/macos/build-launcher.py --portable
```

Produit `../outputs/Beam-AppleSilicon.dmg` avec Beam, Node et le moteur Ollama, sans données utilisateur ni secrets. Le runtime Ollama doit être disponible dans `data/ai/runtime` avant la construction. `--with-model` inclut aussi les poids déjà téléchargés. La signature est ad hoc ; le package n’est pas notarisé.

Sans `--portable`, le script construit un lanceur lié au dépôt et à l’installation Node locale ; il est réservé au développement.

### Héberger le serveur Node

```sh
npm ci
npm run build
BEAM_ADMIN_TOKEN='<une longue clé aléatoire>' HOST=0.0.0.0 PORT=5173 npm start
```

Utilisez un disque persistant et HTTPS devant le serveur. Le mode serveur exige la clé administrateur ; les comptes de collaboration Supabase constituent un accès distinct. `BEAM_DB` permet de choisir le chemin SQLite. Un `Dockerfile` est fourni ; montez un volume persistant sur `/app/data`.

[Connexions produit](docs/integrations.md) · [Slack et Teams](docs/conversation-intake.md) · [Schéma Supabase](supabase/README.md)

Les visiteurs de la roadmap publique peuvent cliquer sur **Faire une demande**, sans compte Beam. La demande arrive dans **Demandes** du workspace partagé. Le portail PULS est activé ; les futurs exports incluent automatiquement son récepteur public. Aucune note privée ni clé serveur n’est publiée.
