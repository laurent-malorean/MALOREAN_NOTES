# CRM et Kanban

Spécification fonctionnelle rédigée le 24/11, **à valider par l'utilisateur** : ne pas coder avant sa validation. Ce document se lit seul : tout ce qu'il faut pour réaliser la fonction est ici.

S'il manque un élément, voir le dépôt dont la fonction s'inspire : https://github.com/laurent-malorean/malorean_office.git (spécification : `spec/crm.md` ; code : `web/crm*.js`, `web/kanban*.js`). En cas de désaccord, ce document prime. Les écarts voulus avec ce dépôt sont au § 2 et au § 14.

## 1. Vocabulaire

Les mots ci-dessous valent dans le domaine du CRM. Un même mot peut avoir un autre sens dans un autre domaine de l'application (carte du canvas, action de Claude, colonne d'édition) : chaque domaine garde le sien, et l'ontologie les distingue.

| Mot | Sens |
|---|---|
| Note | Un fichier `.md` de l'espace de travail. |
| CRM | Une note dont l'en-tête porte `type: crm`, montrée en onglets (Kanban, Ma semaine, Personnes, Entreprises, Projets). Un espace de travail en a autant qu'on veut, indépendants : chacun a ses entreprises, ses personnes, ses actions, ses projets et son NODATA. |
| Fiche | Un fichier du CRM qui décrit une entreprise, une personne, une action ou un projet. Chaque fiche est une note d'un type propre (§ 4), indexée à part, avec son CRM comme conteneur. |
| Entreprise | Une organisation que l'on suit. |
| NODATA | L'entreprise des personnes qui n'en ont pas. Ce n'est pas une fiche : c'est l'absence d'entreprise. |
| Personne | Un individu que l'on suit, rattaché à une entreprise à la fois, ou à NODATA. |
| Action | Un échange ou une tâche : ce qu'on a à faire, ou qu'on a fait, avec zéro, une ou plusieurs personnes. |
| Carte | Une action, telle qu'elle se montre dans une colonne du Kanban ou de Ma semaine. Ne se dit que dans le CRM : à ne pas confondre avec la carte du canvas ni avec la carte mentale. |
| Kanban | L'onglet du CRM qui montre ses actions en colonnes, une par statut. Ce n'est pas un type de note. |
| Colonne du Kanban | Un statut du CRM. À ne pas confondre avec la colonne d'édition de la fenêtre. |
| Statut | Ce qui place une action dans une colonne. Trois sont fixes : « TODO » (toujours la première), « Done » et « Cancel » (les deux dernières). Entre « TODO » et « Done », les étapes du CRM. |
| Étape | Une colonne du Kanban entre « TODO » et « Done », propre à un CRM. « Progress » et « WaitingFor » tant que le CRM n'a pas choisi les siennes. |
| Action ouverte | Une action « TODO » ou dans une étape. |
| Action terminée | Une action « Done » ou « Cancel ». |
| Projet | Un regroupement d'actions, propre à un CRM : un nom et une couleur. |
| Couleur d'action | Facultative : l'une des 10 couleurs de la palette (§ 3), sans rapport avec celle de son projet. |
| Étiquette | Un mot court de l'en-tête (`tags`), comme pour toute note. Une action en a plusieurs ; le CRM, une entreprise, une personne et un projet aussi (§ 4.9). |
| Note liée | Une note de l'espace de travail à laquelle une action renvoie. |
| Canal | Comment l'échange a eu lieu : appel, e-mail, rendez-vous, courrier, salon, réseau social, autre. |
| Liste à cocher | Une liste nommée d'éléments à cocher, dans une action. Une action peut en avoir plusieurs. |
| Commentaire | Un texte daté ajouté à une action. |
| Rang | La place choisie à la main d'une carte dans sa colonne. |
| Retard | État d'une action ouverte dont la date est passée (§ 7.1). |
| Parcours | La liste des entreprises où une personne est passée, avec les dates. |
| Ajout rapide | La ligne de saisie en bas d'une colonne du Kanban qui crée une action avec son seul titre. |

## 2. Principes

- Un CRM est une note, ses fiches aussi. Elles ont donc tout ce qu'a une note dans l'application : renommage, déplacement, mise à la corbeille, historique des versions, synchronisation par iCloud.
- **Un fichier par fiche**, en Markdown ordinaire : lisible et modifiable à la main, dans Obsidian ou par Claude. Chaque information n'est écrite qu'à un endroit : les listes affichées (actions d'une personne, personnes d'une entreprise, colonnes du Kanban, compteurs) sont calculées, jamais recopiées.
- **Une seule personne utilise l'application.** Il n'y a donc ni auteur d'une action, ni commentaire signé, ni droits, ni mise à jour en direct entre utilisateurs. Un changement fait ailleurs (Claude, Obsidian, iCloud) se voit aussitôt (§ 10).
- **Simplicité** : pas de pipeline de vente, pas de montant, pas de devis.
- **Ce qui est écarté par rapport au dépôt d'origine** : le sens entrant/sortant d'une action, l'auteur, l'historique des changements de statut, « Ma journée », les pastilles de compteurs au bout des onglets, la page « Voir tout » d'un statut terminé.
- **Ce qui est nouveau** : plusieurs personnes par action, des notes liées à une action.
- Rien de ce que l'utilisateur a écrit dans un fichier n'est perdu quand le CRM enregistre, sauf les exceptions nommées au § 4.8.
- Une fiche rendue illisible ailleurs (statut inconnu, valeur incompréhensible) est laissée de côté par le CRM, jamais effacée.

