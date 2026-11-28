# 0111 — Saisie vocale : la zone de saisie d'un cahier de recherche se dicte aussi

Date : 28/11/2026. Spécification : `doc/specs/saisie-vocale.md`, § 6 et § 6.1. Fiches voisines : 0103 (le moteur), 0109 et 0110 (le raccourci). Spécification de la zone de saisie : `doc/specs/entree-de-cahier.md`.

## Contexte

La spécification du 27/11 écartait la zone de saisie d'un cahier de recherche (« champ de texte simple, micro grisé »). L'utilisateur, en essayant : « je ne peux pas faire de saisie vocale dans le cahier de recherche (j'ouvre une note : l'icône est grisée) ». Il le demande : la spécification et cette fiche corrigent le périmètre.

## Décision

- **Le contrat ne change pas** : la saisie vocale n'écrit que par l'interface `Dictation` (début, texte provisoire, texte fixé, fin, abandon). Une seconde réalisation de cette interface, `EntryDictation` (`editor/voice/entry-dictation.ts`), écrit dans le champ de texte (`<textarea>`) de la zone de saisie. L'éditeur du cahier la crée une fois (`entryDictation`) ; la zone de saisie s'y lie quand le cahier la montre et s'en délie quand elle disparaît (le panneau de CodeMirror qui porte la zone est détruit). La colonne dit où écrire par `dictation()` : l'éditeur de texte si la note est modifiable, la zone de saisie si c'est un cahier qui la montre, sinon rien. `textEditor()` reste ce qu'il était (l'éditeur de texte modifiable) pour tout le reste de l'application.
- **Le micro est actif** quand `dictation()` n'est pas vide pour la colonne active : un cahier ouvert avec sa zone de saisie compte comme un éditeur (même contrat que pour l'éditeur : actif ou grisé, avec la même bulle « ouvrez une note » quand il n'y a rien où écrire). Un cahier montré sans zone de saisie reste grisé.
- **Texte provisoire dans le champ** : un champ de texte simple n'a ni décor ni texte grisé. Le texte provisoire est donc écrit dans le champ, à la suite du curseur, et sa place est retenue (début, fin) pour que chaque mise à jour le remplace en entier et qu'un texte vide l'efface. Le champ prend la classe `dictating` pendant l'écoute (liseré de la couleur du micro à l'écoute, `--danger`, du thème). Écarté : un calque de miroir derrière un champ au texte transparent pour griser le texte provisoire (alignement et défilement à refaire à la main, fragile pour un gain seulement visuel).
- **Écriture** : par la commande d'édition du navigateur (`execCommand("insertText")`) quand le champ a le focus, pour que l'annulation du champ la connaisse ; sinon directement (`setRangeText`), car le focus peut être sur « Ajouter l'entrée ». Mesuré dans WebKit : des écritures successives et la frappe contiguë forment une seule étape d'annulation, qu'on ne sait pas couper (ni par la sélection programmée, ni par un changement de focus) ; l'annulation d'une écoute n'a donc pas son étape séparée, contrairement à l'éditeur. Dit dans la spécification.
- **Cohérence avec la frappe de l'utilisateur** : même règle que dans l'éditeur (§ 5.2) : une frappe ou un curseur déplacé fixe le texte provisoire où il est, l'écoute continue à la nouvelle place, le début répété par le moteur n'est pas réécrit. Les écritures de la dictée ne comptent pas comme des frappes (un indicateur pendant l'écriture).
- **« Ajouter l'entrée »** pendant l'écoute ajoute ce qui est dans le champ, texte provisoire compris ; la zone prévient la dictée qu'elle est vidée (`cleared`), qui continue sans répéter. **La dictée n'appelle jamais l'ajout** : elle n'a aucun accès à l'action d'ajout, et un test affirme qu'aucun événement de validation n'est émis.
- **Arrêts** : inchangés, ils passent par la même cible d'écoute (`Target.dictation`) : clic, raccourci, Échap, silence, changement de contenu (le texte provisoire est fixé dans le champ, comme dans l'éditeur), arrière-plan.

## Conséquences

- Hors de ce que les tests jouent : le vrai micro et les raccourcis physiques ; les tests (Vitest, WebKit, parcours `voice-input`) jouent la dictée du faux moteur dans la zone de saisie, y compris le raccourci, Échap, la frappe pendant l'écoute et l'ajout de l'entrée.
- À essayer à la main : ouvrir un cahier de recherche, cliquer dans la zone de saisie, démarrer la dictée (micro ou raccourci), parler, vérifier qu'aucune entrée n'est ajoutée, puis « Ajouter l'entrée ».
