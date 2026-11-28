# 0107 : le lien vers une entrée d'un cahier de recherche

## Contexte

La fiche 0095 a donné un numéro à chaque entrée et un bouton qui copie du texte brut (`Titre du cahier · 0007`),
en écartant « le lien `[[note#ancre]]` ». L'utilisateur (28/11) veut un vrai lien entre notes avec ancre, comme un lien
HTML `page#ancre` : coller la référence dans une note, cliquer, arriver sur l'entrée.

## Décision

- **Syntaxe** : `[[Titre du cahier#0007]]`, le `#` puis le numéro d'entrée. C'est une cible de lien entre notes comme
  les autres (`[[titre|texte]]`, `[[Dossier/titre#0007]]`) ; aucun format de fichier ne change, aucun identifiant n'est
  écrit (le numéro est la position de l'entrée, stable parce qu'un cahier ne se modifie jamais).
- **Qui décide** : Rust, dans la résolution des liens (`LinkIndex::resolve`). Nouvelle réponse `Resolution::Entry`
  (cahier, numéro). Le texte entier est d'abord pris pour un titre : un titre qui contient `#` n'est jamais cassé. Sinon,
  si la cible se termine par `#` et des chiffres seuls, le début est résolu comme avant ; il faut que ce soit un cahier de
  recherche (`LinkIndex::with_notebooks`), sans quoi la cible ne désigne rien. Un début ambigu reste ambigu (même règle
  que les liens existants). Les numéros `0000` et au-delà de la dernière entrée sont des liens vers une entrée : Rust ne
  compte pas les entrées pour cela, l'interface le vérifie avec la liste des entrées et le dit.
- **Liens entrants** : un lien vers une entrée compte comme un lien vers le cahier. Favoris : inchangés (seul un lien
  qui désigne le contenu entier fait un favori).
- **Interface** : « Copier la référence » colle le lien ; un clic dans l'aperçu en direct, comme sur un lien entre notes,
  ouvre le cahier (celui déjà ouvert sert), défile jusqu'à l'entrée et la met en évidence par une animation dont la
  couleur et la durée sont dans le thème ; entrée introuvable : le cahier s'ouvre sans défiler, message « Entrée 0007
  introuvable dans ce cahier ».
- **Outils MCP** : aucun outil ne change ; la lecture des liens entrants (`linking_notes`) compte le nouveau suffixe.
- **Choix écartés** : une ancre de date (`[[Cahier#2026-11-20-09h42]]`, trop longue, et le numéro suffit) ; un
  identifiant écrit dans le fichier ; un lien vers une entrée de note ordinaire (seuls les cahiers ont des entrées).

## Contrôles

Tests Rust : résolution (numéro, `0000`, au-delà, `#abc`, cahier introuvable, homonymes, titre qui contient `#`,
canvas et note ordinaire), liens entrants. Tests d'écran : copie de la référence, clic, défilement, évidence, message. Un
parcours Playwright : copier la référence, la coller dans une note, cliquer, l'entrée est montrée.
