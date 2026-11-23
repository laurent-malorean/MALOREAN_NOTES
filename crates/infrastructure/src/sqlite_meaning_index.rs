//! L'index de sens d'un espace de travail, dans le fichier SQLite de son index de mots (fiche
//! 0028) : les segments des notes et leurs vecteurs de sens (fiche 0042). Les vecteurs sont des
//! décimaux 32 bits en petit-boutiste dans une colonne BLOB ; la comparaison se fait en Rust, ligne
//! par ligne, sans charger tous les vecteurs en mémoire. Une taille de vecteur fausse est une
//! valeur abîmée : l'index est indisponible, comme pour les autres valeurs.

use std::collections::HashMap;
use std::sync::Arc;

use application::{
    FoundSegment, MeaningIndex, MeaningIndexError, MeaningSearch, MeaningStatus, PendingSegment,
    RelatedNote, SegmentId, StoreError, check_dimensions,
};
use domain::segments::{Segment, SegmentKey, reuse};
use domain::{MeaningModel, MeaningVector, NotePath, dot_product};
use rusqlite::{Connection, OptionalExtension, Row, params};

use std::fs;

use application::{NoteIndex, WorkspaceLocation};

use crate::sqlite_index::{SqliteIndex, SqliteIndexes, unavailable};

impl SqliteIndexes {
    /// L'index de l'espace de travail situé à `location` et son index de sens : le même fichier,
    /// la même connexion, donc jamais l'un sans l'autre.
    ///
    /// # Errors
    ///
    /// [`StoreError::Unavailable`] si aucun index ne peut être créé.
    pub fn open_with_meaning(
        &self,
        location: &WorkspaceLocation,
    ) -> Result<(Arc<dyn NoteIndex>, Arc<SqliteMeaningIndex>), StoreError> {
        fs::create_dir_all(&self.folder).map_err(|e| unavailable(&e))?;
        let index = Arc::new(SqliteIndex::open(&self.file_for(location))?);
        let meaning = Arc::new(SqliteMeaningIndex::new(Arc::clone(&index)));
        Ok((index, meaning))
    }
}

/// Les octets d'un décimal 32 bits.
const FLOAT_BYTES: usize = 4;

/// L'index de sens, qui partage la base et la connexion de `SqliteIndex`.
#[derive(Debug)]
pub struct SqliteMeaningIndex {
    index: Arc<SqliteIndex>,
}

impl SqliteMeaningIndex {
    /// L'index de sens rangé dans la base de `index`.
    #[must_use]
    pub fn new(index: Arc<SqliteIndex>) -> Self {
        Self { index }
    }

    fn run<T>(
        &self,
        work: impl FnOnce(&mut Connection) -> rusqlite::Result<T>,
    ) -> Result<T, MeaningIndexError> {
        Ok(self.index.run(work)?)
    }
}

fn conversion(column: usize, kind: rusqlite::types::Type, reason: &str) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(column, kind, reason.to_owned().into())
}

/// La clé gardée comme entier signé : les mêmes 64 bits.
fn key_to_sql(key: SegmentKey) -> i64 {
    i64::from_ne_bytes(key.value().to_ne_bytes())
}

fn key_from_sql(value: i64) -> SegmentKey {
    SegmentKey::new(u64::from_ne_bytes(value.to_ne_bytes()))
}

fn id_from_sql(row: &Row<'_>, column: usize) -> rusqlite::Result<SegmentId> {
    let value: i64 = row.get(column)?;
    u64::try_from(value).map(SegmentId::new).map_err(|_| {
        conversion(
            column,
            rusqlite::types::Type::Integer,
            "identifiant négatif",
        )
    })
}

fn id_to_sql(id: SegmentId) -> rusqlite::Result<i64> {
    i64::try_from(id.value())
        .map_err(|error| rusqlite::Error::ToSqlConversionFailure(Box::new(error)))
}

fn encode(vector: &MeaningVector) -> Vec<u8> {
    vector
        .values()
        .iter()
        .flat_map(|value| value.to_le_bytes())
        .collect()
}

/// Lit les décimaux de `bytes` dans `values` ; la taille doit être celle de `dimensions`.
fn decode(
    bytes: &[u8],
    dimensions: usize,
    values: &mut Vec<f32>,
    column: usize,
) -> rusqlite::Result<()> {
    if bytes.len() != dimensions * FLOAT_BYTES {
        return Err(conversion(
            column,
            rusqlite::types::Type::Blob,
            "vecteur de sens de taille fausse",
        ));
    }
    values.clear();
    values.extend(
        bytes
            .as_chunks::<FLOAT_BYTES>()
            .0
            .iter()
            .map(|chunk| f32::from_le_bytes(*chunk)),
    );
    Ok(())
}

fn blob<'a>(row: &'a Row<'_>, column: usize) -> rusqlite::Result<&'a [u8]> {
    row.get_ref(column)?.as_blob().map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(
            column,
            rusqlite::types::Type::Blob,
            Box::new(error),
        )
    })
}

