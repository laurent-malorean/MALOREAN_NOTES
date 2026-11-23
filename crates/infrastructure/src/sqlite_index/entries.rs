//! Les entrées des cahiers de recherche dans l'index (fiche 0041) : rangées à part, chacune avec
//! son cahier pour conteneur.

use application::StoreError;
use domain::research_notebook::{entry_summary, indexed_entries};
use domain::search::{SearchQuery, folded};
use domain::{Modified, NoteSummary};
use rusqlite::{Connection, params, params_from_iter};

use super::{SqliteIndex, note_path, search_filter, unsigned};

impl SqliteIndex {
    /// Les entrées des cahiers de recherche qui contiennent tous les mots de `query`, chacune
    /// avec son texte, dans l'ordre où elles ont été gardées.
    pub(super) fn found_entries(
        &self,
        query: &SearchQuery,
    ) -> Result<Vec<(NoteSummary, String)>, StoreError> {
        let (filter, values) = search_filter(query, "entries_text");
        self.run(|connection| {
            let sql = format!(
                "SELECT n.path, e.title, n.modified, e.content FROM entries_text \
                 JOIN entries AS e ON e.id = entries_text.rowid JOIN notes AS n ON n.id = e.note \
                 WHERE {filter} ORDER BY e.id"
            );
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map(params_from_iter(values), |row| {
                let notebook = note_path(row, 0)?;
                let modified = Modified(unsigned(row, 2)?);
                Ok((
                    entry_summary(&notebook, row.get(1)?, modified),
                    row.get::<_, String>(3)?,
                ))
            })?;
            rows.collect()
        })
    }
}

/// Range les entrées du cahier `summary` (de texte `content`), gardé sous l'identifiant `id`.
pub(super) fn keep_entries(
    connection: &Connection,
    id: i64,
    summary: &NoteSummary,
    content: &str,
) -> rusqlite::Result<()> {
    for (entry, text) in indexed_entries(summary, content) {
        connection.execute(
            "INSERT INTO entries (note, title, content) VALUES (?1, ?2, ?3)",
            params![id, entry.title(), text],
        )?;
        connection.execute(
            "INSERT INTO entries_text (rowid, folded) VALUES (?1, ?2)",
            params![connection.last_insert_rowid(), folded(&text)],
        )?;
    }
    Ok(())
}
