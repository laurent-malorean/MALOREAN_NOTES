# Agenda 12

Trois outils : lire un agenda 12, y ajouter un événement, en clore un. Ils font ce que fait l'écran (spécification : [`doc/specs/agenda-12.md`](../specs/agenda-12.md), format de fichiers : [`doc/format/agenda-12.md`](../format/agenda-12.md)).

Un agenda 12 est une note (`type: agenda-12`) montrée en grille de 12 cases, une par mois, de janvier à décembre. Ses **événements** sont des notes rangées dans un dossier qui porte le nom de son fichier (`salons/` pour `salons.md`), les événements clos dans le sous-dossier `archives/`. Un événement a un titre et un mois ; le jour, l'année, la fin (un jour de fin, et un mois de fin s'il diffère du mois du début), le pays (code ISO 3166-1 sur deux lettres), la ville et les étiquettes sont facultatifs.

Règles communes :

- **Un agenda 12 se désigne par son chemin** (`path`) ; les agendas 12 d'un espace se listent avec `search_notes` (`content_type` : `agenda-12`). Un événement se désigne par le chemin de sa note, rendu par `read_agenda_12` (`path` de chaque événement) ; `search_notes` avec `content_type` `agenda-12-evenement` les trouve aussi, avec `agenda`, le chemin de leur agenda 12.
- **Le texte d'un événement** (budget, contacts, notes prises sur place) se lit avec [`read_note`](notes.md#read_note) et se change avec [`replace_in_note`](notes.md#replace_in_note) : un événement est une note simple pour ces deux outils. L'agenda 12 lui-même est refusé par eux, avec les trois outils de cette page pour réponse. Les étiquettes se changent avec [`add_tags` et `remove_tags`](etiquettes-et-epingles.md).
- **Le nom du fichier d'un événement ne change jamais** après sa création : changer son titre (`replace_in_note`, `rename_note`) ne change que sa ligne `#`. Les dossiers d'un agenda 12 ne se renomment, ne se déplacent ni ne se jettent à la main : un agenda 12 se range avec `move_note` et se jette avec `trash_note`, qui emportent ses événements, archives comprises. `rename_note` renomme la note d'un agenda 12 sans son dossier des événements : le changer par l'écran.
- **Une date impossible est refusée** avec le message de l'écran : « Ce jour n'existe pas dans ce mois. » (31 février, 29 février d'une année non bissextile), « La fin exige un jour de début. », « La fin est avant le début. », « L'année doit être comprise entre 1 et 9999. ».
- **Un mois** est un nombre de 1 (janvier) à 12 (décembre) ; un autre nombre donne « « 13 » n'est pas un mois : un nombre de 1 (janvier) à 12 (décembre) est attendu. ». **Un pays** est un code de la norme ; un autre donne « « ZZ » n'est pas un pays connu : un code sur deux lettres (FR, DE, US…) est attendu. ».
- **L'historique** : chaque événement changé garde sa version d'avant dans l'historique des versions.
- `add_agenda_12_event` et `close_agenda_12_event` sont **retenus par le garde-fou du web** ; `read_agenda_12` ne l'est pas.
- Les messages d'erreur sont ceux de l'interface, en français. Un appel refusé ne change rien.

Tous les outils de cette page acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)).

## `read_agenda_12`

Lit un agenda 12 comme des données : ce que montre l'écran, sans le texte des événements.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de l'agenda 12 : `dossier/salons.md`. |
| `tag` | texte | non | Une étiquette : seuls les événements de la grille qui la portent. |
| `include_archives` | booléen | non | Ajouter `archives`, les événements clos. Faux par défaut. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** :

- `path`, `title` (« Sans titre » s'il n'en a pas), `columns` (3, 4 ou 6) ;
- `tags` : les étiquettes portées par les événements de la grille (la liste du filtre), par ordre alphabétique ;
- `cells` : les 12 cases, de janvier à décembre, chacune avec `month` (1 à 12), `name` (`janvier`…) et `events`, dans l'ordre de la case : par année croissante, puis par jour croissant (ceux sans jour après ceux qui en ont un), puis par titre sans compter les majuscules ni les accents ; les événements sans année viennent en dernier, rangés de même ;
- `archives` (seulement avec `include_archives`) : les événements clos, du plus récemment clos au plus ancien ;
- `unreadable` : les chemins des événements illisibles (sans titre, sans mois lisible), laissés de côté et jamais effacés ; absent s'il n'y en a pas ;
- `truncated` et `message` : voir plus bas ; absents si la réponse est entière.

Chaque événement : `path` (sa note), `title`, `month`, et ce qui n'est pas vide : `day`, `year`, `end_day`, `end_month` (la fin d'un événement sur plusieurs jours ; `end_month` est le mois du début quand la fin tombe le même mois), `country` (le code), `country_name` (son nom en français), `city`, `tags`, `closed_on` (le jour de la clôture, `2026-11-27`, pour un événement clos) et `line`, la ligne de l'écran : `date – drapeau (ville) – titre` (`10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World`, `[2029] – Renouveler malorean.fr`, `15/01 – Audit ISO`).

