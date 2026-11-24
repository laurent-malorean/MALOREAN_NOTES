//! L'écriture du canvas comme Obsidian l'écrit (`doc/specs/canvas.md`, § 7) et la géométrie des
//! cartes que cette écriture et le canvas partagent.

use crate::canvas::{ArrowEnd, Canvas, CanvasArrow, CanvasCard, CardKind, Extra, Side};
use crate::json::{Json, write_string};

/// Un rectangle de carte : coin haut gauche et taille.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Rect {
    /// Position horizontale du coin haut gauche.
    pub x: i64,
    /// Position verticale du coin haut gauche.
    pub y: i64,
    /// Largeur.
    pub width: i64,
    /// Hauteur.
    pub height: i64,
}

impl Rect {
    /// Le rectangle de la carte.
    #[must_use]
    pub fn of(card: &CanvasCard) -> Self {
        Self {
            x: card.x,
            y: card.y,
            width: card.width,
            height: card.height,
        }
    }

    /// Vrai si `inner` est entièrement dans ce rectangle (bords compris).
    #[must_use]
    pub fn contains(&self, inner: &Self) -> bool {
        inner.x >= self.x
            && inner.y >= self.y
            && inner.x + inner.width <= self.x + self.width
            && inner.y + inner.height <= self.y + self.height
    }
}

/// Les côtés où s'accroche une flèche de `from` vers `to` quand le fichier ne les dit pas : de
/// droite à gauche pour deux cartes côte à côte (le cas décrit par la spécification), de bas en haut
/// pour deux cartes l'une sous l'autre ; le sens dominant est celui de l'écart entre les centres.
#[must_use]
pub fn deduce_sides(from: Rect, to: Rect) -> (Side, Side) {
    let dx = (2 * to.x + to.width) - (2 * from.x + from.width);
    let dy = (2 * to.y + to.height) - (2 * from.y + from.height);
    if dx.abs() >= dy.abs() {
        if dx >= 0 {
            (Side::Right, Side::Left)
        } else {
            (Side::Left, Side::Right)
        }
    } else if dy >= 0 {
        (Side::Bottom, Side::Top)
    } else {
        (Side::Top, Side::Bottom)
    }
}

impl Canvas {
    /// Les cartes qui font partie du groupe `group` : celles dont le rectangle est entièrement dans
    /// le sien (l'appartenance est géométrique, le fichier ne garde aucune liste).
    #[must_use]
    pub fn members_of(&self, group: &str) -> Vec<&CanvasCard> {
        let Some(frame) = self
            .card(group)
            .filter(|card| matches!(card.kind, CardKind::Group { .. }))
            .map(Rect::of)
        else {
            return Vec::new();
        };
        self.cards
            .iter()
            .filter(|card| card.id != group && frame.contains(&Rect::of(card)))
            .collect()
    }

    /// Le canvas écrit comme Obsidian l'écrit : tabulations, un objet par ligne, aucun espace, pas de
    /// retour à la ligne final. Une flèche sans côté reçoit ceux que déduit [`deduce_sides`].
    #[must_use]
    pub fn to_text(&self) -> String {
        let sided = self.clone().with_deduced_sides();
        let mut sections: Vec<String> = vec![
            list("nodes", sided.cards.iter().map(card_line).collect()),
            list("edges", sided.arrows.iter().map(arrow_line).collect()),
        ];
        for (key, value) in &sided.extra {
            let mut line = String::from("\t");
            write_string(key, &mut line);
            line.push(':');
            value.write_compact(&mut line);
            sections.push(line);
        }
        format!("{{\n{}\n}}", sections.join(",\n"))
    }
}

fn list(key: &str, lines: Vec<String>) -> String {
    if lines.is_empty() {
        return format!("\t\"{key}\":[]");
    }
    let body: Vec<String> = lines
        .into_iter()
        .map(|line| format!("\t\t{line}"))
        .collect();
    format!("\t\"{key}\":[\n{}\n\t]", body.join(",\n"))
}

/// Un objet écrit champ par champ.
struct Line(String);

impl Line {
    fn new() -> Self {
        Self(String::from("{"))
    }

    fn raw(&mut self, key: &str, value: &str) {
        if self.0.len() > 1 {
            self.0.push(',');
        }
        write_string(key, &mut self.0);
        self.0.push(':');
        self.0.push_str(value);
    }

    fn text(&mut self, key: &str, value: &str) {
        let mut quoted = String::new();
        write_string(value, &mut quoted);
        self.raw(key, &quoted);
    }

    fn maybe(&mut self, key: &str, value: Option<&str>) {
        if let Some(value) = value {
            self.text(key, value);
        }
    }

    fn number(&mut self, key: &str, value: i64) {
        self.raw(key, &value.to_string());
    }

    fn extra(&mut self, extra: &Extra) {
        for (key, value) in extra {
            self.raw(key, &Json::to_compact(value));
        }
    }

    fn done(mut self) -> String {
        self.0.push('}');
        self.0
    }
}

fn frame(line: &mut Line, card: &CanvasCard) {
    line.number("x", card.x);
    line.number("y", card.y);
    line.number("width", card.width);
    line.number("height", card.height);
    line.maybe("color", card.color.as_deref());
}

fn card_line(card: &CanvasCard) -> String {
    let mut line = Line::new();
    line.text("id", &card.id);
    match &card.kind {
        CardKind::Text { text } => {
            line.text("type", "text");
            line.text("text", text);
            frame(&mut line, card);
        }
        CardKind::File { file, subpath } => {
            line.text("type", "file");
            line.text("file", file);
            line.maybe("subpath", subpath.as_deref());
            frame(&mut line, card);
        }
        CardKind::Link { url } => {
            line.text("type", "link");
            line.text("url", url);
            frame(&mut line, card);
        }
        CardKind::Group {
            label,
            background,
            background_style,
        } => {
            line.text("type", "group");
            line.maybe("backgroundStyle", background_style.map(|s| s.name()));
            frame(&mut line, card);
            line.maybe("label", label.as_deref());
            line.maybe("background", background.as_deref());
        }
    }
    line.extra(&card.extra);
    line.done()
}

fn arrow_line(arrow: &CanvasArrow) -> String {
    let mut line = Line::new();
    line.text("id", &arrow.id);
    line.text("fromNode", &arrow.from);
    line.maybe("fromSide", arrow.from_side.map(Side::name));
    line.text("toNode", &arrow.to);
    line.maybe("toSide", arrow.to_side.map(Side::name));
    if arrow.from_end != ArrowEnd::None {
        line.text("fromEnd", arrow.from_end.name());
    }
    if arrow.to_end != ArrowEnd::Arrow {
        line.text("toEnd", arrow.to_end.name());
    }
    line.maybe("color", arrow.color.as_deref());
    line.maybe("label", arrow.label.as_deref());
    line.extra(&arrow.extra);
    line.done()
}
