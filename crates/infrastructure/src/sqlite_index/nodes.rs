//! Les nœuds des cartes mentales dans l'index (fiche 0050) : rangés à part, comme les entrées d'un
//! cahier de recherche, chacun avec sa carte pour conteneur.

use application::StoreError;
use domain::mind_map::{NodePath, indexed_node_entries, node_summary, searchable_text};
use domain::search::{SearchQuery, folded};
use domain::{ContentType, Modified, NoteSummary};
use rusqlite::{Connection, params, params_from_iter};

use super::{SqliteIndex, note_path, search_filter, unsigned};

impl SqliteIndex {
    /// Les nœuds des cartes mentales qui contiennent tous les mots de `query` dans leur titre ou
    /// leur détail, chacun avec son texte, dans l'ordre où ils ont été gardés.
    pub(super) fn found_nodes(
        &self,
        query: &SearchQuery,
    ) -> Result<Vec<(NoteSummary, String)>, StoreError> {
        let (filter, values) = search_filter(query, "nodes_text");
        self.run(|connection| {
            let sql = format!(
                "SELECT n.path, d.title, n.modified, d.content, d.path FROM nodes_text \
                 JOIN nodes AS d ON d.id = nodes_text.rowid JOIN notes AS n ON n.id = d.note \
                 WHERE {filter} ORDER BY d.id"
            );
            let mut statement = connection.prepare(&sql)?;
            let rows = statement.query_map(params_from_iter(values), |row| {
                let map = note_path(row, 0)?;
                let modified = Modified(unsigned(row, 2)?);
                let node = NodePath(
                    row.get::<_, String>(4)?
                        .split('.')
                        .filter_map(|rank| rank.parse().ok())
                        .collect(),
                );
                Ok((
                    node_summary(&map, &row.get::<_, String>(1)?, modified, &node),
                    row.get::<_, String>(3)?,
                ))
            })?;
            rows.collect()
        })
    }
}

/// Range les nœuds de la carte `summary` (de texte `content`), gardée sous l'identifiant `id`.
pub(super) fn keep_nodes(
    connection: &Connection,
    id: i64,
    summary: &NoteSummary,
    content: &str,
) -> rusqlite::Result<()> {
    for (node, text) in indexed_node_entries(summary, content) {
        connection.execute(
            "INSERT INTO nodes (note, path, title, content) VALUES (?1, ?2, ?3, ?4)",
            params![id, node.node(), node.title(), text],
        )?;
        connection.execute(
            "INSERT INTO nodes_text (rowid, folded) VALUES (?1, ?2)",
            params![connection.last_insert_rowid(), folded(&text)],
        )?;
    }
    Ok(())
}

/// Ce que la recherche par les mots lit d'une note : son texte, sauf pour une carte mentale, dont
/// seuls le titre et les étiquettes comptent (ses nœuds sont cherchés à part), et pour un canvas, les
/// textes qu'il montre (pas son JSON).
pub(super) fn searched_text(summary: &NoteSummary, content: &str) -> String {
    match summary.content_type() {
        ContentType::MindMap => searchable_text(summary),
        ContentType::Canvas => domain::canvas::indexed_text(summary.title(), content),
        _ => content.to_owned(),
    }
}
