# 0012 — Corbeille : un dossier caché `.trash/` qui garde le chemin d'origine

- **Date** : 2026-11-16
- **Statut** : acceptée

## Contexte

Supprimer une note ou un dossier ne doit rien perdre tout de suite : on veut pouvoir restaurer. La bibliothèque reste un simple dossier de fichiers Markdown, lisible par d'autres outils ; la corbeille doit donc vivre dans le système de fichiers, sans base de données ni fichier de suivi à côté.

## Décision

- La corbeille est le dossier caché **`.trash/`** à la racine de la bibliothèque, comme dans Obsidian. Étant caché, il n'apparaît jamais parmi les dossiers, dans la liste ni dans la recherche.
- Un élément supprimé y garde **son chemin d'origine** : `Travail/lundi.md` va dans `.trash/Travail/lundi.md`. Une note part avec son dossier de pièces jointes, un dossier part entier. Restaurer, c'est remettre l'élément à ce chemin : aucune autre information n'est nécessaire.
- Deux éléments supprimés au même chemin ne s'écrasent pas : la note reçoit le premier suffixe libre (`lundi-2.md`, liens vers ses pièces jointes mis à jour), le dossier devient `Travail 2`, comme dans le Finder.
- Restaurer recrée les dossiers manquants. Un nom pris reçoit un suffixe libre. Un dossier restauré là où un dossier du même nom existe déjà y est fusionné, élément par élément. Les dossiers de la corbeille laissés vides en disparaissent (les fichiers cachés du Finder, comme `.DS_Store`, ne comptent pas).
- La corbeille se vide **seulement à la main**, après une confirmation : c'est la seule action définitive de l'application.
- La corbeille montre les notes de la racine, puis chaque dossier suivi de ses notes, avec leur emplacement d'origine. Un dossier y apparaît aussi quand il ne fait que contenir une note supprimée ; le restaurer remet tout ce qu'il contient.

## Conséquences

- Aucune métadonnée : la corbeille reste lisible et réparable à la main, dans le Finder.
- Sans date de suppression, pas de vidage automatique ni de tri par date de suppression ; c'est voulu (vidage manuel seulement).
- Un dossier qui contient seulement une note supprimée et un dossier supprimé sous le même nom ne se distinguent pas dans la corbeille : les deux se restaurent de la même façon, ce qui suffit.
