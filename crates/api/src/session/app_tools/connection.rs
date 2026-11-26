//! Brancher une IA (fiche 0056) : les outils de l'application offerts à une IA extérieure, par
//! la clé de branchement et la prise de branchement. Même serveur, mêmes outils, mêmes cas
//! d'usage que pour la colonne Claude Code ; ce qui change, c'est la clé (stable, révocable) et
//! l'absence de tour : les outils visent l'espace de travail ouvert au moment de l'appel.

use std::path::PathBuf;
use std::sync::Arc;

use application::use_cases::{CreateConnectionKey, ReadConnectionKey, RevokeConnectionKey};
use application::{AppError, ConnectionKeys, ConnectionSocket, SecretMaker};
use domain::connection_key::ConnectionKey;
use serde_json::Value;

mod configuration;

use super::{Fallback, ToolsScope, mcp};
use crate::{ApiError, ConnectionInfo, ConnectionKeyItem, Session};

/// Ce que l'application répond à une demande sans clé de branchement valable.
const CONNECTION_KEY_REFUSED: &str = "clé refusée : cette clé de branchement n'existe pas ou a \
     été révoquée";

/// Ce qu'il faut pour brancher une IA : où garder la clé, d'où tirer son secret, la prise qui la
/// reçoit, et le programme de l'application, que l'IA lance (la commande de branchement).
#[derive(Debug, Clone)]
pub(in crate::session) struct Connection {
    keys: Arc<dyn ConnectionKeys>,
    secrets: Arc<dyn SecretMaker>,
    socket: Arc<dyn ConnectionSocket>,
    program: PathBuf,
}

impl Session {
    /// La même session, où l'on peut brancher une IA extérieure : `keys` garde la clé de
    /// branchement, `secrets` en tire le secret, `socket` est la prise qui n'existe que tant que
    /// la clé existe, `program` le programme de l'application, que l'IA lance. Sans cela, aucune IA
    /// ne peut être branchée.
    #[must_use]
    pub fn with_connection(
        mut self,
        keys: Arc<dyn ConnectionKeys>,
        secrets: Arc<dyn SecretMaker>,
        socket: Arc<dyn ConnectionSocket>,
        program: PathBuf,
    ) -> Self {
        self.connection = Some(Connection {
            keys,
            secrets,
            socket,
            program,
        });
        self
    }

    fn connection(&self) -> Result<&Connection, ApiError> {
        self.connection.as_ref().ok_or_else(|| ApiError {
            message: "brancher une IA n'est pas disponible".to_owned(),
        })
    }

    /// La clé de branchement, s'il y en a une.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : brancher une IA indisponible, fichier
    /// de la clé illisible.
    pub fn connection_key(&self) -> Result<Option<ConnectionKey>, ApiError> {
        Ok(ReadConnectionKey::new(&*self.connection()?.keys).execute()?)
    }

    /// Où en est le branchement : la clé de branchement, s'il y en a une, avec ce qu'il faut coller
    /// dans Claude et dans Codex pour les brancher.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : brancher une IA indisponible, fichier
    /// de la clé illisible.
    pub fn connection_info(&self) -> Result<ConnectionInfo, ApiError> {
        let program = &self.connection()?.program;
        Ok(ConnectionInfo {
            key: self.connection_key()?.map(|key| ConnectionKeyItem {
                secret: key.secret().to_owned(),
                created_on: key.created_on(),
                claude_config: configuration::claude_config(program, &key),
                codex_config: configuration::codex_config(program, &key),
            }),
        })
    }

    /// Crée la clé de branchement et ouvre la prise de branchement ; s'il y a déjà une clé, c'est
    /// elle qui est rendue (elle ne change que si on la révoque). Si la prise ne s'ouvre pas, la
    /// clé qui vient d'être créée est retirée : jamais de clé sans prise.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : brancher une IA indisponible, clé
    /// non gardée, prise non ouverte.
    pub fn create_connection_key(&self) -> Result<ConnectionKey, ApiError> {
        let connection = self.connection()?;
        let existed = self.connection_key()?.is_some();
        let key = CreateConnectionKey::new(&*connection.keys, &*connection.secrets, &*self.clock)
            .execute()?;
        if let Err(error) = connection.socket.open() {
            if !existed {
                RevokeConnectionKey::new(&*connection.keys)
                    .execute()
                    .unwrap_or_else(|error| {
                        tracing::warn!(%error, "clé de branchement non retirée");
                    });
            }
            return Err(AppError::from(error).into());
        }
        Ok(key)
    }

    /// Révoque la clé de branchement : elle est effacée, les IA branchées sont coupées tout de
    /// suite et la prise est refermée.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : brancher une IA indisponible, clé
    /// non effacée (la prise reste alors ouverte, la clé valable).
    pub fn revoke_connection_key(&self) -> Result<(), ApiError> {
        let connection = self.connection()?;
        RevokeConnectionKey::new(&*connection.keys).execute()?;
        connection.socket.close();
        Ok(())
    }

    /// Au lancement de l'application : ouvre la prise de branchement si une clé existe. Sans clé,
    /// aucune prise n'est ouverte.
    ///
    /// # Errors
    ///
    /// Un [`ApiError`] dont le message dit ce qui a échoué : brancher une IA indisponible, clé
    /// illisible, prise non ouverte.
    pub fn open_connection(&self) -> Result<(), ApiError> {
        if self.connection_key()?.is_some() {
            self.connection()?.socket.open().map_err(AppError::from)?;
        }
        Ok(())
    }

    /// La réponse à une ligne du protocole MCP reçue d'une IA extérieure avec la clé `key`, s'il
    /// en faut une : les outils ne répondent qu'à la clé de branchement qui existe, relue à
    /// chaque ligne, donc une clé révoquée n'est plus écoutée même sur une connexion ouverte.
    #[must_use]
    pub fn answer_connection(&self, key: &str, line: &str) -> Option<String> {
        let accepted = self
            .connection
            .as_ref()
            .is_some_and(|connection| ReadConnectionKey::new(&*connection.keys).accepts(key));
        let refusal = (!accepted).then_some(CONNECTION_KEY_REFUSED);
        mcp::answer(line, refusal, |tool, arguments: &Value| {
            self.call_tool(&Self::connected_scope(), tool, arguments)
        })
    }

    /// Ce que visent les outils d'une IA extérieure sans le paramètre `workspace` : l'espace de
    /// travail ouvert à cet instant, s'il est autorisé pour les IA (fiche 0074) ; le dossier des
    /// modèles n'est choisi que par l'interface, pour un tour de la colonne.
    const fn connected_scope() -> ToolsScope {
        ToolsScope {
            fallback: Fallback::Opened,
        }
    }
}

#[cfg(test)]
mod tests;
