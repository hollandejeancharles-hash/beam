# Slack et Microsoft Teams → Demandes

Les deux points d’entrée sont de vrais récepteurs d’événements, hébergés sur Supabase. Une mention de Beam dans un canal autorisé crée une demande partagée. Le message, son auteur et un lien vers la source sont conservés : canal Slack ou message Teams. La référence du fil Slack est aussi conservée. Les retries du fournisseur sont idempotents. Aucune réponse n’est envoyée à la conversation.

L’assistant local analyse les demandes à la prochaine ouverture de Beam, si l’assistant est activé. Le serveur ne lance pas de modèle et ne lit pas vos notes personnelles. Les demandes ne modifient pas automatiquement le Gantt.

## Installation Supabase (administrateur du projet)

Exécuter `supabase/004_intake.sql` après les migrations 001–003, puis :

```sh
supabase functions deploy beam-slack --project-ref auerxzzdzhgawkcvqeiq --use-api
supabase functions deploy beam-teams --project-ref auerxzzdzhgawkcvqeiq --use-api
```

La vérification du JWT **Supabase** est désactivée pour ces deux fonctions dans config.toml : Slack signe chaque requête avec HMAC ; Teams utilise des JWT Bot Connector (signature Microsoft, expiration, émetteur, audience, serviceUrl et endorsement msteams vérifiés). Sans les paramètres ci-dessous, les fonctions refusent toute réception. Ne pas désactiver ces vérifications propres aux fournisseurs.

## Slack

1. Créer une application depuis `integrations/slack/manifest.json` sur [Slack Apps](https://api.slack.com/apps). Utiliser le projet Supabase de votre déploiement dans l’URL du manifeste.
2. Dans Basic Information → App Credentials, copier le **Signing Secret** dans Supabase → Edge Functions → Secrets sous `BEAM_SLACK_SIGNING_SECRET`. Ne pas le coller dans un chat, le dépôt ou le package Mac.
3. Activer Event Subscriptions avec `https://auerxzzdzhgawkcvqeiq.supabase.co/functions/v1/beam-slack`. Slack vérifie automatiquement le challenge signé.
4. Installer l’application dans votre espace Slack. Le seul scope requis est `app_mentions:read` ; aucun jeton permettant de lire tout l’historique n’est nécessaire.
5. Inviter Beam dans le canal souhaité. Relever le Team ID et le Channel ID (dans les liens Slack).
6. Lier ce team et les canaux au bon workspace Beam avec la requête ci-dessous.
7. Écrire `@Beam Les clients veulent exporter leurs rapports en PDF`. Ouvrir Demandes dans Beam ; Intégrations indique la dernière réception.

Le message mentionnant Beam est conservé, avec sa référence de fil. Cette version ne récupère pas les autres messages du fil. Les messages privés et les messages sans mention ne sont pas importés.

## Microsoft Teams

1. Enregistrer une application **Beam** dans Microsoft Entra ID et créer un Azure Bot associé à cet App ID ; activer son canal Microsoft Teams. L’autorisation de créer/installer une app personnalisée dépend de votre organisation.
2. Configurer le messaging endpoint : `https://auerxzzdzhgawkcvqeiq.supabase.co/functions/v1/beam-teams`.
3. Dans Supabase → Edge Functions → Secrets, définir `BEAM_TEAMS_APP_ID` avec l’App ID du bot. Aucun mot de passe Microsoft n’est requis pour ce récepteur entrant qui n’envoie pas de réponse.
4. Dans Teams Developer Portal, créer l’application Beam et ajouter ce bot avec la portée **Team**, puis l’installer dans l’équipe autorisée. Configurer les métadonnées et icônes demandées par le portail. Pas de permission Graph de lecture globale.
5. Relever le Tenant ID et l’identifiant du canal ; les ajouter à la liaison Supabase ci-dessous.
6. Envoyer une mention `@Beam` dans ce canal. Le message doit apparaître dans Demandes.

Seul le contenu du message adressé au bot est disponible. Les pièces jointes, conversations privées, notifications de modification et l’historique complet ne sont pas importés. La lecture complète des fils nécessiterait une extension distincte des permissions. Aucun message n’est envoyé par Beam en retour.

## Lier un espace fournisseur au workspace Beam

Cette opération est réservée à l’administrateur du projet Supabase, après vérification que l’app est bien autorisée dans l’espace concerné. Un utilisateur Beam ne peut pas revendiquer un autre tenant depuis le navigateur. Le UUID est celui du workspace **partagé** dans `beam_workspaces`, pas l’identifiant du dossier local.

```sql
insert into public.beam_intake_connections(workspace_id,provider,external_id,channels)
values ('UUID_WORKSPACE_BEAM','slack','T_SLACK',array['C_CANAL_SLACK']);
-- Pour Teams :
insert into public.beam_intake_connections(workspace_id,provider,external_id,channels)
values ('UUID_WORKSPACE_BEAM','teams','UUID_TENANT_MICROSOFT',array['ID_CANAL_TEAMS']);
```

Un espace Slack / tenant Microsoft est lié à un seul workspace Beam dans cette version. Seuls les canaux explicitement listés sont acceptés. Pour désactiver une liaison : `update public.beam_intake_connections set enabled=false where id='UUID_LIAISON';`. Aucun secret fournisseur n’est présent dans ces tables ou dans les réponses envoyées à Beam.

## Vérifier le fonctionnement

Intégrations distingue **Non configuré**, **Configuré · en attente du premier message**, **Réception vérifiée** et **Désactivé**. Une dernière réception ne garantit pas que le fournisseur fonctionne encore : envoyer une nouvelle mention pour tester la connexion actuelle. `supabase/test_intake.sql` vérifie stockage, idempotence, isolation et permissions dans une transaction annulée. Les logs de fonctions permettent de diagnostiquer une livraison refusée sans enregistrer le texte ou les secrets.

Les données partagées sont hébergées chez Supabase ; seul le traitement IA reste local. Les membres autorisés du workspace peuvent lire les messages envoyés à Beam. Informer l’équipe avant d’activer un canal. Les quotas et éventuelles validations administrateur de Slack, Microsoft et Supabase restent applicables.

Références : [mentions Slack](https://docs.slack.dev/reference/events/app_mention/), [signature Slack](https://api.slack.com/docs/verifying-requests-from-slack), [authentification Bot Connector](https://learn.microsoft.com/en-us/azure/bot-service/rest-api/bot-framework-rest-connector-authentication?view=azure-bot-service-4.0).
