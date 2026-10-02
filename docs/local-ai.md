# Assistant local de Beam

Beam utilise **Ministral 3 8B Instruct** via l’API locale d’Ollama. Les nouvelles notes sont sauvegardées immédiatement puis analysées en arrière-plan si l’assistant est activé. L’IA propose un classement et, lorsque les sources le justifient, un ajout à une feature ou une nouvelle feature interne.

## Utilisation

- Ouvrir **Notes → Propositions**, puis activer l’assistant.
- Les nouvelles notes sont analysées automatiquement. Pour une note existante, la sélectionner puis cliquer sur **Analyser cette note**.
- Vérifier le classement, les changements proposés et leurs sources avant d’appliquer. Le texte original reste conservé.
- Depuis les **détails d’une feature → Assistant local**, analyser les notes et informations source qui lui sont explicitement associées.
- Une nouvelle feature est toujours créée en interne. Un ajout à la description d’une feature publique fait l’objet d’une indication de visibilité avant validation. Les dates, statuts et publications ne sont jamais modifiés par l’assistant.

La mise en pause empêche de nouvelles analyses. Une analyse déjà lancée peut se terminer, sans appliquer de changement. Une erreur ou une réponse invalide laisse les données intactes. Si une source, une note ou la feature a changé depuis l’analyse, relancer l’analyse avant application.

## Installation sur ce Mac

Le moteur officiel **Ollama v0.35.0** est installé dans `data/ai/runtime`, et le modèle dans `data/ai/models`. Ces fichiers et les journaux sont ignorés par Git. Le serveur Beam démarre ce moteur lorsqu’il est présent et que le port local 11434 est libre. Il arrête uniquement le moteur qu’il a lui-même lancé lorsqu’il se ferme. Un Ollama déjà ouvert est réutilisé.

Pour une autre installation, télécharger Ollama depuis [le site officiel](https://ollama.com/download/mac), puis télécharger le modèle avec :

```sh
ollama pull ministral-3:8b
```

Démarrer Ollama puis ouvrir Beam. L’interface permet de vérifier si le moteur et le modèle sont disponibles. Aucun modèle n’est téléchargé automatiquement par Beam.

## Confidentialité et limites

- Endpoint fixe : `http://127.0.0.1:11434`. Aucun endpoint cloud configurable et aucun secours vers un service externe.
- Le moteur géré par Beam est lancé avec `OLLAMA_NO_CLOUD=1` et écoute seulement sur `127.0.0.1`.
- Réponses contraintes par un schéma JSON et les identifiants exacts des sources, puis validées côté serveur. Aucun outil, script ou commande n’est fourni au modèle.
- Routes et propositions réservées à l’administration. Aucune note ou proposition exportée sur GitHub Pages.
- L’analyse locale peut prendre plusieurs dizaines de secondes. File d’attente séquentielle, délai maximal de deux minutes et mise en veille du modèle après cinq minutes d’inactivité.
- Le contexte est limité aux sources sélectionnées ; pour une feature très documentée, analyser les notes séparément. Le classement et les suggestions restent à vérifier.
- La confidentialité de l’inférence ne désactive pas une éventuelle synchronisation ou sauvegarde des fichiers du Mac configurée par l’utilisateur.

Documentation : [API Ollama](https://docs.ollama.com/api/chat), [modèle Ministral 3](https://ollama.com/library/ministral-3).