## 3. Palette des couleurs

La palette est la même pour toute l'application (une seule définition dans le thème) et la même en thème clair et en thème sombre. C'est celle de la carte mentale.

| Nom (dans le fichier et à l'écran) | Valeur |
|---|---|
| rouge | `#dc2626` |
| orange | `#f97316` |
| jaune | `#e3c400` |
| vert | `#22a447` |
| turquoise | `#14b8b0` |
| bleu | `#2563eb` |
| violet | `#9333ea` |
| rose | `#ec6aa8` |
| marron | `#92643a` |
| ardoise | `#64748b` |

Ordre de la palette dans les menus : celui du tableau.

Rendu d'une carte qui a une couleur d'action :
- **Bordure** : la couleur elle-même.
- **Fond** : un mélange de 18 % de la couleur et de 82 % du fond de la carte.
- **Texte** : la couleur du texte du thème, inchangée.

**Couleur d'un projet** : sa pastille et son étiquette sur la carte. **Couleur d'une étiquette** : l'une des 10 couleurs, choisie d'après son nom, la même partout : la somme des codes Unicode de son nom en minuscules, modulo 10, donne le rang dans la palette (0 = rouge).

## 4. Format des fichiers

### 4.1 Rangement

Un CRM est une note ; ses fiches sont rangées dans des dossiers qui portent son nom de fichier, un dossier par sorte de fiche. Un dossier naît avec sa première fiche.

```
clients.md                                      type: crm
clients/projets/refonte-du-site.md              type: crm-projet
clients/entreprises/acme.md                     type: crm-entreprise
clients/personnes/jean-dupont.md                type: crm-personne
clients/actions/2026-11-24-demande-de-devis.md  type: crm-action
```

- Le CRM est le **conteneur** de toutes ses fiches dans l'index : le dossier du même nom fait foi.
- Le nom de fichier d'une entreprise, d'une personne ou d'un projet est son nom en kebab-case, suivi de `-2`, `-3`… s'il est pris. Celui d'une action est la date de sa création et son titre en kebab-case, suivis d'un numéro si le nom est pris.
- **Renommer une fiche change son titre, jamais son nom de fichier** : les autres fiches la désignent par ce nom.
- Une fiche désigne une autre fiche par `[[nom-de-fichier]]`, sans dossier ni extension.
- Une référence à une fiche qui n'existe plus est ignorée à l'affichage, puis retirée au prochain enregistrement de la fiche qui la porte.

### 4.2 Le CRM

```markdown
---
type: crm
etapes: [Progress, WaitingFor]
---
# Clients
```

- `type: crm` dit que la note est un CRM. Seule compte la première propriété `type:` au premier niveau de l'en-tête.
- `etapes` est la liste ordonnée des étapes. Absente : « Progress » puis « WaitingFor ». Une liste vide : aucune étape (le Kanban a trois colonnes). Elle se change dans le CRM (§ 5.5).
- Le titre est le premier titre `#`, comme toute note. Le CRM ne modifie jamais le texte sous le titre ; il ne l'affiche pas.

### 4.3 Une entreprise

```markdown
---
type: crm-entreprise
site: https://acme.fr
secteur: Industrie
adresse: 12 rue des Lilas, Lyon
telephone: 01 23 45 67 89
---
# Acme

Notes libres sur l'entreprise, en Markdown.
```

- Seul le titre est obligatoire ; les autres propriétés sont facultatives.
- Le texte sous le titre est les notes libres de l'entreprise : tout le Markdown, liens entre notes compris.

### 4.4 Une personne

```markdown
---
type: crm-personne
fonction: Responsable maintenance
entreprise: '[[acme]]'
parcours: ['[[globex]] · 2024-01-10 → 2026-03-01', '[[acme]] · 2026-03-01 →']
email: jean.dupont@acme.fr
telephone: 06 12 34 56 78
linkedin: https://www.linkedin.com/in/jean-dupont
---
# Jean Dupont

Notes libres sur la personne.
```

- Le titre est le nom entier (prénom et nom), obligatoire.
- Une personne sans entreprise n'a pas de propriété `entreprise` : elle est dans NODATA.
- `parcours` : une ligne par passage, `[[entreprise]] · début → fin` (jour au format `2026-03-01`), la fin vide pour le passage en cours.
- L'entreprise et le parcours se changent dans le CRM (« Changer d'entreprise »), pas à la main.

### 4.5 Une action

