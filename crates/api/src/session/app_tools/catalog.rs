//! Ce que Claude lit de chaque outil de l'application : son nom, ce qu'il fait, et ce qu'il
//! attend (schéma JSON de son entrée), dans les mots de l'application (fiche 0040).

use domain::app_tools::AppTool;
use serde_json::{Value, json};

/// Un champ texte de l'entrée d'un outil, décrit pour Claude.
fn text(description: &str) -> Value {
    json!({ "type": "string", "description": description })
}

/// Le chemin d'une note, tel que les outils l'attendent.
fn note_path() -> Value {
    text("Chemin de la note depuis l'espace de travail : `dossier/nom.md`.")
}

/// Un dossier depuis l'espace de travail, la racine par défaut.
fn folder() -> Value {
    text("Le dossier depuis l'espace de travail : `Travail/Projets` ; la racine si absent.")
}

/// L'identifiant d'une version.
fn version() -> Value {
    text("L'identifiant de la version, tel que `list_versions` le donne : `2026-11-18 14h30`.")
}

/// Une liste d'étiquettes.
fn tag_list() -> Value {
    json!({
        "type": "array",
        "items": { "type": "string" },
        "description": "Les étiquettes, sans `#` : `[\"maison\", \"jardin\"]`.",
    })
}

/// L'entrée d'un outil : ses champs, et ceux qu'il exige.
fn input(properties: Value, required: &[&str]) -> Value {
    json!({ "type": "object", "properties": properties, "required": required })
}

