//! L'index de sens en mémoire : il ne survit pas à la session. C'est le faux des tests de
//! contrat de l'index de sens (voir `testing::meaning_index_contract`).

use std::cmp::Ordering;
use std::collections::{BTreeMap, HashMap};
use std::sync::{Arc, Mutex, MutexGuard, PoisonError};

use domain::segments::{Segment, SegmentKey, reuse};
use domain::{MeaningModel, MeaningVector, NotePath, dot_product};

use crate::meaning_index::check_dimensions;
use crate::{
    FoundSegment, IndexOpener, MeaningIndex, MeaningIndexError, MeaningSearch, MeaningStatus,
    MemoryIndex, NoteIndex, OpenedIndex, PendingSegment, RelatedNote, SegmentId, SegmentingIndex,
    StoreError, WorkspaceLocation,
};

#[derive(Debug)]
struct Row {
    note: NotePath,
    position: usize,
    segment: Segment,
    key: SegmentKey,
}

#[derive(Debug, Default)]
struct State {
    next: u64,
    rows: BTreeMap<SegmentId, Row>,
    vectors: HashMap<(SegmentId, &'static str), MeaningVector>,
}

/// Index de sens rangé en mémoire, vide à sa création.
#[derive(Debug, Default)]
pub struct MemoryMeaningIndex {
    state: Mutex<State>,
}

impl MemoryMeaningIndex {
    fn state(&self) -> MutexGuard<'_, State> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl MemoryMeaningIndex {
    /// Les segments gardés pour `note`, dans l'ordre de la note ; aucun si elle est inconnue.
    /// Pour les tests : l'index ne rend pas ses segments autrement que par la recherche.
    #[must_use]
    pub fn segments_of(&self, note: &NotePath) -> Vec<Segment> {
        let state = self.state();
        let mut rows: Vec<&Row> = state
            .rows
            .values()
            .filter(|row| &row.note == note)
            .collect();
        rows.sort_by_key(|row| row.position);
        rows.into_iter().map(|row| row.segment.clone()).collect()
    }

    /// Les notes qui ont au moins un segment gardé, dans l'ordre alphabétique de leur chemin.
    #[must_use]
    pub fn notes(&self) -> Vec<NotePath> {
        let state = self.state();
        let mut notes: Vec<NotePath> = state.rows.values().map(|row| row.note.clone()).collect();
        notes.sort();
        notes.dedup();
        notes
    }
}

impl State {
    fn forget(&mut self, ids: &[SegmentId]) {
        for id in ids {
            self.rows.remove(id);
            self.vectors.retain(|(segment, _), _| segment != id);
        }
    }

    fn ids_of(&self, note: &NotePath) -> Vec<SegmentId> {
        self.rows
            .iter()
            .filter(|(_, row)| &row.note == note)
            .map(|(id, _)| *id)
            .collect()
    }

    /// Les segments qui ont un vecteur de `model`, avec ce vecteur.
    fn vectored(&self, model: MeaningModel) -> impl Iterator<Item = (&Row, &MeaningVector)> {
        self.rows.iter().filter_map(move |(id, row)| {
            self.vectors
                .get(&(*id, model.name()))
                .map(|vector| (row, vector))
        })
    }
}

fn by_score_then_place(a: (f32, &NotePath, usize), b: (f32, &NotePath, usize)) -> Ordering {
    b.0.total_cmp(&a.0)
        .then_with(|| a.1.to_path().cmp(&b.1.to_path()))
        .then_with(|| a.2.cmp(&b.2))
}

impl MeaningIndex for MemoryMeaningIndex {
    fn replace_segments(
        &self,
        note: &NotePath,
        segments: &[Segment],
    ) -> Result<usize, MeaningIndexError> {
        let mut state = self.state();
        let mut old: Vec<(SegmentId, SegmentKey, usize)> = state
            .ids_of(note)
            .into_iter()
            .map(|id| (id, state.rows[&id].key, state.rows[&id].position))
            .collect();
        old.sort_by_key(|(_, _, position)| *position);
        let old_keys: Vec<(SegmentId, SegmentKey)> =
            old.iter().map(|(id, key, _)| (*id, *key)).collect();
        let keys: Vec<SegmentKey> = segments.iter().map(Segment::key).collect();
        let plan = reuse(&old_keys, &keys);
        state.forget(&plan.removed);
        let mut added = 0;
        for (position, (segment, kept)) in segments.iter().zip(plan.kept).enumerate() {
            if let Some(row) = kept.and_then(|id| state.rows.get_mut(&id)) {
                row.position = position;
                continue;
            }
            added += 1;
            state.next += 1;
            let id = SegmentId::new(state.next);
            let row = Row {
                note: note.clone(),
                position,
                segment: segment.clone(),
                key: segment.key(),
            };
            state.rows.insert(id, row);
        }
        Ok(added)
    }