```markdown
---
type: crm-action
personnes: ['[[jean-dupont]] · [[acme]]', '[[marie-durand]]']
statut: Progress
date: '2026-11-24'
canal: e-mail
projet: '[[refonte-du-site]]'
couleur: violet
tags: [urgent, salon]
notes: ['[[Cahier des charges]]']
rang: 2
---
# Demande de devis

Pour 3 postes. Voir le [[plan de la salle]].

#### Liste à cocher : Préparation
- [x] Relire la demande
- [ ] Chiffrer

#### Commentaires
- 2026-11-24 10:32 · Rappelé, pas de réponse.
  Retenter jeudi.
```

- **Titre** : une ligne, obligatoire.
- **`personnes`** : zéro, une ou plusieurs personnes, sans doublon. Chaque entrée est `[[personne]]`, suivie de ` · [[entreprise]]` : l'entreprise de la personne **au moment** où elle a été donnée à l'action. Sans ` · …`, la personne était dans NODATA. Propriété absente : aucune personne. Une action passée reste ainsi attachée à l'ancienne entreprise quand la personne en change.
- **`statut`** : le nom de la colonne (§ 5.5). Absent ou inconnu : voir § 5.5.
- **`date`** : au format `2026-11-24`. Pour une action ouverte, le jour où elle est à faire ; pour une action terminée, celui où elle a été faite.
- **`canal`** : l'un des sept canaux ; absent ou autre valeur : aucun.
- **`projet`** : `[[projet]]`, un seul ; absent : « Sans projet ».
- **`couleur`** : un nom de la palette ; absent ou autre nom : sans couleur (le nom inconnu disparaît au prochain enregistrement).
- **`tags`** : les étiquettes, comme pour toute note (mêmes règles de lecture et de nettoyage : sans doublon, la casse ne compte pas).
- **`notes`** : les notes liées, `[[titre de la note]]`, comme un lien entre notes.
- **`rang`** : un entier ≥ 1 ; absent : pas de place choisie.
- **Description** : le texte sous le titre, hors listes à cocher et commentaires. Elle accepte tout le Markdown, liens entre notes compris.
- **Liste à cocher** : une ligne `#### Liste à cocher : nom`, puis une ligne `- [ ]` ou `- [x]` par élément.
- **Commentaires** : une ligne `#### Commentaires`, puis `- AAAA-MM-JJ HH:MM · texte` par commentaire (heure du Mac) ; les lignes suivantes d'un commentaire sont en retrait de deux espaces.
- La description, les listes à cocher et les commentaires peuvent se suivre **dans n'importe quel ordre** : une partie va de son titre `####` jusqu'au titre `####` d'une autre partie, ou jusqu'à la fin. Le CRM les écrit dans l'ordre : description, listes à cocher, commentaires.
- Une ligne d'une partie qui n'a pas sa place (texte dans une liste à cocher, ligne d'un commentaire qui ne commence pas par `- date · ` et n'est pas en retrait) est gardée dans la description, à sa fin.

### 4.6 Un projet

```markdown
---
type: crm-projet
couleur: bleu
---
# Refonte du site
```

- `tags` : facultatif, comme pour toute fiche (§ 4.9).
- Le texte sous le titre est gardé tel quel, jamais montré.
- Une couleur absente ou inconnue se lit comme la première couleur de la palette, sans modifier le fichier ; une couleur n'est écrite que si l'utilisateur en choisit une.

### 4.7 Noms et unicité

- Dans un CRM, deux entreprises, deux personnes ou deux projets ne portent pas le même nom : deux noms sont les mêmes quand ils sont égaux sans majuscules, sans accents et sans ponctuation. Le nom est refusé avec un message.
- Un **e-mail déjà connu** d'une autre personne du CRM est signalé à la saisie (risque de doublon), sans bloquer.
- Plusieurs actions peuvent porter le même titre.

### 4.8 Ce que le CRM change en enregistrant

- **Un geste ne change que le champ touché**, dans la version la plus récente du fichier : les autres propriétés, le texte inconnu et les propriétés libres (`aliases`, épinglage…) restent identiques octet pour octet.
- Pour une action, le CRM réécrit seulement la partie touchée (description, une liste à cocher, les commentaires) ; l'ordre des parties est remis dans l'ordre du § 4.5 au premier enregistrement.
- Le fichier finit par un seul retour à la ligne.
- Une action dont `rang` n'a plus de sens (statut changé, § 7.1) perd cette propriété.

### 4.9 Étiquettes

- Le CRM, une entreprise, une personne, une action et un projet peuvent porter `tags` dans leur en-tête, comme toute note (mêmes règles de lecture et de nettoyage : sans doublon, la casse ne compte pas) ; la propriété est facultative et n'est écrite que s'il y a au moins une étiquette.
- On les change dans le **champ d'étiquettes** de l'application (pastilles avec « × », champ « Ajouter une étiquette » et « + », suggestions des étiquettes de l'espace de travail) : § 8 pour une action, § 9 pour une entreprise et une personne.
- Changer les étiquettes ne change que la propriété `tags` : les autres propriétés, le texte et les propriétés libres restent identiques octet pour octet (§ 4.8).
- Les étiquettes d'une entreprise, d'une personne et d'un projet servent au filtre par étiquette de l'application ; le filtre du Kanban (§ 7.1) ne porte que sur celles des actions.

## 5. Règles des fiches

### 5.1 Entreprise et NODATA

- NODATA existe toujours dans un CRM, ne se renomme pas et ne se supprime pas ; l'onglet Entreprises la montre en premier, avec ses personnes.
- On crée, modifie (champs modifiables en cliquant dessus) et supprime une entreprise.
- **Supprimer une entreprise** : une confirmation dit que ses personnes passent à NODATA. L'entreprise va à la corbeille ; chacune de ses personnes passe à NODATA (son parcours garde l'ancienne entreprise, fermée ce jour-là) ; les actions gardent l'entreprise du moment. Restaurer l'entreprise ne rattache pas ses anciennes personnes.

