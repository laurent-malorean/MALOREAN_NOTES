//! Cahier de recherche (fiche 0041) : une note où l'on ne fait qu'ajouter des entrées datées,
//! de la plus ancienne en haut à la plus récente en bas, comme dans un cahier papier, sous des
//! titres d'année, de mois et de jour créés quand il le faut.
//!
//! ```text
//! ---
//! type: cahier-de-recherche
//! ---
//! # Levures
//!
//! ## 2026
//!
//! ### Novembre
//!
//! #### Vendredi 20
//!
//! - 09:42 - Première ligne de l'entrée
//!   ligne suivante, en retrait
//! - 10:15 - Correction de [l'entrée du 20 novembre 2026 à 09:42](#2026-11-20-09h42) : …
//! ```
//!
//! Une entrée est désignée par son ancre : sa date et son heure (`2026-11-20-09h42`), suivies de
//! son rang (`-2`, `-3`…) quand plusieurs entrées tombent dans la même minute. Rien n'étant
//! jamais inséré avant elle, son ancre ne change pas.

use std::fmt;

use crate::attachment_name::MONTHS;
use crate::front_matter::split;
use crate::{ContentType, Modified, Moment, NotePath, NoteSummary};

const YEAR_HEADING: &str = "## ";
const MONTH_HEADING: &str = "### ";
const DAY_HEADING: &str = "#### ";
const HEADING_MARK: char = '#';
const ENTRY_MARK: &str = "- ";
const TIME_SEPARATOR: &str = " - ";
/// Le retrait des lignes d'une entrée après la première : celui du texte d'un élément de liste.
const CONTINUATION: &str = "  ";
const TAB: char = '\t';
/// Le suffixe du premier jour du mois dans un titre de jour : `Dimanche 1er`.
const FIRST_DAY_SUFFIX: &str = "er";
const WEEKDAYS: [&str; 7] = [
    "Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche",
];
/// Le titre d'un cahier créé sans titre.
pub const DEFAULT_TITLE: &str = "Cahier de recherche";

/// Pourquoi une entrée n'est pas ajoutée.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum RefusedEntry {
    /// La note n'est pas un cahier de recherche.
    NotANotebook,
    /// L'entrée n'a pas de texte.
    Empty,
    /// L'entrée à corriger, désignée par son ancre, n'est pas dans le cahier.
    CorrectedEntryNotFound(String),
}

impl fmt::Display for RefusedEntry {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::NotANotebook => f.write_str("cette note n'est pas un cahier de recherche"),
            Self::Empty => f.write_str("l'entrée est vide"),
            Self::CorrectedEntryNotFound(anchor) => {
                write!(
                    f,
                    "l'entrée « {anchor} » à corriger n'est pas dans ce cahier"
                )
            }
        }
    }
}

impl std::error::Error for RefusedEntry {}

/// Une entrée d'un cahier de recherche, telle que le cahier l'écrit.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Entry {
    at: Moment,
    rank: usize,
    text: String,
    line: usize,
}

impl Entry {
    /// Son ancre : `2026-11-20-09h42`, suivie de `-2`, `-3`… pour la deuxième, la troisième
    /// entrée de la même minute.
    #[must_use]
    pub fn anchor(&self) -> String {
        let (_, _, _, hour, minute) = self.at.parts();
        let base = format!("{}-{hour:02}h{minute:02}", self.at.iso_date());
        if self.rank > 1 {
            format!("{base}-{}", self.rank)
        } else {
            base
        }
    }

    /// Son moment tel qu'on le lit : `20 novembre 2026 à 09:42`.
    #[must_use]
    pub fn label(&self) -> String {
        format!("{} à {}", self.at.long_date(), self.at.time())
    }

    /// Son texte, ses lignes sans retrait.
    #[must_use]
    pub fn text(&self) -> &str {
        &self.text
    }

    /// Le numéro de sa première ligne dans le texte du cahier, à partir de 0.
    #[must_use]
    pub fn line(&self) -> usize {
        self.line
    }
}

