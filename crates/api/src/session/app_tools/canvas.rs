//! La lecture d'un canvas par une IA (fiche 0079) : des cartes, des flèches et des groupes en
//! données, jamais le JSON du fichier ; la taille est bornée et la coupure toujours dite.

use application::use_cases::ReadCanvas;
use domain::NotePath;
use domain::canvas::{Canvas, CanvasArrow, CanvasCard, CardKind};
use domain::canvas_color::color_name;
use domain::canvas_edit::ArrowSense;
use domain::canvas_reading::{
    MAX_READ_CANVAS_ARROWS, MAX_READ_CANVAS_CARDS, MAX_READ_CANVAS_TEXT_CHARACTERS, text_within,
};
use serde::Serialize;
use serde_json::Value;

use super::{required, written};
use crate::ApiError;
use crate::session::Session;

/// Une carte de canvas, telle que l'IA la reçoit.
#[derive(Debug, Serialize)]
pub(super) struct CardView {
    id: String,
    #[serde(rename = "type")]
    kind: &'static str,
    x: i64,
    y: i64,
    width: i64,
    height: i64,
    /// Le nom de la couleur dans la palette de l'application.
    color: Option<&'static str>,
    /// La valeur écrite d'une couleur hors palette (canvas venu d'ailleurs).
    #[serde(skip_serializing_if = "Option::is_none")]
    other_color: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    text: Option<String>,
    /// Le texte de la carte est coupé : sa fin n'est pas dans `text`.
    #[serde(skip_serializing_if = "std::ops::Not::not")]
    text_truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    file: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    subpath: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    url: Option<String>,
    /// Le nom d'un groupe.
    #[serde(skip_serializing_if = "Option::is_none")]
    label: Option<String>,
    /// Les cartes qui font partie d'un groupe : celles entièrement dans son cadre.
    #[serde(skip_serializing_if = "Option::is_none")]
    members: Option<Vec<String>>,
}

/// Une flèche de canvas, telle que l'IA la reçoit.
#[derive(Debug, Serialize)]
pub(super) struct ArrowView {
    id: String,
    from: String,
    to: String,
    from_side: Option<&'static str>,
    to_side: Option<&'static str>,
    from_end: &'static str,
    to_end: &'static str,
    /// `none`, `single` ou `both` ; rien pour une pointe au seul départ.
    sense: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    label: Option<String>,
    color: Option<&'static str>,
    #[serde(skip_serializing_if = "Option::is_none")]
    other_color: Option<String>,
}

