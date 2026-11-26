//! Ce que l'IA lit des outils du cahier de recherche (fiches 0041 et 0087) : créer un cahier, y
//! ajouter une entrée.

use serde_json::json;

use super::{Described, folder, input, text};

pub(super) fn create_research_notebook() -> Described {
    (
        "Crée un cahier de recherche (une note dont l'en-tête porte `type: cahier-de-recherche`) \
         selon les règles de MALOREAN Notes : titre `# title` en tête, nom du fichier tiré du \
         titre (sans écraser une autre note), dans `folder` (la racine par défaut ; créé avec ses \
         parents s'il n'existe pas). Le titre n'est pas vide. Le cahier est neuf, sans entrée. \
         Rend son chemin. Ensuite, on y écrit avec `add_entry`, et jamais autrement : un cahier \
         ne se modifie ni avec `replace_in_note` ni avec vos outils de fichiers.",
        input(
            json!({
                "title": text("Le titre du cahier."),
                "folder": folder(),
            }),
            &["title"],
        ),
    )
}

pub(super) fn add_entry() -> Described {
    (
        "Ajoute une entrée à la fin d'un cahier de recherche (une note dont l'en-tête porte \
         `type: cahier-de-recherche`, créé par `create_research_notebook`), à l'heure qu'il est, sous les titres d'année, de mois et \
         de jour qui manquent. C'est la seule façon d'écrire dans un cahier : il ne se modifie \
         jamais, ni par cet outil ni par vos outils de fichiers. Une erreur se \
         rectifie par une nouvelle entrée. Rend l'entrée ajoutée : ancre, moment et texte.",
        input(
            json!({
                "path": text("Chemin du cahier depuis l'espace de travail : `dossier/nom.md`."),
                "text": text("Le texte de l'entrée ; plusieurs lignes permises."),
            }),
            &["path", "text"],
        ),
    )
}
