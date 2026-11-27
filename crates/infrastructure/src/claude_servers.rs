//! Ce que `claude mcp` dit des serveurs MCP extérieurs (fiche 0105) : la liste (`claude mcp list`,
//! qui vérifie chaque serveur : plus de dix secondes pour trente serveurs) et la description d'un
//! serveur ajouté par l'utilisateur à son Claude Code (`claude mcp get`), que l'application passe
//! elle-même à Claude Code pour un tour. Une description peut contenir un jeton ou un mot de
//! passe : elle ne vit que le temps du lancement et n'est jamais écrite ailleurs, ni dans le
//! journal (aucune forme de débogage ne l'affiche).

use domain::external_servers::{ExternalServer, ServerName, ServerState};
use serde_json::{Map, Value, json};

/// Les signes que `claude mcp list` met devant l'état de chaque serveur : connecté, à connecter,
/// en échec, en attente d'approbation.
const STATE_MARKS: [(&str, ServerState); 4] = [
    (" - ✔ ", ServerState::Connected),
    (" - ! ", ServerState::ToConnect),
    (" - ✘ ", ServerState::Failed),
    (" - ⏸ ", ServerState::Failed),
];

/// Les serveurs que dit `claude mcp list`, dans son ordre : une ligne `nom: cible - ✔ Connected`
/// par serveur ; ce qui n'a pas cette forme (« Checking MCP server health… », lignes vides) est
/// ignoré. Un état inconnu de l'application vaut « en échec ».
pub(crate) fn parse_list(output: &str) -> Vec<ExternalServer> {
    output.lines().filter_map(parse_list_line).collect()
}

fn parse_list_line(line: &str) -> Option<ExternalServer> {
    let (name, rest) = line.split_once(": ")?;
    let state = STATE_MARKS
        .iter()
        .filter_map(|(mark, state)| rest.find(mark).map(|at| (at, *state)))
        .min_by_key(|(at, _)| *at)
        .map(|(_, state)| state)?;
    Some(ExternalServer {
        name: ServerName::new(name)?,
        state,
    })
}

/// Ce que `claude mcp get` dit d'un serveur : ses champs, son environnement, ses en-têtes.
#[derive(Default)]
struct Fields {
    fields: Map<String, Value>,
    env: Map<String, Value>,
    headers: Map<String, Value>,
}

impl Fields {
    /// Lit la sortie de `claude mcp get` : des champs `  Clé: valeur`, dont `Environment:` et
    /// `Headers:` sont suivis de lignes à quatre espaces (`CLE=valeur`, `En-tête: valeur`).
    fn read(output: &str) -> Self {
        let mut read = Self::default();
        let mut section: Option<&str> = None;
        for line in output.lines() {
            if let Some(entry) = line.strip_prefix("    ") {
                read.add_entry(section, entry);
            } else if let Some(field) = line.strip_prefix("  ") {
                section = read.add_field(field);
            }
        }
        read
    }

    /// Une ligne de l'environnement ou des en-têtes, selon la `section` en cours.
    fn add_entry(&mut self, section: Option<&str>, entry: &str) {
        let (target, separator) = match section {
            Some("Environment") => (&mut self.env, "="),
            Some("Headers") => (&mut self.headers, ": "),
            _ => return,
        };
        if let Some((key, value)) = entry.split_once(separator) {
            target.insert(key.trim().to_owned(), json!(value));
        }
    }

    /// Un champ ; rend la section qu'il ouvre (`Environment`, `Headers`), s'il en ouvre une.
    fn add_field<'a>(&mut self, field: &'a str) -> Option<&'a str> {
        let (key, value) = field.split_once(':').unwrap_or((field, ""));
        if matches!(key, "Environment" | "Headers") {
            return Some(key);
        }
        let value = value.trim();
        if !value.is_empty() {
            self.fields.insert(key.to_owned(), json!(value));
        }
        None
    }

    fn text(&self, key: &str) -> Option<&str> {
        self.fields.get(key)?.as_str()
    }

    /// Un serveur lancé sur le Mac : sa commande, ses arguments, son environnement.
    fn stdio(self) -> Option<Value> {
        let args: Vec<&str> = self
            .text("Args")
            .unwrap_or_default()
            .split_whitespace()
            .collect();
        let mut description =
            json!({ "type": "stdio", "command": self.text("Command")?, "args": args });
        if !self.env.is_empty() {
            description["env"] = Value::Object(self.env);
        }
        Some(description)
    }

    /// Un serveur joint par une adresse (`http` ou `sse`) : son adresse, ses en-têtes.
    fn web(self, kind: &str) -> Option<Value> {
        let mut description = json!({ "type": kind, "url": self.text("URL")? });
        if !self.headers.is_empty() {
            description["headers"] = Value::Object(self.headers);
        }
        Some(description)
    }
}

/// La description d'un serveur lue dans `claude mcp get`, telle que `--mcp-config` la demande ;
/// rien si le serveur n'est pas décrit comme un serveur lancé sur le Mac (`stdio`) ou joint par
/// une adresse (`http`, `sse`). Les arguments d'une commande sont séparés aux espaces : Claude
/// Code les donne sur une seule ligne.
pub(crate) fn parse_description(output: &str) -> Option<Value> {
    let fields = Fields::read(output);
    match fields.text("Type")? {
        "stdio" => fields.stdio(),
        kind @ ("http" | "sse") => {
            let kind = kind.to_owned();
            fields.web(&kind)
        }
        _ => None,
    }
}

#[cfg(test)]
#[path = "claude_servers_tests.rs"]
mod tests;