/// Le jour où l'on en est en lisant le cahier, d'après ses titres.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct Day {
    year: Option<i32>,
    month: Option<u32>,
    day: Option<u32>,
}

/// Ce qu'est une ligne du cahier.
enum Line<'a> {
    Year(i32),
    Month(u32),
    Day(u32),
    OtherHeading,
    Entry {
        hour: u32,
        minute: u32,
        text: &'a str,
    },
    Continuation(&'a str),
    Blank,
    Other,
}

fn number(text: &str, digits: usize) -> Option<u32> {
    (text.len() == digits && text.bytes().all(|b| b.is_ascii_digit()))
        .then(|| text.parse().ok())
        .flatten()
}

fn month_of(name: &str) -> Option<u32> {
    let name = name.trim().to_lowercase();
    let index = MONTHS.iter().position(|month| *month == name)?;
    u32::try_from(index + 1).ok()
}

fn day_of(heading: &str) -> Option<u32> {
    let last = heading.split_whitespace().last()?;
    let digits = last.strip_suffix(FIRST_DAY_SUFFIX).unwrap_or(last);
    number(digits, digits.len()).filter(|day| (1..=31).contains(day))
}

fn entry_of(line: &str) -> Option<Line<'_>> {
    let rest = line.strip_prefix(ENTRY_MARK)?;
    let (time, text) = (rest.get(..5)?, rest.get(5..)?);
    let (hour, minute) = time.split_once(':')?;
    let text = text.strip_prefix(TIME_SEPARATOR)?;
    Some(Line::Entry {
        hour: number(hour, 2)?,
        minute: number(minute, 2)?,
        text,
    })
}

fn classify(line: &str) -> Line<'_> {
    if let Some(rest) = line.strip_prefix(YEAR_HEADING) {
        return number(rest.trim(), 4)
            .and_then(|year| i32::try_from(year).ok())
            .map_or(Line::OtherHeading, Line::Year);
    }
    if let Some(rest) = line.strip_prefix(MONTH_HEADING) {
        return month_of(rest).map_or(Line::OtherHeading, Line::Month);
    }
    if let Some(rest) = line.strip_prefix(DAY_HEADING) {
        return day_of(rest).map_or(Line::OtherHeading, Line::Day);
    }
    if line.starts_with(HEADING_MARK) {
        return Line::OtherHeading;
    }
    if line.trim().is_empty() {
        return Line::Blank;
    }
    if line.starts_with([' ', TAB]) {
        let text = line
            .strip_prefix(CONTINUATION)
            .or_else(|| line.strip_prefix(TAB))
            .unwrap_or_else(|| line.trim_start());
        return Line::Continuation(text);
    }
    entry_of(line).unwrap_or(Line::Other)
}

/// Ce que dit la lecture d'un cahier : ses entrées, le jour de son dernier titre, et si sa
/// dernière ligne écrite appartient à une entrée.
struct Reading {
    entries: Vec<Entry>,
    day: Day,
    in_entry: bool,
}

fn read(content: &str) -> Reading {
    let (_, body) = split(content);
    let first_line = content[..content.len() - body.len()].matches('\n').count();
    let mut reading = Reading {
        entries: Vec::new(),
        day: Day::default(),
        in_entry: false,
    };
    let mut blanks = 0;
    for (index, raw) in body.split('\n').enumerate() {
        let line = raw.strip_suffix('\r').unwrap_or(raw);
        match classify(line) {
            Line::Year(year) => {
                reading.day = Day {
                    year: Some(year),
                    ..Day::default()
                };
                reading.in_entry = false;
            }
            Line::Month(month) => {
                reading.day.month = Some(month);
                reading.day.day = None;
                reading.in_entry = false;
            }
            Line::Day(day) => {
                reading.day.day = Some(day);
                reading.in_entry = false;
            }
            Line::OtherHeading => {
                reading.day = Day::default();
                reading.in_entry = false;
            }
            Line::Other => reading.in_entry = false,
            Line::Entry { hour, minute, text } => {
                reading.in_entry = reading.add(hour, minute, text, first_line + index);
                blanks = 0;
            }
            Line::Continuation(text) => {
                reading.continued(text, blanks);
                blanks = 0;
            }
            Line::Blank => blanks += 1,
        }
    }
    reading
}