    fn remove_note(&self, note: &NotePath) -> Result<(), MeaningIndexError> {
        let mut state = self.state();
        let ids = state.ids_of(note);
        state.forget(&ids);
        Ok(())
    }

    fn clear(&self) -> Result<(), MeaningIndexError> {
        let mut state = self.state();
        state.rows.clear();
        state.vectors.clear();
        Ok(())
    }

    fn clear_vectors(&self, model: MeaningModel) -> Result<(), MeaningIndexError> {
        self.state()
            .vectors
            .retain(|(_, name), _| *name != model.name());
        Ok(())
    }

    fn without_vector(
        &self,
        model: MeaningModel,
        limit: usize,
    ) -> Result<Vec<PendingSegment>, MeaningIndexError> {
        let state = self.state();
        Ok(state
            .rows
            .iter()
            .filter(|(id, _)| !state.vectors.contains_key(&(**id, model.name())))
            .take(limit)
            .map(|(id, row)| PendingSegment {
                id: *id,
                segment: row.segment.clone(),
            })
            .collect())
    }

    fn put_vectors(
        &self,
        model: MeaningModel,
        vectors: &[(SegmentId, MeaningVector)],
    ) -> Result<(), MeaningIndexError> {
        for (_, vector) in vectors {
            check_dimensions(model, vector)?;
        }
        let mut state = self.state();
        for (id, vector) in vectors {
            if state.rows.contains_key(id) {
                state.vectors.insert((*id, model.name()), vector.clone());
            }
        }
        Ok(())
    }
}

impl MeaningSearch for MemoryMeaningIndex {
    fn nearest(
        &self,
        model: MeaningModel,
        question: &MeaningVector,
        limit: usize,
    ) -> Result<Vec<FoundSegment>, MeaningIndexError> {
        check_dimensions(model, question)?;
        let state = self.state();
        let mut found: Vec<(f32, &Row)> = state
            .vectored(model)
            .map(|(row, vector)| (dot_product(question.values(), vector.values()), row))
            .collect();
        found.sort_by(|a, b| {
            by_score_then_place(
                (a.0, &a.1.note, a.1.position),
                (b.0, &b.1.note, b.1.position),
            )
        });
        found.truncate(limit);
        let found = found
            .into_iter()
            .map(|(score, row)| FoundSegment {
                note: row.note.clone(),
                segment: row.segment.clone(),
                score,
            })
            .collect();
        Ok(found)
    }

    fn related_notes(
        &self,
        model: MeaningModel,
        note: &NotePath,
        limit: usize,
    ) -> Result<Vec<RelatedNote>, MeaningIndexError> {
        let state = self.state();
        let own: Vec<&MeaningVector> = state
            .vectored(model)
            .filter(|(row, _)| &row.note == note)
            .map(|(_, vector)| vector)
            .collect();
        let mut best: HashMap<&NotePath, f32> = HashMap::new();
        for (row, vector) in state.vectored(model).filter(|(row, _)| &row.note != note) {
            for mine in &own {
                let score = dot_product(mine.values(), vector.values());
                best.entry(&row.note)
                    .and_modify(|kept| *kept = kept.max(score))
                    .or_insert(score);
            }
        }
        let mut related: Vec<RelatedNote> = best
            .into_iter()
            .map(|(note, score)| RelatedNote {
                note: note.clone(),
                score,
            })
            .collect();
        related.sort_by(|a, b| by_score_then_place((a.score, &a.note, 0), (b.score, &b.note, 0)));
        related.truncate(limit);
        Ok(related)
    }

