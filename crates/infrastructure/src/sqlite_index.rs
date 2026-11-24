//! L'index de chaque espace de travail dans une base SQLite (fiche 0028), rangée dans le dossier
//! de support de l'application, jamais dans l'espace de travail. Un fichier abîmé ou d'un ancien
//! format est remplacé par un index vide, que la mise à jour remplit à partir des fichiers.

use std::fs;
use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, PoisonError};

use application::{IndexOpener, IndexedNote, NoteIndex, NoteStamp, StoreError, WorkspaceLocation};
use domain::mind_map::searchable_text;
use domain::search::{SearchQuery, folded};
use domain::{ContentType, Folder, Modified, NotePath, NoteSummary};
use rusqlite::{Connection, ErrorCode, OptionalExtension, Row, ToSql, params, params_from_iter};

mod entries;
mod nodes;

/// Le format de la base : à changer à chaque changement du schéma ; un index d'un autre format
/// est reconstruit. 2 : le type de contenu et le conteneur de chaque note (fiche 0034). 3 : le
/// type des notes se nomme « note », et non plus « page » (fiche 0037). 4 : les cahiers de
/// recherche et leurs entrées (fiche 0041). 6 : les segments des notes et leurs vecteurs de sens
/// (fiche 0044). 7 : les cartes mentales, nouveau type de contenu (fiche 0050). 8 : leurs nœuds,
/// cherchés à part, et le nœud de chaque segment.
pub const FORMAT_VERSION: i32 = 8;
const FILE_PREFIX: &str = "index-";
const FILE_SUFFIX: &str = ".sqlite";
/// Séparateur des étiquettes d'une note dans sa colonne : une étiquette tient sur une ligne.
const TAG_SEPARATOR: char = '\n';
/// Les trigrammes de la recherche plein texte ne trouvent que les mots d'au moins 3 caractères.
const TRIGRAM: usize = 3;
/// Les tables du schéma, toutes présentes dans une base utilisable.
const EXPECTED_TABLES: i64 = 9;

const SETTINGS: &str = "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL; \
                        PRAGMA foreign_keys = ON;";

/// Le texte de chaque note est gardé sans majuscule ni accent (`folded`), tel que la recherche
/// le compare ; la table plein texte le découpe en trigrammes, sans rien y changer. Le type de
/// contenu est gardé par son nom ; le conteneur, par son chemin, vide pour une note. Les entrées
/// d'un cahier de recherche ont leur table, rattachée à leur cahier, et leur table plein texte.
const SCHEMA: &str = "
CREATE TABLE notes (
    id INTEGER PRIMARY KEY,
    path TEXT NOT NULL UNIQUE,
    folder TEXT NOT NULL,
    title TEXT NOT NULL,
    modified INTEGER NOT NULL,
    size INTEGER NOT NULL,
    pinned INTEGER NOT NULL,
    tags TEXT NOT NULL,
    type TEXT NOT NULL,
    container TEXT,
    content TEXT NOT NULL
);
CREATE INDEX notes_by_folder ON notes (folder);
CREATE TABLE note_tags (
    note INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    tag TEXT NOT NULL
);
CREATE INDEX note_tags_by_tag ON note_tags (tag);
CREATE INDEX note_tags_by_note ON note_tags (note);
CREATE VIRTUAL TABLE notes_text USING fts5 (folded, tokenize = 'trigram case_sensitive 1');
CREATE TABLE entries (
    id INTEGER PRIMARY KEY,
    note INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    content TEXT NOT NULL
);
CREATE INDEX entries_by_note ON entries (note);
CREATE VIRTUAL TABLE entries_text USING fts5 (folded, tokenize = 'trigram case_sensitive 1');
CREATE TABLE nodes (
    id INTEGER PRIMARY KEY,
    note INTEGER NOT NULL REFERENCES notes (id) ON DELETE CASCADE,
    path TEXT NOT NULL,
    title TEXT NOT NULL,
    content TEXT NOT NULL
);
CREATE INDEX nodes_by_note ON nodes (note);
CREATE VIRTUAL TABLE nodes_text USING fts5 (folded, tokenize = 'trigram case_sensitive 1');
CREATE TABLE segments (
    id INTEGER PRIMARY KEY,
    note TEXT NOT NULL,
    position INTEGER NOT NULL,
    heading TEXT NOT NULL,
    text TEXT NOT NULL,
    key INTEGER NOT NULL,
    node TEXT
);
CREATE INDEX segments_by_note ON segments (note, position);
CREATE TABLE segment_vectors (
    segment INTEGER NOT NULL REFERENCES segments (id) ON DELETE CASCADE,
    model TEXT NOT NULL,
    vector BLOB NOT NULL,
    PRIMARY KEY (segment, model)
);
";

