//! Une action (spécification §§ 4.5 et 5.3) : un échange ou une tâche, avec zéro, une ou plusieurs
//! personnes, un statut, une date, un canal, un projet, une couleur, des étiquettes, des notes
//! liées, un rang et un texte (description, listes à cocher, commentaires).

use std::num::NonZeroU32;

use super::action_body::{Body, rewritten};
use super::day::Day;
use super::header::{self, Style};
use super::kind::{CrmKind, Unreadable, read_title};
use super::palette::Color;
use super::reference::Reference;
use super::stage::{Stages, Status};
use super::text::folded;
use super::under_title::{text, with_text};
use crate::tag::{tags, written_tags};

pub(super) const PEOPLE_KEY: &str = "personnes";
pub(super) const STATUS_KEY: &str = "statut";
pub(super) const DATE_KEY: &str = "date";
pub(super) const CHANNEL_KEY: &str = "canal";
pub(super) const PROJECT_KEY: &str = "projet";
pub(super) const COLOR_KEY: &str = "couleur";
pub(super) const TAGS_KEY: &str = "tags";
pub(super) const NOTES_KEY: &str = "notes";
pub(super) const RANK_KEY: &str = "rang";
/// Sépare la personne de son entreprise dans `personnes` : `[[jean-dupont]] · [[acme]]`.
const COMPANY_SEPARATOR: char = '·';

/// Comment l'échange a eu lieu.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum Channel {
    /// Un appel.
    Call,
    /// Un e-mail.
    Email,
    /// Un rendez-vous.
    Meeting,
    /// Un courrier.
    Letter,
    /// Un salon.
    Fair,
    /// Un réseau social.
    SocialNetwork,
    /// Un autre canal.
    Other,
}

impl Channel {
    /// Les sept canaux, dans l'ordre des menus.
    pub const ALL: [Self; 7] = [
        Self::Call,
        Self::Email,
        Self::Meeting,
        Self::Letter,
        Self::Fair,
        Self::SocialNetwork,
        Self::Other,
    ];

    /// Le nom du canal, tel qu'il s'écrit dans le fichier et à l'écran.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Call => "appel",
            Self::Email => "e-mail",
            Self::Meeting => "rendez-vous",
            Self::Letter => "courrier",
            Self::Fair => "salon",
            Self::SocialNetwork => "réseau social",
            Self::Other => "autre",
        }
    }

    /// Le canal de ce nom, majuscules et accents ignorés ; rien pour une autre valeur.
    #[must_use]
    pub fn read(text: &str) -> Option<Self> {
        let wanted = folded(text);
        Self::ALL
            .into_iter()
            .find(|channel| folded(channel.name()) == wanted)
    }
}

/// Une personne d'une action, avec l'entreprise qu'elle avait au moment où on l'a donnée à l'action.
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct ActionPerson {
    /// La fiche de la personne.
    pub person: Reference,
    /// Son entreprise de ce moment ; rien si elle était dans NODATA.
    pub company: Option<Reference>,
}

impl ActionPerson {
    /// La personne que dit une entrée de `personnes` : `[[personne]]`, suivie de ` · [[entreprise]]`.
    #[must_use]
    pub fn parse(entry: &str) -> Option<Self> {
        let (person, company) = match entry.split_once(COMPANY_SEPARATOR) {
            Some((person, company)) => (person, Reference::parse(company)),
            None => (entry, None),
        };
        Some(Self {
            person: Reference::parse(person)?,
            company,
        })
    }

    /// L'entrée de `personnes` qui l'écrit.
    #[must_use]
    pub fn entry(&self) -> String {
        match &self.company {
            Some(company) => format!("{} {COMPANY_SEPARATOR} {company}", self.person),
            None => self.person.to_string(),
        }
    }
}

/// Une action lue.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Action {
    /// Le nom de fichier de la fiche, sans dossier ni extension : ce par quoi on la désigne.
    pub name: Reference,
    /// Son titre, d'une ligne.
    pub title: String,
    /// Ses personnes, sans doublon, dans l'ordre écrit.
    pub people: Vec<ActionPerson>,
    /// Son statut : « TODO » si le fichier n'en dit pas ou n'en dit pas un qui soit une colonne.
    pub status: Status,
    /// Pour une action ouverte, le jour où elle est à faire ; pour une action terminée, celui où
    /// elle a été faite. Rien si le fichier n'en dit pas ou n'en dit pas une qui soit une date.
    pub date: Option<Day>,
    /// Son canal.
    pub channel: Option<Channel>,
    /// Son projet ; rien : « Sans projet ».
    pub project: Option<Reference>,
    /// Sa couleur d'action.
    pub color: Option<Color>,
    /// Ses étiquettes, sans doublon (la casse ne compte pas).
    pub tags: Vec<String>,
    /// Ses notes liées, désignées par leur titre.
    pub linked_notes: Vec<Reference>,
    /// La place choisie à la main dans sa colonne.
    pub rank: Option<NonZeroU32>,
    /// Sa description, ses listes à cocher et ses commentaires.
    pub body: Body,
}

