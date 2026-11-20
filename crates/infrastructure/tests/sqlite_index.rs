//! L'index SQLite respecte le contrat de l'index, survit d'un lancement à l'autre, et se
//! reconstruit vide s'il est abîmé ou d'un autre format.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::fs;
use std::os::unix::fs::PermissionsExt;

use application::testing::index_contract::note_index_contract;
use application::{IndexOpener, IndexedNote, NoteIndex, NoteStamp, StoreError, WorkspaceLocation};
use domain::search::SearchQuery;
use domain::{ContentType, Folder, Modified, NotePath};
use infrastructure::{FORMAT_VERSION, SqliteIndex, SqliteIndexes};
use tempfile::TempDir;

const READ_ONLY_FOLDER: u32 = 0o555;
const WRITABLE_FOLDER: u32 = 0o755;

fn location(text: &str) -> WorkspaceLocation {
    WorkspaceLocation::new(text).unwrap()
}

fn note(name: &str, content: &str) -> IndexedNote {
    IndexedNote {
        stamp: NoteStamp {
            path: NotePath::parse(name).unwrap(),
            modified: Modified(7),
            size: 12,
        },
        content: content.to_owned(),
    }
}

fn titles(index: &dyn NoteIndex) -> Vec<String> {
    let mut notes = index.all_notes().unwrap();
    notes.sort_by(|a, b| a.path().cmp(b.path()));
    notes.iter().map(|n| n.title().to_owned()).collect()
}

#[test]
fn the_sqlite_index_honours_the_contract() {
    let dirs = std::cell::RefCell::new(Vec::new());
    note_index_contract(|| {
        let dir = TempDir::new().unwrap();
        let index = SqliteIndex::open(&dir.path().join("index.sqlite")).unwrap();
        dirs.borrow_mut().push(dir);
        index
    });
}

#[test]
fn each_workspace_has_its_own_file_named_after_its_folder() {
    let dir = TempDir::new().unwrap();
    let indexes = SqliteIndexes::new(dir.path().to_path_buf());
    let notes = indexes.file_for(&location("/Users/moi/Notes"));
    assert_eq!(notes, indexes.file_for(&location("/Users/moi/Notes")));
    assert_ne!(notes, indexes.file_for(&location("/Users/moi/Travail")));
    assert_eq!(notes.parent(), Some(dir.path()));
    // FNV-1a de « /Users/moi/Notes » : le même nom à chaque lancement, sur chaque Mac.
    assert_eq!(
        notes.file_name().unwrap().to_str().unwrap(),
        "index-665169a2bf74c794.sqlite"
    );
}

#[test]
fn an_index_is_kept_from_one_launch_to_the_next() {
    let dir = TempDir::new().unwrap();
    let support = dir.path().join("Application Support").join("malorean");
    let indexes = SqliteIndexes::new(support.clone());
    let first = indexes.open(&location("/Users/moi/Notes")).unwrap();
    first.put(&[note("a.md", "# Alpha\ndu pain")]).unwrap();
    drop(first);
    assert!(indexes.file_for(&location("/Users/moi/Notes")).is_file());
    let again = indexes.open(&location("/Users/moi/Notes")).unwrap();
    assert_eq!(titles(&*again), ["Alpha"]);
    assert_eq!(again.stamps().unwrap(), [note("a.md", "").stamp]);
    let query = SearchQuery::parse("pain").unwrap();
    assert_eq!(again.search(&query, &ContentType::ALL).unwrap().len(), 1);
    let other = indexes.open(&location("/Users/moi/Travail")).unwrap();
    assert!(other.all_notes().unwrap().is_empty());
}

#[test]
fn a_damaged_index_is_replaced_by_an_empty_one() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    fs::write(
        &file,
        "ceci n'est pas une base SQLite, mais un fichier abîmé",
    )
    .unwrap();
    let index = SqliteIndex::open(&file).unwrap();
    assert!(index.stamps().unwrap().is_empty());
    index.put(&[note("a.md", "# A")]).unwrap();
    assert_eq!(titles(&index), ["A"]);
}

