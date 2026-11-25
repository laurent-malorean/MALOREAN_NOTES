//! Brancher une IA : créer, lire et révoquer la clé de branchement (fiche 0056).

use domain::connection_key::ConnectionKey;

use crate::{AppError, Clock, ConnectionKeys, SecretMaker, StoreError};

/// Crée la clé de branchement. Elle est stable : s'il y en a déjà une, c'est elle qui est rendue,
/// jamais une nouvelle.
#[derive(Debug)]
pub struct CreateConnectionKey<'a> {
    keys: &'a dyn ConnectionKeys,
    secrets: &'a dyn SecretMaker,
    clock: &'a dyn Clock,
}

impl<'a> CreateConnectionKey<'a> {
    /// Le cas d'usage, branché sur le stockage de la clé, la source de secrets et l'horloge.
    #[must_use]
    pub fn new(
        keys: &'a dyn ConnectionKeys,
        secrets: &'a dyn SecretMaker,
        clock: &'a dyn Clock,
    ) -> Self {
        Self {
            keys,
            secrets,
            clock,
        }
    }

    /// La clé de branchement : celle qui existe, ou une neuve, gardée aussitôt.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la clé ne peut pas être lue, tirée ou gardée.
    pub fn execute(&self) -> Result<ConnectionKey, AppError> {
        if let Some(key) = self.keys.load()? {
            return Ok(key);
        }
        let key = ConnectionKey::new(self.secrets.secret()?, self.clock.now())
            .ok_or_else(|| StoreError::Unavailable("le secret tiré est vide".to_owned()))?;
        self.keys.save(&key)?;
        Ok(key)
    }
}

/// Lit la clé de branchement.
#[derive(Debug)]
pub struct ReadConnectionKey<'a> {
    keys: &'a dyn ConnectionKeys,
}

impl<'a> ReadConnectionKey<'a> {
    /// Le cas d'usage, branché sur le stockage de la clé.
    #[must_use]
    pub fn new(keys: &'a dyn ConnectionKeys) -> Self {
        Self { keys }
    }

    /// La clé de branchement, s'il y en a une.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la clé ne peut pas être lue.
    pub fn execute(&self) -> Result<Option<ConnectionKey>, AppError> {
        Ok(self.keys.load()?)
    }

    /// Dit si `presented` est le secret de la clé de branchement qui existe : sans clé, ou si la
    /// clé ne peut pas être lue, rien n'est accepté.
    #[must_use]
    pub fn accepts(&self, presented: &str) -> bool {
        matches!(self.keys.load(), Ok(Some(key)) if key.secret() == presented)
    }
}

/// Révoque la clé de branchement : elle est effacée, et plus aucune IA ne peut la présenter.
#[derive(Debug)]
pub struct RevokeConnectionKey<'a> {
    keys: &'a dyn ConnectionKeys,
}

impl<'a> RevokeConnectionKey<'a> {
    /// Le cas d'usage, branché sur le stockage de la clé.
    #[must_use]
    pub fn new(keys: &'a dyn ConnectionKeys) -> Self {
        Self { keys }
    }

    /// Efface la clé ; rien à faire s'il n'y en a pas.
    ///
    /// # Errors
    ///
    /// [`AppError::StorageUnavailable`] si la clé ne peut pas être effacée.
    pub fn execute(&self) -> Result<(), AppError> {
        Ok(self.keys.delete()?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::testing::{
        CountingSecretMaker, FixedClock, InMemoryConnectionKeys, connection_contract,
    };

    fn created(keys: &InMemoryConnectionKeys) -> ConnectionKey {
        CreateConnectionKey::new(
            keys,
            &CountingSecretMaker::default(),
            &FixedClock::default(),
        )
        .execute()
        .unwrap()
    }

    #[test]
    fn the_in_memory_keys_follow_the_contract() {
        connection_contract::connection_keys_contract(InMemoryConnectionKeys::default);
    }

    #[test]
    fn creating_a_key_keeps_it_with_the_moment_of_its_creation() {
        let keys = InMemoryConnectionKeys::default();

        let key = created(&keys);

        assert_eq!(key.secret(), "secret-1");
        assert_eq!(key.created_label(), "2026-11-16 18h30");
        assert_eq!(ReadConnectionKey::new(&keys).execute().unwrap(), Some(key));
    }

    #[test]
    fn creating_again_gives_the_same_key() {
        let keys = InMemoryConnectionKeys::default();
        let secrets = CountingSecretMaker::default();
        let clock = FixedClock::default();
        let create = CreateConnectionKey::new(&keys, &secrets, &clock);

        let first = create.execute().unwrap();
        let second = create.execute().unwrap();

        assert_eq!(second, first);
        assert_eq!(secrets.secret().unwrap(), "secret-2");
    }

    #[test]
    fn an_empty_secret_is_refused() {
        #[derive(Debug)]
        struct Empty;
        impl SecretMaker for Empty {
            fn secret(&self) -> Result<String, StoreError> {
                Ok(String::new())
            }
        }
        let keys = InMemoryConnectionKeys::default();

        let result = CreateConnectionKey::new(&keys, &Empty, &FixedClock::default()).execute();

        assert_eq!(
            result,
            Err(AppError::StorageUnavailable(
                "le secret tiré est vide".to_owned()
            ))
        );
        assert_eq!(keys.load().unwrap(), None);
    }

    #[test]
    fn only_the_secret_of_the_existing_key_is_accepted() {
        let keys = InMemoryConnectionKeys::default();
        let read = ReadConnectionKey::new(&keys);
        assert!(!read.accepts(""));
        assert!(!read.accepts("secret-1"));

        created(&keys);

        assert!(read.accepts("secret-1"));
        assert!(!read.accepts("secret-2"));
        assert!(!read.accepts(""));
    }

    #[test]
    fn a_revoked_key_is_no_longer_accepted_and_a_new_one_has_nothing_to_do_with_it() {
        let keys = InMemoryConnectionKeys::default();
        let secrets = CountingSecretMaker::default();
        let clock = FixedClock::default();
        let create = CreateConnectionKey::new(&keys, &secrets, &clock);
        create.execute().unwrap();

        RevokeConnectionKey::new(&keys).execute().unwrap();

        let read = ReadConnectionKey::new(&keys);
        assert!(!read.accepts("secret-1"));
        assert_eq!(read.execute().unwrap(), None);
        assert_eq!(create.execute().unwrap().secret(), "secret-2");
    }

    #[test]
    fn a_key_that_cannot_be_read_accepts_nothing() {
        #[derive(Debug)]
        struct Broken;
        impl ConnectionKeys for Broken {
            fn load(&self) -> Result<Option<ConnectionKey>, StoreError> {
                Err(StoreError::Unavailable("illisible".to_owned()))
            }
            fn save(&self, _: &ConnectionKey) -> Result<(), StoreError> {
                Ok(())
            }
            fn delete(&self) -> Result<(), StoreError> {
                Ok(())
            }
        }

        assert!(!ReadConnectionKey::new(&Broken).accepts("secret-1"));
    }
}