    fn status(&self, model: MeaningModel) -> Result<MeaningStatus, MeaningIndexError> {
        let state = self.state();
        let mut notes: Vec<&NotePath> = state.rows.values().map(|row| &row.note).collect();
        notes.sort();
        notes.dedup();
        Ok(MeaningStatus {
            segments: state.rows.len(),
            with_vector: state.vectored(model).count(),
            notes: notes.len(),
        })
    }
}

/// Ouvre, pour chaque espace de travail, un index de mots et un index de sens en mémoire, vides,
/// le premier tenant le second à jour (`SegmentingIndex`) : l'index d'une session sans fichier de
/// l'index, avec la recherche par le sens.
#[derive(Debug, Default)]
pub struct MemoryMeaningIndexes;

impl IndexOpener for MemoryMeaningIndexes {
    fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn NoteIndex>, StoreError> {
        Ok(self.open_with_meaning(location)?.words)
    }

    fn open_with_meaning(&self, _location: &WorkspaceLocation) -> Result<OpenedIndex, StoreError> {
        let meaning = Arc::new(MemoryMeaningIndex::default());
        let words = Arc::new(SegmentingIndex::new(
            Arc::new(MemoryIndex::default()),
            meaning.clone(),
        ));
        Ok(OpenedIndex { words, meaning })
    }
}

#[cfg(test)]
mod tests {
    use super::MemoryMeaningIndex;
    use crate::MeaningIndex;
    use crate::testing::meaning_index_contract::meaning_index_contract;
    use domain::NotePath;
    use domain::segments::segments;

    #[test]
    fn the_segments_and_notes_kept_can_be_read_back_in_order() {
        let index = MemoryMeaningIndex::default();
        let (a, b) = (
            NotePath::parse("a.md").unwrap(),
            NotePath::parse("b.md").unwrap(),
        );
        let kept = segments("B", "## Un\n\nun\n\n## Deux\n\ndeux");
        index.replace_segments(&b, &kept).unwrap();
        index.replace_segments(&a, &segments("A", "texte")).unwrap();
        assert_eq!(index.segments_of(&b), kept);
        assert_eq!(index.segments_of(&a), segments("A", "texte"));
        assert_eq!(index.notes(), [a.clone(), b]);
        assert!(
            index
                .segments_of(&NotePath::parse("c.md").unwrap())
                .is_empty()
        );
        index.remove_note(&a).unwrap();
        assert_eq!(index.notes().len(), 1);
    }

    fn note(path: &str, content: &str) -> crate::IndexedNote {
        crate::IndexedNote {
            stamp: crate::NoteStamp {
                path: NotePath::parse(path).unwrap(),
                modified: domain::Modified(1),
                size: 1,
            },
            content: content.to_owned(),
        }
    }

    #[test]
    fn opened_indexes_keep_the_segments_of_the_notes_they_receive() {
        use crate::{IndexOpener, MemoryMeaningIndexes};
        let location = crate::WorkspaceLocation::new("/Users/moi/Notes").unwrap();
        let opened = MemoryMeaningIndexes.open_with_meaning(&location).unwrap();
        let model = domain::MeaningModel::Small;
        assert_eq!(opened.meaning.status(model).unwrap().notes, 0);
        opened.words.put(&[note("a.md", "# A\n\ntexte")]).unwrap();
        assert_eq!(opened.meaning.status(model).unwrap().notes, 1);
        // Chaque ouverture est neuve ; `open` donne le même index de mots suivi.
        let words = MemoryMeaningIndexes.open(&location).unwrap();
        assert!(words.stamps().unwrap().is_empty());
        words.put(&[note("a.md", "# A")]).unwrap();
        assert_eq!(words.stamps().unwrap().len(), 1);
        let again = MemoryMeaningIndexes.open_with_meaning(&location).unwrap();
        assert_eq!(again.meaning.status(model).unwrap().notes, 0);
    }

    #[test]
    fn an_opener_without_meaning_gives_an_empty_index_of_meaning_that_nothing_fills() {
        use crate::{IndexOpener, MemoryIndexes};
        let location = crate::WorkspaceLocation::new("/Users/moi/Notes").unwrap();
        let opened = MemoryIndexes.open_with_meaning(&location).unwrap();
        opened.words.put(&[note("a.md", "# A\n\ntexte")]).unwrap();
        assert_eq!(opened.words.stamps().unwrap().len(), 1);
        let status = opened.meaning.status(domain::MeaningModel::Small).unwrap();
        assert_eq!((status.segments, status.notes), (0, 0));
    }

    #[test]
    fn the_memory_meaning_index_honours_the_contract() {
        meaning_index_contract(MemoryMeaningIndex::default);
    }
}
