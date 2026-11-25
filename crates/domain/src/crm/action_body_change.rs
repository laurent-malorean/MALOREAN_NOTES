//! Les gestes sur le texte d'une action (spécification § 8) : un geste ne change que sa partie, sur
//! la version la plus récente du texte. Une liste à cocher, un élément et un commentaire se
//! désignent par leur place (à partir de 0) dans l'ordre écrit.

use std::fmt;

use super::action_body::{Body, Checklist, ChecklistItem, Comment};
use super::day::DayTime;

/// Pourquoi un geste sur le texte d'une action est refusé.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BodyError {
    /// Le nom, l'élément ou le commentaire est vide.
    Empty,
    /// Le nom ou l'élément tient sur plusieurs lignes.
    NotOneLine,
    /// La liste à cocher n'existe plus.
    NoSuchChecklist,
    /// L'élément n'existe plus.
    NoSuchItem,
    /// Le commentaire n'existe plus.
    NoSuchComment,
}

impl fmt::Display for BodyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Empty => "Le texte est vide.",
            Self::NotOneLine => "Le texte tient sur une seule ligne.",
            Self::NoSuchChecklist => "Cette liste à cocher n'existe plus.",
            Self::NoSuchItem => "Cet élément n'existe plus.",
            Self::NoSuchComment => "Ce commentaire n'existe plus.",
        })
    }
}

impl std::error::Error for BodyError {}

/// Un geste sur le texte d'une action.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BodyChange {
    /// Remplacer la description.
    Description(String),
    /// Ajouter, à la fin, une liste à cocher de ce nom.
    AddChecklist(String),
    /// Renommer la liste à cocher.
    RenameChecklist {
        /// Sa place.
        list: usize,
        /// Son nouveau nom.
        name: String,
    },
    /// Supprimer la liste à cocher et ses éléments.
    RemoveChecklist(usize),
    /// Ajouter, à la fin de la liste, un élément non coché.
    AddItem {
        /// La place de la liste.
        list: usize,
        /// Le texte de l'élément.
        text: String,
    },
    /// Changer le texte d'un élément.
    EditItem {
        /// La place de la liste.
        list: usize,
        /// La place de l'élément.
        item: usize,
        /// Son nouveau texte.
        text: String,
    },
    /// Cocher ou décocher un élément.
    CheckItem {
        /// La place de la liste.
        list: usize,
        /// La place de l'élément.
        item: usize,
        /// Vrai pour le cocher.
        done: bool,
    },
    /// Supprimer un élément.
    RemoveItem {
        /// La place de la liste.
        list: usize,
        /// La place de l'élément.
        item: usize,
    },
    /// Ajouter, à la fin, un commentaire daté de ce moment.
    AddComment {
        /// Le moment de l'ajout, heure du Mac.
        at: DayTime,
        /// Le texte du commentaire.
        text: String,
    },
    /// Changer le texte d'un commentaire ; sa date reste celle de l'ajout.
    EditComment {
        /// La place du commentaire.
        comment: usize,
        /// Son nouveau texte.
        text: String,
    },
    /// Supprimer un commentaire.
    RemoveComment(usize),
}

impl BodyChange {
    /// Le texte de l'action une fois ce geste fait sur `body` ; le reste est inchangé.
    ///
    /// # Errors
    ///
    /// [`BodyError`] si un nom, un élément ou un commentaire est vide (ou, pour les deux
    /// premiers, sur plusieurs lignes), ou si la liste, l'élément ou le commentaire désigné n'existe
    /// plus.
    pub fn apply(&self, body: &Body) -> Result<Body, BodyError> {
        let mut new = body.clone();
        match self {
            Self::Description(text) => new.description.clone_from(text),
            Self::AddChecklist(name) => new.checklists.push(Checklist {
                name: one_line(name)?,
                items: Vec::new(),
            }),
            Self::RenameChecklist { list, name } => {
                checklist(&mut new, *list)?.name = one_line(name)?;
            }
            Self::RemoveChecklist(list) => {
                checklist(&mut new, *list)?;
                new.checklists.remove(*list);
            }
            Self::AddItem { list, text } => {
                let text = one_line(text)?;
                checklist(&mut new, *list)?
                    .items
                    .push(ChecklistItem { done: false, text });
            }
            Self::EditItem { list, item, text } => {
                let text = one_line(text)?;
                self::item(&mut new, *list, *item)?.text = text;
            }
            Self::CheckItem { list, item, done } => {
                self::item(&mut new, *list, *item)?.done = *done;
            }
            Self::RemoveItem { list, item } => {
                self::item(&mut new, *list, *item)?;
                checklist(&mut new, *list)?.items.remove(*item);
            }
            Self::AddComment { at, text } => new.comments.push(Comment {
                at: *at,
                text: not_empty(text)?,
            }),
            Self::EditComment { comment, text } => {
                let text = not_empty(text)?;
                comment_at(&mut new, *comment)?.text = text;
            }
            Self::RemoveComment(comment) => {
                comment_at(&mut new, *comment)?;
                new.comments.remove(*comment);
            }
        }
        Ok(new)
    }
}

