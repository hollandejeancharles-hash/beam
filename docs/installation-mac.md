# Installer Beam sur Mac

[Télécharger Beam pour Mac Apple Silicon](https://github.com/hollandejeancharles-hash/beam/releases/download/v2.0.0-beta.35/Beam-AppleSilicon.dmg)

## À savoir avant de télécharger

**Cette bêta n’est pas notarisée par Apple. macOS peut bloquer sa première ouverture et afficher un avertissement indiquant que le développeur ne peut pas être vérifié.** Une autorisation manuelle peut être nécessaire. Téléchargez Beam uniquement depuis le dépôt GitHub officiel indiqué ci-dessus, si vous faites confiance à cette source.

## Installation et première ouverture

1. Ouvrez le fichier **Beam-AppleSilicon.dmg**.
2. Glissez **Beam.app** dans **Applications**, puis ouvrez Beam depuis ce dossier.
3. Si macOS bloque l’ouverture, fermez l’avertissement et ouvrez **Réglages Système → Confidentialité et sécurité**.
4. Dans la section Sécurité, trouvez le message concernant Beam et cliquez sur **Ouvrir quand même**. Confirmez l’ouverture et authentifiez-vous si demandé.

Cette exception concerne Beam ; ne désactivez pas les protections générales de macOS. Si macOS signale un logiciel malveillant ou si votre entreprise interdit cette autorisation, ne contournez pas le blocage et contactez votre administrateur.

[Consulter la procédure officielle Apple](https://support.apple.com/fr-fr/102445).

## Après l’ouverture

- Beam nécessite un Mac **Apple Silicon (M1 ou plus récent), macOS 14 ou plus récent**. Pour l’IA, 16 Go de mémoire ou plus sont recommandés.
- Le moteur IA est inclus. Le modèle se télécharge depuis les réglages du workspace : prévoyez environ **6 Go** supplémentaires et une connexion Internet pour ce téléchargement.
- Au premier lancement, suivez l’accueil pour créer votre profil et votre workspace. Aucun terminal ni Node.js à installer.
- Pour rejoindre votre équipe : ouvrez le lien d’invitation reçu, choisissez **Ouvrir dans Beam**, puis **Rejoindre le workspace**. Vous pouvez aussi coller ce lien dans **Rejoindre un workspace**, depuis le sélecteur du workspace. La connexion à votre compte est demandée si nécessaire.
- Le Gantt et le Kanban de l’espace partagé se synchronisent en ligne. Les notes, pièces jointes et analyses IA restent sur votre Mac.

## Mettre Beam à jour

À partir de la bêta 35, ouvrez **Beam → Rechercher une mise à jour…** dans le menu macOS, ou **Votre installation → Mettre à jour Beam** dans les réglages. Beam télécharge et vérifie le paquet officiel, puis vous propose **Installer et relancer**. L’app doit être installée dans **Applications**, dans un dossier accessible en écriture ; le navigateur et le lanceur de développement proposent toujours le téléchargement manuel.

La dernière app est conservée : **Beam → Revenir à la version précédente…**. Ce retour conserve vos données actuelles, y compris les notes ajoutées depuis la mise à jour. Avant chaque remplacement, une copie privée des données locales est stockée dans `~/Library/Application Support/Beam/update-backups/` ; les modèles IA ne sont pas dupliqués. En cas de changement de format de données entre versions, une restauration depuis cette copie peut être nécessaire ; n’effacez pas vos données pour tenter un retour. Les anciennes copies ne sont pas supprimées automatiquement.

Installez une fois la bêta 35 manuellement pour activer ce mécanisme. Les protections de macOS restent actives : cette bêta non notarisée peut demander une nouvelle autorisation d’ouverture. Aucun contournement de Gatekeeper ni mot de passe administrateur n’est automatisé.
