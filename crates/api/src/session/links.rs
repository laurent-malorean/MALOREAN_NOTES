//! Les liens entre notes de l'espace de travail ouvert, vus depuis l'interface.

use application::use_cases::{LinkChoices, NoteLinks};
use domain::NotePath;

use super::Session;
use crate::{ApiError, LinkResolutionItem, LinkableItem, LinkingNoteItem};

impl Session {
    /// Tout ce qu'un lien peut désigner, le plus récemment modifié en premier, chacun avec le
    /// lien à écrire pour le désigner.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; espace de travail illisible, aucun
    /// espace de travail ouvert.
    pub fn list_linkable(&self) -> Result<Vec<LinkableItem>, ApiError> {
        let index = self.index()?;
        Ok(LinkChoices::new(&*index)
            .contents()?
            .into_iter()
            .map(LinkableItem::from)
            .collect())
    }

    /// Ce que désigne chacune des cibles de liens `targets` (`titre`, `nom.canvas`,
    /// `Dossier/titre`), dans le même ordre.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; espace de travail illisible, aucun
    /// espace de travail ouvert.
    pub fn resolve_links(&self, targets: &[String]) -> Result<Vec<LinkResolutionItem>, ApiError> {
        let index = self.index()?;
        Ok(LinkChoices::new(&*index)
            .resolve(targets)?
            .into_iter()
            .map(LinkResolutionItem::from)
            .collect())
    }

    /// Les liens entrants de la note reçue de l'interface, la plus récente en premier.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué ; chemin invalide, note absente,
    /// espace de travail illisible, aucun espace de travail ouvert.
    pub fn list_backlinks(&self, path: &str) -> Result<Vec<LinkingNoteItem>, ApiError> {
        let store = self.store()?;
        let notes = NoteLinks::new(&*store).backlinks(&NotePath::parse(path)?)?;
        Ok(notes
            .into_iter()
            .map(|note| {
                let of_crm = note.content_type.crm_kind().is_some();
                LinkingNoteItem {
                    folder: note.path.folder().to_path(),
                    path: note.path.to_path(),
                    title: note.title,
                    content_type: of_crm.then(|| note.content_type.into()),
                    crm: note.container.as_ref().map(NotePath::to_path),
                }
            })
            .collect())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use application::testing::{FakeOpener, FakePreferences, FixedClock, InMemoryNoteStore};

    use super::*;
    use crate::ContentTypeItem;

    fn opened(notes: &[(&str, &str)]) -> Session {
        let opener = FakeOpener::new(Arc::new(InMemoryNoteStore::with_notes(notes)));
        let session = Session::new(
            Arc::new(opener),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        session.add_workspace("Notes", "/Users/moi/Notes").unwrap();
        session
    }

    fn targets(texts: &[&str]) -> Vec<String> {
        texts.iter().map(|text| (*text).to_owned()).collect()
    }

    #[test]
    fn each_link_leads_to_a_path_to_several_or_to_none() {
        let session = opened(&[
            ("Cuisine/crepes.md", "# Crêpes"),
            ("a.md", "# Courses"),
            ("b.md", "# Courses"),
            ("Plan.canvas", "{}"),
        ]);
        let resolved = session
            .resolve_links(&targets(&["crepes", "Courses", "Galettes", "Plan.canvas"]))
            .unwrap();
        assert_eq!(resolved.len(), 4);
        assert_eq!(
            resolved[0],
            LinkResolutionItem::Found {
                path: "Cuisine/crepes.md".into()
            }
        );
        assert!(
            matches!(&resolved[1], LinkResolutionItem::Ambiguous { paths } if paths.len() == 2)
        );
        assert_eq!(resolved[2], LinkResolutionItem::Missing);
        assert_eq!(
            resolved[3],
            LinkResolutionItem::Found {
                path: "Plan.canvas".into()
            }
        );
    }

    #[test]
    fn everything_a_link_can_designate_comes_with_the_link_to_write() {
        let session = opened(&[
            ("Cuisine/crepes.md", "# Crêpes"),
            ("Plan du projet.canvas", "{}"),
        ]);
        let mut linkable = session.list_linkable().unwrap();
        linkable.sort_by(|a, b| a.path.cmp(&b.path));
        assert_eq!(
            linkable,
            [
                LinkableItem {
                    path: "Cuisine/crepes.md".into(),
                    title: "Crêpes".into(),
                    folder: "Cuisine".into(),
                    content_type: ContentTypeItem::Note,
                    link: "Crêpes".into(),
                },
                LinkableItem {
                    path: "Plan du projet.canvas".into(),
                    title: "Plan du projet".into(),
                    folder: String::new(),
                    content_type: ContentTypeItem::Canvas,
                    link: "Plan du projet.canvas".into(),
                },
            ]
        );
    }

    #[test]
    fn backlinks_come_with_their_title_and_folder() {
        let session = opened(&[
            ("courses.md", "# Courses"),
            ("Travail/lundi.md", "# Lundi\nvoir [[Courses]]"),
        ]);
        assert_eq!(
            session.list_backlinks("courses.md").unwrap(),
            [LinkingNoteItem {
                path: "Travail/lundi.md".into(),
                title: "Lundi".into(),
                folder: "Travail".into(),
                content_type: None,
                crm: None,
            }]
        );
    }

    #[test]
    fn the_cards_of_a_crm_that_link_a_note_come_with_their_type_and_their_crm() {
        let session = opened(&[
            ("plan.md", "# Plan"),
            (
                "c/actions/2026-11-24-devis.md",
                "---\ntype: crm-action\nnotes: ['[[Plan]]']\n---\n# Devis",
            ),
            (
                "c/personnes/jean.md",
                "---\ntype: crm-personne\n---\n# Jean\n\nVoir [[Plan]].",
            ),
        ]);
        let mut linking = session.list_backlinks("plan.md").unwrap();
        linking.sort_by(|a, b| a.path.cmp(&b.path));
        assert_eq!(
            linking,
            [
                LinkingNoteItem {
                    path: "c/actions/2026-11-24-devis.md".into(),
                    title: "Devis".into(),
                    folder: "c/actions".into(),
                    content_type: Some(ContentTypeItem::CrmAction),
                    crm: Some("c.md".into()),
                },
                LinkingNoteItem {
                    path: "c/personnes/jean.md".into(),
                    title: "Jean".into(),
                    folder: "c/personnes".into(),
                    content_type: Some(ContentTypeItem::CrmPerson),
                    crm: Some("c.md".into()),
                },
            ]
        );
    }

    #[test]
    fn invalid_paths_and_closed_workspaces_are_refused() {
        let session = opened(&[]);
        assert!(session.list_backlinks("../secret.md").is_err());
        let closed = Session::new(
            Arc::new(FakeOpener::new(Arc::new(
                InMemoryNoteStore::with_notes(&[]),
            ))),
            Arc::new(FakePreferences::default()),
            Arc::new(FixedClock::default()),
        );
        assert!(closed.resolve_links(&targets(&["x"])).is_err());
        assert!(closed.list_linkable().is_err());
        assert!(closed.list_backlinks("a.md").is_err());
    }
}