#[test]
fn an_index_of_another_format_is_replaced_by_an_empty_one() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let index = SqliteIndex::open(&file).unwrap();
    index.put(&[note("a.md", "# A")]).unwrap();
    drop(index);
    let connection = rusqlite::Connection::open(&file).unwrap();
    connection
        .pragma_update(None, "user_version", FORMAT_VERSION + 1)
        .unwrap();
    drop(connection);
    let index = SqliteIndex::open(&file).unwrap();
    assert!(index.all_notes().unwrap().is_empty());
    drop(index);
    let connection = rusqlite::Connection::open(&file).unwrap();
    let version: i32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .unwrap();
    assert_eq!(version, FORMAT_VERSION);
}

#[test]
fn an_index_that_cannot_be_created_is_unavailable() {
    let dir = TempDir::new().unwrap();
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(READ_ONLY_FOLDER)).unwrap();
    let opened = SqliteIndexes::new(dir.path().join("support")).open(&location("/x"));
    let in_place = SqliteIndex::open(&dir.path().join("index.sqlite"));
    fs::set_permissions(dir.path(), fs::Permissions::from_mode(WRITABLE_FOLDER)).unwrap();
    assert!(matches!(opened, Err(StoreError::Unavailable(_))));
    assert!(matches!(in_place, Err(StoreError::Unavailable(_))));
}

#[test]
fn notes_are_summarised_with_their_folder_and_tags() {
    let dir = TempDir::new().unwrap();
    let index = SqliteIndex::open(&dir.path().join("index.sqlite")).unwrap();
    index
        .put(&[
            note("Été/a.md", "---\ntags: [b, a]\n---\n# A"),
            note("b.md", "# B"),
        ])
        .unwrap();
    let in_folder = index.notes_in(&Folder::parse("Été").unwrap()).unwrap();
    assert_eq!(in_folder[0].tags(), ["b", "a"]);
    assert!(
        index.notes_in(&Folder::root()).unwrap()[0]
            .tags()
            .is_empty()
    );
}

#[test]
fn an_index_missing_its_tables_is_replaced_by_an_empty_one() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let connection = rusqlite::Connection::open(&file).unwrap();
    connection
        .pragma_update(None, "user_version", FORMAT_VERSION)
        .unwrap();
    connection.execute_batch("CREATE TABLE notes (x)").unwrap();
    drop(connection);
    let index = SqliteIndex::open(&file).unwrap();
    index.put(&[note("a.md", "# A")]).unwrap();
    assert_eq!(titles(&index), ["A"]);
}

#[test]
fn a_replaced_index_does_not_take_back_the_journal_of_the_old_one() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let journal = dir.path().join("index.sqlite-wal");
    let old = rusqlite::Connection::open(&file).unwrap();
    old.execute_batch(
        "PRAGMA journal_mode = WAL; CREATE TABLE notes (ancien); PRAGMA user_version = 99;",
    )
    .unwrap();
    let kept = fs::read(&journal).unwrap();
    drop(old);
    fs::write(&journal, kept).unwrap();
    let index = SqliteIndex::open(&file).unwrap();
    index.put(&[note("a.md", "# A")]).unwrap();
    assert_eq!(titles(&index), ["A"]);
}

/// Le schéma de la première version de l'index, sans type de contenu ni conteneur.
const FIRST_FORMAT: &str = "
CREATE TABLE notes (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, folder TEXT NOT NULL,
    title TEXT NOT NULL, modified INTEGER NOT NULL, size INTEGER NOT NULL,
    pinned INTEGER NOT NULL, tags TEXT NOT NULL, content TEXT NOT NULL);
CREATE TABLE note_tags (note INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    tag TEXT NOT NULL);
CREATE VIRTUAL TABLE notes_text USING fts5 (folded, tokenize = 'trigram case_sensitive 1');
INSERT INTO notes VALUES (1, 'a.md', '', 'A', 7, 12, 0, '', '# A');
INSERT INTO notes_text (rowid, folded) VALUES (1, '# a');
PRAGMA user_version = 1;
";

