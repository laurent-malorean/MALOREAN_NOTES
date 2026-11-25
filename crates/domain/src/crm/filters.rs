//! Les filtres de la rangée au-dessus des colonnes du Kanban (spécification § 7.1) : tout
//! s'ajoute, une action n'est montrée que si elle répond à tous.

use super::action::Action;
use super::reference::Reference;
use super::text::folded;
use crate::tag::same_tag;

/// Le choix de la liste « Toutes les entreprises » : NODATA ou une entreprise.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CompanyChoice {
    /// NODATA : les personnes sans entreprise, et les actions sans personne.
    NoData,
    /// Une entreprise.
    Company(Reference),
}

/// Ce que la rangée de recherche et de filtres demande.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Filters {
    /// Le mot cherché dans le titre, la description et les commentaires, sans compter majuscules ni
    /// accents ; vide : tout passe.
    pub search: String,
    /// La liste « Toutes les personnes » : une action reste visible si au moins une de ses personnes
    /// est celle-ci.
    pub person: Option<Reference>,
    /// La liste « Toutes les entreprises » : une action reste visible si au moins une de ses
    /// entreprises est celle-ci.
    pub company: Option<CompanyChoice>,
    /// Les projets cochés, cumulés : une action reste visible si son projet en est un ; une action
    /// sans projet est alors masquée. Aucun : tout passe.
    pub projects: Vec<Reference>,
    /// Les étiquettes cochées, cumulées : une action reste visible si elle porte au moins l'une
    /// d'elles. Aucune : tout passe.
    pub tags: Vec<String>,
}

impl Filters {
    /// Rien n'est demandé : toutes les actions passent.
    #[must_use]
    pub fn is_empty(&self) -> bool {
        self.search.trim().is_empty()
            && self.person.is_none()
            && self.company.is_none()
            && self.projects.is_empty()
            && self.tags.is_empty()
    }

    /// L'action répond à tous les filtres.
    #[must_use]
    pub fn matches(&self, action: &Action) -> bool {
        self.matches_search(action)
            && self.matches_person(action)
            && self.matches_company(action)
            && self.matches_project(action)
            && self.matches_tags(action)
    }

    fn matches_search(&self, action: &Action) -> bool {
        let wanted = folded(&self.search);
        wanted.is_empty() || {
            let comments = action
                .body
                .comments
                .iter()
                .map(|comment| comment.text.as_str());
            [action.title.as_str(), action.body.description.as_str()]
                .into_iter()
                .chain(comments)
                .any(|text| folded(text).contains(&wanted))
        }
    }

    fn matches_person(&self, action: &Action) -> bool {
        self.person
            .as_ref()
            .is_none_or(|wanted| action.people.iter().any(|p| p.person == *wanted))
    }

    fn matches_company(&self, action: &Action) -> bool {
        let wanted = match &self.company {
            None => return true,
            Some(CompanyChoice::NoData) => None,
            Some(CompanyChoice::Company(company)) => Some(company.clone()),
        };
        action.companies().contains(&wanted)
    }

    fn matches_project(&self, action: &Action) -> bool {
        self.projects.is_empty()
            || action
                .project
                .as_ref()
                .is_some_and(|project| self.projects.contains(project))
    }

    fn matches_tags(&self, action: &Action) -> bool {
        self.tags.is_empty()
            || self
                .tags
                .iter()
                .any(|wanted| action.tags.iter().any(|tag| same_tag(tag, wanted)))
    }
}

/// Les étiquettes du CRM : celles de ses actions, sans doublon (la casse et les accents ne
/// comptent pas), par ordre alphabétique ; chacune telle qu'écrite la première fois.
#[must_use]
pub fn crm_tags(actions: &[Action]) -> Vec<String> {
    let mut found: Vec<String> = Vec::new();
    for tag in actions.iter().flat_map(|action| &action.tags) {
        if !found.iter().any(|known| same_tag(known, tag)) {
            found.push(tag.clone());
        }
    }
    found.sort_by_key(|tag| folded(tag));
    found
}

#[cfg(test)]
#[path = "filters_tests.rs"]
mod tests;