const SUMMARY_COLUMNS: &str = "path, title, modified, pinned, tags, type, container";

/// Les index des espaces de travail, un fichier chacun dans `folder`.
#[derive(Debug)]
pub struct SqliteIndexes {
    pub(crate) folder: PathBuf,
}

impl SqliteIndexes {
    /// Les index rangés dans `folder` (le dossier de support de l'application).
    #[must_use]
    pub fn new(folder: PathBuf) -> Self {
        Self { folder }
    }

    /// Le fichier de l'index de l'espace de travail situé à `location` : son nom vient d'une
    /// empreinte stable du dossier, toujours la même d'un lancement à l'autre.
    #[must_use]
    pub fn file_for(&self, location: &WorkspaceLocation) -> PathBuf {
        let hash = stable_hash(location.as_str());
        self.folder
            .join(format!("{FILE_PREFIX}{hash:016x}{FILE_SUFFIX}"))
    }
}

impl IndexOpener for SqliteIndexes {
    fn open(&self, location: &WorkspaceLocation) -> Result<Arc<dyn NoteIndex>, StoreError> {
        fs::create_dir_all(&self.folder).map_err(|e| unavailable(&e))?;
        Ok(Arc::new(SqliteIndex::open(&self.file_for(location))?))
    }
}

/// L'empreinte FNV-1a sur 64 bits : stable, contrairement au hachage fourni par `std`.
fn stable_hash(text: &str) -> u64 {
    const OFFSET: u64 = 0xcbf2_9ce4_8422_2325;
    const PRIME: u64 = 0x0100_0000_01b3;
    text.bytes().fold(OFFSET, |hash, byte| {
        (hash ^ u64::from(byte)).wrapping_mul(PRIME)
    })
}

/// L'index d'un espace de travail, dans un fichier SQLite.
#[derive(Debug)]
pub struct SqliteIndex {
    file: PathBuf,
    connection: Mutex<Connection>,
}

impl SqliteIndex {
    /// L'index gardé dans `file` ; s'il n'existe pas, s'il est abîmé ou d'un autre format, un
    /// index vide le remplace.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si aucun index ne peut être créé dans `file`.
    pub fn open(file: &Path) -> Result<Self, StoreError> {
        let connection = match usable(file) {
            Some(connection) => connection,
            None => fresh(file).map_err(|e| unavailable(&e))?,
        };
        Ok(Self {
            file: file.to_path_buf(),
            connection: Mutex::new(connection),
        })
    }

    /// Fait `work` sur la base. Si elle se révèle abîmée, son fichier est effacé : le prochain
    /// lancement, ou la reconstruction demandée, repart d'un index vide.
    pub(crate) fn run<T>(
        &self,
        work: impl FnOnce(&mut Connection) -> rusqlite::Result<T>,
    ) -> Result<T, StoreError> {
        let mut connection = self
            .connection
            .lock()
            .unwrap_or_else(PoisonError::into_inner);
        work(&mut connection).map_err(|error| {
            if is_damage(&error) {
                remove_files(&self.file);
            }
            unavailable(&error)
        })
    }

    fn summaries(
        &self,
        filter: &str,
        params: &[&dyn ToSql],
    ) -> Result<Vec<NoteSummary>, StoreError> {
        self.run(|connection| {
            let sql = format!("SELECT {SUMMARY_COLUMNS} FROM notes {filter}");
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map(params, summary)?;
            rows.collect()
        })
    }
}

/// L'erreur dit que la base est abîmée, ou n'est pas une base SQLite.
fn is_damage(error: &rusqlite::Error) -> bool {
    matches!(
        error.sqlite_error_code(),
        Some(ErrorCode::DatabaseCorrupt | ErrorCode::NotADatabase)
    )
}

