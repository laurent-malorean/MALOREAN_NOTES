# 0022 — Notes récentes : tenues par l'interface, relues par Rust

- **Date** : 2026-11-18
- **Statut** : acceptée

## Contexte

On veut retrouver les notes ouvertes le plus récemment, de n'importe quel dossier : dans la colonne des dossiers, comme un dossier, et en tête de l'ouverture rapide. Il faut dire ce qu'« ouvrir » veut dire, qui tient la liste, où elle est gardée, et comment elle suit les renommages et les notes jetées.

## Décision

- **Une note est ouverte** quand elle devient la note montrée par la colonne active (clic dans la liste, onglet, ouverture rapide, lien, colonne activée). Chaque changement des colonnes la met en tête : la plus récente d'abord, sans doublon, `RECENT_NOTES_LIMIT` (10) au plus.
- **L'interface tient la liste** (`state/recent-notes.ts`, pur ; `app/recent-notes.ts`), gardée pour chaque bibliothèque dans le stockage de la page (`malorean.recent:<bibliothèque>`), comme le tri et les dossiers pliés. Ouvrir une note n'est pas un fait de la bibliothèque : Rust n'en garde rien.
- **Rust dit ce que sont devenues les notes** : `list_recent_notes(paths)` rend les lignes de la liste de ces notes, dans l'ordre donné, sans celles qui n'existent plus. Une note jetée ou disparue sort ainsi de la liste à la relecture suivante (Récentes, ou la liste relue après la corbeille) ; une réponse arrivée après un changement de bibliothèque n'efface rien.
- **Renommer suit** : un titre tapé qui renomme le fichier, une note déplacée, un dossier renommé ou déplacé passent leur correspondance d'anciens en nouveaux chemins à la liste. Un renommage hors de l'application n'est pas suivi : l'ancien chemin disparaît comme une note supprimée.
- **Récentes** est un mode de la liste (`recent` dans l'écran), comme le filtre par étiquette : choisir un dossier ou une étiquette le quitte, la recherche et la corbeille le mettent de côté. La liste y garde l'ordre d'ouverture : le choix du tri est caché. Elle n'est pas réordonnée à chaque clic, seulement quand elle est relue (rechoisir Récentes, enregistrement, corbeille).
- **L'ouverture rapide** place les notes récentes en tête tant que rien n'est tapé ; dès qu'on tape, l'ordre habituel revient.

## Conséquences

- Les notes récentes ne sont pas partagées entre deux Mac : elles vivent dans le stockage de la page.
