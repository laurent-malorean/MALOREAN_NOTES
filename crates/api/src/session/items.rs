//! Les lignes que l'interface reçoit pour une note de la liste et pour un résultat de recherche.

use application::use_cases::SearchResult;
use domain::NotePath;
use domain::NoteSummary;
use domain::search::ExcerptPart;

use crate::{ExcerptPartItem, NoteListItem, SearchResultItem};

/// Une ligne de la liste des notes.
pub(super) fn list_item(note: &NoteSummary) -> NoteListItem {
    NoteListItem {
        path: note.path().to_path(),
        title: note.title().to_owned(),
        modified: note.modified().0,
        pinned: note.is_pinned(),
        tags: note.tags().to_vec(),
    }
}

pub(super) fn search_result_item(result: SearchResult) -> SearchResultItem {
    let excerpt = result
        .excerpt
        .parts()
        .iter()
        .map(|part| match part {
            ExcerptPart::Text(text) => ExcerptPartItem {
                text: text.clone(),
                matched: false,
            },
            ExcerptPart::Match(text) => ExcerptPartItem {
                text: text.clone(),
                matched: true,
            },
        })
        .collect();
    SearchResultItem {
        path: result.path.to_path(),
        title: result.title,
        folder: result.path.folder().to_path(),
        content_type: result.content_type.into(),
        container: result.container.as_ref().map(NotePath::to_path),
        container_title: result.container_title,
        node: result.node,
        modified: result.modified.0,
        excerpt,
    }
}
