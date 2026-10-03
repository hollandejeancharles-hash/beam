# Activer la collaboration Beam

1. Ouvrir le projet `auerxzzdzhgawkcvqeiq` dans Supabase, puis SQL Editor.
2. Exécuter une fois `001_collaboration.sql`, puis `002_team.sql` pour les profils, commentaires, historique et présence privée. Les tables sont protégées par RLS ; seul un membre voit sa roadmap. Les mises à jour passent par une fonction atomique qui refuse une révision périmée.
3. Dans Beam, cliquer sur le sélecteur du workspace → **Inviter des personnes**. Connectez-vous ou créez votre compte si nécessaire ; confirmez l’e-mail si Supabase le demande.
4. Choisissez Modifier ou Consulter et créez votre lien. Si le workspace est personnel, « Partager et inviter » partage explicitement sa roadmap actuelle. Les notes, pièces jointes, jetons et analyses restent locaux.
5. Le destinataire ouvre le lien → **Ouvrir dans Beam** → **Rejoindre le workspace**. La connexion est demandée si nécessaire et l’invitation est conservée. Un lien peut aussi être collé dans **Rejoindre un workspace**, directement dans le sélecteur, même depuis un workspace déjà partagé. L’ouverture directe sur Mac nécessite beta.10 ou plus récent ; chaque lien reste valable 7 jours pour une utilisation.


## Limites de la première version

- Gantt/Kanban partagés en ligne ; écritures bloquées hors connexion.
- Conflit : l’opération est refusée, la dernière version est chargée et l’utilisateur peut réessayer. Une fiche déjà ouverte conserve sa révision d’origine.
- Réception par Supabase Realtime ; récupération des changements toutes les 30 secondes en cas d’interruption du canal.
- Notes, sources, décisions, publications, profil et identité du workspace restent locaux. L’export public est une opération distincte.
- Pour éviter une modification uniquement dans le cache, la promotion directe d’une source est bloquée. Les propositions IA peuvent être appliquées après validation explicite, avec vérification des sources et de la révision partagée. Seul le texte validé rejoint la roadmap ; ses notes sources restent locales.
- Partager une description peut divulguer les informations que l’utilisateur y a incluses : l’option de copie de la roadmap est décochée par défaut.
- La sauvegarde locale d’origine est restaurée quand on quitte l’espace ; elle n’est pas remplacée par la roadmap partagée.
- Supabase Free a des quotas, une pause après inactivité et pas de sauvegardes automatiques. Exporter régulièrement la roadmap.

## Package Mac autonome

Pour les utilisateurs : [installation et autorisation à la première ouverture](../docs/installation-mac.md). La bêta n’est pas notarisée par Apple ; macOS peut demander une autorisation manuelle.

`python3 scripts/macos/build-launcher.py --portable`

Produit `../outputs/Beam-AppleSilicon.dmg` avec Node, les dépendances, l’interface compilée et Ollama. Le modèle Ministral 3 8B se télécharge depuis les réglages du workspace au premier lancement (bouton explicite et suivi des octets reçus). `--with-model` permet aussi de construire un DMG complet pour une installation sans téléchargement du modèle. Aucune base utilisateur ni donnée du dossier data n’est embarquée, à l’exception des fichiers du moteur IA et des poids du modèle. Les données du destinataire vivent dans `~/Library/Application Support/Beam/data`.

Le package cible Apple Silicon avec macOS 14+ ; 16 Go de mémoire ou plus recommandés pour l’IA. L’installateur de base fait environ 348 Mo, le modèle nécessite environ 6 Go supplémentaires. La signature actuelle est ad hoc pour les tests locaux : une signature Developer ID et une notarisation Apple restent nécessaires pour une distribution fluide avec Gatekeeper. Ne pas demander aux destinataires de désactiver les protections macOS.
