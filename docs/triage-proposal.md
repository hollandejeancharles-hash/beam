# Proposition : collecte et triage des demandes

Discussion produit issue des captures Linear fournies le 4 octobre 2026. Ce document décrit une proposition, pas des fonctionnalités déjà livrées.

## Parcours proposé

Conversation, note, suggestion ou source → une ou plusieurs demandes proposées → revue dans une file partagée → rattachement à un élément existant, création d’un élément, report ou rejet motivé → suivi dans la roadmap.

Les notes demeurent personnelles. La transformation en demande partage seulement le contenu sélectionné et les références autorisées, sans publier tout le carnet ou toute la conversation.

## Les blocs

- Collecte : entrée manuelle, depuis une note, depuis les suggestions publiques, puis connecteurs de conversations.
- Extraction : titre, problème, contexte, auteur/source, pièces jointes pertinentes. Une conversation peut produire plusieurs demandes distinctes.
- Analyse : catégorie et rattachement suggérés, rapprochements, doublons possibles. Chaque suggestion doit exposer des preuves. La fréquence seule ne détermine pas la priorité.
- Triage : valider, ajuster, rattacher, créer, différer, ignorer avec motif ou fusionner en gardant les origines. Une demande acceptée ne constitue pas automatiquement un engagement de livraison.
- Responsabilité : membre chargé de la revue et notification ciblée. Les rotations complexes peuvent être ajoutées ensuite.
- Règles : conditions explicites, ordre de priorité, exceptions et actions, test sur les demandes existantes avant activation. Les corrections humaines restent protégées.

## Place dans Beam

Choix validé avec l’utilisateur : remplacer Suggestions par Demandes, avec À examiner / À clarifier / Traitées. Une liste compacte et un panneau de détail exposeraient la source, les propositions et les décisions. Les écarts de roadmap et les décisions extraites demeureraient des revues distinctes, et non de fausses demandes produit.

## Première version proposée

Notes et suggestions publiques, demandes partagées, analyse locale, rapprochements et doublons proposés, validation humaine, rattachement ou création d’une feature, responsable de revue, historique et notification interne.

Ensuite : connecteurs Slack/Teams et tickets, règles contrôlées, automatisation limitée au classement, rotations si le volume le justifie.

## Contraintes de fonctionnement

L’IA locale nécessite un Mac actif et Beam disponible. Pour recevoir les événements pendant que ce Mac est éteint, la collecte et la file doivent être assurées séparément ; l’analyse locale reprend ensuite. Les connecteurs nécessitent une configuration et des accès propres au workspace. Aucun connecteur de conversation ni agent externe n’est ajouté par cette proposition.

L’import doit être idempotent avec l’identifiant de la source et de l’événement, éviter de recréer une demande à chaque synchronisation et conserver les références lors d’une fusion. Les modifications de roadmap conservent les contrôles de révision et l’annulation existants.