/// Ce que fait un outil, et l'entrée qu'il attend.
type Described = (&'static str, Value);

fn search_notes() -> Described {
    (
        "Cherche des notes de l'espace de travail avec l'index de MALOREAN Notes, sans \
         parcourir les fichiers : les notes qui contiennent tous les mots de `query` \
         (majuscules et accents ignorés), et/ou qui portent l'étiquette `tag`, et/ou rangées \
         dans `folder` (sous-dossiers compris), et/ou d'un type de contenu (`note`). Rend \
         100 notes au plus : chemin, titre, dossier, étiquettes, et un extrait autour des \
         mots trouvés.",
        input(
            json!({
                "query": text("Les mots cherchés dans le texte des notes."),
                "tag": text("Une étiquette que les notes doivent porter."),
                "folder": text("Un dossier depuis l'espace de travail : `Travail/Projets`."),
                "content_type": text("Un type de contenu ; le seul pour l'instant : `note`."),
            }),
            &[],
        ),
    )
}

fn list_tags() -> Described {
    (
        "Liste les étiquettes de l'espace de travail, chacune avec son nombre de notes.",
        input(json!({}), &[]),
    )
}

fn linking_notes() -> Described {
    (
        "Les liens entrants d'une note : les notes dont un lien `[[titre]]` la désigne.",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

fn list_templates() -> Described {
    (
        "Les noms des modèles de note (les notes du dossier des modèles choisi par \
         l'utilisateur), sans leur texte.",
        input(json!({}), &[]),
    )
}

fn list_versions() -> Described {
    (
        "L'historique des versions d'une note : chaque version gardée par MALOREAN Notes, \
         la plus récente d'abord, avec son identifiant et sa date.",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

fn read_version() -> Described {
    (
        "Le texte d'une version d'une note, désignée par l'identifiant que donne \
         `list_versions` (`2026-11-18 14h30`).",
        input(
            json!({
                "path": note_path(),
                "version": version(),
            }),
            &["path", "version"],
        ),
    )
}

fn create_note() -> Described {
    (
        "Crée une note selon les règles de MALOREAN Notes : titre `# title` en tête, nom du \
         fichier tiré du titre (sans écraser une autre note), dans `folder` (la racine par \
         défaut), avec `text` sous le titre. Rend son chemin.",
        input(
            json!({
                "title": text("Le titre de la note."),
                "folder": folder(),
                "text": text("Le texte de la note, en Markdown, sous son titre."),
            }),
            &["title"],
        ),
    )
}

fn create_note_from_template() -> Described {
    (
        "Crée une note depuis un modèle de note : MALOREAN Notes applique le modèle (date, \
         heure et titre remplacés) ; inutile de lire le modèle. `template` est le nom que \
         donne `list_templates`. Rend son chemin.",
        input(
            json!({
                "template": text("Le nom du modèle, tel que `list_templates` le donne."),
                "title": text("Le titre de la nouvelle note."),
                "folder": folder(),
            }),
            &["template", "title"],
        ),
    )
}

fn trash_note() -> Described {
    (
        "Met une note à la corbeille de MALOREAN Notes (jamais effacée : l'utilisateur peut \
         la restaurer), avec ses pièces jointes et son historique.",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

fn rename_note() -> Described {
    (
        "Change le titre d'une note : son fichier et son dossier de pièces jointes sont \
         renommés, ses liens vers ses pièces jointes suivent. Rend son nouveau chemin et les \
         notes dont un lien `[[ancien titre]]` la visait (à reprendre avec vos outils de \
         fichiers si besoin).",
        input(
            json!({ "path": note_path(), "title": text("Le nouveau titre.") }),
            &["path", "title"],
        ),
    )
}

fn move_note() -> Described {
    (
        "Range une note dans un autre dossier, avec ses pièces jointes et son historique ; un \
         nom pris reçoit un suffixe. Rend son nouveau chemin.",
        input(
            json!({ "path": note_path(), "folder": text("Le dossier d'arrivée depuis l'espace de travail ; `` pour la racine.") }),
            &["path", "folder"],
        ),
    )
}

fn restore_version() -> Described {
    (
        "Remet dans une note le texte d'une de ses versions (identifiant de `list_versions`) ; \
         son texte actuel est d'abord gardé comme version.",
        input(
            json!({ "path": note_path(), "version": version() }),
            &["path", "version"],
        ),
    )
}

fn add_tags() -> Described {
    (
        "Ajoute des étiquettes dans l'en-tête d'une note, sans toucher au reste.",
        input(
            json!({ "path": note_path(), "tags": tag_list() }),
            &["path", "tags"],
        ),
    )
}

fn remove_tags() -> Described {
    (
        "Retire des étiquettes de l'en-tête d'une note, sans toucher au reste.",
        input(
            json!({ "path": note_path(), "tags": tag_list() }),
            &["path", "tags"],
        ),
    )
}

fn pin_note() -> Described {
    (
        "Épingle une note en tête de la liste des notes.",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

fn unpin_note() -> Described {
    (
        "Désépingle une note.",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

fn add_attachment() -> Described {
    (
        "Ajoute à une note, comme pièce jointe, une image ou un PDF déjà rangé dans l'espace \
         de travail : il est copié dans le dossier de pièces jointes de la note (le fichier \
         d'origine reste où il est) et son lien est ajouté à la fin de la note.",
        input(
            json!({
                "path": note_path(),
                "file": text("Le fichier à joindre, depuis l'espace de travail : `Documents/plan.pdf`."),
            }),
            &["path", "file"],
        ),
    )
}

fn viewed_note() -> Described {
    (
        "Ce que l'utilisateur regarde dans MALOREAN Notes : la note ouverte dans la colonne \
         active (chemin et titre, ou rien) et le texte qu'il y a sélectionné (vide s'il n'y en a \
         pas), avec le nom de l'espace de travail. Utile quand il parle de « cette note » ou de \
         « ce passage ».",
        input(json!({}), &[]),
    )
}

fn show_note() -> Described {
    (
        "Montre une note à l'utilisateur : MALOREAN Notes l'ouvre dans la colonne active (par \
         exemple la note que vous venez de créer ou de trouver).",
        input(json!({ "path": note_path() }), &["path"]),
    )
}

/// Ce que fait l'outil, et l'entrée qu'il attend.
fn described(tool: AppTool) -> Described {
    match tool {
        AppTool::SearchNotes => search_notes(),
        AppTool::ListTags => list_tags(),
        AppTool::LinkingNotes => linking_notes(),
        AppTool::ListTemplates => list_templates(),
        AppTool::ListVersions => list_versions(),
        AppTool::ReadVersion => read_version(),
        AppTool::CreateNote => create_note(),
        AppTool::CreateNoteFromTemplate => create_note_from_template(),
        AppTool::TrashNote => trash_note(),
        AppTool::RenameNote => rename_note(),
        AppTool::MoveNote => move_note(),
        AppTool::RestoreVersion => restore_version(),
        AppTool::AddTags => add_tags(),
        AppTool::RemoveTags => remove_tags(),
        AppTool::PinNote => pin_note(),
        AppTool::UnpinNote => unpin_note(),
        AppTool::AddAttachment => add_attachment(),
        AppTool::ViewedNote => viewed_note(),
        AppTool::ShowNote => show_note(),
    }
}

/// L'outil tel que `tools/list` le donne à Claude.
pub(super) fn tool_description(tool: AppTool) -> Value {
    let (description, input_schema) = described(tool);
    json!({ "name": tool.name(), "description": description, "inputSchema": input_schema })
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Le schéma de l'entrée de l'outil, vérifié : un objet, chaque champ décrit, chaque champ
    /// exigé connu.
    fn checked_schema(tool: AppTool) -> Value {
        let described = tool_description(tool);
        assert_eq!(described["name"], tool.name());
        assert!(!described["description"].as_str().unwrap().is_empty());
        let schema = described["inputSchema"].clone();
        assert_eq!(schema["type"], "object");
        schema
    }

    #[test]
    fn each_tool_is_described_by_its_name_and_an_object_schema() {
        for tool in AppTool::ALL {
            let schema = checked_schema(tool);
            let properties = schema["properties"].as_object().unwrap();
            let unknown = schema["required"]
                .as_array()
                .unwrap()
                .iter()
                .filter(|field| !properties.contains_key(field.as_str().unwrap()))
                .count();
            assert_eq!(unknown, 0, "{tool:?}");
            let kinds: Vec<_> = properties
                .iter()
                .map(|(name, property)| (name == "tags", property["type"].as_str().unwrap()))
                .collect();
            assert!(
                kinds
                    .iter()
                    .all(|(tags, kind)| *kind == if *tags { "array" } else { "string" })
            );
            assert!(
                properties
                    .values()
                    .all(|p| !p["description"].as_str().unwrap().is_empty())
            );
        }
    }

    #[test]
    fn each_tool_requires_what_it_cannot_work_without() {
        let path: &[&str] = &["path"];
        let expected: [(AppTool, &[&str]); 19] = [
            (AppTool::SearchNotes, &[]),
            (AppTool::ListTags, &[]),
            (AppTool::LinkingNotes, path),
            (AppTool::ListTemplates, &[]),
            (AppTool::ListVersions, path),
            (AppTool::ReadVersion, &["path", "version"]),
            (AppTool::CreateNote, &["title"]),
            (AppTool::CreateNoteFromTemplate, &["template", "title"]),
            (AppTool::TrashNote, path),
            (AppTool::RenameNote, &["path", "title"]),
            (AppTool::MoveNote, &["path", "folder"]),
            (AppTool::RestoreVersion, &["path", "version"]),
            (AppTool::AddTags, &["path", "tags"]),
            (AppTool::RemoveTags, &["path", "tags"]),
            (AppTool::PinNote, path),
            (AppTool::UnpinNote, path),
            (AppTool::AddAttachment, &["path", "file"]),
            (AppTool::ViewedNote, &[]),
            (AppTool::ShowNote, path),
        ];
        for (tool, fields) in expected {
            assert_eq!(checked_schema(tool)["required"], json!(fields), "{tool:?}");
        }
    }

    #[test]
    fn the_search_takes_words_tag_folder_and_content_type() {
        let schema = tool_description(AppTool::SearchNotes)["inputSchema"].clone();
        let mut fields: Vec<_> = schema["properties"]
            .as_object()
            .unwrap()
            .keys()
            .cloned()
            .collect();
        fields.sort();
        assert_eq!(fields, ["content_type", "folder", "query", "tag"]);
    }
}
