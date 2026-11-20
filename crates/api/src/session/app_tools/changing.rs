//! Les outils de l'application qui créent, changent, rangent ou jettent une note, par les règles
//! de l'application : nom du fichier tiré du titre, en-tête, dossier des pièces jointes, corbeille
//! au lieu d'effacer (fiche 0040). Le garde-fou du web les retient après une lecture du web.

use application::use_cases::{AttachWorkspaceFile, CreateNote, CreateNoteFromTemplate, ListNotes};
use domain::app_tools::AppTool;
use domain::links::same_title;
use domain::tag::{retagged, same_tag, tags, writable_tag};
use domain::title::retitled;
use domain::{Folder, NoteOrder, NotePath};
use serde::Serialize;
use serde_json::{Value, json};

use super::{ToolsTurn, optional, required, written};
use crate::ApiError;
use crate::session::Session;

/// Ce qu'un échec dit à Claude : le message de l'application.
fn said(error: impl Into<ApiError>) -> String {
    error.into().message
}

/// Une note créée, renommée ou rangée : son chemin.
#[derive(Debug, Serialize)]
struct Placed {
    path: String,
}

/// Les étiquettes reçues de Claude, telles que l'application les écrit.
fn tags_given(arguments: &Value) -> Result<Vec<String>, String> {
    let given = arguments["tags"]
        .as_array()
        .filter(|tags| !tags.is_empty())
        .ok_or_else(|| "il manque « tags » : une liste d'étiquettes".to_owned())?;
    given
        .iter()
        .map(|tag| {
            let raw = tag.as_str().unwrap_or_default();
            writable_tag(raw).ok_or_else(|| format!("étiquette invalide : « {raw} »"))
        })
        .collect()
}

impl Session {
    /// Joue un outil qui crée, change, range ou jette une note.
    pub(super) fn call_changing_tool(
        &self,
        turn: &ToolsTurn,
        tool: AppTool,
        arguments: &Value,
    ) -> Result<String, String> {
        match tool {
            AppTool::CreateNote => self.tool_create_note(arguments),
            AppTool::CreateNoteFromTemplate => self.tool_create_from_template(turn, arguments),
            AppTool::TrashNote => {
                let trashed = self.trash_note(required(arguments, "path")?);
                written(&json!({ "trashed": trashed.map_err(|e| e.message)? }))
            }
            AppTool::RenameNote => self.tool_rename_note(arguments),
            AppTool::MoveNote => {
                let path = required(arguments, "path")?;
                let into = arguments["folder"].as_str().unwrap_or_default();
                written(&self.move_note(path, into).map_err(|e| e.message)?)
            }
            AppTool::RestoreVersion => {
                let (path, version) = (
                    required(arguments, "path")?,
                    required(arguments, "version")?,
                );
                let restored = self.restore_version(path, version).map_err(|e| e.message)?;
                written(&json!({ "path": restored.path }))
            }
            AppTool::AddTags => self.tool_change_tags(arguments, true),
            AppTool::RemoveTags => self.tool_change_tags(arguments, false),
            AppTool::PinNote => {
                let pinned = self
                    .pin_note(required(arguments, "path")?)
                    .map_err(|e| e.message)?;
                written(&json!({ "path": pinned.path, "pinned": true }))
            }
            AppTool::UnpinNote => {
                let unpinned = self
                    .unpin_note(required(arguments, "path")?)
                    .map_err(|e| e.message)?;
                written(&json!({ "path": unpinned.path, "pinned": false }))
            }
            AppTool::AddAttachment => self.tool_add_attachment(arguments),
            AppTool::AddEntry => {
                let (path, text) = (required(arguments, "path")?, required(arguments, "text")?);
                let entry = self
                    .add_entry(path, text, optional(arguments, "corrected"))
                    .map_err(|e| e.message)?;
                written(&json!({ "path": path, "entry": entry }))
            }
            _ => unreachable!("un outil qui ne change rien est joué à part"),
        }
    }