/// Un canvas, tel que l'IA le reçoit.
#[derive(Debug, Serialize)]
struct CanvasView {
    path: String,
    title: String,
    tags: Vec<String>,
    /// Le nombre de cartes du canvas entier.
    card_count: usize,
    /// Le nombre de flèches du canvas entier.
    arrow_count: usize,
    cards: Vec<CardView>,
    arrows: Vec<ArrowView>,
    /// La lecture est coupée : une partie du canvas n'est pas dans cette réponse.
    truncated: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

/// Le nom de la couleur dans la palette, et la valeur écrite si elle n'y est pas.
fn colors(written: Option<&str>) -> (Option<&'static str>, Option<String>) {
    match written {
        None => (None, None),
        Some(value) => match color_name(value) {
            Some(name) => (Some(name), None),
            None => (None, Some(value.to_owned())),
        },
    }
}

/// La carte telle que l'IA la reçoit ; son texte compte sur `room` caractères, qui diminue.
pub(super) fn card_view(canvas: &Canvas, card: &CanvasCard, room: &mut usize) -> CardView {
    let (color, other_color) = colors(card.color.as_deref());
    let mut view = CardView {
        id: card.id.clone(),
        kind: "text",
        x: card.x,
        y: card.y,
        width: card.width,
        height: card.height,
        color,
        other_color,
        text: None,
        text_truncated: false,
        file: None,
        subpath: None,
        url: None,
        label: None,
        members: None,
    };
    match &card.kind {
        CardKind::Text { text } => {
            let (shown, cut) = text_within(text, *room);
            *room -= shown.chars().count();
            view.text = Some(shown.to_owned());
            view.text_truncated = cut;
        }
        CardKind::File { file, subpath } => {
            view.kind = "file";
            view.file = Some(file.clone());
            view.subpath.clone_from(subpath);
        }
        CardKind::Link { url } => {
            view.kind = "link";
            view.url = Some(url.clone());
        }
        CardKind::Group { label, .. } => {
            view.kind = "group";
            view.label.clone_from(label);
            view.members = Some(
                canvas
                    .members_of(&card.id)
                    .iter()
                    .map(|member| member.id.clone())
                    .collect(),
            );
        }
    }
    view
}

/// La flèche telle que l'IA la reçoit.
pub(super) fn arrow_view(arrow: &CanvasArrow) -> ArrowView {
    let (color, other_color) = colors(arrow.color.as_deref());
    ArrowView {
        id: arrow.id.clone(),
        from: arrow.from.clone(),
        to: arrow.to.clone(),
        from_side: arrow.from_side.map(domain::canvas::Side::name),
        to_side: arrow.to_side.map(domain::canvas::Side::name),
        from_end: arrow.from_end.name(),
        to_end: arrow.to_end.name(),
        sense: ArrowSense::of(arrow).map(ArrowSense::name),
        label: arrow.label.clone(),
        color,
        other_color,
    }
}

/// Ce que la coupure a retiré, dit à l'IA ; rien si rien n'est coupé.
fn cut_message(cards: (usize, usize), arrows: (usize, usize), texts: usize) -> Option<String> {
    let mut parts = Vec::new();
    if cards.0 < cards.1 {
        parts.push(format!(
            "{} cartes sur {} sont données (la limite est de {MAX_READ_CANVAS_CARDS}) : les \
             suivantes ne sont pas listées",
            cards.0, cards.1
        ));
    }
    if arrows.0 < arrows.1 {
        parts.push(format!(
            "{} flèches sur {} sont données (la limite est de {MAX_READ_CANVAS_ARROWS}) : les \
             suivantes ne sont pas listées",
            arrows.0, arrows.1
        ));
    }
    if texts > 0 {
        parts.push(format!(
            "{texts} texte(s) de carte sont coupés (la limite est de \
             {MAX_READ_CANVAS_TEXT_CHARACTERS} caractères de texte pour tout le canvas) : les \
             cartes concernées portent `text_truncated`"
        ));
    }
    (!parts.is_empty()).then(|| {
        format!(
            "la lecture est coupée : {} ; les cartes et les flèches données se changent \
             normalement, les autres ne se lisent pas avec cet outil",
            parts.join(" ; ")
        )
    })
}

impl Session {
    /// Le canvas `path` en données : cartes, flèches, groupes, étiquettes ; coupé, et la réponse
    /// le dit, au-delà de [`MAX_READ_CANVAS_CARDS`] cartes, [`MAX_READ_CANVAS_ARROWS`] flèches
    /// ou [`MAX_READ_CANVAS_TEXT_CHARACTERS`] caractères de texte (fiche 0079).
    pub(super) fn tool_read_canvas(&self, arguments: &Value) -> Result<String, String> {
        let said = |error: ApiError| error.message;
        let path = NotePath::parse(required(arguments, "path")?)
            .map_err(ApiError::from)
            .map_err(said)?;
        let store = self.store().map_err(said)?;
        let (canvas, _) = ReadCanvas::new(&*store)
            .execute(&path)
            .map_err(ApiError::from)
            .map_err(said)?;
        let mut room = MAX_READ_CANVAS_TEXT_CHARACTERS;
        let cards: Vec<CardView> = canvas
            .cards
            .iter()
            .take(MAX_READ_CANVAS_CARDS)
            .map(|card| card_view(&canvas, card, &mut room))
            .collect();
        let arrows: Vec<ArrowView> = canvas
            .arrows
            .iter()
            .take(MAX_READ_CANVAS_ARROWS)
            .map(arrow_view)
            .collect();
        let cut_texts = cards.iter().filter(|card| card.text_truncated).count();
        let message = cut_message(
            (cards.len(), canvas.cards.len()),
            (arrows.len(), canvas.arrows.len()),
            cut_texts,
        );
        written(&CanvasView {
            path: path.to_path(),
            title: path.name().as_str().to_owned(),
            tags: canvas.tags(),
            card_count: canvas.cards.len(),
            arrow_count: canvas.arrows.len(),
            cards,
            arrows,
            truncated: message.is_some(),
            message,
        })
    }
}
