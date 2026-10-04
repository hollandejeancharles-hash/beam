# Décisions et fiabilité de la roadmap

Les décisions extraites des notes restent proposées jusqu’à confirmation. Elles conservent leur date et leur source ; confirmer une décision ne modifie pas automatiquement la roadmap. Elles sont visibles dans la note et dans les éléments associés.

## Dates et déplacements

Chaque élément distingue une date cible d’un engagement confirmé. Les éléments existants sont considérés comme des cibles : Beam ne leur attribue aucun engagement rétroactif. Les dates cibles ont un contour discontinu dans le Gantt. Sans dates précises, le trimestre reste un horizon estimé.

Toute modification des dates d’un élément existant présente un aperçu avant application : enfants, dépendances, publications liées et incompatibilités de dates. Un déplacement de toute la période permet de décaler ensemble les enfants datés non terminés. Les dépendances et publications restent à vérifier, sans modification automatique. Une modification concurrente invalide l’aperçu.

## Écarts à examiner

Beam signale les reports datés issus des décisions lorsqu’ils contredisent la période actuelle, et les versions publiées liées à des éléments encore ouverts. Chaque écart expose ses sources. Une PR fusionnée ne constitue pas une preuve de livraison. Une version liée peut couvrir seulement une partie de la feature : la vérification reste humaine. Les autres contradictions sémantiques ne sont pas encore détectées de manière générale.

Un écart ignoré reste masqué tant que ses preuves et l’état concerné ne changent pas.

## Historique et annulation

L’historique commence avec cette version et conserve les changements observés sur ce Mac, leur auteur connu et le motif facultatif des replanifications. Les changements distants observés sont identifiés comme une synchronisation d’équipe ; l’activité partagée conserve les informations d’auteur distantes.

L’annulation rétablit ensemble les éléments d’une même opération, y compris les déplacements dans le Gantt et le Kanban. Elle préserve les autres champs modifiés depuis, et refuse de rétablir un champ modifié par une opération plus récente. En collaboration, la révision distante est également vérifiée. Les historiques locaux sont inclus dans les sauvegardes.