**Borné** : 60 000 caractères au plus. Au-delà, les événements qui ne tiennent pas ne sont pas rendus (la coupure suit l'ordre de la grille, puis des archives), `truncated` vaut `true` et `message` dit combien manquent et comment avancer (filtrer avec `tag`, ne pas demander les archives) : jamais de coupure silencieuse.

**Erreurs** :

- « il manque « path » » ;
- « cette note n'est pas un agenda 12 » ;
- « « include_archives » est true ou false » ;
- la note n'existe pas.

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "read_agenda_12", "arguments": {"path": "pro/salons.md", "tag": "salon"}}
```

Réponse (abrégée) :

```json
{"path": "pro/salons.md", "title": "Salons", "columns": 6, "tags": ["salon"],
 "cells": [
   {"month": 1, "name": "janvier", "events": []},
   {"month": 2, "name": "février", "events": [
     {"path": "pro/salons/salon-embedded-world.md", "title": "Salon Embedded World",
      "month": 2, "day": 10, "year": 2027, "end_day": 13, "end_month": 2,
      "country": "DE", "country_name": "Allemagne", "city": "Nuremberg", "tags": ["salon"],
      "line": "10–13/02 [2027] – 🇩🇪 (Nuremberg) – Salon Embedded World"}]},
   ...
 ]}
```

## `add_agenda_12_event`

Crée un événement dans un agenda 12 : une note rangée dans son dossier des événements (créé avec le premier), nommée d'après son titre (suffixe `-2`, `-3`… si le nom est pris), dans la case de son mois. Mêmes refus qu'à l'écran. Le texte de l'événement s'écrit ensuite avec `replace_in_note`.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de l'agenda 12. |
| `title` | texte | oui | Le titre de l'événement. |
| `month` | entier | oui | Le mois de début, de 1 à 12 : sa case. |
| `day` | entier | non | Le jour de début. |
| `year` | entier | non | L'année de début, de 1 à 9999. |
| `end_day` | entier | non | Le jour de fin d'un événement sur plusieurs jours (exige `day`). |
| `end_month` | entier | non | Le mois de fin, de 1 à 12, s'il diffère du mois de début (exige `end_day`). |
| `country` | texte | non | Le code du pays : `FR`, `DE`, `US` (majuscules ou non). |
| `city` | texte | non | La ville. |
| `tags` | liste de textes | non | Les étiquettes, sans `#`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `path` (la note de l'événement), `agenda` (le chemin de l'agenda 12) et `event` (tous ses champs, comme `read_agenda_12`).

**Erreurs** :

- « il manque « path » », « il manque « title » », « il manque « month » : un nombre de 1 à 12 » ;
- « cette note n'est pas un agenda 12 » ;
- les messages de date et de mois ci-dessus, « « end_month » exige « end_day » » ;
- « « day » doit être un entier », « « day » doit être un entier positif », « « tags » est une liste de textes ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "add_agenda_12_event", "arguments": {"path": "pro/salons.md", "title": "Vivatech",
 "month": 5, "day": 30, "year": 2027, "end_day": 2, "end_month": 6,
 "country": "FR", "city": "Paris", "tags": ["salon"]}}
```

Réponse :

```json
{"path": "pro/salons/vivatech.md", "agenda": "pro/salons.md",
 "event": {"path": "pro/salons/vivatech.md", "title": "Vivatech", "month": 5, "day": 30,
           "year": 2027, "end_day": 2, "end_month": 6, "country": "FR", "country_name": "France",
           "city": "Paris", "tags": ["salon"],
           "line": "30/05 → 02/06 [2027] – 🇫🇷 (Paris) – Vivatech"}}
```

## `close_agenda_12_event`

Clôt un événement, comme le bouton « Clore » : il sort de la grille et passe dans les archives de son agenda 12 (le sous-dossier `archives/`, qui naît avec la première clôture ; nom suffixé s'il est déjà pris là-bas), en retenant le jour de sa clôture (le jour du Mac). Il garde tous ses champs et son texte. Avec `prepare_next`, une copie reprend son titre, son mois, son pays, sa ville et ses étiquettes, sans jour, sans année, sans fin et sans texte, et apparaît dans la grille : pour un événement qui revient chaque année. Ne rien clore sans que l'utilisateur le demande. Un événement clos se rouvre à l'écran (« Rouvrir »).

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note de l'événement (`path` d'un événement de `read_agenda_12`). |
| `prepare_next` | booléen | non | Créer la copie qui prépare le suivant. Faux par défaut. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : `closed` (le nouveau chemin de la note, dans les archives) et `successor` (le chemin de la copie, ou `null`).

**Erreurs** :

- « il manque « path » » ;
- « Cet événement n'existe plus. » ;
- « cette note n'est pas un événement d'un agenda 12 » ;
- « Cet événement est déjà clos. » ;
- « « prepare_next » est true ou false » ;
- un événement illisible (sans titre ou sans mois lisible) est refusé avec sa raison : « Cet événement n'a pas de titre. », « Cet événement n'a pas de mois lisible. ».

**Garde-fou du web** : retenu.

**Exemple** :

```json
{"name": "close_agenda_12_event", "arguments": {"path": "pro/salons/salon-embedded-world.md", "prepare_next": true}}
```

Réponse :

```json
{"closed": "pro/salons/archives/salon-embedded-world.md", "successor": "pro/salons/salon-embedded-world.md"}
```

## Références

- [0104](../decisions/0104-agenda-12.md) : l'agenda 12.
