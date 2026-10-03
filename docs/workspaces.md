# Plusieurs workspaces

Le sélecteur en haut du menu permet de créer un workspace, de changer d’espace et d’ouvrir ses réglages. Chaque workspace possède sa roadmap, ses notes, ses pièces jointes, ses sources et ses publications.

## Personnel ou partagé

Un workspace personnel peut devenir partagé : Réglages → Équipe → Activer la collaboration. Sa roadmap et son nom sont conservés. Les notes et documents restent sur votre Mac. Désactiver la collaboration conserve la dernière roadmap sur ce Mac ; cela ne supprime pas l’espace de l’équipe.

Pour rejoindre, ouvrez le lien reçu : la page propose « Ouvrir dans Beam ». Vous pouvez aussi cliquer sur le sélecteur → Rejoindre un workspace et coller le lien ou l’ancien code. La connexion est demandée uniquement si nécessaire, et le parcours reprend l’invitation après connexion. Rejoindre une équipe ouvre un autre workspace dans le sélecteur. Vos espaces personnels ne sont pas remplacés. Retrouver un espace partagé déjà ouvert réutilise son workspace local.

Pour inviter : sélecteur → Inviter des personnes → choisissez Modifier ou Consulter → Copier le lien. Une invitation est valable 7 jours pour une seule personne. L’ouverture directe sur Mac nécessite Beam beta.10 ou plus récent ; le lien peut aussi être collé dans le formulaire. Le code reste dans le fragment de l’adresse publique et n’est pas transmis au serveur GitHub Pages.

Le compte et le profil sont communs aux workspaces. Le nom et la photo suivent vos modifications dans les équipes ; une synchronisation échouée est reprise lors de la reconnexion. L’e-mail de contact reste local et ne change pas l’adresse de connexion. Le nom et l’image du produit peuvent être personnalisés localement.

## Fenêtres et brouillons

Chaque fenêtre conserve son workspace dans son adresse. Changer d’espace dans une fenêtre ne recharge pas les autres. Le dernier espace choisi devient celui de la capture de notes dans la barre de menu Mac.

Les brouillons des éléments, du profil, des réglages et du texte des nouvelles notes sont conservés par fenêtre et par workspace. Les fichiers sélectionnés avant l’enregistrement ne sont pas des pièces jointes sauvegardées : enregistrez la note pour les conserver. Les anciens brouillons ne doivent pas servir à écraser les changements d’une équipe : les contrôles de révision restent actifs.

## Diffusion publique

La prévisualisation locale reste uniquement accessible sur votre Mac. « Diffuser la roadmap » permet d’exporter un fichier public beam-publication.json. Déposez-le dans public/ du dépôt Beam : la publication GitHub Pages l’utilise lors du prochain déploiement. Seuls les éléments publics non archivés et les publications déjà publiées sont inclus. Chaque déploiement diffuse une version statique d’un seul workspace, sans synchronisation automatique des modifications suivantes.

## Sauvegardes

Installation propose une sauvegarde du workspace courant ou de tous les workspaces. Les clés et sessions de connexion ne sont jamais exportées. Une sauvegarde de plusieurs espaces s’importe comme de nouveaux workspaces et conserve les espaces et le profil actuels. Une sauvegarde individuelle remplace uniquement l’espace sélectionné ; une copie précédente est conservée automatiquement.

L’ancien fichier beam.sqlite reste le workspace initial. Les autres bases sont conservées dans workspaces/ à côté de cette base. Aucun élément existant n’est déplacé ou effacé lors de cette mise à jour.
