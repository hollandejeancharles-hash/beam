# Notifications

La cloche de la barre supérieure ouvre un panneau inspiré du composant ActivityDropdown fourni, adapté à la structure React de Beam et aux icônes animées 21st.dev. Il affiche des événements réels du workspace actif, sans données de démonstration.

- Commentaires d’autres membres et mentions exactes `@Nom du profil`.
- Changements d’état, de priorité, de dates, de responsable, et suppression d’un élément. Plusieurs changements du même élément sont regroupés ; réordonner une carte ne déclenche pas de notification.
- Propositions locales à examiner, regroupées en une entrée. Marquer comme lu ne valide pas une proposition ; retirer une proposition déjà lue ne réveille pas les propositions restantes, mais une nouvelle proposition réactive le badge.
- Connexion à un workspace partagé interrompue.

Les alertes d’équipe commencent lors de la première utilisation des notifications par ce compte sur ce workspace. Les propositions IA déjà en attente restent visibles. Le panneau est actualisé à l’ouverture, au retour dans l’app et toutes les 30 secondes. Les états lus sont stockés localement par compte et workspace ; les analyses privées ne sont jamais transmises à l’équipe.

Ces notifications sont internes à Beam ; il n’y a pas de notification système macOS ou de demande d’autorisation supplémentaire. Les alertes résolues disparaissent du panneau. Les commentaires et changements sont obtenus avec les droits Supabase du membre connecté.
