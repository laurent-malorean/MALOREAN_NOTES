//! Canvas (fiche 0052) : en créer un, le lire, l'enregistrer sans écraser ce qui a changé ailleurs.

use domain::canvas::Canvas;
use domain::{FileName, Folder, NotePath};

use crate::{AppError, NoteStore};

/// Un nouveau canvas vide, qui n'écrase aucun fichier.
#[derive(Debug)]
pub struct CreateCanvas<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> CreateCanvas<'a> {
    /// Le cas d'usage, branché sur l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le chemin du canvas nommé `title` créé dans `folder`, sous le nom tiré de ce titre.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si le dossier ne peut pas être lu ou écrit.
    pub fn execute(&self, folder: &Folder, title: &str) -> Result<NotePath, AppError> {
        let existing = self.store.names(folder)?;
        let name = FileName::canvas_from_title(title)
            .deduplicated(|candidate| existing.contains(candidate));
        let path = NotePath::new(folder.clone(), name);
        self.store.write(&path, &Canvas::default().to_text())?;
        Ok(path)
    }
}

/// Le canvas d'un fichier, avec le texte exact d'où il vient.
#[derive(Debug)]
pub struct ReadCanvas<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> ReadCanvas<'a> {
    /// Le cas d'usage, branché sur le stockage de l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Le canvas du fichier `path` (les côtés absents des flèches sont déduits) et son texte.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACanvas`] si le fichier n'est pas un `.canvas` ; [`AppError::InvalidCanvas`]
    /// si son contenu n'est pas un canvas valide ; [`AppError::NoteNotFound`] s'il n'existe pas ;
    /// [`AppError::StorageUnavailable`] si le stockage ne répond pas.
    pub fn execute(&self, path: &NotePath) -> Result<(Canvas, String), AppError> {
        if !path.name().is_canvas() {
            return Err(AppError::NotACanvas);
        }
        let text = self.store.read(path)?.content;
        let canvas = Canvas::parse(&text)?.with_deduced_sides();
        Ok((canvas, text))
    }
}

/// Ce que l'enregistrement rend : le canvas tel qu'il est maintenant dans le fichier et son texte.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct SavedCanvas {
    /// Le canvas enregistré, fusionné si le fichier avait changé.
    pub canvas: Canvas,
    /// Le texte du fichier après l'enregistrement.
    pub text: String,
}

/// L'enregistrement d'un canvas.
#[derive(Debug)]
pub struct SaveCanvas<'a> {
    store: &'a dyn NoteStore,
}

impl<'a> SaveCanvas<'a> {
    /// Le cas d'usage, branché sur le stockage de l'espace de travail ouvert.
    #[must_use]
    pub fn new(store: &'a dyn NoteStore) -> Self {
        Self { store }
    }

