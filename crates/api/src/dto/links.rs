//! Les liens vus de l'interface : ce qu'on peut lier, et ce que désigne un lien écrit.

use application::use_cases::LinkableContent;
use domain::links::Resolution;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

use crate::ContentTypeItem;

/// Un contenu qu'un lien peut désigner, avec le lien à écrire pour le désigner.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct LinkableItem {
    /// Le chemin du contenu depuis l'espace de travail : `dossier/nom.md`.
    pub path: String,
    /// Le titre affiché.
    pub title: String,
    /// Le dossier du contenu : `""` pour la racine.
    pub folder: String,
    /// Son type de contenu, montré par une icône.
    pub content_type: ContentTypeItem,
    /// Ce qu'on écrit entre les crochets : son titre, `nom.canvas` pour un canvas, précédé de son
    /// dossier quand un autre contenu porte le même nom.
    pub link: String,
}

impl From<LinkableContent> for LinkableItem {
    fn from(content: LinkableContent) -> Self {
        Self {
            folder: content.path.folder().to_path(),
            path: content.path.to_path(),
            title: content.title,
            content_type: content.content_type.into(),
            link: content.link,
        }
    }
}

/// Ce que désigne un lien écrit.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(tag = "kind", rename_all = "camelCase")]
#[ts(export)]
pub enum LinkResolutionItem {
    /// Un seul contenu porte ce nom : son chemin.
    Found {
        /// Le chemin du contenu.
        path: String,
    },
    /// Plusieurs contenus portent ce nom : leurs chemins.
    Ambiguous {
        /// Les chemins des contenus.
        paths: Vec<String>,
    },
    /// Aucun contenu ne porte ce nom.
    Missing,
}

impl From<Resolution> for LinkResolutionItem {
    fn from(resolution: Resolution) -> Self {
        match resolution {
            Resolution::Found(path) => Self::Found {
                path: path.to_path(),
            },
            Resolution::Ambiguous(paths) => Self::Ambiguous {
                paths: paths.iter().map(domain::NotePath::to_path).collect(),
            },
            Resolution::Missing => Self::Missing,
        }
    }
}