/// La base de `file` si elle s'ouvre, se lit et est au bon format. Le contrôle reste léger
/// (en-tête et schéma) : un contrôle complet relirait toute la base à chaque ouverture.
fn usable(file: &Path) -> Option<Connection> {
    if !file.exists() {
        return None;
    }
    let connection = Connection::open(file).ok()?;
    let version: i32 = connection
        .query_row("PRAGMA user_version", [], |row| row.get(0))
        .ok()?;
    let tables: i64 = connection
        .query_row(
            "SELECT count(*) FROM sqlite_master WHERE name IN ('notes', 'note_tags', 'notes_text', \
             'entries', 'entries_text', 'nodes', 'nodes_text', 'segments', 'segment_vectors')",
            [],
            |row| row.get(0),
        )
        .ok()?;
    (version == FORMAT_VERSION && tables == EXPECTED_TABLES)
        .then_some(connection)
        .filter(|connection| connection.execute_batch(SETTINGS).is_ok())
}

/// Efface la base. Les fichiers que SQLite pose à côté d'elle (`-wal`, `-shm`) peuvent rester :
/// SQLite ne les reprend pas pour une base neuve.
fn remove_files(file: &Path) {
    if let Err(error) = fs::remove_file(file) {
        tracing::debug!(%error, "fichier de l'index déjà absent");
    }
}

/// Une base vide, au format du jour, à la place de ce que contenait `file`.
fn fresh(file: &Path) -> rusqlite::Result<Connection> {
    remove_files(file);
    let connection = Connection::open(file)?;
    connection.execute_batch(SETTINGS)?;
    connection.execute_batch(SCHEMA)?;
    connection.pragma_update(None, "user_version", FORMAT_VERSION)?;
    Ok(connection)
}

impl NoteIndex for SqliteIndex {
    fn stamps(&self) -> Result<Vec<NoteStamp>, StoreError> {
        self.run(|connection| {
            let mut statement = connection.prepare("SELECT path, modified, size FROM notes")?;
            let rows = statement.query_map([], |row| {
                Ok(NoteStamp {
                    path: note_path(row, 0)?,
                    modified: Modified(unsigned(row, 1)?),
                    size: unsigned(row, 2)?,
                })
            })?;
            rows.collect()
        })
    }

    fn put(&self, notes: &[IndexedNote]) -> Result<(), StoreError> {
        self.run(|connection| {
            let transaction = connection.transaction()?;
            for note in notes {
                forget(&transaction, &note.stamp.path)?;
                keep(&transaction, note)?;
            }
            transaction.commit()
        })
    }

    fn remove(&self, notes: &[NotePath]) -> Result<(), StoreError> {
        self.run(|connection| {
            let transaction = connection.transaction()?;
            for note in notes {
                forget(&transaction, note)?;
                transaction.execute("DELETE FROM segments WHERE note = ?1", [note.to_path()])?;
            }
            transaction.commit()
        })
    }

    /// Repart d'une base neuve plutôt que de vider l'ancienne : la reconstruction demandée
    /// répare ainsi aussi un index abîmé.
    fn clear(&self) -> Result<(), StoreError> {
        self.run(|connection| {
            *connection = Connection::open_in_memory()?;
            *connection = fresh(&self.file)?;
            Ok(())
        })
    }

    fn content(&self, note: &NotePath) -> Result<Option<String>, StoreError> {
        self.run(|connection| {
            connection
                .query_row(
                    "SELECT content FROM notes WHERE path = ?1",
                    [note.to_path()],
                    |row| row.get::<_, String>(0),
                )
                .optional()
        })
    }

    fn notes_in(&self, folder: &Folder) -> Result<Vec<NoteSummary>, StoreError> {
        self.summaries("WHERE folder = ?1", &[&folder.to_path()])
    }

    fn all_notes(&self) -> Result<Vec<NoteSummary>, StoreError> {
        self.summaries("", &[])
    }

    fn tagged(&self, tag: &str) -> Result<Vec<NoteSummary>, StoreError> {
        self.summaries(
            "WHERE id IN (SELECT note FROM note_tags WHERE tag = ?1)",
            &[&tag],
        )
    }

    fn search(
        &self,
        query: &SearchQuery,
        types: &[ContentType],
    ) -> Result<Vec<(NoteSummary, String)>, StoreError> {
        let (filter, mut values) = search_filter(query, "notes_text");
        values.extend(types.iter().map(|kind| kind.name().to_owned()));
        let kinds = vec!["?"; types.len()].join(", ");
        let mut found = self.run(|connection| {
            let sql = format!(
                "SELECT n.path, n.title, n.modified, n.pinned, n.tags, n.type, n.container, \
                 n.content FROM notes_text JOIN notes AS n ON n.id = notes_text.rowid \
                 WHERE {filter} AND n.type IN ({kinds})"
            );
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map(params_from_iter(values), |row| {
                Ok((summary(row)?, row.get::<_, String>(7)?))
            })?;
            rows.collect::<rusqlite::Result<Vec<_>>>()
        })?;
        for (note, text) in &mut found {
            match note.content_type() {
                ContentType::MindMap => *text = searchable_text(note),
                ContentType::Canvas => *text = domain::canvas::indexed_text(note.title(), text),
                _ => {}
            }
        }
        if types.contains(&ContentType::Entry) {
            found.extend(self.found_entries(query)?);
        }
        if types.contains(&ContentType::Node) {
            found.extend(self.found_nodes(query)?);
        }
        Ok(found)
    }
}

