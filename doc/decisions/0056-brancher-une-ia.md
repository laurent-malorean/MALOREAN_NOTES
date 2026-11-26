# 0056 — Brancher une IA : une clé stable, une prise permanente, une commande de branchement

- **Date** : 2026-11-25
- **Statut** : acceptée (spécification : `doc/specs/brancher-une-ia.md`)
- **Complète** la fiche 0040 (outils de l'application pour Claude : serveur MCP local, relais, prise Unix, clé du tour).
- **Nom du serveur** : renommé `malorean_notes` le 26/11/2026 (fiche 0082) ; les blocs de configuration portent `malorean_notes` (`mcpServers.malorean_notes`, `[mcp_servers.malorean_notes]`), pas `malorean`.

## Contexte

Les outils de l'application ne servaient qu'à la colonne Claude Code, le temps d'un tour : prise neuve à chaque lancement, clé du tour tirée à chaque tour. L'utilisateur veut s'en servir depuis une IA extérieure (extension Claude de VS Code, Codex), qui lance une commande à elle et garde sa configuration d'un jour à l'autre. Toujours aucun port réseau.

## Décision

```
IA extérieure ──(entrée/sortie)── commande de branchement ──(prise Unix, dossier 0700)── application ── mêmes outils
```

- **La clé de branchement est stable** : créée par un bouton, elle ne change que si l'utilisateur la révoque. 256 bits lus dans `/dev/urandom` (`SystemSecretMaker`, port `SecretMaker`), écrits en hexadécimal. Créer quand une clé existe rend la clé existante.
- **Son stockage** (`ConnectionKeys`, `FsConnectionKeys`) : un fichier JSON (`connection-key.json`) dans le dossier de configuration de l'application, à côté des préférences, jamais dans un espace de travail. Il est créé en `0600` (écrit à côté puis renommé : jamais de demi-clé, jamais lisible par un autre compte). La clé n'a pas de forme de débogage lisible (`ConnectionKey(..)`) : elle ne peut pas entrer dans un journal. Un fichier abîmé est une erreur qui dit de révoquer puis de recréer, pas « pas de clé ».
- **La clé est vérifiée à chaque ligne** contre le fichier, pas seulement à la connexion : sans clé ou avec une mauvaise clé, tout est refusé (`-32001`, comme pour la clé du tour) ; une clé révoquée n'est plus acceptée même sur une connexion encore ouverte.
- **La prise de branchement** est une prise Unix à **chemin fixe**, `~/.malorean-notes/branchement.sock` : la configuration collée dans l'IA ne contient que la commande et la clé, donc la commande doit retrouver la prise seule, d'un lancement à l'autre. Choisi plutôt que le dossier des fichiers temporaires (`$TMPDIR` peut différer d'un processus à l'autre, et Codex ou VS Code ne le partagent pas toujours) ou le dossier de support de l'application (chemin trop long pour certains comptes : 104 octets au plus). Le dossier est en `0700`, la prise en `0600`. **Aucun port réseau.** Une prise laissée par un lancement qui s'est mal arrêté est remplacée (si personne n'y répond) ; une prise à laquelle une autre instance répond est respectée.
- **Cycle de vie** : ouverte au lancement si une clé existe, à la création de la clé ; fermée à la révocation : les connexions ouvertes sont coupées tout de suite et le fichier de la prise est effacé. Sans clé, aucune prise n'existe.
- **La commande de branchement** : le programme de l'application lancé avec `--brancher <clé>`, reconnu par `main` avant tout le reste (comme `--relais-mcp`). Elle relie ligne à ligne l'entrée et la sortie de l'IA à la prise, après avoir présenté la clé. Application fermée (prise absente ou sans réponse), elle répond à chaque demande de l'IA par une erreur JSON-RPC qui dit que l'application n'est pas lancée, au lieu de se terminer sans un mot.
- **L'onglet des Réglages** (« Brancher une IA ») : sans clé, une phrase et le bouton « Créer une clé de branchement » ; avec une clé, sa date, la clé et deux blocs à copier (Claude, Codex), chacun avec « Copier » (presse-papiers de la commande `copy_plain_text`), et « Révoquer la clé », qui demande confirmation. Commandes `connection_info`, `create_connection_key`, `revoke_connection_key`.
- **Les blocs de configuration** (`claude_config`, `codex_config`) : pour Claude, le JSON `{"mcpServers": {"malorean": {"command": …, "args": ["--brancher", "<clé>"]}}}` ; pour Codex, le TOML `[mcp_servers.malorean]` avec `command` et `args`. Le programme est celui de l'application qui tourne.
- **Mêmes outils, même serveur** : `Session::answer_connection` répond par le serveur MCP de la fiche 0040 (`mcp::answer`), avec le même catalogue et les mêmes cas d'usage. Pas de tour : l'espace de travail visé est **celui qui est ouvert au moment de l'appel**, désigné par son nom comme pour la colonne. Le dossier des modèles est choisi par l'interface à chaque tour de la colonne Claude Code ; sans tour, il n'est pas connu : `list_templates` et `create_note_from_template` le disent à l'IA (« aucun dossier des modèles n'est choisi »).
- **Le garde-fou du web** (crochet de Claude Code, fiche 0032) ne s'applique qu'à la colonne ; une IA extérieure a ses propres autorisations.

## Conséquences

- Un programme du Mac qui connaît la clé lit et écrit les notes comme l'IA branchée : c'est pourquoi la clé se révoque en un clic.
- L'IA n'est écoutée que tant que l'application tourne.
- Tests : le stockage de la clé sur le faux et sur le disque (contrat, droits `0600`, fichier abîmé) ; la prise permanente (chemin fixe, droits, fermeture qui coupe les connexions, aucun port réseau par `lsof`) ; la commande de branchement (clé refusée, application fermée) ; les blocs de configuration ; l'onglet des Réglages (tests d'écran et parcours Playwright).