#[test]
fn an_index_of_the_first_format_starts_again_and_keeps_types() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let connection = rusqlite::Connection::open(&file).unwrap();
    connection.execute_batch(FIRST_FORMAT).unwrap();
    drop(connection);
    let index = SqliteIndex::open(&file).unwrap();
    assert!(index.stamps().unwrap().is_empty());
    index.put(&[note("a.md", "# A\npain")]).unwrap();
    let query = SearchQuery::parse("pain").unwrap();
    let found = index.search(&query, &ContentType::ALL).unwrap();
    assert_eq!(found[0].0.content_type(), ContentType::Note);
    assert_eq!(found[0].0.container(), None);
}

/// Le deuxième format nommait « page » le type des notes (fiche 0034), devenu « note »
/// (fiche 0037) : une telle base repart de zéro, aussitôt remplie à l'ouverture.
const SECOND_FORMAT: &str = "
CREATE TABLE notes (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, folder TEXT NOT NULL,
    title TEXT NOT NULL, modified INTEGER NOT NULL, size INTEGER NOT NULL,
    pinned INTEGER NOT NULL, tags TEXT NOT NULL, type TEXT NOT NULL, container TEXT,
    content TEXT NOT NULL);
CREATE TABLE note_tags (note INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    tag TEXT NOT NULL);
CREATE VIRTUAL TABLE notes_text USING fts5 (folded, tokenize = 'trigram case_sensitive 1');
INSERT INTO notes VALUES (1, 'a.md', '', 'A', 7, 12, 0, '', 'page', NULL, '# A');
INSERT INTO notes_text (rowid, folded) VALUES (1, '# a');
PRAGMA user_version = 2;
";

#[test]
fn an_index_of_the_second_format_starts_again_with_the_note_type() {
    let dir = TempDir::new().unwrap();
    let file = dir.path().join("index.sqlite");
    let connection = rusqlite::Connection::open(&file).unwrap();
    connection.execute_batch(SECOND_FORMAT).unwrap();
    drop(connection);
    let index = SqliteIndex::open(&file).unwrap();
    assert!(index.stamps().unwrap().is_empty());
    index.put(&[note("a.md", "# A")]).unwrap();
    assert_eq!(
        index.all_notes().unwrap()[0].content_type(),
        ContentType::Note
    );
}

/// Le troisième format ne connaissait pas les cahiers de recherche (fiche 0041) : un cahier y
/// était une note. Une telle base repart de zéro ; une base du format 4 sans la table des
/// entrées aussi.
const THIRD_FORMAT: &str = "
CREATE TABLE notes (id INTEGER PRIMARY KEY, path TEXT NOT NULL UNIQUE, folder TEXT NOT NULL,
    title TEXT NOT NULL, modified INTEGER NOT NULL, size INTEGER NOT NULL,
    pinned INTEGER NOT NULL, tags TEXT NOT NULL, type TEXT NOT NULL, container TEXT,
    content TEXT NOT NULL);
CREATE TABLE note_tags (note INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    tag TEXT NOT NULL);
CREATE VIRTUAL TABLE notes_text USING fts5 (folded, tokenize = 'trigram case_sensitive 1');
INSERT INTO notes VALUES (1, 'c.md', '', 'C', 7, 12, 0, '', 'note', NULL,
    '---\ntype: cahier-de-recherche\n---\n# C');
INSERT INTO notes_text (rowid, folded) VALUES (1, '# c');
";

#[test]
fn an_index_of_the_third_format_or_without_entries_starts_again_with_research_notebooks() {
    for version in [3, 4] {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("index.sqlite");
        let connection = rusqlite::Connection::open(&file).unwrap();
        connection.execute_batch(THIRD_FORMAT).unwrap();
        connection
            .pragma_update(None, "user_version", version)
            .unwrap();
        drop(connection);
        let index = SqliteIndex::open(&file).unwrap();
        assert!(index.stamps().unwrap().is_empty());
        index
            .put(&[note("c.md", "---\ntype: cahier-de-recherche\n---\n# C")])
            .unwrap();
        assert_eq!(
            index.all_notes().unwrap()[0].content_type(),
            ContentType::ResearchNotebook
        );
    }
}