/// La condition de recherche et ses paramètres : les mots d'au moins trois caractères passent par
/// les trigrammes (une phrase chacun, toutes exigées), les plus courts par le texte lui-même.
fn search_filter(query: &SearchQuery, table: &str) -> (String, Vec<String>) {
    let (long, short): (Vec<String>, Vec<String>) = query
        .words()
        .into_iter()
        .partition(|word| word.chars().count() >= TRIGRAM);
    let mut conditions = Vec::new();
    let mut words = Vec::new();
    if !long.is_empty() {
        conditions.push(format!("{table} MATCH ?"));
        let phrases: Vec<String> = long
            .iter()
            .map(|word| format!("\"{}\"", word.replace('"', "\"\"")))
            .collect();
        words.push(phrases.join(" "));
    }
    for word in short {
        conditions.push(format!("instr({table}.folded, ?) > 0"));
        words.push(word);
    }
    (conditions.join(" AND "), words)
}

/// Oublie la note `path`, si l'index la connaît.
fn forget(connection: &Connection, path: &NotePath) -> rusqlite::Result<()> {
    let id: Option<i64> = connection
        .query_row(
            "SELECT id FROM notes WHERE path = ?1",
            [path.to_path()],
            |row| row.get(0),
        )
        .optional()?;
    if let Some(id) = id {
        connection.execute(
            "DELETE FROM entries_text WHERE rowid IN (SELECT id FROM entries WHERE note = ?1)",
            [id],
        )?;
        connection.execute(
            "DELETE FROM nodes_text WHERE rowid IN (SELECT id FROM nodes WHERE note = ?1)",
            [id],
        )?;
        connection.execute("DELETE FROM notes_text WHERE rowid = ?1", [id])?;
        connection.execute("DELETE FROM notes WHERE id = ?1", [id])?;
    }
    Ok(())
}

/// Garde la note, que l'index ne connaît pas (ou plus).
fn keep(connection: &Connection, note: &IndexedNote) -> rusqlite::Result<()> {
    let stamp = &note.stamp;
    let summary = NoteSummary::new(stamp.path.clone(), &note.content, stamp.modified);
    let tags = summary.tags().join(&TAG_SEPARATOR.to_string());
    connection.execute(
        "INSERT INTO notes (path, folder, title, modified, size, pinned, tags, type, container, \
         content) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            stamp.path.to_path(),
            stamp.path.folder().to_path(),
            summary.title(),
            signed(stamp.modified.0)?,
            signed(stamp.size)?,
            summary.is_pinned(),
            tags,
            summary.content_type().name(),
            summary.container().map(NotePath::to_path),
            note.content,
        ],
    )?;
    let id = connection.last_insert_rowid();
    connection.execute(
        "INSERT INTO notes_text (rowid, folded) VALUES (?1, ?2)",
        params![id, folded(&nodes::searched_text(&summary, &note.content))],
    )?;
    for tag in summary.tags() {
        connection.execute(
            "INSERT INTO note_tags (note, tag) VALUES (?1, ?2)",
            params![id, tag],
        )?;
    }
    entries::keep_entries(connection, id, &summary, &note.content)?;
    nodes::keep_nodes(connection, id, &summary, &note.content)?;
    Ok(())
}

/// Le résumé lu dans les colonnes `path, title, modified, pinned, tags, type, container`.
fn summary(row: &Row<'_>) -> rusqlite::Result<NoteSummary> {
    let tags: String = row.get(4)?;
    let tags = if tags.is_empty() {
        Vec::new()
    } else {
        tags.split(TAG_SEPARATOR).map(str::to_owned).collect()
    };
    Ok(NoteSummary::indexed(
        note_path(row, 0)?,
        row.get(1)?,
        Modified(unsigned(row, 2)?),
        row.get(3)?,
        tags,
    )
    .of_type(content_type(row, 5)?, container(row, 6)?))
}