impl Action {
    /// L'action que dit `content`, rangée sous le nom de fichier `name`, pour un CRM qui a ces
    /// `stages`.
    ///
    /// # Errors
    ///
    /// [`Unreadable`] si ce n'est pas une fiche `type: crm-action` ou si elle n'a pas de titre : le CRM
    /// la laisse de côté, sans l'effacer.
    pub fn parse(name: Reference, content: &str, stages: &Stages) -> Result<Self, Unreadable> {
        let title = read_title(content, CrmKind::Action)?;
        let scalar = |key: &str| header::scalar(content, key);
        let mut people: Vec<ActionPerson> = Vec::new();
        for person in header::items(content, PEOPLE_KEY)
            .iter()
            .filter_map(|entry| ActionPerson::parse(entry))
        {
            if !people.iter().any(|known| known.person == person.person) {
                people.push(person);
            }
        }
        Ok(Self {
            name,
            title,
            people,
            status: Status::read(scalar(STATUS_KEY).as_deref(), stages),
            date: scalar(DATE_KEY).and_then(|written| Day::parse(&written).ok()),
            channel: scalar(CHANNEL_KEY).and_then(|written| Channel::read(&written)),
            project: scalar(PROJECT_KEY).and_then(|written| Reference::parse(&written)),
            color: scalar(COLOR_KEY).and_then(|written| Color::parse(&written)),
            tags: tags(content),
            linked_notes: header::items(content, NOTES_KEY)
                .iter()
                .filter_map(|entry| Reference::parse(entry))
                .collect(),
            rank: scalar(RANK_KEY).and_then(|written| written.parse().ok()),
            body: Body::parse(text(content)),
        })
    }

    /// Le texte du fichier qui écrit cette action en entier, propriétés dans l'ordre de la
    /// spécification : pour une action neuve.
    #[must_use]
    pub fn to_content(&self) -> String {
        let properties: Vec<String> = self.property_lines().into_iter().flatten().collect();
        let head = format!("---\n{}\n---\n# {}\n", properties.join("\n"), self.title);
        with_text(&head, &rewritten("", &self.body))
    }

    /// Les lignes de l'en-tête, dans l'ordre d'écriture ; rien pour une propriété sans valeur.
    fn property_lines(&self) -> [Option<String>; 10] {
        let people: Vec<String> = self.people.iter().map(ActionPerson::entry).collect();
        let notes: Vec<String> = self.linked_notes.iter().map(ToString::to_string).collect();
        let tags = written_tags(&self.tags);
        let scalar = |key, value: Option<String>, style| {
            value.map(|value| header::scalar_line(key, &value, style))
        };
        let items = |key, list: &[String], style| {
            (!list.is_empty()).then(|| header::items_line(key, list, style))
        };
        [
            Some(format!("type: {}", CrmKind::Action.name())),
            items(PEOPLE_KEY, &people, Style::Always),
            scalar(STATUS_KEY, Some(self.status.name().to_owned()), Style::Line),
            scalar(
                DATE_KEY,
                self.date.map(|day| day.to_string()),
                Style::Always,
            ),
            scalar(
                CHANNEL_KEY,
                self.channel.map(|c| c.name().to_owned()),
                Style::Line,
            ),
            scalar(
                PROJECT_KEY,
                self.project.as_ref().map(ToString::to_string),
                Style::Always,
            ),
            scalar(
                COLOR_KEY,
                self.color.map(|c| c.name().to_owned()),
                Style::Line,
            ),
            items(TAGS_KEY, &tags, Style::Flow),
            items(NOTES_KEY, &notes, Style::Always),
            scalar(
                RANK_KEY,
                self.rank.map(|rank| rank.to_string()),
                Style::Bare,
            ),
        ]
    }
}

#[cfg(test)]
#[path = "action_tests.rs"]
mod tests;