### 5.2 Personne

- Une personne appartient à une entreprise à la fois. Créée depuis la fiche d'une entreprise, elle y entre le jour même et le parcours le dit ; créée ailleurs, elle est dans NODATA.
- **« Changer d'entreprise »** : on choisit la nouvelle entreprise (ou NODATA) et le jour du changement. L'ancien passage est fermé à ce jour dans le parcours.
- **Supprimer une personne** : confirmation, puis la fiche va à la corbeille et la personne est retirée de la liste des personnes de chacune de ses actions. Les actions restent. Restaurer la personne ne la remet pas dans ses actions.

### 5.3 Action

- Elle a **zéro, une ou plusieurs personnes**. Sans personne, elle n'apparaît sur la fiche d'aucune personne, seulement dans le Kanban, Ma semaine, les projets, la recherche et la fiche des notes liées.
- On **donne** ou on **retire** une personne depuis la fenêtre de l'action. La personne donnée entre avec son entreprise de ce moment (NODATA si elle n'en a pas).
- **Entreprises d'une action** : celles de ses personnes au moment où elles ont été données. Une action sans personne est dans NODATA.
- Statut à la création : celui de la colonne où on l'ajoute, « TODO » sinon.
- Date à la création : aujourd'hui, modifiable.
- On modifie et supprime toute action ; la suppression demande confirmation et envoie l'action à la corbeille, avec ses pièces jointes (restaurable comme une note).

### 5.4 Projet

