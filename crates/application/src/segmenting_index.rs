//! L'index de mots qui tient l'index de sens à jour : tout chemin qui change l'un change l'autre
//! (écriture, enregistrement, création, déplacement, corbeille, restauration, relevés à
//! l'ouverture, changements venus de la surveillance, « Reconstruire l'index »). Seuls les
//! segments suivent : le calcul des vecteurs, lui, se fait à part (`ComputeMeaning`).

use std::sync::Arc;

use domain::segments::{Segment, segments};
use domain::title::displayed_title_of_note;
use domain::{ContentType, Folder, NotePath, NoteSummary};

use crate::{IndexedNote, MeaningIndex, MeaningIndexError, NoteIndex, NoteStamp, StoreError};
use domain::search::SearchQuery;

/// Les segments de la note `note` de contenu `content` : son titre affiché sert de titre de
/// note. Un cahier de recherche est segmenté comme une note (ses entrées n'ont pas de segments).
#[must_use]
pub fn note_segments(note: &NotePath, content: &str) -> Vec<Segment> {
    segments(&displayed_title_of_note(content, note.name()), content)
}

fn unavailable(error: &MeaningIndexError) -> StoreError {
    StoreError::Unavailable(error.to_string())
}

/// L'index de mots `words`, dont chaque changement range aussi les segments dans `meaning`.
#[derive(Debug, Clone)]
pub struct SegmentingIndex {
    words: Arc<dyn NoteIndex>,
    meaning: Arc<dyn MeaningIndex>,
}

impl SegmentingIndex {
    /// L'index de mots `words`, suivi par l'index de sens `meaning`.
    #[must_use]
    pub fn new(words: Arc<dyn NoteIndex>, meaning: Arc<dyn MeaningIndex>) -> Self {
        Self { words, meaning }
    }
}

impl NoteIndex for SegmentingIndex {
    fn stamps(&self) -> Result<Vec<NoteStamp>, StoreError> {
        self.words.stamps()
    }

    fn put(&self, notes: &[IndexedNote]) -> Result<(), StoreError> {
        self.words.put(notes)?;
        for note in notes {
            let path = &note.stamp.path;
            self.meaning
                .replace_segments(path, &note_segments(path, &note.content))
                .map_err(|e| unavailable(&e))?;
        }
        Ok(())
    }

    fn remove(&self, notes: &[NotePath]) -> Result<(), StoreError> {
        self.words.remove(notes)?;
        for note in notes {
            self.meaning
                .remove_note(note)
                .map_err(|e| unavailable(&e))?;
        }
        Ok(())
    }

    fn clear(&self) -> Result<(), StoreError> {
        self.words.clear()?;
        self.meaning.clear().map_err(|e| unavailable(&e))
    }

    fn content(&self, note: &NotePath) -> Result<Option<String>, StoreError> {
        self.words.content(note)
    }

    fn notes_in(&self, folder: &Folder) -> Result<Vec<NoteSummary>, StoreError> {
        self.words.notes_in(folder)
    }

    fn all_notes(&self) -> Result<Vec<NoteSummary>, StoreError> {
        self.words.all_notes()
    }

    fn tagged(&self, tag: &str) -> Result<Vec<NoteSummary>, StoreError> {
        self.words.tagged(tag)
    }

