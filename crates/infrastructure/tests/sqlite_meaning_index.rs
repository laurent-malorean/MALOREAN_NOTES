//! L'index de sens SQLite respecte le contrat, partage le fichier de l'index de mots (les deux ne
//! se contredisent jamais), survit d'un lancement à l'autre, et refuse les valeurs abîmées.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::sync::Arc;

use application::testing::meaning_index_contract::meaning_index_contract;
use application::{
    IndexedNote, MeaningIndex, MeaningIndexError, MeaningSearch, NoteIndex, NoteStamp, StoreError,
    WorkspaceLocation,
};
use domain::segments::segments;
use domain::{MeaningModel, MeaningVector, Modified, NotePath};
use infrastructure::{FORMAT_VERSION, SqliteIndex, SqliteIndexes, SqliteMeaningIndex};
use rusqlite::Connection;
use tempfile::TempDir;

const MODEL: MeaningModel = MeaningModel::Small;

fn path(text: &str) -> NotePath {
    NotePath::parse(text).unwrap()
}

fn note(name: &str, content: &str) -> IndexedNote {
    IndexedNote {
        stamp: NoteStamp {
            path: path(name),
            modified: Modified(7),
            size: 12,
        },
        content: content.to_owned(),
    }
}

fn axis(axis: usize) -> MeaningVector {
    let mut values = vec![0.0; MODEL.dimensions()];
    values[axis] = 1.0;
    MeaningVector::new(values).unwrap()
}

fn open(file: &std::path::Path) -> (Arc<SqliteIndex>, SqliteMeaningIndex) {
    let index = Arc::new(SqliteIndex::open(file).unwrap());
    let meaning = SqliteMeaningIndex::new(Arc::clone(&index));
    (index, meaning)
}

/// Garde la note à la fois dans l'index de mots et dans l'index de sens, avec un vecteur par
/// segment.
fn keep(index: &dyn NoteIndex, meaning: &SqliteMeaningIndex, name: &str, content: &str) {
    index.put(&[note(name, content)]).unwrap();
    meaning
        .replace_segments(&path(name), &segments(name, content))
        .unwrap();
    let waiting = meaning.without_vector(MODEL, usize::MAX).unwrap();
    let vectors: Vec<_> = waiting
        .iter()
        .enumerate()
        .map(|(n, p)| (p.id, axis(n)))
        .collect();
    meaning.put_vectors(MODEL, &vectors).unwrap();
}

fn count(file: &std::path::Path, table: &str) -> i64 {
    Connection::open(file)
        .unwrap()
        .query_row(&format!("SELECT count(*) FROM {table}"), [], |row| {
            row.get(0)
        })
        .unwrap()
}

#[test]
fn the_sqlite_meaning_index_honours_the_contract() {
    let dirs = std::cell::RefCell::new(Vec::new());
    meaning_index_contract(|| {
        let dir = TempDir::new().unwrap();
        let (_, meaning) = open(&dir.path().join("index.sqlite"));
        dirs.borrow_mut().push(dir);
        meaning
    });
}

#[test]
fn segments_and_vectors_are_kept_from_one_launch_to_the_next() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let (index, meaning) = open(&file);
    keep(
        &*index,
        &meaning,
        "a.md",
        "# A\n\nle pain\n\n## Suite\n\nle beurre",
    );
    drop((index, meaning));
    let (_, meaning) = open(&file);
    let status = meaning.status(MODEL).unwrap();
    assert_eq!(
        (status.segments, status.with_vector, status.notes),
        (2, 2, 1)
    );
    let found = meaning.nearest(MODEL, &axis(1), 1).unwrap();
    assert_eq!(found[0].segment.heading(), "a.md > Suite");
    assert_eq!(found[0].segment.text(), "le beurre");
    assert!((found[0].score - 1.0).abs() < 1e-6);
}