fn content_type(row: &Row<'_>, column: usize) -> rusqlite::Result<ContentType> {
    let name: String = row.get(column)?;
    ContentType::from_name(&name).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            rusqlite::types::Type::Text,
            format!("type de contenu inconnu : {name}").into(),
        )
    })
}

/// Le conteneur de l'élément, s'il en a un.
fn container(row: &Row<'_>, column: usize) -> rusqlite::Result<Option<NotePath>> {
    let text: Option<String> = row.get(column)?;
    text.map(|_| note_path(row, column)).transpose()
}

fn note_path(row: &Row<'_>, column: usize) -> rusqlite::Result<NotePath> {
    let text: String = row.get(column)?;
    NotePath::parse(&text).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            rusqlite::types::Type::Text,
            Box::new(error),
        )
    })
}

fn unsigned(row: &Row<'_>, column: usize) -> rusqlite::Result<u64> {
    let value: i64 = row.get(column)?;
    u64::try_from(value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            rusqlite::types::Type::Integer,
            Box::new(error),
        )
    })
}

fn signed(value: u64) -> rusqlite::Result<i64> {
    i64::try_from(value).map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

pub(crate) fn unavailable(error: &impl std::fmt::Display) -> StoreError {
    StoreError::Unavailable(error.to_string())
}

#[cfg(test)]
mod tests {
    use rusqlite::ffi;
    use tempfile::TempDir;

    use super::*;

    fn failure(code: i32) -> rusqlite::Error {
        rusqlite::Error::SqliteFailure(ffi::Error::new(code), None)
    }

    #[test]
    fn a_damaged_base_loses_its_file_and_a_rebuild_starts_a_new_one() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("index.sqlite");
        let index = SqliteIndex::open(&file).unwrap();
        let failed = index.run(|_| Err::<(), _>(failure(ffi::SQLITE_CORRUPT)));
        assert!(matches!(failed, Err(StoreError::Unavailable(_))));
        assert!(!file.exists());
        fs::write(&file, "pas une base").unwrap();
        let failed = index.run(|_| Err::<(), _>(failure(ffi::SQLITE_NOTADB)));
        assert!(matches!(failed, Err(StoreError::Unavailable(_))));
        assert!(!file.exists());
        index.clear().unwrap();
        assert!(file.exists());
        assert!(index.all_notes().unwrap().is_empty());
    }

    /// Un élément rangé dans un conteneur, comme le gardera un type à venir : le format n'a pas
    /// à changer pour lui.
    #[test]
    fn an_element_kept_with_a_container_is_read_back_with_it() {
        let dir = TempDir::new().unwrap();
        let index = SqliteIndex::open(&dir.path().join("index.sqlite")).unwrap();
        index
            .run(|connection| {
                connection.execute(
                    "INSERT INTO notes (path, folder, title, modified, size, pinned, tags, type, \
                     container, content) VALUES ('CRM/carte.md', 'CRM', 'Carte', 1, 1, 0, '', \
                     'note', 'CRM/tableau.md', '# Carte')",
                    [],
                )
            })
            .unwrap();
        let all = index.all_notes().unwrap();
        assert_eq!(
            all[0].container(),
            Some(&NotePath::parse("CRM/tableau.md").unwrap())
        );
        assert_eq!(all[0].content_type(), ContentType::Note);
    }

    #[test]
    fn an_unknown_type_or_container_cannot_be_read() {
        let dir = TempDir::new().unwrap();
        let index = SqliteIndex::open(&dir.path().join("index.sqlite")).unwrap();
        for (kind, container) in [("page", "NULL"), ("note", "'../hors.md'")] {
            index
                .run(|connection| {
                    connection.execute("DELETE FROM notes", [])?;
                    connection.execute(
                        &format!(
                            "INSERT INTO notes (path, folder, title, modified, size, pinned, \
                             tags, type, container, content) VALUES ('a.md', '', 'A', 1, 1, 0, \
                             '', '{kind}', {container}, '')"
                        ),
                        [],
                    )
                })
                .unwrap();
            assert!(matches!(index.all_notes(), Err(StoreError::Unavailable(_))));
        }
    }

    #[test]
    fn another_failure_keeps_the_base() {
        let dir = TempDir::new().unwrap();
        let file = dir.path().join("index.sqlite");
        let index = SqliteIndex::open(&file).unwrap();
        let failed = index.run(|_| Err::<(), _>(failure(ffi::SQLITE_BUSY)));
        assert!(matches!(failed, Err(StoreError::Unavailable(_))));
        assert!(file.exists());
    }
}