    /// Enregistre `mine` dans le fichier `path`, fait à partir du texte `base_text` que l'écran avait
    /// lu. Si le fichier n'est plus tel qu'il l'était, ses changements sont fusionnés avec ceux de
    /// l'écran ([`Canvas::merged`]) et le résultat est écrit. Rien n'est écrit si le texte ne change
    /// pas.
    ///
    /// # Errors
    ///
    /// [`AppError::NotACanvas`] si le fichier n'est pas un `.canvas` ; [`AppError::InvalidCanvas`]
    /// si le fichier d'aujourd'hui ou celui de départ n'est pas valide (rien n'est écrit) ;
    /// [`AppError::NoteNotFound`] s'il n'existe plus ; [`AppError::StorageUnavailable`] si le
    /// stockage ne répond pas.
    pub fn execute(
        &self,
        path: &NotePath,
        base_text: &str,
        mine: &Canvas,
    ) -> Result<SavedCanvas, AppError> {
        if !path.name().is_canvas() {
            return Err(AppError::NotACanvas);
        }
        let current = self.store.read(path)?.content;
        let canvas = if current == base_text {
            mine.clone()
        } else {
            Canvas::merged(&Canvas::parse(base_text)?, mine, &Canvas::parse(&current)?)
        };
        let text = canvas.to_text();
        if text != current {
            self.store.write(path, &text)?;
        }
        Ok(SavedCanvas {
            canvas: canvas.with_deduced_sides(),
            text,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    const EMPTY: &str = "{\n\t\"nodes\":[],\n\t\"edges\":[]\n}";

    fn card(id: &str, x: i64) -> String {
        format!(r#"{{"id":"{id}","type":"text","text":"","x":{x},"y":0,"width":1,"height":1}}"#)
    }

    fn canvas_with(cards: &[(&str, i64)]) -> Canvas {
        let list: Vec<String> = cards.iter().map(|(id, x)| card(id, *x)).collect();
        Canvas::parse(&format!(r#"{{"nodes":[{}]}}"#, list.join(","))).unwrap()
    }

    #[test]
    fn a_canvas_is_created_empty_under_the_name_of_its_title() {
        let store = InMemoryNoteStore::with_notes(&[("Idees/projet.canvas", "{}")]);
        let created = CreateCanvas::new(&store)
            .execute(&Folder::parse("Idees").unwrap(), "Projet")
            .unwrap();
        assert_eq!(created, path("Idees/projet-2.canvas"));
        assert_eq!(store.read(&created).unwrap().content, EMPTY);
    }

    #[test]
    fn a_canvas_is_read_with_its_text_and_its_deduced_sides() {
        let text = format!(
            r#"{{"nodes":[{},{}],"edges":[{{"id":"e","fromNode":"a","toNode":"b"}}]}}"#,
            card("a", 0),
            card("b", 100)
        );
        let store = InMemoryNoteStore::with_notes(&[("p.canvas", &text)]);
        let (canvas, read) = ReadCanvas::new(&store).execute(&path("p.canvas")).unwrap();
        assert_eq!(read, text);
        assert!(canvas.arrows[0].from_side.is_some());
    }

    #[test]
    fn a_file_that_is_not_a_valid_canvas_is_not_read() {
        let store = InMemoryNoteStore::with_notes(&[("n.md", "{}"), ("bad.canvas", "pas du json")]);
        let read = ReadCanvas::new(&store);
        assert!(matches!(
            read.execute(&path("n.md")),
            Err(AppError::NotACanvas)
        ));
        assert!(matches!(
            read.execute(&path("bad.canvas")),
            Err(AppError::InvalidCanvas(_))
        ));
        assert!(matches!(
            read.execute(&path("absent.canvas")),
            Err(AppError::NoteNotFound(_))
        ));
    }

    #[test]
    fn a_file_that_is_not_a_valid_canvas_is_never_written() {
        let store = InMemoryNoteStore::with_notes(&[("n.md", "{}"), ("bad.canvas", "pas du json")]);
        let save = SaveCanvas::new(&store);
        assert!(matches!(
            save.execute(&path("n.md"), "{}", &Canvas::default()),
            Err(AppError::NotACanvas)
        ));
        assert!(matches!(
            save.execute(&path("bad.canvas"), "{}", &Canvas::default()),
            Err(AppError::InvalidCanvas(_))
        ));
        assert_eq!(
            store.read(&path("bad.canvas")).unwrap().content,
            "pas du json"
        );
    }

    #[test]
    fn a_canvas_is_saved_as_obsidian_writes_it_when_the_file_has_not_changed() {
        let store = InMemoryNoteStore::with_notes(&[("p.canvas", EMPTY)]);
        let mine = canvas_with(&[("a", 3)]);
        let saved = SaveCanvas::new(&store)
            .execute(&path("p.canvas"), EMPTY, &mine)
            .unwrap();
        assert_eq!(saved.text, mine.to_text());
        assert_eq!(
            store.read(&path("p.canvas")).unwrap().content,
            mine.to_text()
        );
        assert_eq!(saved.canvas.cards.len(), 1);
    }

    #[test]
    fn a_save_that_changes_nothing_writes_nothing() {
        let text = canvas_with(&[("a", 3)]).to_text();
        let store = InMemoryNoteStore::with_notes(&[("p.canvas", &text)]);
        let before = store.read(&path("p.canvas")).unwrap();
        SaveCanvas::new(&store)
            .execute(&path("p.canvas"), &text, &canvas_with(&[("a", 3)]))
            .unwrap();
        assert_eq!(store.read(&path("p.canvas")).unwrap(), before);
    }

    #[test]
    fn what_changed_in_the_file_meanwhile_is_merged_with_the_save() {
        let base = canvas_with(&[("a", 0)]).to_text();
        let elsewhere = canvas_with(&[("a", 0), ("t", 9)]).to_text();
        let store = InMemoryNoteStore::with_notes(&[("p.canvas", &elsewhere)]);
        let mine = canvas_with(&[("a", 5)]);
        let saved = SaveCanvas::new(&store)
            .execute(&path("p.canvas"), &base, &mine)
            .unwrap();
        let ids: Vec<(&str, i64)> = saved
            .canvas
            .cards
            .iter()
            .map(|c| (c.id.as_str(), c.x))
            .collect();
        assert_eq!(ids, [("a", 5), ("t", 9)]);
        assert_eq!(store.read(&path("p.canvas")).unwrap().content, saved.text);
    }
}
