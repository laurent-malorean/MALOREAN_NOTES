//! Le titre d'une fiche et les règles de nom du CRM (spécification §§ 4.1 et 4.7) : un nom est
//! d'une ligne et jamais vide ; deux entreprises, deux personnes ou deux projets d'un CRM ne le
//! portent pas en même temps ; le nom de fichier en découle.

use std::fmt;

use super::text::{folded, name_key};
use crate::FileName;
use crate::title::retitled;

use super::day::Day;

/// Pourquoi un nom est refusé.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NameError {
    /// Le nom est vide.
    Empty,
    /// Le nom tient sur plusieurs lignes.
    NotOneLine,
    /// Une autre fiche du CRM porte déjà ce nom.
    Taken,
}

impl fmt::Display for NameError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Empty => "Le nom est vide.",
            Self::NotOneLine => "Le nom tient sur une seule ligne.",
            Self::Taken => "Une autre fiche porte déjà ce nom.",
        })
    }
}

impl std::error::Error for NameError {}

/// Le titre d'une fiche : son nom pour une entreprise, une personne ou un projet, son titre pour
/// une action. Une ligne, jamais vide, sans espaces autour.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct Name(String);

impl Name {
    /// Le nom que dit `text`, sans espaces autour.
    ///
    /// # Errors
    ///
    /// [`NameError::Empty`] s'il est vide, [`NameError::NotOneLine`] s'il tient sur plusieurs lignes.
    pub fn parse(text: &str) -> Result<Self, NameError> {
        let text = text.trim();
        if text.is_empty() {
            Err(NameError::Empty)
        } else if text.contains(['\n', '\r']) {
            Err(NameError::NotOneLine)
        } else {
            Ok(Self(text.to_owned()))
        }
    }

    /// Le nom que dit `text`, qui ne doit être celui d'aucun des noms `others` : les autres
    /// entreprises, personnes ou projets du CRM (pour un renommage, sans la fiche elle-même). Deux
    /// noms sont les mêmes quand ils sont égaux sans majuscules, sans accents et sans ponctuation.
    ///
    /// # Errors
    ///
    /// [`NameError`] si le nom est refusé par [`Self::parse`], ou [`NameError::Taken`] s'il est déjà pris.
    pub fn unique<'a>(
        text: &str,
        others: impl IntoIterator<Item = &'a str>,
    ) -> Result<Self, NameError> {
        let name = Self::parse(text)?;
        let key = name_key(&name.0);
        if others.into_iter().any(|other| name_key(other) == key) {
            Err(NameError::Taken)
        } else {
            Ok(name)
        }
    }

    /// Le nom écrit.
    #[must_use]
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

/// L'ordre alphabétique de deux noms : sans compter majuscules ni accents ; à égalité, l'ordre
/// des caractères.
#[must_use]
pub fn name_order(a: &str, b: &str) -> std::cmp::Ordering {
    folded(a).cmp(&folded(b)).then_with(|| a.cmp(b))
}

/// Le texte de la fiche avec ce titre : la ligne de son titre `#` remplacée, le nom de fichier de
/// la fiche ne changeant jamais.
#[must_use]
pub fn with_name(content: &str, name: &Name) -> String {
    retitled(content, name.as_str())
}

/// Le nom de fichier d'une entreprise, d'une personne ou d'un projet : son nom en kebab-case,
/// suivi de `-2`, `-3`… s'il est pris.
#[must_use]
pub fn file_name_of(name: &Name, is_taken: impl FnMut(&FileName) -> bool) -> FileName {
    FileName::from_text(name.as_str()).deduplicated(is_taken)
}

/// Le nom de fichier d'une action : la date de sa création et son titre en kebab-case, suivis d'un
/// numéro si le nom est pris.
#[must_use]
pub fn action_file_name(
    created: Day,
    title: &Name,
    is_taken: impl FnMut(&FileName) -> bool,
) -> FileName {
    FileName::from_text(&format!("{created} {}", title.as_str())).deduplicated(is_taken)
}

/// Un e-mail déjà connu d'une autre personne du CRM : un risque de doublon, signalé à la saisie
/// sans bloquer. Deux e-mails sont les mêmes sans majuscules ni espaces autour ; un e-mail vide
/// n'est jamais connu.
#[must_use]
pub fn email_is_known<'a>(email: &str, others: impl IntoIterator<Item = &'a str>) -> bool {
    let wanted = folded(email);
    !wanted.is_empty() && others.into_iter().any(|other| folded(other) == wanted)
}

#[cfg(test)]
#[path = "name_tests.rs"]
mod tests;
