# 0063 — CRM : les listes (Personnes, Entreprises, Projets) et les fiches d'entreprise et de personne

- **Date** : 2026-11-25
- **Statut** : acceptée
- **Complète** les fiches 0058 (commandes), 0060 (vue de base) et 0050 (une note montrée à la place de l'éditeur).

## Contexte

Spécification validée : `doc/specs/crm.md`, §§ 7.3 à 7.6 et 9. Les trois onglets qui disaient « Bientôt » deviennent des listes, la ligne d'une action dans une liste est définie une fois, et une note de type `crm-entreprise` ou `crm-personne` s'ouvre dans sa fiche. La fenêtre d'une action (§ 8) est faite ailleurs : les listes et les fiches ne font que lui demander de s'ouvrir.

## Décision

- **L'écran n'a toujours aucune règle** : les listes affichent ce que `read_crm` rend (ordre alphabétique, actions ouvertes la plus en retard d'abord, compteurs d'ouvertes, de retard et du jour, NODATA). Seuls restent côté interface des choix de présentation, testés dans `state/crm-lists.ts` et `state/crm-fiche.ts` : la recherche sans majuscules ni accents, le texte des compteurs, la ligne d'action (§ 7.6), les 10 dernières actions d'une personne, les anciennes personnes, le parcours.
- **Un contexte prêté par l'écran** : les trois listes (`crm-people.ts`, `crm-companies.ts`, `crm-projects.ts`) et les fiches reçoivent le CRM lu, l'état gardé d'un dessin à l'autre (recherche, nom à créer, nom à changer, palette ouverte) et un petit jeu d'actions (redessiner, geste, confirmation, ouvrir une fiche, ouvrir une action). Les modifications de `crm-view.ts` se limitent à ces branchements ; `CrmBackend` s'enrichit des commandes des listes et des fiches.
- **Ce qui est déplié est gardé sur ce Mac** (`crm-unfolded:<chemin du CRM>`, une liste JSON de clés), jamais dans le fichier ; une clé qui ne désigne plus rien est sans effet.
- **Les fiches s'ouvrent comme une note** : un nom cliqué appelle l'ouverture d'une note (`events.openNote`) sur le chemin de la fiche (`clients/personnes/jean.md`). La colonne reconnaît une fiche à son `type:` et à son dossier (`personnes/` ou `entreprises/` sous le dossier du CRM) et la montre à la place de l'éditeur (`crm-fiche-pane.ts`, classe `fiche-shown`) ; ailleurs, la note reste du texte. Le CRM d'une fiche se tire de son chemin ; l'écran le lit en entier (`read_crm`) et y cherche sa fiche, relue à chaque geste et à chaque changement venu d'ailleurs dans le dossier du CRM.
- **Un seul point de branchement pour la fenêtre d'une action** (`crm-hooks.ts`, `ActionHooks`) : `onOpenAction(reference, crm)` pour un clic sur une ligne d'action, `onNewAction(person, crm)` pour « Nouvelle action » de la fiche d'une personne. Sans fenêtre branchée (`NO_HOOKS`), ils ne font rien. La fenêtre les remplira par `CrmDeps.hooks`.
- **Un champ de fiche** s'édite en cliquant sur sa valeur : Entrée ou quitter le champ enregistre, Échap abandonne ; un nom vidé reprend sa valeur, un autre champ vidé est effacé ; les notes s'enregistrent en quittant le champ. Un e-mail déjà connu d'une autre personne est signalé après l'enregistrement, sans bloquer (§ 4.7).

## Points tranchés là où la spécification ne dit rien

- La ligne d'une action sur les fiches suit le § 7.6 (`date · statut · [projet] · titre`) plutôt que la forme courte du § 9.1 (`date · statut · titre`) ; un projet absent n'est pas dit.
- Les personnes d'une ligne de l'onglet Projets sont dites par leurs noms, puis les entreprises d'alors sans doublon ; une personne sans entreprise est dite « NODATA » ; une fiche disparue est laissée de côté.
- Les actions d'une personne sur sa fiche : les ouvertes puis les terminées, chaque groupe de la plus récente à la plus ancienne (le § 9.2), triées côté interface par date (sans date à la fin, la dernière créée d'abord à date égale) ; Rust rend les ouvertes la plus en retard d'abord.
- Une « ancienne personne » est une personne qui a un passage dans l'entreprise, et n'y est plus ; ses actions sont celles dont l'entreprise d'alors est cette entreprise, 10 au plus, comme les personnes actuelles. La section n'existe pas sans ancienne personne.
- Le tableau des personnes dit « NODATA » dans la colonne entreprise d'une personne sans entreprise.
- Le texte des compteurs : « N personnes », « N ouvertes », « N en retard » (rouge), « N à faire aujourd'hui » (orange).
- Supprimer une entreprise, une personne : un bouton « Supprimer l'entreprise » ou « Supprimer la personne » au pied de la fiche, avec la confirmation du § 5.1 ou 5.2 (la spécification n'en place aucun). Après la suppression, la fiche dit « Cette fiche n'existe plus. ».
- Renommer un projet : un bouton « Renommer » visible (Entrée valide, Échap ou quitter le champ abandonne) ; la couleur : un clic sur la pastille ouvre les 10 couleurs ; supprimer : « Supprimer » avec la confirmation, « Ses N actions passent à « Sans projet » ».
- « Voir les actions de … » remet les autres filtres à zéro : le Kanban est filtré sur ce seul projet.
- Un passage du parcours dans une entreprise dont la fiche n'existe plus est laissé de côté (§ 4.1).
- « Changer d'entreprise » : une liste (NODATA en tête) et un jour (aujourd'hui d'office) ; un jour vidé ne fait rien.

## Conséquences

- La fenêtre d'une action branche `CrmDeps.hooks` (listes, fiches) et son propre clic sur les cartes.
- Les parcours (`ui/e2e/crm-lists.spec.ts`, `crm-fiches.spec.ts`) jouent les listes et les fiches sur un faux Rust (`fake-crm-lists.ts`) ; l'essai de l'application réelle joue le scénario des onglets.
