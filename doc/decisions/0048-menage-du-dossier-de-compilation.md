# 0048 — La CI fait le ménage du dossier de compilation, seulement le périmé

- **Date** : 2026-11-23
- **Statut** : acceptée

## Contexte

Le dossier de compilation de Cargo pesait 40 Go le 23/11 (31 Go de `target/debug`, dont 27 Go de `debug/build` : une centaine de variantes de chaque programme de test ; 6,6 Go de `llvm-cov-target` ; 4,1 Go de `debug/incremental`) et le disque était plein à 98 %. Tout effacer après chaque passage obligerait à tout recompiler, candle compris (plusieurs minutes), à chaque commit.

## Décision

1. Un ménage (`scripts/ci-menage.sh`) retire seulement le périmé : les variantes de compilation (`build/<crate>/<empreinte>`, `deps`, `incremental`, le même sous `llvm-cov-target`, fichiers `.profraw`) dont aucun fichier n'a été lu ni modifié depuis plus d'un jour, sauf la variante la plus récemment utilisée de chaque crate. Les copies temporaires de cargo-mutants (`$TMPDIR/cargo-mutants-*.tmp`) et la copie figée de `--copie` suivent la même règle.
2. Seulement au-delà de 20 Go (constante `SEUIL_GO`).
3. Jamais pendant qu'un passage de la CI, la mutation du diff, un `cargo` ou un autre ménage tourne (contrôle des processus plus verrou) : il saute, avec une ligne qui le dit.
4. À la fin de la barrière de commit (hors documentation seule) et de `--complet`, réussies ou non, silencieux hors un résumé d'une ligne ; son échec ne fait jamais échouer la CI. À part : `scripts/ci.sh --menage`, et `--menage --a-blanc` qui liste sans rien effacer.
5. Garde-fous : `CARGO_TARGET_DIR` respecté ; le dossier doit porter la marque de Cargo (`CACHEDIR.TAG`), ne pas être un lien, ni `/`, ni le dossier personnel, ni le dépôt ; tout effacement est vérifié sous ce dossier.

## Pourquoi

- **Date d'accès ou de modification, pas la modification seule** : Cargo réutilise une variante en lisant ses fichiers d'empreinte sans les modifier ; avec la seule date de modification, ce qui sert tous les jours serait jeté chaque jour et recompilé. Mesuré sur ce Mac (APFS) : la date d'accès de la variante réutilisée est à jour. On ne regarde que les fichiers, jamais les dossiers (les parcourir mettrait leur date d'accès à jour et fausserait la mesure suivante).
- **Un jour** : une variante inutilisée depuis plus d'un jour correspond à un état du code ou des options que le travail courant n'utilise plus.
- **Seuil** : sous 20 Go, le disque ne souffre pas ; le ménage ne coûte alors rien.

## Mesures

Dossier réel, à blanc, le 23/11 après le nettoyage à la main du matin : 19,3 Go, 11,0 Go (`~/Library/Caches/malorean-notes-target`) et 7,2 Go (copie figée), toutes variantes de moins d'un jour : rien à retirer aujourd'hui. Passe de contrôle de 1272 variantes : 2,5 s.
