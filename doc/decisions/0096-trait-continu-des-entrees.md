# 0096 : la barre d'entrée est continue et au même endroit sur toutes les lignes

- **Date** : 2026-11-26
- **Statut** : acceptée, correction d'un défaut signalé par l'utilisateur (capture d'écran)
- **Corrige** l'affichage de la barre d'entrée (fiche 0041, spécification « Entrée de cahier », section 2 bis).

## Contexte

Dans une entrée contenant une citation (`> …`, y compris imbriquée `> >`), la barre d'entrée n'était plus alignée avec celle du titre : la citation a sa propre bordure gauche de 3 px sur la ligne, et l'image de fond de la barre, dessinée à partir de l'intérieur de la ligne, était repoussée de ces 3 px vers la droite. Les deux traits se collaient, décalés par rapport à la barre des autres lignes. Le raccourci `background` de la barre effaçait aussi le fond gris d'un bloc de code, et le retrait fixe du bloc de code (`padding: 0 1em !important`) supprimait celui de la barre.

## Décision

- **La barre d'entrée garde le même x sur toutes les lignes d'une entrée**, quel que soit leur contenu (titre, citation, citation imbriquée, bloc de code, liste, tableau, ligne vide, dernière ligne). Elle se dessine en image de fond de la ligne (`background-image`, jamais le raccourci `background`), à gauche, jusqu'au bas de la ligne.
- **Le trait propre à la citation reste visible, à l'intérieur de l'entrée, à droite de la barre** : dans une entrée, la bordure de la citation est remplacée par une seconde image de fond, placée au retrait de l'entrée, sans masquer la barre. Le texte de la citation et celui du bloc de code gardent leur retrait propre (1 em) en plus de celui de la barre.
- **Le bloc de code garde son fond** dans une entrée.
- **Rien d'autre ne change** : espace net avant chaque entrée, couleurs du thème clair et sombre, cahiers sans numéro, notes ordinaires. Le numéro d'entrée (fiche 0095) n'est pas touché.

## Conséquences

- Test d'écran WebKit sur les pixels de la page (capture) : une entrée avec citation simple, citation imbriquée, bloc de code, liste mixte, tableau, lignes vides et dernière ligne, avec les numéros d'entrée. Il mesure le x et la largeur de la barre sur chaque ligne (identiques au titre, en thème clair et sombre), l'absence de rupture du titre à la dernière ligne, le trait de la citation au moins 2 px à droite de la barre, et le fond du bloc de code.