impl Reading {
    /// Ajoute l'entrée lue à l'heure `hour:minute` du jour en cours ; faux si le jour n'est pas
    /// complet.
    fn add(&mut self, hour: u32, minute: u32, text: &str, line: usize) -> bool {
        let Day {
            year: Some(year),
            month: Some(month),
            day: Some(day),
        } = self.day
        else {
            return false;
        };
        let Ok(at) = Moment::new(year, month, day, hour, minute) else {
            return false;
        };
        let rank = self.entries.iter().filter(|entry| entry.at == at).count() + 1;
        self.entries.push(Entry {
            at,
            rank,
            text: text.to_owned(),
            line,
        });
        true
    }

    /// Une ligne en retrait : la suite de l'entrée en cours, après les `blanks` lignes vides
    /// qui la précèdent.
    fn continued(&mut self, text: &str, blanks: usize) {
        if !self.in_entry {
            return;
        }
        if let Some(entry) = self.entries.last_mut() {
            entry.text.push_str(&"\n".repeat(blanks + 1));
            entry.text.push_str(text);
        }
    }
}

/// Les entrées du cahier, de la plus ancienne à la plus récente.
#[must_use]
pub fn entries(content: &str) -> Vec<Entry> {
    read(content).entries
}

/// Le texte d'un nouveau cahier de recherche titré `title` (sur une ligne ; « Cahier de
/// recherche » s'il est vide), sans entrée.
#[must_use]
pub fn new_notebook(title: &str) -> String {
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    let title = if title.is_empty() {
        DEFAULT_TITLE
    } else {
        &title
    };
    format!(
        "---\ntype: {}\n---\n# {title}\n",
        ContentType::ResearchNotebook.name()
    )
}

fn capitalized(word: &str) -> String {
    let mut chars = word.chars();
    chars.next().map_or_else(String::new, |first| {
        first.to_uppercase().collect::<String>() + chars.as_str()
    })
}

/// Les titres à écrire avant une entrée du moment `at`, après le jour `day` du cahier.
fn headings(day: Day, at: &Moment) -> Vec<String> {
    let (year, month, day_of_month, _, _) = at.parts();
    let month_name = MONTHS
        .get(month as usize - 1)
        .unwrap_or_else(|| unreachable!("le mois est entre 1 et 12"));
    let weekday = WEEKDAYS
        .get(usize::try_from((at.days_since_epoch() + 3).rem_euclid(7)).unwrap_or_default())
        .unwrap_or_else(|| unreachable!("un jour de la semaine est entre 0 et 6"));
    let date = if day_of_month == 1 {
        format!("1{FIRST_DAY_SUFFIX}")
    } else {
        day_of_month.to_string()
    };
    let all = [
        format!("{YEAR_HEADING}{year}"),
        format!("{MONTH_HEADING}{}", capitalized(month_name)),
        format!("{DAY_HEADING}{weekday} {date}"),
    ];
    let from = if day.year != Some(year) {
        0
    } else if day.month != Some(month) {
        1
    } else if day.day != Some(day_of_month) {
        2
    } else {
        3
    };
    all[from..].to_vec()
}

/// Les lignes du texte d'une entrée : fins de ligne unifiées, espaces de fin et lignes vides
/// du début et de la fin retirés.
fn written_lines(text: &str) -> Result<Vec<String>, RefusedEntry> {
    let unified = text.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<&str> = unified.split('\n').map(str::trim_end).collect();
    let first = lines.iter().position(|line| !line.is_empty());
    let last = lines.iter().rposition(|line| !line.is_empty());
    match (first, last) {
        (Some(first), Some(last)) => Ok(lines[first..=last]
            .iter()
            .map(|line| (*line).to_owned())
            .collect()),
        _ => Err(RefusedEntry::Empty),
    }
}

fn notebook_checked(content: &str) -> Result<(), RefusedEntry> {
    if ContentType::of(content) == ContentType::ResearchNotebook {
        Ok(())
    } else {
        Err(RefusedEntry::NotANotebook)
    }
}