    /// Une note neuve, titrée `title`, dans `folder` : son texte `text` sous ce titre.
    pub(super) fn tool_create_note(&self, arguments: &Value) -> Result<String, String> {
        let title = required(arguments, "title")?;
        let folder =
            Folder::parse(optional(arguments, "folder").unwrap_or_default()).map_err(said)?;
        let content = retitled(
            optional(arguments, "text").unwrap_or_default(),
            title.trim(),
        );
        let store = self.store().map_err(|error| error.message)?;
        let created = CreateNote::new(&*store)
            .with_content(&folder, &content)
            .map_err(said)?;
        written(&Placed {
            path: created.to_path(),
        })
    }

    /// Une note tirée du modèle nommé `template` (titre ou nom du fichier, dans le dossier des
    /// modèles du tour), titrée `title`.
    pub(super) fn tool_create_from_template(
        &self,
        turn: &ToolsTurn,
        arguments: &Value,
    ) -> Result<String, String> {
        let (name, title) = (
            required(arguments, "template")?,
            required(arguments, "title")?,
        );
        let folder =
            Folder::parse(optional(arguments, "folder").unwrap_or_default()).map_err(said)?;
        let templates_folder = turn.templates.as_ref().ok_or_else(|| {
            "aucun dossier des modèles n'est choisi : l'utilisateur peut en choisir un dans les \
             réglages de MALOREAN Notes"
                .to_owned()
        })?;
        let index = self.index().map_err(|error| error.message)?;
        let templates = ListNotes::new(&*index)
            .execute(templates_folder, NoteOrder::Title)
            .map_err(said)?;
        let template = templates
            .iter()
            .find(|template| {
                same_title(template.title(), name)
                    || template.path().name().as_str().strip_suffix(".md") == Some(name)
            })
            .ok_or_else(|| format!("aucun modèle « {name} » : voyez list_templates"))?;
        let store = self.store().map_err(|error| error.message)?;
        let created = CreateNoteFromTemplate::new(&*store, &*self.clock)
            .titled(template.path(), &folder, title.trim())
            .map_err(said)?;
        written(&Placed {
            path: created.to_path(),
        })
    }

    /// Change le titre d'une note : son fichier et son dossier de pièces jointes suivent ; les
    /// notes dont un lien visait l'ancien titre sont rendues, à reprendre par Claude.
    pub(super) fn tool_rename_note(&self, arguments: &Value) -> Result<String, String> {
        let (path, title) = (required(arguments, "path")?, required(arguments, "title")?);
        let read = self.read_note(path).map_err(|error| error.message)?;
        let linking = self.list_backlinks(path).map_err(|error| error.message)?;
        let saved = self
            .save_note(
                path,
                &retitled(&read.content, title.trim()),
                &read.fingerprint,
            )
            .map_err(|error| error.message)?;
        written(&json!({
            "path": saved.path,
            "linking_notes_to_update": linking,
        }))
    }

    /// Ajoute ou retire des étiquettes dans l'en-tête de la note, sans toucher au reste.
    pub(super) fn tool_change_tags(
        &self,
        arguments: &Value,
        adding: bool,
    ) -> Result<String, String> {
        let path = required(arguments, "path")?;
        let given = tags_given(arguments)?;
        let read = self.read_note(path).map_err(|error| error.message)?;
        let mut kept = tags(&read.content);
        if adding {
            for tag in given {
                if !kept.iter().any(|known| same_tag(known, &tag)) {
                    kept.push(tag);
                }
            }
        } else {
            kept.retain(|known| !given.iter().any(|tag| same_tag(known, tag)));
        }
        let content = retagged(&read.content, &kept);
        if content != read.content {
            self.save_note(path, &content, &read.fingerprint)
                .map_err(|error| error.message)?;
        }
        written(&json!({ "path": path, "tags": kept }))
    }

    /// Copie un fichier de l'espace de travail (image ou PDF) dans le dossier de pièces jointes
    /// de la note et ajoute son lien à la fin de la note.
    pub(super) fn tool_add_attachment(&self, arguments: &Value) -> Result<String, String> {
        let (path, file) = (required(arguments, "path")?, required(arguments, "file")?);
        let note = NotePath::parse(path).map_err(said)?;
        let (folder, name) = file.rsplit_once('/').unwrap_or(("", file));
        let folder = Folder::parse(folder).map_err(said)?;
        let store = self.store().map_err(|error| error.message)?;
        let link = AttachWorkspaceFile::new(&*store, &*self.clock)
            .execute(&note, &folder, name)
            .map_err(said)?;
        written(&json!({ "path": path, "link": link }))
    }
}
