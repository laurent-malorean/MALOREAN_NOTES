# 0027 — Copier en texte mis en forme : le presse-papiers du Mac écrit par Rust, en HTML aux styles en ligne et en texte brut

- **Date** : 2026-11-18
- **Statut** : acceptée

## Contexte

On veut copier une note pour la coller dans un mail ou un document, mise en forme comme l'export PDF (fiche 0025) : titres, emphase, listes, code coloré, tableaux, images. L'application qui colle doit trouver deux formats à la fois : du HTML pour Mail, Pages, Word ou Notes, et du texte brut pour celles qui ne lisent que du texte. Les mails et les documents ignorent les classes et les feuilles de style : l'apparence doit être écrite dans chaque élément.

Pistes regardées pour écrire dans le presse-papiers :

- **`navigator.clipboard.write` avec un `ClipboardItem`** (HTML et texte) depuis la page : WebKit ne l'accepte que pendant un geste de l'utilisateur. Or la copie lit d'abord la note (appel à Rust), charge les langues des blocs de code et lit les images : le geste est passé quand le HTML est prêt. WebKit admet des promesses dans le `ClipboardItem` pour ce cas, mais le comportement dans le WKWebView de Tauri (protocole `tauri://`, autorisations du presse-papiers) n'est pas garanti et ne se teste pas dans les parcours. Rejeté : peu fiable.
- **Le greffon presse-papiers de Tauri** (`tauri-plugin-clipboard-manager`, `writeHtml`) : il passe par la bibliothèque `arboard` et une permission de plus ; une dépendance nouvelle pour quelques lignes. Rejeté.
- **Un port `Clipboard` dans `application`, et son adaptateur `MacClipboard` dans `infrastructure`** qui écrit `NSPasteboard` par `objc2-app-kit` (déjà tiré par Tauri, déjà utilisé par l'export PDF) : le HTML sous `public.html` et le texte sous `public.utf8-plain-text`, dans le même presse-papiers, après l'avoir vidé. Aucun geste exigé, aucun bloc `unsafe` (les types sont donnés par leur nom, pas par les constantes d'AppKit). Un presse-papiers nommé, à part, sert aux tests : le vrai presse-papiers de l'utilisateur n'est jamais touché. Retenu.

## Décision

- **Action « Copier en texte mis en forme »** : palette, **Cmd+Maj+C** (libre dans l'application, dans l'éditeur et dans le menu par défaut de Tauri ; Cmd+C reste la copie de l'éditeur), menu d'une note dans la liste (après « Imprimer… ») et menu d'un onglet (en dernier).
- **Ce qui est copié** : depuis un menu, la note cliquée, entière. Depuis la palette ou le raccourci, la sélection de la colonne active si du texte y est sélectionné, sinon sa note entière. La note entière est enregistrée d'abord, puis relue ; la sélection est prise telle qu'elle est dans l'éditeur. Un message le confirme : « Note copiée » ou « Sélection copiée ».
- **HTML** : le rendu HTML de l'export (`noteHtml`), puis `styledHtml` y écrit le style de chaque élément dans son attribut `style`, d'après les règles de la feuille d'impression (`noteStyles`), avec les valeurs du thème lues sur la feuille d'impression : thème clair, police de lecture. Les cases à cocher deviennent ☐ et ☑. Le tout est enveloppé dans un bloc au style du texte.
- **Images** : chaque image est lue par la page et incluse en adresse `data:` tant que toutes tiennent dans 8 Mo ; au-delà, ou si elle ne se lit pas comme une image, elle est laissée de côté.
- **Texte brut** (`plainText`) : la note lue par le même analyseur, sans syntaxe ni en-tête : paragraphes séparés d'une ligne vide, puces « • », numéros gardés, cases ☐ et ☑, cellules séparées par des tabulations, texte des liens et des images seulement.
- **Rust** : port `Clipboard::copy_rich_text(html, text)`, adaptateur `MacClipboard` (presse-papiers général par défaut), faux `InMemoryClipboard` ; session `with_clipboard`, commande `copy_rich_text(html, text)`.

### Ajout : Copier en Markdown (2026-11-18)

- **Action « Copier en Markdown »** : palette, **Ctrl+Cmd+C**, menu d'une note dans la liste et menu d'un onglet, juste après « Copier en texte mis en forme ». Raccourci : Cmd+Maj+Alt+C, d'abord envisagé, est écarté parce qu'Option change la lettre tapée sur Mac (« ç ») et que la table des raccourcis lit la lettre tapée (pour suivre le clavier AZERTY) ; Ctrl+Cmd+C est libre dans l'application, dans l'éditeur et dans le menu par défaut de Tauri, et rejoint les autres raccourcis Ctrl+Cmd.
- **Mêmes notes visées** que la copie mise en forme : la logique « note cliquée, ou sélection, ou note active » est partagée (`copyText`), seul le format change.
- **Le texte tel quel, en-tête compris**, comme le fichier de l'export Markdown : copier en Markdown, c'est emporter la note pour la coller dans un autre outil qui lit le Markdown, étiquettes comprises ; l'en-tête s'efface d'un geste s'il gêne, il ne se retrouve pas. Les liens vers les pièces jointes restent ceux de la note (rien n'est copié à côté).
- **Texte brut seul** (`public.utf8-plain-text`), aucun HTML : l'application qui colle reçoit la syntaxe Markdown, jamais une mise en forme. Port `Clipboard::copy_plain_text(text)`, qui vide le presse-papiers comme `copy_rich_text` ; commande `copy_plain_text(text)`. Messages « Markdown copié » ou « Sélection copiée ».

## Conséquences

- Collée dans un mail ou un document, la note ressemble à l'export PDF ; collée dans un champ de texte, elle se lit sans marques Markdown.
- Le vrai presse-papiers n'est écrit que par l'adaptateur, vérifié sur un presse-papiers nommé à part ; ce que Mail, Pages ou Word font du HTML collé (styles gardés, images `data:` acceptées) n'est vérifié que par l'essai réel.
- Une note aux images lourdes donne une copie sans ces images : le texte reste complet.
