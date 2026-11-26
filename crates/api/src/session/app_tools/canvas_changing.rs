//! Les outils qui changent un canvas (fiche 0079) : un par geste de l'interface. Chacun applique son
//! geste à un canvas du domaine, par `ChangeCanvas` qui garde la version d'avant et enregistre par
//! le même cas d'usage que l'interface.

use application::use_cases::ChangeCanvas;
use domain::NotePath;
use domain::app_tools::AppTool;
use domain::canvas::{Canvas, CardKind, Side};
use domain::canvas_edit::{
    ArrowChange, ArrowSense, CanvasEditError, CardChange, ColorChoice, GroupPlace, NewArrow,
    NewCard, NewGroup,
};
use serde::Serialize;
use serde_json::Value;

use super::canvas::{ArrowView, CardView, arrow_view, card_view};
use super::{required, written};
use crate::ApiError;
use crate::session::Session;

/// Ce qu'un outil du canvas rend : le chemin, et ce que le geste a touché.
#[derive(Debug, Default, Serialize)]
struct Changed {
    path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    card: Option<CardView>,
    #[serde(skip_serializing_if = "Option::is_none")]
    arrow: Option<ArrowView>,
    /// Les cartes déplacées, la carte demandée d'abord.
    #[serde(skip_serializing_if = "Option::is_none")]
    moved: Option<Vec<String>>,
    /// Les flèches retirées avec une carte.
    #[serde(skip_serializing_if = "Option::is_none")]
    removed_arrows: Option<Vec<String>>,
    /// La flèche ou la carte retirée.
    #[serde(skip_serializing_if = "Option::is_none")]
    removed: Option<String>,
}

fn said(error: impl Into<ApiError>) -> String {
    error.into().message
}

/// Un nombre entier facultatif.
fn integer(arguments: &Value, field: &str) -> Result<Option<i64>, String> {
    match &arguments[field] {
        Value::Null => Ok(None),
        value => value
            .as_i64()
            .map(Some)
            .ok_or_else(|| format!("« {field} » doit être un nombre entier")),
    }
}

/// Un nombre entier que l'outil exige.
fn required_integer(arguments: &Value, field: &str) -> Result<i64, String> {
    integer(arguments, field)?.ok_or_else(|| format!("il manque « {field} »"))
}

/// Un texte facultatif, pris tel quel : vide permis.
fn text_of(arguments: &Value, field: &str) -> Result<Option<String>, String> {
    match &arguments[field] {
        Value::Null => Ok(None),
        Value::String(text) => Ok(Some(text.clone())),
        _ => Err(format!("« {field} » doit être un texte")),
    }
}

/// La couleur demandée, s'il y en a une.
fn color_of(arguments: &Value) -> Result<Option<ColorChoice>, String> {
    text_of(arguments, "color")?
        .map(|name| ColorChoice::parse(&name).map_err(|error| error.to_string()))
        .transpose()
}

/// Un côté demandé, s'il y en a un.
fn side_of(arguments: &Value, field: &str) -> Result<Option<Side>, String> {
    text_of(arguments, field)?
        .map(|name| {
            Side::from_name(&name).ok_or_else(|| {
                format!(
                    "« {name} » n'est pas un côté (« {field} ») : « top », « right », « bottom » \
                     ou « left »"
                )
            })
        })
        .transpose()
}

/// Le sens demandé, s'il y en a un.
fn sense_of(arguments: &Value) -> Result<Option<ArrowSense>, String> {
    text_of(arguments, "sense")?
        .map(|name| ArrowSense::parse(&name).map_err(|error| error.to_string()))
        .transpose()
}

/// Le texte d'un champ que l'outil exige, vide refusé.
fn id_of<'a>(arguments: &'a Value, field: &str) -> Result<&'a str, String> {
    required(arguments, field)
}

/// L'outil a l'air de vouloir changer quelque chose : au moins un des champs est donné.
fn something(arguments: &Value, fields: &[&str]) -> Result<(), String> {
    if fields.iter().any(|field| !arguments[*field].is_null()) {
        return Ok(());
    }
    let named: Vec<String> = fields.iter().map(|field| format!("« {field} »")).collect();
    Err(format!(
        "rien à changer : donnez au moins l'un de {}",
        named.join(", ")
    ))
}

impl Session {
    /// Applique `gesture` au canvas désigné par `path` ; rend le chemin et ce que le geste a
    /// rendu, avec le canvas enregistré. `file` est un fichier de l'espace à vérifier d'abord.
    fn change_canvas<T>(
        &self,
        arguments: &Value,
        file: Option<&str>,
        gesture: impl FnOnce(&mut Canvas) -> Result<T, CanvasEditError>,
    ) -> Result<(NotePath, Canvas, T), String> {
        let path = NotePath::parse(required(arguments, "path")?)
            .map_err(ApiError::from)
            .map_err(said)?;
        let opened = self.opened().map_err(said)?;
        let changing = ChangeCanvas::new(&*opened.store, &*opened.history, &*self.clock);
        if let Some(file) = file {
            changing.ensure_file(file).map_err(said)?;
        }
        let changed = changing.execute(&path, gesture).map_err(said)?;
        self.worker.request();
        Ok((path, changed.saved.canvas, changed.outcome))
    }

