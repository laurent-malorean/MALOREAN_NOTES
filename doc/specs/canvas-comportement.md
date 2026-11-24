# Canvas : comportement

Spécification fonctionnelle de l'usage d'un canvas dans MALOREAN Notes. **Principe décidé par l'utilisateur le 24/11 : on suit Obsidian**, rien n'est inventé. Ce document reprend le comportement décrit par l'aide officielle d'Obsidian (page « Canvas », <https://obsidian.md/help/plugins/canvas>), version bureau seulement. Le format du fichier est dans [canvas.md](canvas.md). Ce document se lit seul.

Un canvas est un nouveau type de contenu, à côté des notes, des cahiers de recherche et des cartes mentales. C'est un fichier `.canvas` de l'espace de travail, au format ouvert JSON Canvas : il s'ouvre aussi dans Obsidian.

## 1. Créer un canvas

- Clic droit sur un dossier de l'espace de travail, puis **« Nouveau canvas »**. Le fichier est créé dans ce dossier.
- Par la palette de commandes : **« Canvas : créer un canvas »** ; le fichier est créé dans le même dossier que le fichier actif.

## 2. Ajouter des cartes

La barre d'outils au bas du canvas porte trois boutons, qu'on sélectionne ou qu'on glisse sur le canvas :
- le **fichier vierge** : une carte texte ;
- le **document** : une note de l'espace de travail ;
- l'**image** : un média de l'espace de travail.

Autres façons, par type de carte :

- **Carte texte** : aussi par double-clic sur le canvas. Son contenu est du Markdown (liens, blocs de code…, comme dans une note). Une carte texte n'apparaît pas dans les rétroliens tant qu'elle n'est pas convertie : clic droit, « Convertir en fichier… », saisir le nom, « Enregistrer ».
- **Note** : clic droit sur le canvas, « Ajouter une note de l'espace de travail » ; ou glisser une note depuis la liste des notes. **Décidé par l'utilisateur le 24/11 (écart voulu avec Obsidian) : la carte n'affiche pas d'aperçu de la note, elle montre un lien** (le nom de la note, en couleur de lien) qui ouvre la note. Dans une carte texte, `[[nom de la note]]` est de même un lien ; la forme d'intégration d'Obsidian (`![[nom de la note]]`, qui dessine la note dans la carte avec une barre bleue à gauche et un bouton d'agrandissement) n'est pas rendue en aperçu. Un aperçu serait trop petit pour être lisible. Les commandes « Réduire à un titre » et « Réduire à un bloc » n'ont donc pas de sens et ne sont pas reprises.
- **Média** : clic droit sur le canvas, « Ajouter un média de l'espace de travail » ; ou glisser un média depuis la liste. Images, audio, PDF et autres médias. Le fichier est choisi dans la fenêtre du Mac, copié à côté du canvas (dossier `<nom>.assets`) sous un nom libre, puis la carte apparaît au centre de la vue, l'image affichée dans la carte. **La carte image prend les proportions de l'image** (écart voulu par l'utilisateur, la spécification d'origine ne décrivait pas la taille) : largeur 400, hauteur 400 × hauteur de l'image / largeur de l'image, arrondie ; si cette hauteur dépasse 600, la hauteur est 600 et la largeur est réduite pour garder les proportions (une photo de 300 × 600 donne une carte de 300 × 600). L'image remplit la carte, sans bande. Une carte image déjà dans un fichier garde la taille du fichier. Si la copie échoue (fichier refusé, disque), un message s'affiche et aucune carte n'est ajoutée.
- **Page web** : clic droit sur le canvas, « Ajouter une page web », saisir l'adresse, « Enregistrer » ; ou glisser une adresse depuis le navigateur. Pour l'ouvrir dans le navigateur : Cmd + clic sur le libellé de la carte, ou clic droit puis « Ouvrir le lien externe ». Menu de la carte : « Copier l'adresse », « Changer l'adresse… », « Recharger la page ».
- **Dossier** : glisser un dossier ajoute tous ses fichiers.

Les **bases** décrites par Obsidian n'existent pas dans MALOREAN Notes : elles ne sont pas reprises.

## 3. Modifier, supprimer, remplacer

- **Modifier** : double-clic sur une carte texte ou note ; on arrête en cliquant hors de la carte ou avec Échap. Autres moyens : clic droit puis « Modifier », ou « Modifier » dans les commandes de la sélection.
- **Supprimer** : clic droit puis « Retirer » ; ou la touche Suppr (Retour arrière) ; ou « Retirer » dans les commandes de la sélection.
- **Remplacer** (note ou média, par un élément du même type) : clic droit, « Changer le fichier », choisir le fichier.

## 4. Sélection

- Clic sur une carte, ou glisser un rectangle autour de plusieurs cartes.
- Maj + clic ajoute ou retire une carte de la sélection.
- Cmd + A sélectionne tout.
- Pour faire défiler le contenu d'une carte, il faut d'abord la sélectionner.

## 5. Déplacer, redimensionner, aligner

- **Déplacer** : glisser une carte sélectionnée ; sélectionner une carte la met au premier plan. Maj pendant le glissement contraint le déplacement à une direction. Espace désactive l'accrochage.
- **Redimensionner** : glisser un bord quelconque. Espace désactive l'accrochage ; Maj conserve le rapport largeur/hauteur ; pour une carte image, il est toujours conservé (Maj ne change rien de plus).
- **Aligner et répartir** (au moins deux cartes sélectionnées, « Aligner » dans les commandes de la sélection) : aligner à gauche, au centre, à droite, en haut, au milieu, en bas ; disposer en ligne, en colonne, en grille ; répartir l'espace horizontal ou vertical ; justifier horizontalement ou verticalement.

## 6. Flèches (connexions)

- **Créer** : survoler un bord de carte jusqu'à voir un rond plein, puis glisser ce rond jusqu'au bord d'une autre carte. Relâcher dans le vide permet de créer une nouvelle carte à l'autre bout.
- **Déconnecter** : survoler la ligne jusqu'à voir deux petits ronds, puis glisser un rond sans l'accrocher à une carte. Ou clic droit sur la ligne puis « Retirer » ; ou sélectionner la ligne puis Suppr.
- **Reconnecter une extrémité** : glisser son rond vers une autre carte.
- **Suivre une connexion** : clic droit près d'une extrémité, puis « Suivre la connexion » ; le canvas se centre sur la carte à l'autre bout.
- **Sens** : par défaut, la flèche pointe vers la seconde carte. Sélectionner la ligne, puis le bouton « sens de la ligne » de sa barre ouvre un menu de trois choix, avec l'icône de chacun et une coche sur le choix actuel : **« Non directionnel »** (un trait), **« Unidirectionnel »** (une flèche vers la seconde carte, le choix par défaut), **« Bidirectionnel »** (une flèche à chaque bout). Dans le fichier, ils s'écrivent comme dans le format (voir [canvas.md](canvas.md), § 5) : trait sans pointe, flèche du départ vers l'arrivée, flèche aux deux bouts.
- **Étiquette** : double-clic sur la ligne, saisir le texte, puis Échap ou un clic sur le canvas. Ou « Modifier l'étiquette » (commandes de la sélection, ou clic droit). « Retirer l'étiquette » l'enlève.
- **Couleur** : sélectionner des cartes ou des connexions, « Couleur » (icône palette), choisir une couleur. **Décidé par l'utilisateur le 24/11 (écart voulu avec Obsidian) : pas de couleur libre.** Obsidian propose ses 7 couleurs puis un rond arc-en-ciel pour une couleur libre ; ici, le menu ne propose que **les couleurs de la palette de l'application** (celles de la carte mentale, voir ci-dessous), et rien d'autre.

**Une seule palette pour toute l'application (décidé le 24/11).** Les couleurs de la carte mentale (rouge, orange, jaune, vert, turquoise, bleu, violet, rose, marron, ardoise) sont **la** palette de l'application : le canvas, la carte mentale et toute fonction à venir qui colore quelque chose n'en ont pas d'autre. Aucune couleur n'est définie ailleurs que dans cette palette.

**Dans le fichier.** Rouge, orange, jaune, vert, turquoise (cyan) et violet s'écrivent avec les préréglages `"1"` à `"6"` du format ; bleu, rose, marron et ardoise s'écrivent en hexadécimal `#RRGGBB`. Un canvas venu d'Obsidian qui contient une autre couleur est lu et affiché tel quel, sans être modifié ; on ne peut simplement pas en choisir une autre que celles de la palette.

## 7. Groupes

- **Groupe vide** : clic droit sur le canvas, « Créer un groupe ».
- **Groupe avec des cartes** : sélectionner les cartes, clic droit sur l'une d'elles, « Créer un groupe ».
- **Renommer** : double-clic sur le nom, Entrée pour valider.
- **Arrière-plan** : sélectionner le groupe, « Définir l'arrière-plan », choisir une image de l'espace de travail. « Modifier l'arrière-plan » propose : remplacer, retirer, couvrir (`cover`), garder les proportions (`ratio`), répéter (`repeat`).
- **Mettre une carte dans un groupe** : on glisse la carte dans le groupe. **La carte fait partie du groupe seulement si elle est entièrement à l'intérieur de son cadre.** Quand on déplace le groupe, les cartes qui en font partie se déplacent avec lui ; une carte qui dépasse du cadre, même un peu, reste en place. (Le fichier ne garde aucune liste : l'appartenance se calcule à partir des positions, voir [canvas.md](canvas.md), § 4.5.)
- **Aller à un groupe** : commande « Canvas : aller à un groupe » ; elle liste les groupes et centre le canvas sur celui choisi.

## 8. Menus du clic droit

- **Sur le canvas** : ajouter une note, ajouter un média, ajouter une page web, créer un groupe.
- **Sur une carte** : convertir en fichier, changer le fichier, ouvrir le lien externe, modifier, retirer, zoomer sur la sélection ; pour une page web : copier l'adresse, changer l'adresse, recharger la page.
- **Sur une ligne** : retirer, modifier l'étiquette, suivre la connexion.

## 9. Navigation et zoom

- **Déplacer la vue** : Espace + glisser ; ou le bouton central de la souris + glisser ; la molette déplace verticalement, Maj + molette horizontalement.
- **Zoom** : Espace ou Cmd + molette ; ou les boutons « Zoomer » et « Dézoomer » en haut à droite.
- **Tout voir** : bouton « Tout voir » ou Maj + 1.
- **Zoom sur la sélection** : clic droit sur une carte sélectionnée, ou Maj + 2.
- **Zoom initial** : bouton « Rétablir le zoom » en haut à droite.

## 10. Réglages du canvas (icône engrenage)

- **Accrocher à la grille** : au déplacement et au redimensionnement, selon la grille du fond.
- **Accrocher aux objets** : aux cartes proches.
- **Lecture seule** : empêche toute modification.

## 11. Annuler et rétablir

- **Annuler** : bouton « Annuler » à droite du canvas, ou Cmd + Z.
- **Rétablir** : bouton « Rétablir », ou Cmd + Maj + Z (ou Cmd + Y).

## 12. Exporter en image

Commande **« Canvas : exporter en image »** (bureau). Options : « Zone » (canvas entier ou fenêtre seulement), « Zoom » (qualité, taille estimée affichée), « Afficher le logo » (activé par défaut), « Mode confidentiel » (masque tout le texte, désactivé par défaut). Nom proposé : le nom du canvas, en `.png`. Un canvas vide ne s'exporte pas.

## 13. Intégrer un canvas dans une note

Un canvas peut être intégré dans une note avec la syntaxe d'intégration de fichier habituelle.

## 14. Observé sur une capture d'Obsidian (24/11, bureau)

Constaté sur une capture fournie par l'utilisateur (un grand canvas, thème sombre) ; ces points complètent l'aide :

- **Barre d'outils du bas** : exactement **trois boutons** carrés, côte à côte et centrés au bas du canvas : un fichier vierge, un document avec des lignes, une image. Ce sont les trois boutons du § 2.
- **Commandes en haut à droite**, en colonne de boutons carrés, de haut en bas : **réglages** (engrenage) ; puis un groupe **zoomer** (+), **rétablir le zoom** (flèche circulaire), **tout voir** (quatre coins), **dézoomer** (−) ; puis **annuler** et **rétablir** ; puis **aide** (point d'interrogation).
- **Barre d'une carte sélectionnée** : au-dessus de la carte, une petite barre de boutons carrés : supprimer (corbeille), couleur (palette), zoom sur la sélection, modifier (crayon). Le bouton couleur ouvre une rangée de ronds colorés ; la couleur choisie est entourée d'un anneau.
- **Barre d'une ligne sélectionnée** : au-dessus de la ligne, cinq boutons carrés : supprimer (corbeille), couleur (palette), zoom sur la sélection, sens de la ligne (l'icône montre le sens actuel : une flèche pour « unidirectionnel »), modifier l'étiquette (crayon). La ligne sélectionnée est tracée plus épaisse, avec un halo.
- **Fond** : points espacés régulièrement (la grille d'accrochage du § 10).
- **Cartes** : rectangles aux coins peu arrondis, colorables ; teintes vues : olive/jaune, rouge, bleu-violet et brun. Une carte d'image montre l'image seule, sans cadre de texte.
- **Flèches** : courbes fines avec une pointe à l'arrivée ; une même carte peut en envoyer beaucoup vers d'autres.
- **Très dézoomé** : les cartes texte se réduisent à un rectangle coloré portant une petite icône de lignes ; le texte n'est plus dessiné.
- **Chargement** : un indicateur « Chargement des modules… » peut s'afficher en bas à droite à l'ouverture.

## 15. Décisions de l'utilisateur sur les derniers points (24/11)

Ces points, non décrits par l'aide d'Obsidian, sont réglés ; **rien n'est supposé au-delà** :

- **Pas de création de carte texte au clavier** : seul le double-clic (et les boutons de la barre du bas) crée une carte texte.
- **Pas de duplication** (Option + glisser) : l'utilisateur ne l'a pas trouvée dans Obsidian ; elle n'est pas reprise.
- **Aucun raccourci clavier** autre que ceux cités dans ce document.
- **Aucune limite** de taille ni de nombre de cartes.