fn one_line(text: &str) -> Result<String, BodyError> {
    let text = text.trim();
    if text.is_empty() {
        Err(BodyError::Empty)
    } else if text.contains(['\n', '\r']) {
        Err(BodyError::NotOneLine)
    } else {
        Ok(text.to_owned())
    }
}

fn not_empty(text: &str) -> Result<String, BodyError> {
    let text = text.trim();
    if text.is_empty() {
        Err(BodyError::Empty)
    } else {
        Ok(text.to_owned())
    }
}

fn checklist(body: &mut Body, list: usize) -> Result<&mut Checklist, BodyError> {
    body.checklists
        .get_mut(list)
        .ok_or(BodyError::NoSuchChecklist)
}

fn item(body: &mut Body, list: usize, item: usize) -> Result<&mut ChecklistItem, BodyError> {
    checklist(body, list)?
        .items
        .get_mut(item)
        .ok_or(BodyError::NoSuchItem)
}

fn comment_at(body: &mut Body, comment: usize) -> Result<&mut Comment, BodyError> {
    body.comments
        .get_mut(comment)
        .ok_or(BodyError::NoSuchComment)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crm::Day;

    fn body() -> Body {
        Body {
            description: "Texte".to_owned(),
            checklists: vec![
                Checklist {
                    name: "A".to_owned(),
                    items: vec![
                        ChecklistItem {
                            done: true,
                            text: "un".to_owned(),
                        },
                        ChecklistItem {
                            done: false,
                            text: "deux".to_owned(),
                        },
                    ],
                },
                Checklist {
                    name: "B".to_owned(),
                    items: vec![],
                },
            ],
            comments: vec![
                Comment {
                    at: moment(),
                    text: "premier".to_owned(),
                },
                Comment {
                    at: moment(),
                    text: "second".to_owned(),
                },
            ],
        }
    }

    fn moment() -> DayTime {
        DayTime::new(Day::parse("2026-11-24").unwrap(), 10, 32).unwrap()
    }

    fn apply(change: BodyChange) -> Result<Body, BodyError> {
        change.apply(&body())
    }

    #[test]
    fn the_description_is_replaced_and_the_rest_stays() {
        let new = apply(BodyChange::Description("Autre".to_owned())).unwrap();
        assert_eq!(new.description, "Autre");
        assert_eq!(new.checklists, body().checklists);
        assert_eq!(new.comments, body().comments);
        assert_eq!(
            apply(BodyChange::Description(String::new()))
                .unwrap()
                .description,
            ""
        );
    }

    #[test]
    fn a_checklist_is_added_at_the_end_renamed_and_removed() {
        let added = apply(BodyChange::AddChecklist("  C  ".to_owned())).unwrap();
        assert_eq!(added.checklists.len(), 3);
        assert_eq!(added.checklists[2].name, "C");
        assert!(added.checklists[2].items.is_empty());
        let renamed = apply(BodyChange::RenameChecklist {
            list: 1,
            name: "Z".to_owned(),
        })
        .unwrap();
        assert_eq!(renamed.checklists[1].name, "Z");
        assert_eq!(renamed.checklists[0], body().checklists[0]);
        let removed = apply(BodyChange::RemoveChecklist(0)).unwrap();
        assert_eq!(removed.checklists, body().checklists[1..]);
    }

    #[test]
    fn an_item_is_added_unchecked_edited_checked_and_removed() {
        let added = apply(BodyChange::AddItem {
            list: 1,
            text: " trois ".to_owned(),
        })
        .unwrap();
        assert_eq!(
            added.checklists[1].items,
            [ChecklistItem {
                done: false,
                text: "trois".to_owned()
            }]
        );
        let edited = apply(BodyChange::EditItem {
            list: 0,
            item: 1,
            text: "2".to_owned(),
        })
        .unwrap();
        assert_eq!(edited.checklists[0].items[1].text, "2");
        assert!(!edited.checklists[0].items[1].done);
        assert!(edited.checklists[0].items[0].done);
        let checked = apply(BodyChange::CheckItem {
            list: 0,
            item: 1,
            done: true,
        })
        .unwrap();
        assert!(checked.checklists[0].items[1].done);
        let unchecked = apply(BodyChange::CheckItem {
            list: 0,
            item: 0,
            done: false,
        })
        .unwrap();
        assert!(!unchecked.checklists[0].items[0].done);
        let removed = apply(BodyChange::RemoveItem { list: 0, item: 0 }).unwrap();
        assert_eq!(removed.checklists[0].items, body().checklists[0].items[1..]);
    }

    #[test]
    fn a_comment_is_added_dated_edited_in_place_and_removed() {
        let later = DayTime::new(Day::parse("2026-11-25").unwrap(), 9, 5).unwrap();
        let added = apply(BodyChange::AddComment {
            at: later,
            text: " tiens \n suite ".to_owned(),
        })
        .unwrap();
        assert_eq!(added.comments.len(), 3);
        assert_eq!(added.comments[2].at, later);
        assert_eq!(added.comments[2].text, "tiens \n suite");
        let edited = apply(BodyChange::EditComment {
            comment: 0,
            text: "modifié".to_owned(),
        })
        .unwrap();
        assert_eq!(edited.comments[0].text, "modifié");
        assert_eq!(edited.comments[0].at, moment());
        assert_eq!(edited.comments[1], body().comments[1]);
        let removed = apply(BodyChange::RemoveComment(0)).unwrap();
        assert_eq!(removed.comments, body().comments[1..]);
    }

    #[test]
    fn an_empty_text_is_refused() {
        let blank = |text: &str| text.to_owned();
        let changes = [
            BodyChange::AddChecklist(blank(" ")),
            BodyChange::RenameChecklist {
                list: 0,
                name: blank(""),
            },
            BodyChange::AddItem {
                list: 0,
                text: blank(""),
            },
            BodyChange::EditItem {
                list: 0,
                item: 0,
                text: blank(" "),
            },
            BodyChange::AddComment {
                at: moment(),
                text: blank("\n"),
            },
            BodyChange::EditComment {
                comment: 0,
                text: blank(""),
            },
        ];
        for change in changes {
            assert_eq!(apply(change), Err(BodyError::Empty));
        }
    }

    #[test]
    fn a_name_or_an_item_stays_on_one_line() {
        for text in ["a\nb", "a\rb"] {
            let text = || text.to_owned();
            let changes = [
                BodyChange::AddChecklist(text()),
                BodyChange::RenameChecklist {
                    list: 0,
                    name: text(),
                },
                BodyChange::AddItem {
                    list: 0,
                    text: text(),
                },
                BodyChange::EditItem {
                    list: 0,
                    item: 0,
                    text: text(),
                },
            ];
            for change in changes {
                assert_eq!(apply(change), Err(BodyError::NotOneLine));
            }
        }
    }

    #[test]
    fn a_list_that_is_gone_is_refused() {
        let text = || "x".to_owned();
        let changes = [
            BodyChange::RenameChecklist {
                list: 2,
                name: text(),
            },
            BodyChange::RemoveChecklist(2),
            BodyChange::AddItem {
                list: 2,
                text: text(),
            },
            BodyChange::EditItem {
                list: 2,
                item: 0,
                text: text(),
            },
            BodyChange::CheckItem {
                list: 2,
                item: 0,
                done: true,
            },
            BodyChange::RemoveItem { list: 2, item: 0 },
        ];
        for change in changes {
            assert_eq!(apply(change), Err(BodyError::NoSuchChecklist));
        }
    }

    #[test]
    fn an_item_or_a_comment_that_is_gone_is_refused() {
        let text = || "x".to_owned();
        let items = [
            BodyChange::EditItem {
                list: 0,
                item: 2,
                text: text(),
            },
            BodyChange::CheckItem {
                list: 0,
                item: 2,
                done: true,
            },
            BodyChange::RemoveItem { list: 0, item: 2 },
        ];
        for change in items {
            assert_eq!(apply(change), Err(BodyError::NoSuchItem));
        }
        let comments = [
            BodyChange::EditComment {
                comment: 2,
                text: text(),
            },
            BodyChange::RemoveComment(2),
        ];
        for change in comments {
            assert_eq!(apply(change), Err(BodyError::NoSuchComment));
        }
    }

    #[test]
    fn each_refusal_says_what_happened() {
        let messages = [
            BodyError::Empty,
            BodyError::NotOneLine,
            BodyError::NoSuchChecklist,
            BodyError::NoSuchItem,
            BodyError::NoSuchComment,
        ]
        .map(|error| error.to_string());
        assert_eq!(
            messages,
            [
                "Le texte est vide.",
                "Le texte tient sur une seule ligne.",
                "Cette liste à cocher n'existe plus.",
                "Cet élément n'existe plus.",
                "Ce commentaire n'existe plus."
            ]
        );
    }
}