    /// Rend la carte `id` du canvas enregistré, avec le chemin.
    fn card_changed(path: &NotePath, canvas: &Canvas, id: &str) -> Result<String, String> {
        let mut room = usize::MAX;
        let card = canvas
            .card(id)
            .map(|card| card_view(canvas, card, &mut room));
        written(&Changed {
            path: path.to_path(),
            card,
            ..Changed::default()
        })
    }

    /// Joue un outil qui change un canvas.
    pub(super) fn call_canvas_tool(
        &self,
        tool: AppTool,
        arguments: &Value,
    ) -> Result<String, String> {
        match tool {
            AppTool::AddCanvasCard => self.tool_add_canvas_card(arguments),
            AppTool::ChangeCanvasCard => self.tool_change_canvas_card(arguments),
            AppTool::MoveCanvasCard => self.tool_move_canvas_card(arguments),
            AppTool::ResizeCanvasCard => self.tool_resize_canvas_card(arguments),
            AppTool::RemoveCanvasCard => self.tool_remove_canvas_card(arguments),
            AppTool::AddCanvasArrow => self.tool_add_canvas_arrow(arguments),
            AppTool::ChangeCanvasArrow => self.tool_change_canvas_arrow(arguments),
            AppTool::RemoveCanvasArrow => self.tool_remove_canvas_arrow(arguments),
            AppTool::AddCanvasGroup => self.tool_add_canvas_group(arguments),
            AppTool::ChangeCanvasGroup => self.tool_change_canvas_group(arguments),
            _ => unreachable!("un outil qui ne change pas un canvas est joué à part"),
        }
    }

    fn tool_add_canvas_card(&self, arguments: &Value) -> Result<String, String> {
        let (kind, file) = match required(arguments, "type")? {
            "text" => (
                CardKind::Text {
                    text: text_of(arguments, "text")?.unwrap_or_default(),
                },
                None,
            ),
            "file" => {
                let file = required(arguments, "file")?;
                (
                    CardKind::File {
                        file: file.to_owned(),
                        subpath: None,
                    },
                    Some(file),
                )
            }
            "link" => (
                CardKind::Link {
                    url: required(arguments, "url")?.to_owned(),
                },
                None,
            ),
            other => {
                return Err(format!(
                    "« {other} » n'est pas un type de carte : « text », « file » ou « link » (un \
                     groupe s'ajoute avec add_canvas_group)"
                ));
            }
        };
        let new = NewCard {
            kind,
            x: required_integer(arguments, "x")?,
            y: required_integer(arguments, "y")?,
            width: integer(arguments, "width")?,
            height: integer(arguments, "height")?,
            color: color_of(arguments)?,
        };
        let (path, canvas, id) =
            self.change_canvas(arguments, file, |canvas| canvas.add_card(new))?;
        Self::card_changed(&path, &canvas, &id)
    }

    fn tool_change_canvas_card(&self, arguments: &Value) -> Result<String, String> {
        let id = id_of(arguments, "id")?;
        something(arguments, &["text", "url", "file", "color"])?;
        let change = CardChange {
            text: text_of(arguments, "text")?,
            url: text_of(arguments, "url")?,
            file: text_of(arguments, "file")?,
            color: color_of(arguments)?,
        };
        let file = change.file.clone();
        let (path, canvas, ()) = self.change_canvas(arguments, file.as_deref(), |canvas| {
            canvas.change_card(id, change)
        })?;
        Self::card_changed(&path, &canvas, id)
    }

    fn tool_move_canvas_card(&self, arguments: &Value) -> Result<String, String> {
        let id = id_of(arguments, "id")?;
        let (x, y) = (
            required_integer(arguments, "x")?,
            required_integer(arguments, "y")?,
        );
        let (path, _, moved) =
            self.change_canvas(arguments, None, |canvas| canvas.move_card(id, x, y))?;
        written(&Changed {
            path: path.to_path(),
            moved: Some(moved),
            ..Changed::default()
        })
    }

    fn tool_resize_canvas_card(&self, arguments: &Value) -> Result<String, String> {
        let id = id_of(arguments, "id")?;
        let (width, height) = (
            required_integer(arguments, "width")?,
            required_integer(arguments, "height")?,
        );
        let (path, canvas, ()) = self.change_canvas(arguments, None, |canvas| {
            canvas.resize_card(id, width, height)
        })?;
        Self::card_changed(&path, &canvas, id)
    }