    fn search(
        &self,
        query: &SearchQuery,
        types: &[ContentType],
    ) -> Result<Vec<(NoteSummary, String)>, StoreError> {
        self.words.search(query, types)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::InMemoryNoteStore;
    use crate::use_cases::{RebuildIndex, RefreshIndex};
    use crate::{IndexedStore, MemoryIndex, MemoryMeaningIndex, NoteStore};
    use domain::{FileName, MeaningModel, MeaningVector};

    use crate::{PendingSegment, SegmentId};

    fn path(text: &str) -> NotePath {
        NotePath::parse(text).unwrap()
    }

    fn folder(text: &str) -> Folder {
        Folder::parse(text).unwrap()
    }

    struct Workspace {
        files: Arc<InMemoryNoteStore>,
        words: Arc<MemoryIndex>,
        meaning: Arc<MemoryMeaningIndex>,
        index: Arc<SegmentingIndex>,
        store: IndexedStore,
    }

    fn workspace(notes: &[(&str, &str)]) -> Workspace {
        let files = Arc::new(InMemoryNoteStore::with_notes(notes));
        let words = Arc::new(MemoryIndex::default());
        let meaning = Arc::new(MemoryMeaningIndex::default());
        let index = Arc::new(SegmentingIndex::new(words.clone(), meaning.clone()));
        RefreshIndex::new(&*files, &*index).execute().unwrap();
        let store = IndexedStore::new(files.clone(), index.clone());
        Workspace {
            files,
            words,
            meaning,
            index,
            store,
        }
    }

    impl Workspace {
        /// L'index de sens a, pour chaque note de l'index de mots, exactement ses segments, et
        /// rien d'autre.
        fn assert_in_step(&self) {
            let mut known = Vec::new();
            for summary in self.words.all_notes().unwrap() {
                let content = self.words.content(summary.path()).unwrap().unwrap();
                let expected = segments(summary.title(), &content);
                assert_eq!(
                    self.meaning.segments_of(summary.path()),
                    expected,
                    "{}",
                    summary.path().to_path()
                );
                if !expected.is_empty() {
                    known.push(summary.path().clone());
                }
            }
            known.sort();
            assert_eq!(self.meaning.notes(), known);
        }
    }

    #[test]
    fn the_title_of_a_note_for_its_segments_is_its_displayed_title() {
        let titled = note_segments(&path("a.md"), "# Mon titre\n\ntexte");
        assert_eq!(titled[0].heading(), "Mon titre");
        let untitled = note_segments(&path("tarte-aux-pommes.md"), "texte");
        assert_eq!(untitled[0].heading(), "tarte-aux-pommes");
        let new = note_segments(&path("sans-titre.md"), "texte");
        assert_eq!(new[0].heading(), "Sans titre");
    }

    #[test]
    fn opening_a_workspace_segments_every_note() {
        let workspace = workspace(&[
            ("a.md", "# A\n\n## Un\n\ntexte"),
            ("T/b.md", "# B\n\ntexte"),
            ("T/U/c.md", "pas de titre"),
        ]);
        workspace.assert_in_step();
        assert_eq!(workspace.meaning.notes().len(), 3);
    }

    #[test]
    fn writing_a_note_updates_its_segments() {
        let workspace = workspace(&[("a.md", "# A\n\ntexte")]);
        workspace.store.write(&path("b.md"), "# B\n\nneuf").unwrap();
        workspace.assert_in_step();
        workspace
            .store
            .write(&path("a.md"), "# Alpha\n\n## Deux\n\nautre")
            .unwrap();
        workspace.assert_in_step();
        workspace
            .store
            .write_keeping_date(&path("a.md"), "# Alpha\n\n## Trois\n\nencore")
            .unwrap();
        workspace.assert_in_step();
        assert_eq!(
            workspace.meaning.segments_of(&path("a.md"))[0].heading(),
            "Alpha > Trois"
        );
    }

    #[test]
    fn an_unchanged_segment_keeps_its_vector_when_the_note_is_written() {
        let workspace = workspace(&[("a.md", "# A\n\n## Un\n\ntexte")]);
        let waiting = workspace
            .meaning
            .without_vector(MeaningModel::Small, 10)
            .unwrap();
        let mut values = vec![0.0; MeaningModel::Small.dimensions()];
        values[0] = 1.0;
        let vector = MeaningVector::new(values).unwrap();
        let given: Vec<(SegmentId, MeaningVector)> = waiting
            .iter()
            .map(|PendingSegment { id, .. }| (*id, vector.clone()))
            .collect();
        workspace
            .meaning
            .put_vectors(MeaningModel::Small, &given)
            .unwrap();
        workspace
            .store
            .write(&path("a.md"), "# A\n\n## Un\n\ntexte")
            .unwrap();
        assert!(
            workspace
                .meaning
                .without_vector(MeaningModel::Small, 10)
                .unwrap()
                .is_empty()
        );
    }

    #[test]
    fn moved_and_renamed_notes_and_folders_keep_their_segments() {
        let workspace = workspace(&[
            ("a.md", "# A\n\nun"),
            ("T/b.md", "# B\n\ndeux"),
            ("T/U/c.md", "# C\n\ntrois"),
        ]);
        workspace
            .store
            .move_note(&path("a.md"), &path("T/a.md"))
            .unwrap();
        workspace.assert_in_step();
        workspace
            .store
            .rename(&path("T/b.md"), &FileName::parse("d.md").unwrap())
            .unwrap();
        workspace.assert_in_step();
        workspace
            .store
            .move_folder(&folder("T"), &folder("P"))
            .unwrap();
        workspace.assert_in_step();
        assert_eq!(
            workspace.meaning.notes(),
            [path("P/a.md"), path("P/d.md"), path("P/U/c.md")]
        );
    }

    #[test]
    fn trashed_and_restored_notes_and_folders_keep_their_segments() {
        let workspace = workspace(&[
            ("a.md", "# A\n\nun"),
            ("T/b.md", "# B\n\ndeux"),
            ("c.md", "# C\n\ntrois"),
        ]);
        workspace
            .store
            .trash_note(&path("a.md"), &path("a.md"))
            .unwrap();
        workspace.assert_in_step();
        workspace
            .store
            .trash_folder(&folder("T"), &folder("T"))
            .unwrap();
        workspace.assert_in_step();
        assert_eq!(workspace.meaning.notes(), [path("c.md")]);
        workspace
            .store
            .restore_note(&path("a.md"), &path("a.md"))
            .unwrap();
        workspace.assert_in_step();
        workspace
            .store
            .restore_folder(&folder("T"), &folder("T"))
            .unwrap();
        workspace.assert_in_step();
        assert_eq!(workspace.meaning.notes().len(), 3);
    }

    #[test]
    fn a_refresh_after_an_outside_change_updates_the_segments() {
        let workspace = workspace(&[("a.md", "# A\n\nun"), ("b.md", "# B\n\ndeux")]);
        workspace
            .files
            .write(&path("a.md"), "# A\n\nautre texte")
            .unwrap();
        workspace
            .files
            .trash_note(&path("b.md"), &path("b.md"))
            .unwrap();
        workspace.files.write(&path("c.md"), "# C\n\nneuf").unwrap();
        RefreshIndex::new(&*workspace.files, &*workspace.index)
            .execute()
            .unwrap();
        workspace.assert_in_step();
        assert_eq!(workspace.meaning.notes(), [path("a.md"), path("c.md")]);
    }

    #[test]
    fn rebuilding_the_index_rebuilds_the_segments() {
        let workspace = workspace(&[("a.md", "# A\n\nun"), ("b.md", "# B\n\ndeux")]);
        workspace
            .files
            .trash_note(&path("b.md"), &path("b.md"))
            .unwrap();
        RebuildIndex::new(&*workspace.files, &*workspace.index)
            .execute()
            .unwrap();
        workspace.assert_in_step();
        assert_eq!(workspace.meaning.notes(), [path("a.md")]);
    }

    #[test]
    fn a_research_notebook_is_segmented_as_a_note_without_its_entries() {
        let notebook = "---\ntype: cahier-de-recherche\n---\n# Levures\n## 2026\n### Novembre\n\
                        #### Lundi 16\n- 09:42 - du pain\n- 10:00 - du levain";
        let workspace = workspace(&[("labo.md", notebook)]);
        workspace.assert_in_step();
        let kept = workspace.meaning.segments_of(&path("labo.md"));
        assert!(!kept.is_empty());
        assert!(kept.iter().all(|s| s.heading().starts_with("Levures")));
        assert_eq!(workspace.meaning.notes(), [path("labo.md")]);
    }

    #[test]
    fn reading_goes_through_to_the_word_index() {
        let workspace = workspace(&[("a.md", "---\ntags: [idee]\n---\n# A\n\npain")]);
        let index: &dyn NoteIndex = &*workspace.index;
        assert_eq!(index.stamps().unwrap().len(), 1);
        assert_eq!(index.all_notes().unwrap().len(), 1);
        assert_eq!(index.notes_in(&Folder::root()).unwrap().len(), 1);
        assert_eq!(index.tagged("idee").unwrap().len(), 1);
        assert!(
            index
                .content(&path("a.md"))
                .unwrap()
                .unwrap()
                .contains("pain")
        );
        let found = index
            .search(&SearchQuery::parse("pain").unwrap(), &ContentType::ALL)
            .unwrap();
        assert_eq!(found.len(), 1);
    }

    #[derive(Debug)]
    struct BrokenMeaning;

    impl MeaningIndex for BrokenMeaning {
        fn replace_segments(
            &self,
            _: &NotePath,
            _: &[Segment],
        ) -> Result<usize, MeaningIndexError> {
            Err(MeaningIndexError::Unavailable("disque plein".into()))
        }
        fn remove_note(&self, _: &NotePath) -> Result<(), MeaningIndexError> {
            Err(MeaningIndexError::Unavailable("disque plein".into()))
        }
        fn clear(&self) -> Result<(), MeaningIndexError> {
            Err(MeaningIndexError::Unavailable("disque plein".into()))
        }
        fn clear_vectors(&self, _: MeaningModel) -> Result<(), MeaningIndexError> {
            Err(MeaningIndexError::Unavailable("disque plein".into()))
        }
        fn without_vector(
            &self,
            _: MeaningModel,
            _: usize,
        ) -> Result<Vec<PendingSegment>, MeaningIndexError> {
            Err(MeaningIndexError::Unavailable("disque plein".into()))
        }
        fn put_vectors(
            &self,
            _: MeaningModel,
            _: &[(SegmentId, MeaningVector)],
        ) -> Result<(), MeaningIndexError> {
            Err(MeaningIndexError::Unavailable("disque plein".into()))
        }
    }

    #[test]
    fn a_failing_meaning_index_makes_the_change_fail_with_its_cause() {
        let index = SegmentingIndex::new(Arc::new(MemoryIndex::default()), Arc::new(BrokenMeaning));
        let files = InMemoryNoteStore::with_notes(&[("a.md", "# A")]);
        let note = files.read_indexed(&path("a.md")).unwrap();
        for error in [
            index.put(&[note]).unwrap_err(),
            index.remove(&[path("a.md")]).unwrap_err(),
            index.clear().unwrap_err(),
        ] {
            let StoreError::Unavailable(reason) = error else {
                panic!("{error:?}")
            };
            assert!(reason.contains("disque plein"), "{reason}");
        }
    }
}