fn sql_limit(limit: usize) -> i64 {
    i64::try_from(limit).unwrap_or(i64::MAX)
}

impl MeaningIndex for SqliteMeaningIndex {
    fn replace_segments(
        &self,
        note: &NotePath,
        segments: &[Segment],
    ) -> Result<usize, MeaningIndexError> {
        let path = note.to_path();
        self.run(|connection| {
            let transaction = connection.transaction()?;
            let old: Vec<(SegmentId, SegmentKey)> = {
                let mut statement = transaction
                    .prepare("SELECT id, key FROM segments WHERE note = ?1 ORDER BY position")?;
                let rows = statement.query_map([&path], |row| {
                    Ok((id_from_sql(row, 0)?, key_from_sql(row.get(1)?)))
                })?;
                rows.collect::<rusqlite::Result<_>>()?
            };
            let keys: Vec<SegmentKey> = segments.iter().map(Segment::key).collect();
            let plan = reuse(&old, &keys);
            for id in &plan.removed {
                transaction.execute("DELETE FROM segments WHERE id = ?1", [id_to_sql(*id)?])?;
            }
            let mut added = 0;
            for (position, (segment, kept)) in segments.iter().zip(&plan.kept).enumerate() {
                let position = sql_limit(position);
                if let Some(id) = kept {
                    transaction.execute(
                        "UPDATE segments SET position = ?1 WHERE id = ?2",
                        params![position, id_to_sql(*id)?],
                    )?;
                    continue;
                }
                added += 1;
                transaction.execute(
                    "INSERT INTO segments (note, position, heading, text, key, node) \
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                    params![
                        path,
                        position,
                        segment.heading(),
                        segment.text(),
                        key_to_sql(segment.key()),
                        segment.node()
                    ],
                )?;
            }
            transaction.commit()?;
            Ok(added)
        })
    }

    fn remove_note(&self, note: &NotePath) -> Result<(), MeaningIndexError> {
        self.run(|connection| {
            connection.execute("DELETE FROM segments WHERE note = ?1", [note.to_path()])?;
            Ok(())
        })
    }

    fn clear(&self) -> Result<(), MeaningIndexError> {
        self.run(|connection| {
            connection.execute("DELETE FROM segments", [])?;
            Ok(())
        })
    }

    fn clear_vectors(&self, model: MeaningModel) -> Result<(), MeaningIndexError> {
        self.run(|connection| {
            connection.execute(
                "DELETE FROM segment_vectors WHERE model = ?1",
                [model.name()],
            )?;
            Ok(())
        })
    }

    fn without_vector(
        &self,
        model: MeaningModel,
        limit: usize,
    ) -> Result<Vec<PendingSegment>, MeaningIndexError> {
        self.run(|connection| {
            let mut statement = connection.prepare(
                "SELECT s.id, s.heading, s.text, s.node FROM segments AS s WHERE NOT EXISTS \
                 (SELECT 1 FROM segment_vectors AS v WHERE v.segment = s.id AND v.model = ?1) \
                 ORDER BY s.id LIMIT ?2",
            )?;
            let rows = statement.query_map(params![model.name(), sql_limit(limit)], |row| {
                Ok(PendingSegment {
                    id: id_from_sql(row, 0)?,
                    segment: Segment::from_stored(
                        &row.get::<_, String>(1)?,
                        &row.get::<_, String>(2)?,
                        row.get::<_, Option<String>>(3)?.as_deref(),
                    ),
                })
            })?;
            rows.collect()
        })
    }

    fn put_vectors(
        &self,
        model: MeaningModel,
        vectors: &[(SegmentId, MeaningVector)],
    ) -> Result<(), MeaningIndexError> {
        for (_, vector) in vectors {
            check_dimensions(model, vector)?;
        }
        self.run(|connection| {
            let transaction = connection.transaction()?;
            for (id, vector) in vectors {
                // Un segment qui n'est plus gardé ne donne aucune ligne : le vecteur est ignoré.
                transaction.execute(
                    "INSERT OR REPLACE INTO segment_vectors (segment, model, vector) \
                     SELECT id, ?2, ?3 FROM segments WHERE id = ?1",
                    params![id_to_sql(*id)?, model.name(), encode(vector)],
                )?;
            }
            transaction.commit()
        })
    }
}

/// Un segment et son score, avant de lire son texte.
struct Candidate {
    id: i64,
    note: String,
    position: i64,
    score: f32,
}