    fn tool_remove_canvas_card(&self, arguments: &Value) -> Result<String, String> {
        let id = id_of(arguments, "id")?;
        let (path, _, arrows) =
            self.change_canvas(arguments, None, |canvas| canvas.remove_card(id))?;
        written(&Changed {
            path: path.to_path(),
            removed: Some(id.to_owned()),
            removed_arrows: Some(arrows),
            ..Changed::default()
        })
    }

    fn arrow_changed(path: &NotePath, canvas: &Canvas, id: &str) -> Result<String, String> {
        let arrow = canvas.arrows.iter().find(|a| a.id == id).map(arrow_view);
        written(&Changed {
            path: path.to_path(),
            arrow,
            ..Changed::default()
        })
    }

    fn tool_add_canvas_arrow(&self, arguments: &Value) -> Result<String, String> {
        let new = NewArrow {
            from: id_of(arguments, "from")?.to_owned(),
            to: id_of(arguments, "to")?.to_owned(),
            from_side: side_of(arguments, "from_side")?,
            to_side: side_of(arguments, "to_side")?,
            sense: sense_of(arguments)?,
            label: text_of(arguments, "label")?,
            color: color_of(arguments)?,
        };
        let (path, canvas, id) =
            self.change_canvas(arguments, None, |canvas| canvas.add_arrow(new))?;
        Self::arrow_changed(&path, &canvas, &id)
    }

    fn tool_change_canvas_arrow(&self, arguments: &Value) -> Result<String, String> {
        let id = id_of(arguments, "id")?;
        something(
            arguments,
            &[
                "sense",
                "label",
                "color",
                "from",
                "from_side",
                "to",
                "to_side",
            ],
        )?;
        let change = ArrowChange {
            from: text_of(arguments, "from")?,
            from_side: side_of(arguments, "from_side")?,
            to: text_of(arguments, "to")?,
            to_side: side_of(arguments, "to_side")?,
            sense: sense_of(arguments)?,
            label: text_of(arguments, "label")?,
            color: color_of(arguments)?,
        };
        let (path, canvas, ()) =
            self.change_canvas(arguments, None, |canvas| canvas.change_arrow(id, change))?;
        Self::arrow_changed(&path, &canvas, id)
    }

    fn tool_remove_canvas_arrow(&self, arguments: &Value) -> Result<String, String> {
        let id = id_of(arguments, "id")?;
        let (path, _, ()) =
            self.change_canvas(arguments, None, |canvas| canvas.remove_arrow(id))?;
        written(&Changed {
            path: path.to_path(),
            removed: Some(id.to_owned()),
            ..Changed::default()
        })
    }

    /// Où poser le groupe : autour des cartes données, ou vide à une position, jamais les deux.
    fn group_place(arguments: &Value) -> Result<GroupPlace, String> {
        let (x, y) = (integer(arguments, "x")?, integer(arguments, "y")?);
        let (width, height) = (integer(arguments, "width")?, integer(arguments, "height")?);
        let cards = match &arguments["cards"] {
            Value::Null => None,
            Value::Array(ids) => Some(
                ids.iter()
                    .map(|id| {
                        id.as_str().map(str::to_owned).ok_or_else(|| {
                            "« cards » est une liste d'identifiants de cartes".to_owned()
                        })
                    })
                    .collect::<Result<Vec<_>, _>>()?,
            ),
            _ => return Err("« cards » est une liste d'identifiants de cartes".to_owned()),
        };
        match (cards, x, y) {
            (Some(ids), None, None) if width.is_none() && height.is_none() => {
                Ok(GroupPlace::Around(ids))
            }
            (Some(_), ..) => Err(
                "donnez soit « cards » (le groupe entoure ces cartes), soit « x » et « y » (un \
                 groupe vide à cet endroit), pas les deux"
                    .to_owned(),
            ),
            (None, Some(x), Some(y)) => Ok(GroupPlace::At {
                x,
                y,
                width,
                height,
            }),
            (None, ..) => Err(
                "donnez soit « cards » (le groupe entoure ces cartes), soit « x » et « y » (un \
                 groupe vide à cet endroit)"
                    .to_owned(),
            ),
        }
    }

    fn tool_add_canvas_group(&self, arguments: &Value) -> Result<String, String> {
        let new = NewGroup {
            place: Self::group_place(arguments)?,
            label: text_of(arguments, "label")?,
            color: color_of(arguments)?,
        };
        let (path, canvas, id) =
            self.change_canvas(arguments, None, |canvas| canvas.add_group(new))?;
        Self::card_changed(&path, &canvas, &id)
    }

    fn tool_change_canvas_group(&self, arguments: &Value) -> Result<String, String> {
        let id = id_of(arguments, "id")?;
        something(arguments, &["label", "color"])?;
        let (label, color) = (text_of(arguments, "label")?, color_of(arguments)?);
        let (path, canvas, ()) = self.change_canvas(arguments, None, |canvas| {
            canvas.change_group(id, label, color)
        })?;
        Self::card_changed(&path, &canvas, id)
    }
}