#[test]
fn the_vector_is_stored_as_little_endian_floats() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let (index, meaning) = open(&file);
    keep(&*index, &meaning, "a.md", "texte");
    drop((index, meaning));
    let bytes: Vec<u8> = Connection::open(&file)
        .unwrap()
        .query_row("SELECT vector FROM segment_vectors", [], |row| row.get(0))
        .unwrap();
    assert_eq!(bytes.len(), 384 * 4);
    assert_eq!(bytes[..4], 1.0_f32.to_le_bytes());
    assert!(bytes[4..].iter().all(|byte| *byte == 0));
}

#[test]
fn forgetting_a_note_in_the_word_index_forgets_its_segments() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let (index, meaning) = open(&file);
    keep(&*index, &meaning, "a.md", "texte a");
    keep(&*index, &meaning, "b.md", "texte b");
    index.remove(&[path("a.md"), path("inconnue.md")]).unwrap();
    let status = meaning.status(MODEL).unwrap();
    assert_eq!(
        (status.segments, status.with_vector, status.notes),
        (1, 1, 1)
    );
    assert_eq!(count(&file, "segments"), 1);
    assert_eq!(count(&file, "segment_vectors"), 1);
    index.clear().unwrap();
    let status = meaning.status(MODEL).unwrap();
    assert_eq!(
        (status.segments, status.with_vector, status.notes),
        (0, 0, 0)
    );
    assert_eq!(count(&file, "segments"), 0);
    assert_eq!(count(&file, "segment_vectors"), 0);
    // La reconstruction a repris une base neuve : les deux index servent encore.
    keep(&*index, &meaning, "c.md", "texte c");
    assert_eq!(meaning.status(MODEL).unwrap().segments, 1);
}

#[test]
fn updating_a_note_keeps_its_segments_and_vectors() {
    let dir = TempDir::new().unwrap();
    let (index, meaning) = open(&dir.path().join("index.sqlite"));
    keep(&*index, &meaning, "a.md", "texte a");
    index.put(&[note("a.md", "texte a")]).unwrap();
    let status = meaning.status(MODEL).unwrap();
    assert_eq!((status.segments, status.with_vector), (1, 1));
}

#[test]
fn removing_segments_removes_their_vectors_by_the_database_itself() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let (index, meaning) = open(&file);
    keep(&*index, &meaning, "a.md", "texte a");
    meaning.replace_segments(&path("a.md"), &[]).unwrap();
    assert_eq!(count(&file, "segment_vectors"), 0);
    keep(&*index, &meaning, "a.md", "texte a");
    meaning.remove_note(&path("a.md")).unwrap();
    assert_eq!(count(&file, "segment_vectors"), 0);
    keep(&*index, &meaning, "a.md", "texte a");
    meaning.clear().unwrap();
    assert_eq!(count(&file, "segment_vectors"), 0);
    // Les clés étrangères restent actives quand l'index est rouvert.
    drop((index, meaning));
    let (index, meaning) = open(&file);
    keep(&*index, &meaning, "a.md", "texte a");
    meaning.replace_segments(&path("a.md"), &[]).unwrap();
    assert_eq!(count(&file, "segment_vectors"), 0);
}

#[test]
fn a_base_of_another_format_loses_its_segments() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let (index, meaning) = open(&file);
    keep(&*index, &meaning, "a.md", "texte a");
    drop((index, meaning));
    Connection::open(&file)
        .unwrap()
        .pragma_update(None, "user_version", FORMAT_VERSION - 1)
        .unwrap();
    let (index, meaning) = open(&file);
    assert!(index.all_notes().unwrap().is_empty());
    assert_eq!(meaning.status(MODEL).unwrap().segments, 0);
    drop((index, meaning));
    let version: i32 = Connection::open(&file)
        .unwrap()
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, FORMAT_VERSION);
    assert_eq!(FORMAT_VERSION, 7);
}

