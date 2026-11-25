//! Choisir et suivre un lien sans le saisir : la liste de tout ce qu'un lien peut désigner, et ce
//! que désigne chaque lien écrit.

use domain::links::{LinkIndex, Resolution};
use domain::{ContentType, NotePath};

use super::ListAllNotes;
use crate::{AppError, NoteIndex};

/// Un contenu qu'un lien peut désigner, avec le lien à écrire pour le désigner.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LinkableContent {
    /// Le dossier et le nom de fichier du contenu.
    pub path: NotePath,
    /// Le titre affiché.
    pub title: String,
    /// Son type de contenu, que la liste montre par une icône.
    pub content_type: ContentType,
    /// Ce qu'on écrit entre les crochets : son titre, `nom.canvas` pour un canvas, précédé de son
    /// dossier quand un autre contenu porte le même nom.
    pub link: String,
}

/// Les contenus que les liens peuvent désigner, lus dans l'index de l'espace de travail ouvert.
#[derive(Debug)]
pub struct LinkChoices<'a> {
    index: &'a dyn NoteIndex,
}

impl<'a> LinkChoices<'a> {
    /// Le cas d'usage, branché sur l'index de l'espace de travail ouvert.
    #[must_use]
    pub fn new(index: &'a dyn NoteIndex) -> Self {
        Self { index }
    }

    fn links(&self) -> Result<(LinkIndex, Vec<domain::NoteSummary>), AppError> {
        let notes = ListAllNotes::new(self.index).execute()?;
        let links = LinkIndex::new(
            notes
                .iter()
                .map(|note| (note.path().clone(), note.title().to_owned())),
        );
        Ok((links, notes))
    }

    /// Tout ce qu'un lien peut désigner, le plus récemment modifié en premier.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'index ne répond pas.
    pub fn contents(&self) -> Result<Vec<LinkableContent>, AppError> {
        let (links, notes) = self.links()?;
        Ok(notes
            .into_iter()
            .map(|note| LinkableContent {
                link: links
                    .written(note.path())
                    .unwrap_or_else(|| note.title().to_owned()),
                title: note.title().to_owned(),
                content_type: note.content_type(),
                path: note.path().clone(),
            })
            .collect())
    }

    /// Ce que désigne chacune des cibles de liens `targets`, dans le même ordre.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si l'index ne répond pas.
    pub fn resolve(&self, targets: &[String]) -> Result<Vec<Resolution>, AppError> {
        let (links, _) = self.links()?;
        Ok(targets.iter().map(|target| links.resolve(target)).collect())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{InMemoryNoteStore, indexed};

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    #[test]
    fn every_content_comes_with_its_type_and_the_link_to_write() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "# Agenda"),
            (
                "Idées/carte.md",
                "---\ntype: carte-mentale\n---\n# Ma carte",
            ),
            ("Plan du projet.canvas", "{}"),
        ]);
        let contents = LinkChoices::new(&indexed(&store)).contents().unwrap();
        let mut described: Vec<_> = contents
            .iter()
            .map(|c| {
                (
                    c.path.to_path(),
                    c.title.clone(),
                    c.content_type,
                    c.link.clone(),
                )
            })
            .collect();
        described.sort_by(|a, b| a.0.cmp(&b.0));
        assert_eq!(
            described,
            [
                (
                    "Idées/carte.md".to_owned(),
                    "Ma carte".to_owned(),
                    ContentType::MindMap,
                    "Ma carte".to_owned()
                ),
                (
                    "Plan du projet.canvas".to_owned(),
                    "Plan du projet".to_owned(),
                    ContentType::Canvas,
                    "Plan du projet.canvas".to_owned()
                ),
                (
                    "a.md".to_owned(),
                    "Agenda".to_owned(),
                    ContentType::Note,
                    "Agenda".to_owned()
                ),
            ]
        );
    }

    #[test]
    fn contents_come_most_recent_first_and_twins_carry_their_folder() {
        let store =
            InMemoryNoteStore::with_notes(&[("a.md", "# Courses"), ("Vieux/b.md", "# Courses")]);
        let links: Vec<_> = LinkChoices::new(&indexed(&store))
            .contents()
            .unwrap()
            .into_iter()
            .map(|c| (c.path.to_path(), c.link))
            .collect();
        assert_eq!(
            links,
            [
                ("Vieux/b.md".to_owned(), "Vieux/Courses".to_owned()),
                ("a.md".to_owned(), "/Courses".to_owned()),
            ]
        );
    }

    #[test]
    fn each_target_is_resolved_in_order() {
        let store = InMemoryNoteStore::with_notes(&[
            ("a.md", "# Agenda"),
            ("b.md", "# Courses"),
            ("Vieux/c.md", "# Courses"),
        ]);
        let targets = ["agenda", "Courses", "Absente"].map(str::to_owned);
        assert_eq!(
            LinkChoices::new(&indexed(&store))
                .resolve(&targets)
                .unwrap(),
            [
                Resolution::Found(path("a.md")),
                Resolution::Ambiguous(vec![path("Vieux/c.md"), path("b.md")]),
                Resolution::Missing,
            ]
        );
    }
}