/// Le cahier avec, à la fin, l'entrée `text` du moment `at` (plusieurs lignes permises), sous
/// les titres d'année, de mois et de jour qui manquent ; rien d'autre ne change.
///
/// # Errors
///
/// [`RefusedEntry::NotANotebook`] si la note n'est pas un cahier de recherche,
/// [`RefusedEntry::Empty`] si l'entrée n'a pas de texte.
pub fn with_entry(content: &str, at: &Moment, text: &str) -> Result<String, RefusedEntry> {
    notebook_checked(content)?;
    let lines = written_lines(text)?;
    let reading = read(content);
    let newline = if content.contains("\r\n") {
        "\r\n"
    } else {
        "\n"
    };
    let (_, _, _, hour, minute) = at.parts();
    let entry: Vec<String> = lines
        .iter()
        .enumerate()
        .map(|(index, line)| match (index, line.is_empty()) {
            (0, _) => format!(
                "{ENTRY_MARK}{hour:02}:{minute:02}{TIME_SEPARATOR}{}",
                line.trim_start()
            ),
            (_, true) => String::new(),
            (_, false) => format!("{CONTINUATION}{line}"),
        })
        .collect();
    let headings = headings(reading.day, at);
    let mut written = content.trim_end_matches(['\r', '\n']).to_owned();
    for heading in &headings {
        written.push_str(&newline.repeat(2));
        written.push_str(heading);
    }
    let tight = headings.is_empty() && reading.in_entry;
    written.push_str(&newline.repeat(if tight { 1 } else { 2 }));
    written.push_str(&entry.join(newline));
    written.push_str(newline);
    Ok(written)
}

/// Le cahier avec, à la fin, une entrée du moment `at` qui corrige l'entrée d'ancre `corrected`
/// (`#` devant permis) : « Correction de [l'entrée du …](#ancre) : » suivi de `text`. L'entrée
/// corrigée ne change pas.
///
/// # Errors
///
/// Celles de [`with_entry`], et [`RefusedEntry::CorrectedEntryNotFound`] si aucune entrée du
/// cahier n'a cette ancre.
pub fn with_correction(
    content: &str,
    at: &Moment,
    text: &str,
    corrected: &str,
) -> Result<String, RefusedEntry> {
    notebook_checked(content)?;
    written_lines(text)?;
    let anchor = corrected.trim_start_matches(HEADING_MARK);
    let target = entries(content)
        .into_iter()
        .find(|entry| entry.anchor() == anchor)
        .ok_or_else(|| RefusedEntry::CorrectedEntryNotFound(anchor.to_owned()))?;
    let reference = format!(
        "Correction de [l'entrée du {}](#{anchor}) :",
        target.label()
    );
    with_entry(content, at, &format!("{reference} {}", text.trim_start()))
}

/// Le résumé d'une entrée tel que l'index le garde : son moment `label` pour titre, le chemin
/// `notebook` et la date `modified` de son cahier, le type entrée, le cahier pour conteneur.
#[must_use]
pub fn entry_summary(notebook: &NotePath, label: String, modified: Modified) -> NoteSummary {
    NoteSummary::indexed(notebook.clone(), label, modified, false, Vec::new())
        .of_type(ContentType::Entry, Some(notebook.clone()))
}

/// Les entrées du cahier `notebook` de texte `content`, telles que l'index les garde : chacune
/// avec son résumé ([`entry_summary`]) et son texte pour la recherche. Aucune si la note n'est
/// pas un cahier.
#[must_use]
pub fn indexed_entries(notebook: &NoteSummary, content: &str) -> Vec<(NoteSummary, String)> {
    if notebook.content_type() != ContentType::ResearchNotebook {
        return Vec::new();
    }
    entries(content)
        .into_iter()
        .map(|entry| {
            let summary = entry_summary(notebook.path(), entry.label(), notebook.modified());
            (summary, entry.text)
        })
        .collect()
}

#[cfg(test)]
#[path = "research_notebook_tests.rs"]
mod tests;
