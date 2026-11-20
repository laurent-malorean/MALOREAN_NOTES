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

/// L'entrée d'un outil : ses champs, et ceux qu'il exige.
fn input(properties: Value, required: &[&str]) -> Value {
    json!({ "type": "object", "properties": properties, "required": required })
}

/// Ce que fait l'outil, et l'entrée qu'il attend.
fn described(tool: AppTool) -> (&'static str, Value) {
    match tool {
        AppTool::SearchNotes => (
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
        ),
        AppTool::ListTags => (
            "Liste les étiquettes de l'espace de travail, chacune avec son nombre de notes.",
            input(json!({}), &[]),
        ),
        AppTool::LinkingNotes => (
            "Les liens entrants d'une note : les notes dont un lien `[[titre]]` la désigne.",
            input(json!({ "path": note_path() }), &["path"]),
        ),
        AppTool::ListTemplates => (
            "Les noms des modèles de note (les notes du dossier des modèles choisi par \
             l'utilisateur), sans leur texte.",
            input(json!({}), &[]),
        ),
        AppTool::ListVersions => (
            "L'historique des versions d'une note : chaque version gardée par MALOREAN Notes, \
             la plus récente d'abord, avec son identifiant et sa date.",
            input(json!({ "path": note_path() }), &["path"]),
        ),
        AppTool::ReadVersion => (
            "Le texte d'une version d'une note, désignée par l'identifiant que donne \
             `list_versions` (`2026-11-18 14h30`).",
            input(
                json!({
                    "path": note_path(),
                    "version": text("L'identifiant de la version : `2026-11-18 14h30`."),
                }),
                &["path", "version"],
            ),
        ),
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

    #[test]
    fn each_tool_is_described_by_its_name_and_an_object_schema() {
        for tool in AppTool::ALL {
            let described = tool_description(tool);
            assert_eq!(described["name"], tool.name());
            assert!(!described["description"].as_str().unwrap().is_empty());
            let schema = &described["inputSchema"];
            assert_eq!(schema["type"], "object");
            let properties = schema["properties"].as_object().unwrap();
            for required in schema["required"].as_array().unwrap() {
                assert!(properties.contains_key(required.as_str().unwrap()));
            }
            for property in properties.values() {
                assert_eq!(property["type"], "string");
                assert!(!property["description"].as_str().unwrap().is_empty());
            }
        }
    }

    #[test]
    fn each_tool_requires_what_it_cannot_work_without() {
        let required = |tool| tool_description(tool)["inputSchema"]["required"].clone();
        assert_eq!(required(AppTool::SearchNotes), json!([]));
        assert_eq!(required(AppTool::ListTags), json!([]));
        assert_eq!(required(AppTool::LinkingNotes), json!(["path"]));
        assert_eq!(required(AppTool::ListTemplates), json!([]));
        assert_eq!(required(AppTool::ListVersions), json!(["path"]));
        assert_eq!(required(AppTool::ReadVersion), json!(["path", "version"]));
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
