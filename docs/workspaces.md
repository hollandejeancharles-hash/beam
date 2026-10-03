# Plusieurs workspaces

Cliquez sur le nom du produit en haut du menu latéral. Le sélecteur permet de changer d’espace, d’ouvrir ses réglages ou de créer un nouveau workspace.

Chaque espace démarre avec une roadmap vide. Il possède ses propres éléments Gantt et Kanban, notes et pièces jointes, sources, suggestions, sujets, décisions, analyses et publications. Le modèle IA installé sur le Mac est commun ; les préférences d’activation de l’assistant sont reprises à la création puis réglables par espace.

Le profil et la connexion au compte Beam sont communs. Dans chaque espace, la rubrique Équipe permet de créer ou rejoindre une roadmap partagée. Les notes et documents demeurent locaux. Le nom et l’image du produit restent des réglages locaux, comme auparavant.

Le workspace actif est mémorisé sur ce Mac. Changer d’espace actualise les autres fenêtres Beam ouvertes sur le même serveur. La fenêtre de prise de note Mac affiche l’espace actif et protège l’enregistrement si celui-ci change pendant la sauvegarde. Enregistrez vos saisies avant de changer d’espace.

Les liens publics de l’application incluent l’identifiant du workspace. L’export GitHub Pages demeure une publication statique d’un seul espace : celui qui est actif lors de l’export, ou celui indiqué par BEAM_WORKSPACE. Il ne publie jamais les notes et les documents privés.

Les sauvegardes depuis Installation concernent le workspace sélectionné. Elles ne constituent pas un export de tous les workspaces du Mac.

## Conservation des données

L’ancien fichier beam.sqlite reste le workspace initial. Les nouveaux espaces sont stockés dans des fichiers distincts sous workspaces, à côté de cette base. Le registre et l’espace actif sont enregistrés dans les métadonnées de la base initiale. Aucun élément existant n’est déplacé ni effacé.
