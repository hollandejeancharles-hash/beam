# Installer Beam sur Mac

[Télécharger Beam pour Mac Apple Silicon](https://github.com/hollandejeancharles-hash/beam/releases/download/v2.0.0-beta.34/Beam-AppleSilicon.dmg)

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

Beam signale les nouvelles versions dans l’interface. Vous pouvez aussi vérifier depuis les réglages du workspace → **Votre installation**. Quittez Beam, téléchargez le nouveau DMG, puis remplacez Beam dans Applications et relancez-le. Vos données sont conservées dans Application Support ; exportez une sauvegarde avant une mise à jour importante. Une nouvelle version non notarisée peut demander une nouvelle autorisation macOS.