#[test]
fn a_base_without_the_segment_tables_is_replaced() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let (index, meaning) = open(&file);
    keep(&*index, &meaning, "a.md", "texte a");
    drop((index, meaning));
    Connection::open(&file)
        .unwrap()
        .execute_batch("DROP TABLE segment_vectors")
        .unwrap();
    let (_, meaning) = open(&file);
    assert_eq!(meaning.status(MODEL).unwrap().segments, 0);
    assert_eq!(count(&file, "segment_vectors"), 0);
}

#[test]
fn a_vector_of_the_wrong_size_makes_the_index_unavailable() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let (index, meaning) = open(&file);
    keep(&*index, &meaning, "a.md", "texte a");
    keep(&*index, &meaning, "b.md", "texte b");
    Connection::open(&file)
        .unwrap()
        .execute("UPDATE segment_vectors SET vector = x'0000'", [])
        .unwrap();
    assert!(matches!(
        meaning.nearest(MODEL, &axis(0), 5),
        Err(MeaningIndexError::Unavailable(_))
    ));
    assert!(matches!(
        meaning.related_notes(MODEL, &path("a.md"), 5),
        Err(MeaningIndexError::Unavailable(_))
    ));
    // Une valeur abîmée n'efface pas la base : la reconstruction demandée la répare.
    assert!(file.exists());
    index.clear().unwrap();
    assert_eq!(meaning.status(MODEL).unwrap().segments, 0);
}

#[test]
fn a_row_with_an_unreadable_note_path_makes_the_index_unavailable() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let (index, meaning) = open(&file);
    keep(&*index, &meaning, "a.md", "texte a");
    Connection::open(&file)
        .unwrap()
        .execute("UPDATE segments SET note = '../hors.md'", [])
        .unwrap();
    assert!(matches!(
        meaning.nearest(MODEL, &axis(0), 5),
        Err(MeaningIndexError::Unavailable(_))
    ));
    drop(index);
}

#[test]
fn a_vector_read_from_a_blob_of_text_is_refused() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let (index, meaning) = open(&file);
    keep(&*index, &meaning, "a.md", "texte a");
    Connection::open(&file)
        .unwrap()
        .execute("UPDATE segment_vectors SET vector = 'texte'", [])
        .unwrap();
    assert!(matches!(
        meaning.nearest(MODEL, &axis(0), 5),
        Err(MeaningIndexError::Unavailable(_))
    ));
    drop(index);
}

#[test]
fn the_word_index_and_the_meaning_index_share_one_file_per_workspace() {
    let dir = TempDir::new().unwrap();
    let indexes = SqliteIndexes::new(dir.path().join("support"));
    let place = WorkspaceLocation::new("/Users/moi/Notes").unwrap();
    let (words, meaning) = indexes.open_with_meaning(&place).unwrap();
    keep(&*words, &meaning, "a.md", "texte a");
    drop((words, meaning));
    let files: Vec<_> = std::fs::read_dir(dir.path().join("support"))
        .unwrap()
        .map(|entry| entry.unwrap().file_name().into_string().unwrap())
        .filter(|name| name.ends_with(".sqlite"))
        .collect();
    assert_eq!(files.len(), 1);
    let (words, meaning) = indexes.open_with_meaning(&place).unwrap();
    assert_eq!(words.stamps().unwrap().len(), 1);
    assert_eq!(meaning.status(MODEL).unwrap().segments, 1);
    let (_, other) = indexes
        .open_with_meaning(&WorkspaceLocation::new("/Users/moi/Travail").unwrap())
        .unwrap();
    assert_eq!(other.status(MODEL).unwrap().segments, 0);
}

#[test]
fn an_index_that_cannot_be_created_is_unavailable_for_both() {
    let dir = TempDir::new().unwrap();
    let blocked = dir.path().join("fichier");
    std::fs::write(&blocked, "pas un dossier").unwrap();
    let indexes = SqliteIndexes::new(blocked.join("support"));
    let opened = indexes.open_with_meaning(&WorkspaceLocation::new("/x").unwrap());
    assert!(matches!(opened, Err(StoreError::Unavailable(_))));
}
