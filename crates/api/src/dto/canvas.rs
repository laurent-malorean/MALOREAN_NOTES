//! Le canvas tel que l'interface le reçoit et le renvoie (fiche 0052).

use domain::canvas::{
    ArrowEnd, BackgroundStyle, Canvas, CanvasArrow, CanvasCard, CanvasError, CardKind, Extra, Side,
};
use domain::canvas_color::{color_name, file_color};
use domain::json::Json;
use serde::{Deserialize, Serialize};
use ts_rs::TS;

/// Une propriété que l'application ne connaît pas : son nom et sa valeur en JSON.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CanvasExtraItem {
    /// Le nom de la propriété.
    pub key: String,
    /// Sa valeur, écrite en JSON.
    pub json: String,
}

/// Une carte du canvas : sa sorte (`text`, `file`, `link` ou `group`) et les champs de cette sorte.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CanvasCardItem {
    /// Son identifiant.
    pub id: String,
    /// Sa sorte : `text`, `file`, `link` ou `group`.
    pub kind: String,
    /// Le texte Markdown d'une carte texte.
    pub text: Option<String>,
    /// Le chemin du fichier d'une carte de note ou de média.
    pub file: Option<String>,
    /// L'ancre dans la note.
    pub subpath: Option<String>,
    /// L'adresse d'une carte de page web.
    pub url: Option<String>,
    /// Le nom d'un groupe.
    pub label: Option<String>,
    /// L'image d'arrière-plan d'un groupe.
    pub background: Option<String>,
    /// Comment l'image remplit le groupe : `cover`, `ratio` ou `repeat`.
    pub background_style: Option<String>,
    /// Position horizontale du coin haut gauche.
    pub x: f64,
    /// Position verticale du coin haut gauche.
    pub y: f64,
    /// Largeur.
    pub width: f64,
    /// Hauteur.
    pub height: f64,
    /// La couleur telle qu'écrite dans le fichier.
    pub color: Option<String>,
    /// La couleur de la palette que désigne `color` ; en la posant, l'écran choisit la couleur.
    pub palette: Option<String>,
    /// Les propriétés inconnues.
    pub extra: Vec<CanvasExtraItem>,
}

/// Une flèche du canvas.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CanvasArrowItem {
    /// Son identifiant.
    pub id: String,
    /// La carte de départ.
    pub from: String,
    /// Son côté de départ : `top`, `right`, `bottom` ou `left`.
    pub from_side: String,
    /// L'extrémité de départ : `none` ou `arrow`.
    pub from_end: String,
    /// La carte d'arrivée.
    pub to: String,
    /// Son côté d'arrivée.
    pub to_side: String,
    /// L'extrémité d'arrivée.
    pub to_end: String,
    /// La couleur telle qu'écrite dans le fichier.
    pub color: Option<String>,
    /// La couleur de la palette que désigne `color`.
    pub palette: Option<String>,
    /// Son étiquette.
    pub label: Option<String>,
    /// Les propriétés inconnues.
    pub extra: Vec<CanvasExtraItem>,
}

/// Un canvas.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CanvasItem {
    /// Les cartes, du fond au premier plan.
    pub cards: Vec<CanvasCardItem>,
    /// Les flèches.
    pub arrows: Vec<CanvasArrowItem>,
    /// Les propriétés inconnues de la racine.
    pub extra: Vec<CanvasExtraItem>,
}

/// Un canvas lu ou enregistré et le texte exact du fichier d'où il vient : l'écran le rend à
/// l'enregistrement pour que Rust sache si le fichier a changé entre-temps.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize, TS)]
#[serde(rename_all = "camelCase")]
#[ts(export)]
pub struct CanvasFileItem {
    /// Le canvas.
    pub canvas: CanvasItem,
    /// Le texte du fichier.
    pub text: String,
}

fn extra_items(extra: Extra) -> Vec<CanvasExtraItem> {
    extra
        .into_iter()
        .map(|(key, value)| CanvasExtraItem {
            key,
            json: value.to_compact(),
        })
        .collect()
}

fn extra_of(items: Vec<CanvasExtraItem>) -> Result<Extra, CanvasError> {
    items
        .into_iter()
        .map(|item| {
            let value = Json::parse(&item.json).map_err(|e| CanvasError(e.to_string()))?;
            Ok((item.key, value))
        })
        .collect()
}

/// La couleur écrite : celle de la palette choisie, ou celle qu'avait le fichier.
fn written_color(color: Option<String>, palette: Option<&str>) -> Option<String> {
    match palette {
        None => color,
        Some(name) => match color {
            Some(kept) if color_name(&kept) == Some(name) => Some(kept),
            _ => file_color(name).map(str::to_owned),
        },
    }
}

