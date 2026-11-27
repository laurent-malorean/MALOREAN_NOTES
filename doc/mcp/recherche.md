# Recherche

Trois outils pour trouver des notes sans parcourir les fichiers : par les mots (avec l'index de l'application), par le sens, et par les liens entrants. Aucun ne change rien : le garde-fou du web ne les retient jamais.

Tous acceptent le paramètre facultatif `workspace` ([règles communes](README.md#règles-communes)).

## `search_notes`

Cherche des notes de l'espace de travail avec l'index : les notes qui contiennent tous les mots de `query`, et/ou portent l'étiquette `tag`, et/ou sont rangées dans `folder` (sous-dossiers compris), et/ou sont d'un type de contenu. Les critères donnés s'ajoutent ; sans aucun critère, l'outil rend les notes de l'espace.

La recherche par mots ignore les majuscules et les accents, et cherche chaque mot aussi à l'intérieur d'un mot plus long : « tomy » trouve « anatomy ». Ce n'est pas une recherche de mot entier.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `query` | texte | non | Les mots cherchés dans le texte des notes. |
| `tag` | texte | non | Une étiquette que les notes doivent porter. |
| `folder` | texte | non | Un dossier depuis l'espace de travail : `Travail/Projets` ; ses sous-dossiers sont compris. |
| `content_type` | texte | non | Un type de contenu : `note`, `cahier-de-recherche`, `carte-mentale`, `canvas`, `crm`, `crm-entreprise`, `crm-personne`, `crm-action`, `crm-projet`, `agenda-12` ou `agenda-12-evenement`. Sans lui, tous ces types. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : une liste de 100 résultats au plus, la note la plus récemment modifiée d'abord. Chaque résultat :

- `path`, `title`, `folder`, `tags` ;
- `excerpt` : un extrait autour des mots trouvés, seulement avec `query` ;
- `matches` : seulement avec `query`, le nombre d'occurrences des mots cherchés dans le texte entier de la note (pas seulement l'extrait ; à l'intérieur des mots aussi ; deux occurrences qui se chevauchent comptent pour une). Il aide à juger la pertinence : un seul résultat est peut-être un mot trouvé par hasard dans un mot plus long ; `read_note` lit la note entière pour confirmer. Il ne change ni l'ordre ni la limite ;
- `type` : pour un CRM, une fiche de CRM, un agenda 12 ou un événement seulement (`crm`, `crm-action`, `agenda-12-evenement`…) ;
- `crm` : pour une fiche de CRM, le chemin de son CRM ;
- `agenda` : pour un événement d'un agenda 12, le chemin de son agenda 12 ;
- `node` : pour un nœud de carte mentale, son chemin dans la carte (`1.0.2`) ; `path` est alors le fichier de la carte et `title` le titre du nœud.

Les nœuds de carte mentale ne sont cherchés qu'avec `query` et sans `content_type` ; ils viennent après les notes, filtrés par `folder` et `tag`, dans la même limite de 100.

**Erreurs** :

- type inconnu : « type de contenu inconnu : « … » ; ceux d'une note : « note », « cahier-de-recherche », « carte-mentale », « crm », « crm-entreprise », « crm-personne », « crm-action », « crm-projet », « agenda-12 », « agenda-12-evenement » » ;
- « dossier invalide » ;
- index indisponible (« stockage indisponible : … »).

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "search_notes", "arguments": {"query": "devis acme", "folder": "Clients"}}
```

Réponse :

```json
[{"path": "Clients/acme.md", "title": "Acme", "folder": "Clients", "tags": ["client"],
  "excerpt": "… le devis Acme est parti le 12 …", "matches": 3}]
```

## `search_by_meaning`

Cherche des notes par ce qu'elles disent plutôt que par leurs mots exacts : à utiliser quand on ne connaît pas les mots des notes (une idée, une question, un synonyme). La recherche par le sens est mêlée à celle par les mots. Si le sens n'est pas disponible (modèle de sens non téléchargé, calcul pas fini, échec), la recherche par mots répond seule et `reason` dit pourquoi, à dire à l'utilisateur.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `question` | texte | oui | Ce qu'on cherche, en une phrase : `comment j'ai décidé du budget`. |
| `limit` | entier | non | Combien de notes au plus : 10 par défaut ; un nombre plus grand que 100 est ramené à 100. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** :

- `meaning_used` : `true` si la recherche par le sens a servi ;
- `reason` : seulement si elle n'a pas servi, la phrase à dire à l'utilisateur ;
- `notes` : les notes les plus proches, la mieux classée d'abord ; chacune avec `path`, `title`, `excerpt` (le titre de la section trouvée, puis le début de son texte), et, pour un CRM, une fiche de CRM, un agenda 12 ou un événement, `type` et, pour une fiche, `crm` (le chemin de son CRM) ou, pour un événement, `agenda` (le chemin de son agenda 12).

**Erreurs** :

- « il manque « question » » ;
- `limit` qui n'est pas un entier d'au moins 1 : « « limit » est un nombre entier d'au moins 1 ».

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "search_by_meaning", "arguments": {"question": "pourquoi avons-nous changé de fournisseur", "limit": 5}}
```

Réponse :

```json
{"meaning_used": true, "notes": [{"path": "Achats/fournisseurs.md", "title": "Fournisseurs",
  "excerpt": "Changement de fournisseur — Les délais de livraison de l'ancien …"}]}
```

## `linking_notes`

Les liens entrants d'une note : les notes dont un lien `[[titre]]` la désigne. Une action d'un CRM la désigne aussi par ses notes liées, sa description ou un commentaire.

**Paramètres** :

| Nom | Type | Obligatoire | Description |
|---|---|---|---|
| `path` | texte | oui | Le chemin de la note depuis l'espace de travail : `dossier/nom.md`. |
| `workspace` | texte | non | L'espace de travail visé. |

**Rend** : une liste ; chaque note avec `path`, `title`, `folder`, et, pour une fiche de CRM ou un événement d'un agenda 12, `type` (`crm-action`, `agenda-12-evenement`…) et `crm` (le chemin de son CRM) ou `agenda` (le chemin de son agenda 12).

**Erreurs** : « il manque « path » » ; note introuvable (« la note « … » n'existe pas ») ; chemin invalide.

**Garde-fou du web** : non retenu.

**Exemple** :

```json
{"name": "linking_notes", "arguments": {"path": "Projets/budget-2027.md"}}
```

Réponse :

```json
[{"path": "Réunions/2026-11-20.md", "title": "Réunion du 20 novembre", "folder": "Réunions"},
 {"path": "clients/actions/2026-11-26-relance-du-devis-acme.md", "title": "Relance du devis Acme",
  "folder": "clients/actions", "type": "crm-action", "crm": "clients.md"}]
```

## Références

- [0040](../decisions/0040-outils-de-l-application-pour-claude.md) : les outils de l'application.
- [0046](../decisions/0046-calcul-du-sens-en-arriere-plan-et-commandes.md) : la recherche par le sens et son calcul en arrière-plan.
- [0050](../decisions/0050-carte-mentale.md) : les nœuds de carte mentale dans la recherche.
- [0081](../decisions/0081-crm-par-le-mcp.md) : le CRM et ses fiches dans les résultats.
- [0086](../decisions/0086-recherche-de-notes-pour-les-ia.md) : la recherche de notes pour les IA, `matches`.