- Un regroupement d'actions, propre à un CRM, sans limite de nombre. Une action a un projet, ou aucun (« Sans projet »).
- À la création, la couleur est la **moins utilisée** du CRM (la première de la palette en cas d'égalité) ; plusieurs projets peuvent porter la même.
- On crée, renomme, change la couleur et supprime un projet, dans l'onglet Projets. Renommer ne change rien pour ses actions.
- **Supprimer un projet** : confirmation, ses actions passent à « Sans projet » (jamais supprimées), puis il va à la corbeille ; le restaurer ne lui rend pas ses actions.

### 5.5 Statuts et étapes

- Statuts fixes : « TODO » (première colonne), « Done » et « Cancel » (dernières). Entre eux, les étapes du CRM dans leur ordre.
- On passe librement d'un statut à n'importe quel autre. « Cancel » n'exige pas de motif (la description sert si besoin).
- **Une action dont le statut n'est pas une colonne du CRM** (fichier écrit à la main, étape retirée entre-temps) reste visible, rangée dans la colonne « TODO », sans que son fichier change.
- Le statut se lit sans compter majuscules ni accents ; il s'écrit comme la colonne.
- **Changer les étapes** : « + Ajouter une étape » (avant « Done »), renommer, retirer, réordonner (§ 7.1). Une étape :
  - ne porte ni le nom d'une colonne fixe, ni celui d'une autre étape (sans compter majuscules ni accents) ;
  - tient sur une ligne et fait 40 caractères au plus ;
  - renommée, garde ses actions et leur rang ; retirée, renvoie ses actions en « TODO » (leur rang s'efface) ; un nom déjà pris par une autre étape se change en deux fois.
- Le changement touche plusieurs fichiers : tous ensemble, ou aucun. Interrompu en route, il est terminé au lancement suivant.

## 6. Créer un CRM

**Par le clic droit**, sur un dossier ou sur la racine dans la liste des dossiers : « Nouveau CRM », dans le menu des types, après « Nouveau cahier de recherche » et « Nouvelle carte mentale ». Le CRM est créé dans le dossier cliqué.

**Par la palette et le menu Fichier** : « Nouveau CRM ». Il est créé dans le dossier affiché.

**Ce qui est créé** :
- La commande demande le nom ; un nom vide est refusé, Échap annule.
- Le fichier contient l'en-tête `type: crm` et la ligne `# Nom donné`, sans étapes écrites.
- Son nom de fichier suit les règles de toute note.
- Le CRM s'ouvre dans la colonne active, sur l'onglet Kanban.

## 7. La vue du CRM

Cinq onglets, dans cet ordre : **Kanban** (ouvert d'office), **Ma semaine**, **Personnes**, **Entreprises**, **Projets**. L'onglet choisi et ce qui est déplié sont gardés sur ce Mac pour chaque CRM, jamais dans le fichier.

Un CRM sans fiche affiche, au centre, en couleur atténuée : « Ajoutez une première action. »

### 7.1 Kanban

- **Colonnes** : « TODO », les étapes, « Done », « Cancel ». Chaque en-tête montre le nom, le nombre de cartes de la colonne, puis, en rouge, le nombre de cartes en retard s'il y en a.
- **Largeur d'une colonne** : 272 points ; quand la fenêtre a de la place, les colonnes s'élargissent pour la remplir, jusqu'à deux fois cette largeur (544 points). Trop de colonnes pour tenir : elles restent à 272 points et l'écran défile.
- **Ordre dans une colonne ouverte** : les cartes **classées** (qui ont un rang) d'abord, dans l'ordre de leur rang, puis les autres par date, la plus ancienne d'abord. Une colonne terminée (« Done », « Cancel ») : de la plus récente à la plus ancienne ; elle montre les **10 plus récentes** et, au pied, « Afficher 10 de plus (N restantes) ».
- **Une carte montre**, de haut en bas :
  - la date, ou la pastille de retard ou du jour (voir plus bas) à sa place ;
  - son projet, en étiquette à la couleur du projet (rien sans projet) ;
  - son titre ;
  - ses personnes : « Nom (entreprise) », une par ligne, les deux premières puis « +N » ; une ligne vide sans personne, pour que les cartes gardent la même hauteur ;
  - ses étiquettes, chacune à sa couleur ;
  - des repères : « ≡ » (une description), « 1/2 » (éléments cochés sur le total de ses listes à cocher, rien sans élément), le nombre de commentaires, « ⧉ N » (le nombre de notes liées).
- **Couleur** : une carte qui a une couleur d'action prend le rendu du § 3.
- **Retard** : une action ouverte est en retard **à partir du jour qui suit sa date** (le jour du Mac). Sa carte porte une pastille rouge « En retard de N jours » (« de 1 jour » le lendemain) à la place de la date et, sans couleur d'action, un fond de 8 % de rouge sur 92 % du fond de la carte. Une action terminée n'est jamais en retard.
- **À faire aujourd'hui** : une action ouverte datée d'aujourd'hui porte une pastille orange « À faire aujourd'hui » et, sans couleur d'action, un fond de 8 % d'orange.
- **Un clic sur une carte** ouvre la fenêtre de l'action (§ 8).
- **Glisser une carte** dans une autre colonne change son statut ; elle prend la place où elle est lâchée.
- **Ordre à la main** : lâcher une carte entre deux autres d'une colonne ouverte la place là ; hors des cartes, tout en bas. L'ordre est écrit dans le `rang` de chaque carte de la colonne. Changer le statut d'une action (fenêtre, glisser, Claude) efface son rang. Pendant un **filtre**, la carte lâchée change de colonne mais n'est pas placée : des cartes cachées rendraient la place fausse. Une colonne terminée ne se range pas à la main.
- **Étapes, depuis le Kanban** :
  - « + Ajouter une étape » (avant « Done ») ouvre un champ « Nom de l'étape » : Entrée la crée, Échap annule ;
  - cliquer le nom d'une étape le modifie (ses actions la suivent) ;
  - « × » la retire (une confirmation dit que ses actions repartent en « TODO » s'il y en a) ;
  - glisser son en-tête la déplace.
  « TODO », « Done » et « Cancel » n'ont ni « × », ni renommage, ni glissement. Un nom refusé (§ 5.5) s'affiche en message d'erreur.
- **Ajout rapide** : « + Ajouter une action » au pied de chaque colonne ouverte ouvre une ligne : un champ « Titre de l'action », une liste « Personne » (chaque personne avec son entreprise : « Marie Durand · Acme » ; « — Sans personne — » en tête, choisi d'office la première fois, puis la dernière choisie) et « Plus de détails ».
  - **Entrée** crée l'action (aujourd'hui, statut de la colonne, le projet filtré s'il n'y en a qu'un) et la ligne reste ouverte pour la suivante ; **Échap** la ferme ; un titre vide ne crée rien ; un titre en cours de saisie est gardé quand l'écran se redessine.
  - « Plus de détails » ouvre la fenêtre de l'action avec le titre et la personne déjà remplis.
  - Sans aucune personne dans le CRM, le bouton ouvre directement la fenêtre.
- **Recherche et filtres** (rangée au-dessus des colonnes) :
  - une **recherche d'action** : le mot est cherché dans le titre, la description et les commentaires, sans compter majuscules ni accents ;
  - deux listes, « Toutes les personnes » et « Toutes les entreprises » (NODATA comprise) : une action reste visible si **au moins une** de ses personnes, ou de ses entreprises, correspond ;
  - un bouton arrondi par **projet**, à sa couleur, après « Tous les projets » (actif d'office) : cliquer des projets les cumule, et une action sans projet est alors masquée ; la rangée n'apparaît pas sans projet ;
  - un bouton par **étiquette** du CRM (sans doublon, ordre alphabétique) : cliquer des étiquettes les cumule, une action reste visible si elle porte au moins une des étiquettes cochées ; la rangée n'apparaît pas sans étiquette.
  - Tout s'ajoute : une action n'est montrée que si elle répond à tous les filtres. Les filtres valent aussi pour Ma semaine, ne changent pas les autres onglets ni les nombres des en-têtes, et ne sont pas gardés d'une ouverture à l'autre.

### 7.2 Ma semaine

- Les actions **ouvertes** du CRM, rangées par jour. **Huit colonnes** : « En retard » à gauche (les actions ouvertes datées d'avant le lundi affiché, la plus ancienne d'abord), puis lundi à dimanche, les sept toujours visibles même vides, aujourd'hui mis en évidence. Les cartes sont celles du Kanban ; un clic ouvre la fenêtre de l'action.
- Des flèches « ‹ » et « › » : semaine précédente et suivante ; « Aujourd'hui » revient à la semaine en cours. Le titre dit les dates (« Semaine du 23 nov. au 29 nov. »). La semaine commence le lundi.
- **Glisser une carte** sur un jour change sa **date** ; elle est reçue n'importe où sur la colonne du jour (en-tête, bas, jour vide) ; on ne dépose pas dans « En retard ».
- « + Ajouter une action » au pied de chaque jour : la fenêtre s'ouvre avec la date de ce jour et le statut « TODO ».

### 7.3 Personnes

- Une recherche par nom, « Nouvelle personne », puis le tableau : nom (un clic ouvre sa fiche), fonction, entreprise, nombre d'actions ouvertes.
- Une personne **se déplie** sur ses actions, les ouvertes d'abord ; un clic sur une action ouvre la fenêtre de l'action.

### 7.4 Entreprises

- Une recherche (nom, sans compter majuscules ni accents), « Nouvelle entreprise », puis NODATA (masquée pendant une recherche), puis les entreprises : nom (un clic ouvre sa fiche), nombre de personnes, nombre d'actions ouvertes de ses personnes (une action à plusieurs personnes de la même entreprise ne compte qu'une fois).
- **Arbre** : chaque entreprise (NODATA comprise) se déplie sur ses personnes, chaque personne sur ses actions ouvertes, la plus en retard d'abord. Entreprise et personne, même repliées, montrent en rouge le nombre d'actions en retard et en orange le nombre d'actions à faire aujourd'hui, quand il y en a.

### 7.5 Projets

- « Nouveau projet » (le nom ; la couleur est celle du § 5.4, modifiable), puis la liste : pastille de couleur, nom, nombre d'actions ouvertes et en retard.
- Un projet se déplie sur ses actions ouvertes, la plus en retard d'abord. Un clic sur ses compteurs (« Voir les actions de … ») ouvre le Kanban filtré sur lui seul.
- On y renomme, change la couleur (les couleurs déjà prises sont grisées, mais choisissables) et supprime un projet.
- **Sous la ligne de chaque projet** (plié ou déplié), le **champ d'étiquettes** de l'application (§ 4.9) : ses étiquettes en pastilles avec « × », un champ « Ajouter une étiquette » avec « + ». Il propose les étiquettes des actions du CRM et celles des autres projets, sans celles du projet. Un geste ne change que `tags` dans la fiche du projet ; le texte tapé et non validé est gardé quand l'écran se redessine.

### 7.6 Une action dans une liste

Une ligne d'action dit, avant son titre, ce que l'écran ne dit pas déjà : `date · statut · [personnes · entreprises] · [projet] · titre`. Le projet est dans sa couleur. Une action sans personne ou sans projet n'en dit rien.
- **Onglet Projets** : personnes et entreprises, pas le projet (c'est le projet déplié).
- **Onglets Personnes et Entreprises, fiches d'une personne et d'une entreprise** : le projet, pas les personnes.
- **Colonne du Kanban** : tout.

## 8. La fenêtre d'une action

Un panneau à droite de la fenêtre, sur toute sa hauteur, de 600 points de large au plus, qui défile quand il est long. Un clic à côté, ou Échap, le ferme.

**Mise en page** : une grille de 4 points (décision 0084) : 24 points entre deux blocs et de marge, 12 entre un titre de bloc et son contenu, des contrôles et des boutons de 36 points de haut, des cibles de clic de 32 au moins, un texte de 15 points sur 1,5 d'interligne ; la même échelle pour les fiches, les listes, le Kanban et la fenêtre de confirmation.

**De haut en bas** (chaque partie est un bloc à part, séparé du suivant par un grand espace, avec son titre quand elle en a un) :
1. **Titre** : une ligne.
2. **Statut**, **date** et **canal**, côte à côte. La date se choisit avec le **sélecteur de date** de l'application (le même partout où l'on donne une date, § 9.2 comprise) : on écrit « JJ/MM/AAAA » ou on ouvre le calendrier par son bouton, un clic ou la saisie ; le calendrier est grand, en français (mois en lettres avec flèches, semaine commençant le lundi), repère aujourd'hui, marque le jour choisi, propose « Aujourd'hui » (et « Effacer » quand la date peut être vide) ; Échap ou un clic à côté le ferme ; au clavier, flèches pour changer de jour ou de semaine, PageHaut et PageBas pour le mois, Entrée pour valider. Une date fausse reprend la valeur d'avant.
3. **Personnes** : les personnes de l'action, chacune « Nom · Entreprise » avec « × » pour la retirer ; un lien vers sa fiche ; au bout, une liste « + Ajouter une personne » (chaque personne avec son entreprise, celles déjà présentes écartées). Un lien « Copier les e-mails » copie dans le presse-papiers les e-mails des personnes qui en ont, séparés par « , », et le dit (« E-mails copiés. ») ; il n'apparaît que si l'une d'elles a un e-mail.
4. **Projet** : une liste, « Sans projet » en tête.
5. **Couleur** : une pastille par couleur de la palette et « Sans couleur ».
6. **Description** : Markdown, en saisie de texte.
7. **Checklists**, juste sous la description, en bloc à part avec son titre : plusieurs, chacune avec son nom, une **barre de progression** verte et son avancement en pourcentage (« 75 % »), ses éléments à cocher (un élément coché est barré et atténué) ; « Ajouter un élément » et « Ajouter une checklist » sont des boutons (icône « + ») qui ouvrent un champ (Entrée ajoute et laisse le champ ouvert pour le suivant, Échap ou « Annuler » le ferme) ; renommage, suppression, coche. **Supprimer une checklist demande confirmation** (« Supprimer la checklist « Historique » et 4 éléments ? », bouton rouge « Supprimer », « Annuler ») ; une checklist qui a changé de place pendant la question n'est pas supprimée.
8. **Étiquettes** : le champ d'étiquettes de l'application : les étiquettes en pastilles à leur couleur avec « × » pour retirer, un champ « Ajouter une étiquette » (Entrée pour la suivante) et un « + » qui ajoute le texte tapé ; il propose celles du CRM que l'action n'a pas.
9. **Notes liées** : les notes liées, chacune cliquable (un clic l'ouvre dans la colonne active) avec « × » pour la délier ; « Lier une note » (bouton « + ») ouvre la recherche de notes de l'application. Un lien vers une note absente est montré comme dans une note.
10. **Commentaires** : le plus récent d'abord ; on ajoute, modifie et supprime un commentaire. Une adresse internet écrite dans un commentaire (seule, entre `<` `>` ou en `[texte](adresse)`) s'affiche en lien cliquable, ouvert dans le navigateur. Pas de commentaires sur une action en cours de création.
11. **Supprimer** (action existante).

**Enregistrement** :
- Pour une action **existante**, à chaque geste : le statut, la date, le canal, les personnes, le projet, la couleur et les notes liées dès qu'on les change ; le titre à Entrée ou en quittant le champ ; la description en quittant le champ ; les étiquettes, les checklists et les commentaires à chaque geste ; ce qu'on ajoute (élément, checklist, étiquette) apparaît aussitôt, même si le curseur est resté dans le champ d'ajout. La fenêtre reste ouverte, le Kanban derrière se met à jour. Pas de bouton « Enregistrer ». Un titre ou une date vidés reprennent leur valeur. Fermer la fenêtre enregistre ce qui ne l'est pas encore.
- Une **nouvelle** action garde un bouton « Enregistrer » (Entrée dans le titre aussi), qui la crée.
- Changer le **statut** efface le rang.

## 9. Fiches entreprise et personne

Une fiche d'entreprise ou de personne s'ouvre dans un onglet d'une colonne d'édition, comme une note, à la place de l'éditeur de texte.

Comme tout contenu, elle a, sous les onglets de sa colonne, le **champ d'étiquettes** de l'application (§ 4.9) : ses étiquettes en pastilles avec « × », un champ « Ajouter une étiquette » avec « + » et les suggestions de l'espace de travail. Il en va de même du CRM lui-même.

### 9.1 Fiche entreprise

- Les champs (nom, site, secteur, adresse, téléphone), modifiables en cliquant dessus, et les notes libres.
- La liste des **personnes** de l'entreprise, par ordre alphabétique ; pour chacune, ses **10 dernières actions**, de la plus récente à la plus ancienne (`date · statut · titre`), et un lien « Toutes les actions » vers sa fiche.
- Une section repliée **« Anciennes personnes »** : les personnes passées par l'entreprise, avec leurs actions faites pendant ce temps.
- « Nouvelle personne » (déjà rattachée à l'entreprise).

### 9.2 Fiche personne

- Les champs (nom, fonction, e-mail, téléphone, LinkedIn), l'entreprise (un lien vers sa fiche), les notes libres et le parcours.
- **Toutes ses actions** : d'abord les ouvertes, puis les terminées, chaque groupe de la plus récente à la plus ancienne. Un clic ouvre la fenêtre de l'action.
- « Nouvelle action » (la personne est déjà donnée) et « Changer d'entreprise ».

## 10. Enregistrer et changements venus d'ailleurs

- **Une intention, un enregistrement** : un geste qui change plusieurs fichiers les enregistre tous ensemble ; interrompu (coupure, arrêt), il est terminé au lancement suivant ; jamais une moitié de geste. Pour les gestes ordinaires, un seul fichier change :
  - créer, modifier, changer le statut ou supprimer une action : l'action ;
  - créer, modifier une personne ; changer d'entreprise : la personne ;
  - créer, modifier, renommer une entreprise : l'entreprise ;
  - supprimer une entreprise, une personne, un projet : la fiche et chaque fiche qui la désigne ;
  - changer les étapes : le CRM et les actions des étapes touchées.
  Une première fiche crée aussi son dossier.
- **Historique des versions** : celui de toute note.
- **Changement venu d'ailleurs** (Claude, Obsidian, iCloud, le même CRM dans une autre colonne) : le CRM ouvert se met à jour aussitôt ; la fenêtre d'une action aussi, sauf pendant la saisie d'un titre, d'une description, d'un nom ou d'un commentaire (la mise à jour attend la fin de la saisie) ; un champ d'ajout (élément, checklist, étiquette) garde son texte à part et ne retient jamais la mise à jour.
- **Conflit** : un geste ne change que son champ, sur la version la plus récente du fichier (§ 4.8). Si la fiche touchée n'existe plus, le geste est abandonné et le message « Cette fiche n'existe plus. » s'affiche ; la fenêtre d'une action supprimée se ferme.
- **Erreur d'écriture** : un message le dit, le geste est retenté à l'enregistrement suivant.
- **Type retiré** : si le fichier n'a plus son `type:`, l'onglet le montre comme une note ordinaire.

## 11. Corbeille

Une fiche supprimée part à la corbeille et se restaure comme une note (avec ses pièces jointes pour une action). Ce que la suppression change aux autres fiches : § 5.1 (entreprise), § 5.2 (personne), § 5.4 (projet), § 5.3 (action : rien).

## 12. Recherche et liens

**Chaque fiche est un résultat à elle seule**, rangée dans l'index avec son CRM comme conteneur. Le résultat montre son titre, le dossier du CRM, son type (« Entreprise », « Personne », « Action », « Projet ») avec « · titre du CRM », discret, et un extrait.
- **Ce qui trouve une fiche** : entreprise : nom, site, secteur, adresse, notes libres ; personne : nom, fonction, e-mail, notes libres ; action : titre, description, étiquettes, texte des listes à cocher, commentaires ; projet : nom.
- **Un clic** ouvre une entreprise ou une personne dans sa fiche ; une action dans le CRM, onglet Kanban, avec sa fenêtre ouverte ; un projet dans l'onglet Projets, déplié.
- **Le CRM lui-même** est un résultat, de type « CRM » : son titre et ses étiquettes le trouvent.
- **Recherche par le sens** : chaque fiche donne un segment (titre, puis texte), qui garde le titre du CRM ; un résultat s'ouvre comme ci-dessus.
- **Liens entrants** : une note montre, dans ses liens entrants, les actions qui la listent en notes liées ou qui la citent dans leur description ou un commentaire (« Action · titre » ; un clic ouvre l'action dans son CRM). Le CRM et ses fiches se retrouvent par `[[titre]]` comme toute note.
- **Étiquettes** : celles de l'en-tête d'une action valent pour elle ; le filtre par étiquette de l'application la montre.

## 13. Claude

- **Outil « créer un CRM »** : il prend le dossier (la racine par défaut) et le titre, crée le fichier selon les règles de nom et rend son chemin. Comme les autres outils qui changent une note, il attend l'accord de l'utilisateur quand Claude a lu le web pendant la réponse.
- **Lire et modifier** : Claude (et toute IA branchée) lit un CRM avec `read_crm` (colonnes du Kanban, personnes, entreprises, projets, étapes, avec les filtres de l'écran) et le change avec quatorze outils, un par objet : créer, changer et supprimer une action, une personne, une entreprise ou un projet, déplacer une action dans une colonne, changer les étapes ; le changement d'une fiche prend une `operation` qui nomme le geste de l'écran (statut et place d'une carte, commentaires, listes à cocher, changement d'entreprise…). Mêmes règles et mêmes messages que l'écran ; une suppression va à la corbeille ; un CRM ouvert se met à jour en direct. Décision 0081.
- **Consigne donnée à Claude** sur les CRM, dans la présentation des outils : un CRM se lit et se change avec ses outils, jamais en écrivant ses fiches ; une fiche se désigne par sa référence ; pour changer le statut d'une action, donner le nom d'une colonne du CRM ; ne rien supprimer sans qu'on le demande ; ajouter un commentaire plutôt que réécrire la description pour un compte rendu. Le rang d'une carte n'est jamais écrit à la main.
- **Recherche dans l'index** : elle rend aussi les fiches, avec leur chemin et celui de leur CRM.

## 14. Hors de cette version

- Opportunités, devis, montants, étapes de vente.
- Import ou export (CSV, autre outil) : l'éventuelle reprise des données d'un autre outil se fait une fois, par Claude, hors de l'application.
- Synchronisation avec une messagerie ou un agenda.
- Sens entrant/sortant d'une action, auteur, historique des changements de statut ou de date.
- « Ma journée », pastilles de compteurs au bout des onglets, page « Voir tout » d'un statut terminé.
- Plusieurs utilisateurs, droits, mise à jour en direct entre utilisateurs.
- Voir une fiche en texte dans l'éditeur (elle reste modifiable dans Obsidian ou par Claude).
- Fonction dédiée aux données personnelles (RGPD) : une demande d'effacement se traite par la suppression habituelle.