impl MeaningSearch for SqliteMeaningIndex {
    fn nearest(
        &self,
        model: MeaningModel,
        question: &MeaningVector,
        limit: usize,
    ) -> Result<Vec<FoundSegment>, MeaningIndexError> {
        check_dimensions(model, question)?;
        self.run(|connection| {
            let mut candidates = Vec::new();
            let mut values = Vec::with_capacity(model.dimensions());
            let mut statement = connection.prepare(
                "SELECT s.id, s.note, s.position, v.vector FROM segment_vectors AS v \
                 JOIN segments AS s ON s.id = v.segment WHERE v.model = ?1",
            )?;
            let mut rows = statement.query([model.name()])?;
            while let Some(row) = rows.next()? {
                decode(blob(row, 3)?, model.dimensions(), &mut values, 3)?;
                candidates.push(Candidate {
                    id: row.get(0)?,
                    note: row.get(1)?,
                    position: row.get(2)?,
                    score: dot_product(question.values(), &values),
                });
            }
            candidates.sort_by(|a, b| {
                b.score
                    .total_cmp(&a.score)
                    .then_with(|| a.note.cmp(&b.note))
                    .then_with(|| a.position.cmp(&b.position))
            });
            candidates.truncate(limit);
            candidates
                .into_iter()
                .map(|candidate| found(connection, &candidate))
                .collect()
        })
    }

    fn related_notes(
        &self,
        model: MeaningModel,
        note: &NotePath,
        limit: usize,
    ) -> Result<Vec<RelatedNote>, MeaningIndexError> {
        let path = note.to_path();
        self.run(|connection| {
            let mut best: HashMap<String, f32> = HashMap::new();
            let mine = vectors_of(connection, model, &path)?;
            if mine.is_empty() {
                return Ok(Vec::new());
            }
            let mut values = Vec::with_capacity(model.dimensions());
            let mut statement = connection.prepare(
                "SELECT s.note, v.vector FROM segment_vectors AS v \
                 JOIN segments AS s ON s.id = v.segment WHERE v.model = ?1 AND s.note <> ?2",
            )?;
            let mut rows = statement.query(params![model.name(), path])?;
            while let Some(row) = rows.next()? {
                decode(blob(row, 1)?, model.dimensions(), &mut values, 1)?;
                let score = mine
                    .iter()
                    .map(|own| dot_product(own, &values))
                    .reduce(f32::max)
                    .unwrap_or(f32::MIN);
                let other: String = row.get(0)?;
                best.entry(other)
                    .and_modify(|kept| *kept = kept.max(score))
                    .or_insert(score);
            }
            let mut related: Vec<(String, f32)> = best.into_iter().collect();
            related.sort_by(|a, b| b.1.total_cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
            related.truncate(limit);
            related
                .into_iter()
                .map(|(other, score)| {
                    Ok(RelatedNote {
                        note: parse_note(&other)?,
                        score,
                    })
                })
                .collect()
        })
    }

    fn status(&self, model: MeaningModel) -> Result<MeaningStatus, MeaningIndexError> {
        self.run(|connection| {
            let count = |sql: &str, params: &[&dyn rusqlite::ToSql]| -> rusqlite::Result<usize> {
                let value: i64 = connection.query_row(sql, params, |row| row.get(0))?;
                usize::try_from(value)
                    .map_err(|_| conversion(0, rusqlite::types::Type::Integer, "compte négatif"))
            };
            Ok(MeaningStatus {
                segments: count("SELECT count(*) FROM segments", &[])?,
                with_vector: count(
                    "SELECT count(*) FROM segment_vectors WHERE model = ?1",
                    &[&model.name()],
                )?,
                notes: count("SELECT count(DISTINCT note) FROM segments", &[])?,
            })
        })
    }
}

fn parse_note(text: &str) -> rusqlite::Result<NotePath> {
    NotePath::parse(text).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(0, rusqlite::types::Type::Text, Box::new(error))
    })
}

/// Les vecteurs de `model` des segments de la note `path`.
fn vectors_of(
    connection: &Connection,
    model: MeaningModel,
    path: &str,
) -> rusqlite::Result<Vec<Vec<f32>>> {
    let mut statement = connection.prepare(
        "SELECT v.vector FROM segment_vectors AS v JOIN segments AS s ON s.id = v.segment \
         WHERE v.model = ?1 AND s.note = ?2",
    )?;
    let mut rows = statement.query(params![model.name(), path])?;
    let mut vectors = Vec::new();
    while let Some(row) = rows.next()? {
        let mut values = Vec::with_capacity(model.dimensions());
        decode(blob(row, 0)?, model.dimensions(), &mut values, 0)?;
        vectors.push(values);
    }
    Ok(vectors)
}

/// Le segment du candidat, avec sa note, son titre complet et son texte.
fn found(connection: &Connection, candidate: &Candidate) -> rusqlite::Result<FoundSegment> {
    let (heading, text, node): (String, String, Option<String>) = connection
        .query_row(
            "SELECT heading, text, node FROM segments WHERE id = ?1",
            [candidate.id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .optional()?
        .ok_or(rusqlite::Error::QueryReturnedNoRows)?;
    Ok(FoundSegment {
        note: parse_note(&candidate.note)?,
        segment: Segment::from_stored(&heading, &text, node.as_deref()),
        score: candidate.score,
    })
}
