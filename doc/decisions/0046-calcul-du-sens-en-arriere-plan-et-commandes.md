# 0046 — Calcul du sens en arrière-plan et commandes : un travailleur unique par session, deux événements, une commande de recherche à part

- **Date** : 2026-11-23
- **Statut** : acceptée
- **Complète** les fiches 0040 (outils de l'application), 0042 (la recherche), 0044 (l'index de sens) et 0045 (les cas d'usage).

## Décision

- **Index ouverts ensemble** : `IndexOpener` gagne `open_with_meaning`, qui rend un `OpenedIndex` (l'index de mots, qui tient l'index de sens à jour, et l'index de sens du même fichier, `MeaningStore`). La session ne demande plus que celui-là. Par défaut (ouvreurs des tests), l'index de sens est vide et rien ne le remplit. L'assemblage (`app/src/main.rs`, `MeaningIndexes`) enfile `SegmentingIndex` sur `SqliteIndexes::open_with_meaning`.
- **Un travailleur par session** (`MeaningWorker`) : un fil créé à la demande, jamais deux ; une demande pendant un calcul pose un drapeau et le calcul se relance une fois fini. Un compteur de génération, changé à chaque changement d'espace de travail et à la fermeture, arrête le calcul entre deux lots (le lot en cours est fini et gardé). Un calcul panique-t-il : le travailleur se remet au repos. Il ne calcule que si le modèle choisi est téléchargé, et ne dit rien quand il n'y a rien à calculer (pas de bruit à chaque enregistrement).
- **Déclencheurs** : ouverture d'un espace de travail, enregistrement (`save_note`), changement de la surveillance, modèle choisi, modèle téléchargé, reconstruction. Une note créée, déplacée ou jetée par l'application n'en lance pas : ses segments changés attendent le déclencheur suivant (un enregistrement suit presque toujours).
- **Événements** : `meaning-progress` (`progress` : segments faits, à faire, nom du modèle ; `finished` : seulement si des vecteurs ont été calculés ; `failed` : message lisible) et `model-download` (`progress` : octets faits et à faire ; `finished` ; `failed`, qui dit aussi une annulation). Le pont est un trait (`MeaningEvents`), réalisé par Tauri (`TauriMeaningEvents`) comme `AppScreen`.
- **Commandes** : `meaning_overview`, `choose_meaning_model`, `download_meaning_model` (rend la main à la fin du téléchargement, comme `send_to_claude` à la fin d'un tour), `cancel_model_download`, `remove_meaning_model`, `rebuild_meaning`, `search_notes_with_meaning`, `related_notes`. Un modèle se désigne par son nom (`e5-small`, `e5-large`). Un seul téléchargement à la fois ; supprimer le modèle en cours de téléchargement est refusé.
- **Recherche : une commande à part** plutôt qu'un paramètre de `search_notes`. La recherche par les mots rend une liste, la recherche mixte rend les résultats et la raison typée (`MeaningUse`) : changer la forme de `search_notes` aurait cassé l'écran actuel avant la brique de l'interface. `search_notes` ne change pas ; l'interface choisira la commande selon l'option « par le sens ».
- **Outil `search_by_meaning`** : joué par la même recherche mixte que la commande (une seule logique), dans l'espace de travail du tour. Entrée : `question` (exigée), `limit` (entier de 1 à 100, 10 par défaut ; plus de 100 est ramené à 100). Sortie : `meaning_used`, `reason` (seulement si le sens manque), `notes` (`path`, `title`, `excerpt`). Il ne change rien.

## Conséquences

- L'interface (brique suivante) branche les deux événements et les huit commandes ; les types TypeScript sont générés (`MeaningOverviewItem`, `ModelOverviewItem`, `MeaningProgressItem`, `ModelDownloadItem`, `MeaningSearchItem`, `MeaningUseItem`).
- Un enregistrement lance un fil court (lecture du modèle choisi, état du modèle) même quand rien n'est à calculer ; son coût n'est pas mesuré.
- À la fermeture, `stop_meaning` attend le lot en cours (10 secondes au plus) ; au-delà, l'application se ferme et le lot est perdu, sans conséquence (un vecteur manquant se recalcule).
