# Application multilingue

Spécification fonctionnelle rédigée le 28/11, **à valider par l'utilisateur**. Ce document se lit seul. Décisions d'architecture : `doc/decisions/0110-catalogue-de-textes.md`.

## 1. Idée

L'application parle aujourd'hui français, partout, et uniquement français. Elle devient multilingue en trois temps :

1. **Français, à l'identique** : tout texte que voit l'utilisateur sort d'un catalogue de textes au lieu d'être écrit dans le code. L'utilisateur ne voit aucune différence.
2. **Anglais** : un réglage « Langue » apparaît, avec l'anglais.
3. **Portugais du Brésil**.

Ajouter une langue ensuite ne demande aucun changement de code : un dossier de textes en plus.

## 2. Vocabulaire

- **Langue de l'interface** : la langue dans laquelle l'application parle à l'utilisateur.
- **Catalogue de textes** : l'ensemble des textes de l'application, rangés par langue puis par module.
- **Clé de texte** : le nom court d'un texte dans le catalogue (par exemple `reglages-titre`), identique dans toutes les langues.
- **Langue automatique** : la langue de l'interface suit celle du Mac.
- **Résumé d'un outil** : la phrase courte, dans la langue de l'interface, qui dit à l'utilisateur à quoi sert un outil offert aux IA (§ 7).

Ces mots entrent dans `doc/ontology.md` avant le code.

## 3. Décisions déjà prises

- Langues, dans cet ordre : français (`fr`), anglais (`en`), portugais du Brésil (`pt-BR`).
- Le catalogue est le même pour tout le produit : un seul format, un seul dossier, les mêmes clés pour Rust et pour l'interface.
- Les textes sont découpés par module, comme l'interface (réglages, cahier de recherche, carte mentale, CRM, agenda, recherche, menus, erreurs, etc.), plus un fichier de mots communs (Annuler, Enregistrer, Fermer).
- Étape 1 « à l'identique » : les tests existants, qui vérifient des textes français, passent sans être modifiés. C'est la preuve que rien n'a changé.

## 4. Ce que l'utilisateur voit

### 4.1 Le réglage « Langue »

- Dans les Réglages. Quatre choix, chacun écrit **dans sa propre langue** pour qu'on le reconnaisse sans comprendre la langue actuelle : « Automatique », « Français », « English », « Português (Brasil) ». Au début de l'étape 2, « Português » n'y est pas encore.
- Par défaut : **Automatique**. L'application prend la première des langues préférées du Mac qu'elle sait parler ; sinon l'anglais.
- Changer de langue enregistre d'abord ce qui est tapé, puis **recharge la fenêtre** dans la nouvelle langue. L'espace de travail, les onglets et les colonnes sont retrouvés.
- Le choix est gardé d'un lancement à l'autre, pour toute l'application (pas par espace de travail).
- À l'étape 1, le réglage n'existe pas : une seule langue.

### 4.2 Ce qui est traduit

- Tous les libellés : boutons, menus et barre des menus, palette de commandes, info-bulles, textes pour les lecteurs d'écran, titres et textes d'aide des réglages, boîtes de dialogue, notifications.
- Les messages d'erreur : un message d'erreur est écrit dans la langue de l'interface, avec les mêmes valeurs (nom de note, nombre) que dans la version française.
- Les noms par défaut que l'application donne à ce qu'elle crée : « Sans titre » devient « Untitled » ou « Sem título ». Le nom est choisi **à la création** ; ensuite le fichier ne change plus de nom ni de contenu si la langue change.
- Les dates et les nombres : jours, mois, séparateurs, ordre (« 28 nov. 2026 », « Nov 28, 2026 », « 28 de nov. de 2026 »), suivant la langue.
- Les noms de pays de l'agenda 12 : dans la langue de l'interface.
- Les pluriels : « 1 note », « 2 notes » ; chaque langue applique ses propres règles.

### 4.3 Ce qui n'est jamais traduit

- Ce que l'utilisateur écrit : notes, titres, étiquettes, noms de dossiers, contenu des fiches.
- Le format des fichiers (`doc/format/`) : en-têtes, clés, ordre, marques. Un fichier écrit en anglais et le même écrit en français sont identiques octet pour octet, hormis le texte que l'utilisateur y a mis.
- Les noms des outils MCP et leurs descriptions pour les IA (§ 7) : en anglais, partout.
- Les journaux de l'application et la documentation du projet (`doc/`).

### 4.4 Reconnaître une note sans titre

L'application reconnaît une note « neuve » à son nom (`sans-titre`, `sans-titre-2`…). Elle doit reconnaître les noms de **toutes** les langues (`untitled`, `sem-titulo`), pour qu'une note créée en anglais reste « sans titre » après un passage en français, et inversement.

## 5. Quand un texte manque

- Dans une langue, une clé absente affiche le texte **français** (la langue de référence) : jamais une clé nue ni un blanc.
- Cette situation ne doit pas arriver en livraison : la CI refuse une langue incomplète (§ 8).

## 6. Rechargement et état

- Le rechargement de la fenêtre ne perd rien : ce qui est tapé est enregistré avant, la disposition (colonnes, onglets, dossiers pliés) est celle déjà gardée par l'interface.
- Une saisie vocale ou un téléchargement de modèle en cours : le changement de langue est refusé avec un message tant qu'ils durent.

## 7. Les outils offerts aux IA

Le serveur MCP offre 73 outils (`doc/mcp/`). Deux lecteurs, deux textes :

- **Pour l'IA** : la description de chaque outil est en **anglais**, précise et technique (paramètres, règles). Elle n'est pas traduite : le comportement de l'IA ne dépend pas de la langue de l'interface.
- **Pour l'humain** : un **résumé** d'une phrase par outil, dans le catalogue, dans chaque langue. Il dit à quoi sert l'outil, sans reprendre la description de l'IA.
- Un écran « Ce que les IA peuvent faire » montre ces résumés, regroupés par partie comme `doc/mcp/`. Il se trouve dans l'onglet « Brancher une IA » des Réglages.
- Un outil sans résumé dans chaque langue fait échouer la CI.

## 8. Contrôles

La CI refuse :

- une clé présente dans une langue et absente d'une autre ;
- une clé utilisée dans le code et absente du catalogue, ou présente et jamais utilisée ;
- un texte à paramètres dont les paramètres ne sont pas les mêmes dans toutes les langues ;
- un outil MCP sans résumé dans chaque langue ;
- un texte en dur dans le code de l'interface (écrit hors du catalogue) : à l'étape 1, un compte qui ne peut que baisser, jusqu'à zéro.

## 9. Étapes et critères

- **Étape 1 — français à l'identique** : tous les textes viennent du catalogue `fr` ; les tests existants et les parcours passent sans changement de texte ; aucun texte en dur ; essai de l'application réelle sans différence visible.
- **Étape 2 — anglais** : le réglage « Langue » ; le catalogue `en` complet ; les descriptions d'outils en anglais ; les résumés d'outils et leur écran ; les parcours rejoués en anglais.
- **Étape 3 — portugais du Brésil** : le catalogue `pt-BR` complet ; les parcours rejoués en portugais ; un contrôle que les textes plus longs ne débordent pas des boutons et des colonnes.

La traduction est rédigée par l'agent puis **relue par l'utilisateur** avant chaque livraison de langue.

## 10. Hors de cette spécification

- Langues qui s'écrivent de droite à gauche.
- Traduction du contenu de l'utilisateur.
- Documentation du projet (`doc/`) en plusieurs langues.
- Changement de langue sans recharger la fenêtre.