impl From<CanvasCard> for CanvasCardItem {
    fn from(card: CanvasCard) -> Self {
        let mut item = Self {
            palette: card
                .color
                .as_deref()
                .and_then(color_name)
                .map(str::to_owned),
            id: card.id,
            kind: String::new(),
            text: None,
            file: None,
            subpath: None,
            url: None,
            label: None,
            background: None,
            background_style: None,
            x: card.x as f64,
            y: card.y as f64,
            width: card.width as f64,
            height: card.height as f64,
            color: card.color,
            extra: extra_items(card.extra),
        };
        match card.kind {
            CardKind::Text { text } => {
                "text".clone_into(&mut item.kind);
                item.text = Some(text);
            }
            CardKind::File { file, subpath } => {
                "file".clone_into(&mut item.kind);
                item.file = Some(file);
                item.subpath = subpath;
            }
            CardKind::Link { url } => {
                "link".clone_into(&mut item.kind);
                item.url = Some(url);
            }
            CardKind::Group {
                label,
                background,
                background_style,
            } => {
                "group".clone_into(&mut item.kind);
                item.label = label;
                item.background = background;
                item.background_style = background_style.map(|s| s.name().to_owned());
            }
        }
        item
    }
}

fn missing(id: &str, field: &str) -> CanvasError {
    CanvasError(format!("la carte « {id} » n'a pas de « {field} »"))
}

impl TryFrom<CanvasCardItem> for CanvasCard {
    type Error = CanvasError;

    fn try_from(item: CanvasCardItem) -> Result<Self, CanvasError> {
        let id = item.id;
        let kind = match item.kind.as_str() {
            "text" => CardKind::Text {
                text: item.text.ok_or_else(|| missing(&id, "text"))?,
            },
            "file" => CardKind::File {
                file: item.file.ok_or_else(|| missing(&id, "file"))?,
                subpath: item.subpath,
            },
            "link" => CardKind::Link {
                url: item.url.ok_or_else(|| missing(&id, "url"))?,
            },
            "group" => CardKind::Group {
                label: item.label,
                background: item.background,
                background_style: match item.background_style.as_deref() {
                    None => None,
                    Some("cover") => Some(BackgroundStyle::Cover),
                    Some("ratio") => Some(BackgroundStyle::Ratio),
                    Some("repeat") => Some(BackgroundStyle::Repeat),
                    Some(other) => {
                        return Err(CanvasError(format!(
                            "style d'arrière-plan « {other} » inconnu"
                        )));
                    }
                },
            },
            other => return Err(CanvasError(format!("type de carte « {other} » inconnu"))),
        };
        Ok(Self {
            color: written_color(item.color, item.palette.as_deref()),
            extra: extra_of(item.extra)?,
            x: item.x.round() as i64,
            y: item.y.round() as i64,
            width: item.width.round() as i64,
            height: item.height.round() as i64,
            id,
            kind,
        })
    }
}

fn side_of(name: &str) -> Result<Side, CanvasError> {
    Side::from_name(name).ok_or_else(|| CanvasError(format!("côté « {name} » inconnu")))
}

fn end_of(name: &str) -> Result<ArrowEnd, CanvasError> {
    match name {
        "none" => Ok(ArrowEnd::None),
        "arrow" => Ok(ArrowEnd::Arrow),
        other => Err(CanvasError(format!("extrémité « {other} » inconnue"))),
    }
}

impl From<CanvasArrow> for CanvasArrowItem {
    fn from(arrow: CanvasArrow) -> Self {
        let side = |side: Option<Side>| side.map_or("right", Side::name).to_owned();
        Self {
            palette: arrow
                .color
                .as_deref()
                .and_then(color_name)
                .map(str::to_owned),
            id: arrow.id,
            from: arrow.from,
            from_side: side(arrow.from_side),
            from_end: arrow.from_end.name().to_owned(),
            to: arrow.to,
            to_side: side(arrow.to_side),
            to_end: arrow.to_end.name().to_owned(),
            color: arrow.color,
            label: arrow.label,
            extra: extra_items(arrow.extra),
        }
    }
}

impl TryFrom<CanvasArrowItem> for CanvasArrow {
    type Error = CanvasError;

    fn try_from(item: CanvasArrowItem) -> Result<Self, CanvasError> {
        Ok(Self {
            from_side: Some(side_of(&item.from_side)?),
            to_side: Some(side_of(&item.to_side)?),
            from_end: end_of(&item.from_end)?,
            to_end: end_of(&item.to_end)?,
            color: written_color(item.color, item.palette.as_deref()),
            extra: extra_of(item.extra)?,
            id: item.id,
            from: item.from,
            to: item.to,
            label: item.label,
        })
    }
}

impl From<Canvas> for CanvasItem {
    fn from(canvas: Canvas) -> Self {
        Self {
            cards: canvas.cards.into_iter().map(Into::into).collect(),
            arrows: canvas.arrows.into_iter().map(Into::into).collect(),
            extra: extra_items(canvas.extra),
        }
    }
}

impl TryFrom<CanvasItem> for Canvas {
    type Error = CanvasError;

    fn try_from(item: CanvasItem) -> Result<Self, CanvasError> {
        Ok(Self {
            cards: item
                .cards
                .into_iter()
                .map(CanvasCard::try_from)
                .collect::<Result<_, _>>()?,
            arrows: item
                .arrows
                .into_iter()
                .map(CanvasArrow::try_from)
                .collect::<Result<_, _>>()?,
            extra: extra_of(item.extra)?,
        })
    }
}

#[cfg(test)]
#[path = "canvas_tests.rs"]
mod tests;
