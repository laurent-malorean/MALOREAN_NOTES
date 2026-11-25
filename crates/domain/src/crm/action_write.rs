//! Écrire une action geste par geste (spécification §§ 4.8, 5 et 8) : chaque fonction rend le
//! texte du fichier avec le seul champ touché changé, les autres propriétés, le texte inconnu et
//! les propriétés libres restant identiques octet pour octet. Le fichier d'où l'on part est
//! toujours la version la plus récente.

use std::collections::HashSet;
use std::num::NonZeroU32;

use super::action::{
    ActionPerson, CHANNEL_KEY, COLOR_KEY, Channel, DATE_KEY, NOTES_KEY, PEOPLE_KEY, PROJECT_KEY,
    RANK_KEY, STATUS_KEY,
};
use super::action_body::{Body, rewritten};
use super::day::Day;
use super::header::{self, Style};
use super::palette::Color;
use super::reference::Reference;
use super::stage::{Stage, Stages, Status, TODO, same};
use super::under_title::{text, with_text};
use crate::tag::{retagged, written_tags};

/// L'action avec ce statut ; le rang s'efface, car la place choisie dans l'ancienne colonne n'a plus
/// de sens. Le même statut ne change rien : le fichier reste tel qu'il est.
#[must_use]
pub fn with_status(content: &str, stages: &Stages, status: &Status) -> String {
    let written = header::scalar(content, STATUS_KEY);
    if Status::read(written.as_deref(), stages) == *status {
        return content.to_owned();
    }
    let with_status = header::with_scalar(content, STATUS_KEY, Some(status.name()), Style::Line);
    header::with_scalar(&with_status, RANK_KEY, None, Style::Line)
}

/// L'action à faire ou faite ce jour-là.
#[must_use]
pub fn with_date(content: &str, day: Day) -> String {
    header::with_scalar(content, DATE_KEY, Some(&day.to_string()), Style::Always)
}

/// L'action avec ce canal ; sans canal, la propriété est retirée.
#[must_use]
pub fn with_channel(content: &str, channel: Option<Channel>) -> String {
    header::with_scalar(
        content,
        CHANNEL_KEY,
        channel.map(Channel::name),
        Style::Line,
    )
}

/// L'action de ce projet ; sans projet, la propriété est retirée.
#[must_use]
pub fn with_project(content: &str, project: Option<&Reference>) -> String {
    let project = project.map(ToString::to_string);
    header::with_scalar(content, PROJECT_KEY, project.as_deref(), Style::Always)
}

/// L'action de cette couleur ; sans couleur, la propriété est retirée.
#[must_use]
pub fn with_color(content: &str, color: Option<Color>) -> String {
    header::with_scalar(content, COLOR_KEY, color.map(Color::name), Style::Line)
}

/// L'action avec ces étiquettes, nettoyées comme pour toute note (sans doublon, la casse ne compte
/// pas) ; sans étiquette, la propriété est retirée.
#[must_use]
pub fn with_tags(content: &str, tags: &[String]) -> String {
    retagged(content, &written_tags(tags))
}

/// L'action avec ces notes liées ; sans note, la propriété est retirée.
#[must_use]
pub fn with_linked_notes(content: &str, notes: &[Reference]) -> String {
    let notes: Vec<String> = notes.iter().map(ToString::to_string).collect();
    header::with_items(content, NOTES_KEY, &notes, Style::Always)
}

/// L'action avec ce rang ; sans rang, la propriété est retirée.
#[must_use]
pub fn with_rank(content: &str, rank: Option<NonZeroU32>) -> String {
    let rank = rank.map(|rank| rank.to_string());
    header::with_scalar(content, RANK_KEY, rank.as_deref(), Style::Bare)
}

/// L'action avec ces personnes (une personne donnée deux fois n'entre qu'une fois, la première) ;
/// sans personne, la propriété est retirée.
#[must_use]
pub fn with_people(content: &str, people: &[ActionPerson]) -> String {
    let mut seen: Vec<&Reference> = Vec::new();
    let mut entries = Vec::new();
    for person in people {
        if !seen.contains(&&person.person) {
            seen.push(&person.person);
            entries.push(person.entry());
        }
    }
    header::with_items(content, PEOPLE_KEY, &entries, Style::Always)
}

/// L'action avec ce texte sous son titre : seules les parties changées sont réécrites, et dans
/// l'ordre description, listes à cocher, commentaires.
#[must_use]
pub fn with_body(content: &str, body: &Body) -> String {
    with_text(content, &rewritten(text(content), body))
}

/// L'action sans cette personne (la fiche de la personne est supprimée) ; une action qui ne la
/// citait pas reste telle quelle.
#[must_use]
pub fn without_person(content: &str, person: &Reference) -> String {
    let people = written_people(content);
    if people.iter().all(|known| known.person != *person) {
        return content.to_owned();
    }
    let kept: Vec<ActionPerson> = people
        .into_iter()
        .filter(|known| known.person != *person)
        .collect();
    with_people(content, &kept)
}

/// L'action sans ce projet (la fiche du projet est supprimée) : « Sans projet » ; une action d'un
/// autre projet reste telle quelle.
#[must_use]
pub fn without_project(content: &str, project: &Reference) -> String {
    if written_project(content).as_ref() == Some(project) {
        with_project(content, None)
    } else {
        content.to_owned()
    }
}

/// L'action sans les références à des fiches qui n'existent plus : la personne et le projet qu'elle
/// désigne sont retirés si leur fiche n'est pas dans `people` et `projects` (les fiches du CRM).
/// L'entreprise d'une personne, celle du moment, n'est jamais retirée : une action garde le passé.
/// Une action sans référence perdue reste telle quelle.
#[must_use]
pub fn without_missing(
    content: &str,
    people: &HashSet<Reference>,
    projects: &HashSet<Reference>,
) -> String {
    let mut result = content.to_owned();
    for missing in written_people(content)
        .iter()
        .filter(|known| !people.contains(&known.person))
    {
        result = without_person(&result, &missing.person);
    }
    match written_project(content) {
        Some(project) if !projects.contains(&project) => without_project(&result, &project),
        _ => result,
    }
}

/// L'action dont l'étape `from` s'appelle maintenant `to` : son statut suit, son rang reste. Une
/// action d'un autre statut reste telle quelle.
#[must_use]
pub fn with_stage_renamed(content: &str, from: &str, to: &Stage) -> String {
    match header::scalar(content, STATUS_KEY) {
        Some(written) if same(&written, from) => {
            header::with_scalar(content, STATUS_KEY, Some(to.as_str()), Style::Line)
        }
        _ => content.to_owned(),
    }
}

/// L'action dont l'étape `stage` est retirée : elle repart en « TODO » et son rang s'efface. Une
/// action d'un autre statut reste telle quelle.
#[must_use]
pub fn with_stage_removed(content: &str, stage: &str) -> String {
    match header::scalar(content, STATUS_KEY) {
        Some(written) if same(&written, stage) => {
            let todo = header::with_scalar(content, STATUS_KEY, Some(TODO), Style::Line);
            header::with_scalar(&todo, RANK_KEY, None, Style::Line)
        }
        _ => content.to_owned(),
    }
}

fn written_people(content: &str) -> Vec<ActionPerson> {
    header::items(content, PEOPLE_KEY)
        .iter()
        .filter_map(|entry| ActionPerson::parse(entry))
        .collect()
}

fn written_project(content: &str) -> Option<Reference> {
    header::scalar(content, PROJECT_KEY).and_then(|written| Reference::parse(&written))
}

#[cfg(test)]
#[path = "action_write_tests.rs"]
mod tests;
