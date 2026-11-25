//! Les statuts d'une action et les étapes d'un CRM (spécification §§ 4.2 et 5.5) : trois statuts
//! fixes, « TODO » en première colonne, « Done » et « Cancel » en dernières, et entre eux les
//! étapes propres au CRM, dans leur ordre.

use std::fmt;

use super::text::folded;

/// La première colonne du Kanban : le statut des actions neuves.
pub const TODO: &str = "TODO";
/// L'avant-dernière colonne : une action faite.
pub const DONE: &str = "Done";
/// La dernière colonne : une action abandonnée.
pub const CANCEL: &str = "Cancel";
/// Les étapes d'un CRM qui n'a pas choisi les siennes.
pub const DEFAULT_STAGES: [&str; 2] = ["Progress", "WaitingFor"];
/// La longueur maximale du nom d'une étape, en caractères.
pub const MAX_STAGE_NAME: usize = 40;

/// Pourquoi un nom d'étape ou un changement d'étapes est refusé.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StageError {
    /// Le nom est vide.
    Empty,
    /// Le nom tient sur plusieurs lignes.
    NotOneLine,
    /// Le nom dépasse [`MAX_STAGE_NAME`] caractères.
    TooLong,
    /// Le nom est celui d'une colonne fixe (« TODO », « Done », « Cancel »).
    FixedName,
    /// Une autre étape porte déjà ce nom.
    Taken,
    /// Le CRM n'a pas cette étape.
    Unknown,
}

impl fmt::Display for StageError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let message = match self {
            Self::Empty => "Le nom de l'étape est vide.".to_owned(),
            Self::NotOneLine => "Le nom de l'étape tient sur une seule ligne.".to_owned(),
            Self::TooLong => {
                format!("Le nom de l'étape fait {MAX_STAGE_NAME} caractères au plus.")
            }
            Self::FixedName => {
                format!("« {TODO} », « {DONE} » et « {CANCEL} » sont déjà des colonnes.")
            }
            Self::Taken => "Une autre étape porte déjà ce nom.".to_owned(),
            Self::Unknown => "Cette étape n'existe pas.".to_owned(),
        };
        f.write_str(&message)
    }
}

impl std::error::Error for StageError {}

/// Le nom d'une étape : une ligne, 40 caractères au plus, qui n'est pas celui d'une colonne fixe.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Stage(String);

impl Stage {
    /// L'étape de ce nom, sans espaces autour.
    ///
    /// # Errors
    ///
    /// [`StageError`] si le nom est vide, tient sur plusieurs lignes, fait plus de 40 caractères
    /// ou est celui d'une colonne fixe (majuscules et accents ignorés).
    pub fn parse(name: &str) -> Result<Self, StageError> {
        let name = name.trim();
        if name.is_empty() {
            Err(StageError::Empty)
        } else if name.contains(['\n', '\r']) {
            Err(StageError::NotOneLine)
        } else if name.chars().count() > MAX_STAGE_NAME {
            Err(StageError::TooLong)
        } else if [TODO, DONE, CANCEL].iter().any(|fixed| same(fixed, name)) {
            Err(StageError::FixedName)
        } else {
            Ok(Self(name.to_owned()))
        }
    }

    /// Le nom de l'étape, tel qu'il s'écrit dans le fichier et à l'écran.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// Les deux noms sont les mêmes, majuscules et accents ignorés.
pub(crate) fn same(a: &str, b: &str) -> bool {
    folded(a) == folded(b)
}

/// Les étapes d'un CRM, dans l'ordre des colonnes, sans doublon (majuscules et accents ignorés).
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Stages(Vec<Stage>);

impl Default for Stages {
    /// « Progress » puis « WaitingFor ».
    fn default() -> Self {
        Self(
            DEFAULT_STAGES
                .iter()
                .map(|name| Stage((*name).to_owned()))
                .collect(),
        )
    }
}

impl Stages {
    /// Les étapes que disent ces noms, dans l'ordre : un nom qui n'est pas une étape valide, ou
    /// qui répète une étape déjà là, est laissé de côté (un fichier écrit à la main).
    #[must_use]
    pub fn read(names: &[String]) -> Self {
        let mut stages = Vec::new();
        for stage in names.iter().filter_map(|name| Stage::parse(name).ok()) {
            if !stages.iter().any(|known: &Stage| same(&known.0, &stage.0)) {
                stages.push(stage);
            }
        }
        Self(stages)
    }

    /// Les étapes, dans l'ordre.
    #[must_use]
    pub fn as_slice(&self) -> &[Stage] {
        &self.0
    }

    /// Le nom de chaque étape, dans l'ordre.
    #[must_use]
    pub fn names(&self) -> Vec<String> {
        self.0.iter().map(|stage| stage.0.clone()).collect()
    }

