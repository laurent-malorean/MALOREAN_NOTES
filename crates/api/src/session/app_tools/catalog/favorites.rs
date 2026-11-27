//! Ce que l'IA lit des outils des favoris (fiche 0102) : mettre un contenu en favori, l'en
//! retirer, lister les favoris.

use serde_json::json;

use super::{Described, input, text};

/// Le chemin d'un contenu qu'on met en favori ou qu'on retire des favoris.
fn content_path() -> serde_json::Value {
    text(
        "Chemin du contenu depuis l'espace de travail : `dossier/nom.md`, `dossier/nom.canvas`. Une \
         note, un cahier de recherche, une carte mentale, un canvas ou un CRM ; jamais une fiche \
         de CRM.",
    )
}

pub(super) fn add_favorite() -> Described {
    (
        "Met un contenu en favori, comme l'étoile de MALOREAN Notes : une ligne `- [[lien]]` est \
         ajoutée à la fin de la note des favoris, avec le lien du menu des liens (`[[titre]]`, \
         `[[Dossier/titre]]` si un autre contenu porte le même titre, `[[nom.canvas]]` pour un \
         canvas). Le texte d'avant est gardé dans l'historique des versions. Un contenu déjà en \
         favori n'est pas ajouté deux fois. La note des favoris est celle que l'utilisateur a \
         choisie dans les Réglages, onglet « Favoris » ; sans elle, l'outil échoue (« Aucune note \
         des favoris n'est choisie. ») : dites-le à l'utilisateur, ne créez pas de note à sa \
         place. Refusé aussi : une fiche de CRM (seul le CRM entier a une étoile) et la note des \
         favoris elle-même. Rend `path` et `favorite` (true).",
        input(json!({ "path": content_path() }), &["path"]),
    )
}

pub(super) fn remove_favorite() -> Described {
    (
        "Retire un contenu des favoris, comme l'étoile : toutes les lignes de la note des favoris \
         faites uniquement d'un lien qui le désigne (avec ou sans marque de liste, doublons \
         compris) sont retirées ; un lien au milieu d'une phrase reste. Le texte d'avant est \
         gardé dans l'historique des versions. Un contenu qui n'était pas en favori ne change \
         rien (`removed_lines` vaut 0). Échoue sans note des favoris choisie (« Aucune note des \
         favoris n'est choisie. »). Rend `path`, `favorite` (false) et `removed_lines`.",
        input(json!({ "path": content_path() }), &["path"]),
    )
}

pub(super) fn list_favorites() -> Described {
    (
        "Les favoris de l'espace de travail : `note`, la note des favoris (`path`, `title`), et \
         `favorites`, les contenus qu'elle désigne par une ligne faite d'un lien seul, dans \
         l'ordre de la note, chacun une fois (`path`, `title`, `type`). Un lien sans cible, ou \
         ambigu, n'est pas listé. Échoue sans note des favoris choisie (« Aucune note des \
         favoris n'est choisie. »).",
        input(json!({}), &[]),
    )
}