    /// L'étape que désigne ce nom, majuscules et accents ignorés.
    #[must_use]
    pub fn find(&self, name: &str) -> Option<&Stage> {
        self.0.iter().find(|stage| same(&stage.0, name))
    }

    fn position(&self, name: &str) -> Result<usize, StageError> {
        self.0
            .iter()
            .position(|stage| same(&stage.0, name))
            .ok_or(StageError::Unknown)
    }

    /// Ces étapes plus `name`, à la fin (juste avant « Done »).
    ///
    /// # Errors
    ///
    /// [`StageError`] si le nom est refusé ou déjà pris par une étape.
    pub fn added(&self, name: &str) -> Result<Self, StageError> {
        let stage = Stage::parse(name)?;
        if self.find(&stage.0).is_some() {
            return Err(StageError::Taken);
        }
        let mut stages = self.0.clone();
        stages.push(stage);
        Ok(Self(stages))
    }

    /// Ces étapes dont `from` s'appelle maintenant `to`, à la même place. Renommer une étape en
    /// elle-même, ou en changer les majuscules et les accents, est permis.
    ///
    /// # Errors
    ///
    /// [`StageError::Unknown`] si `from` n'est pas une étape ; [`StageError`] si `to` est refusé ou
    /// déjà pris par une autre étape.
    pub fn renamed(&self, from: &str, to: &str) -> Result<Self, StageError> {
        let at = self.position(from)?;
        let stage = Stage::parse(to)?;
        let taken = self
            .0
            .iter()
            .enumerate()
            .any(|(other, known)| other != at && same(&known.0, &stage.0));
        if taken {
            return Err(StageError::Taken);
        }
        let mut stages = self.0.clone();
        stages[at] = stage;
        Ok(Self(stages))
    }

    /// Ces étapes sans `name`.
    ///
    /// # Errors
    ///
    /// [`StageError::Unknown`] si `name` n'est pas une étape.
    pub fn removed(&self, name: &str) -> Result<Self, StageError> {
        let at = self.position(name)?;
        let mut stages = self.0.clone();
        stages.remove(at);
        Ok(Self(stages))
    }

    /// Ces étapes avec `name` à la place `to` (à partir de 0) dans la liste obtenue, bornée à
    /// la dernière.
    ///
    /// # Errors
    ///
    /// [`StageError::Unknown`] si `name` n'est pas une étape.
    pub fn moved(&self, name: &str, to: usize) -> Result<Self, StageError> {
        let at = self.position(name)?;
        let mut stages = self.0.clone();
        let stage = stages.remove(at);
        stages.insert(to.min(stages.len()), stage);
        Ok(Self(stages))
    }
}

/// Ce qui place une action dans une colonne du Kanban.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum Status {
    /// La première colonne ; aussi celle d'une action dont le statut n'est pas une colonne.
    Todo,
    /// Une étape du CRM.
    Stage(Stage),
    /// Une action faite.
    Done,
    /// Une action abandonnée.
    Cancel,
}

impl Status {
    /// Le statut que dit `text` pour un CRM qui a ces `stages` : le nom d'une colonne, majuscules et
    /// accents ignorés. Absent ou inconnu (fichier écrit à la main, étape retirée entre-temps),
    /// c'est « TODO ».
    #[must_use]
    pub fn read(text: Option<&str>, stages: &Stages) -> Self {
        let Some(text) = text else {
            return Self::Todo;
        };
        if same(text, DONE) {
            Self::Done
        } else if same(text, CANCEL) {
            Self::Cancel
        } else if let Some(stage) = stages.find(text) {
            Self::Stage(stage.clone())
        } else {
            Self::Todo
        }
    }

    /// Le nom de la colonne, tel qu'il s'écrit dans le fichier.
    #[must_use]
    pub fn name(&self) -> &str {
        match self {
            Self::Todo => TODO,
            Self::Stage(stage) => stage.as_str(),
            Self::Done => DONE,
            Self::Cancel => CANCEL,
        }
    }

    /// Une action ouverte est « TODO » ou dans une étape.
    #[must_use]
    pub fn is_open(&self) -> bool {
        matches!(self, Self::Todo | Self::Stage(_))
    }

    /// Une action terminée est « Done » ou « Cancel ».
    #[must_use]
    pub fn is_closed(&self) -> bool {
        !self.is_open()
    }

    /// Les colonnes d'un Kanban dont le CRM a ces étapes : « TODO », les étapes, « Done »,
    /// « Cancel ».
    #[must_use]
    pub fn columns(stages: &Stages) -> Vec<Self> {
        let mut columns = vec![Self::Todo];
        columns.extend(stages.0.iter().cloned().map(Self::Stage));
        columns.extend([Self::Done, Self::Cancel]);
        columns
    }
}

#[cfg(test)]
#[path = "stage_tests.rs"]
mod tests;
