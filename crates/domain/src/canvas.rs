//! Le canvas (fiche 0052) : un fichier `.canvas` au format JSON Canvas, celui d'Obsidian, lu et écrit
//! comme Obsidian le fait (`doc/specs/canvas.md`). Les propriétés inconnues sont gardées telles quelles.
//! Dans le fichier, une carte est un « nœud » et une flèche une « arête ».

use std::collections::HashSet;
use std::fmt;

use crate::json::Json;

pub use crate::canvas_write::{Rect, deduce_sides};

/// Un côté d'une carte : là où s'accroche une flèche (au milieu du côté).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Side {
    /// Le haut.
    Top,
    /// La droite.
    Right,
    /// Le bas.
    Bottom,
    /// La gauche.
    Left,
}

impl Side {
    /// Le nom écrit dans le fichier.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Top => "top",
            Self::Right => "right",
            Self::Bottom => "bottom",
            Self::Left => "left",
        }
    }

    /// Le côté qui porte ce nom dans le fichier.
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        [Self::Top, Self::Right, Self::Bottom, Self::Left]
            .into_iter()
            .find(|side| side.name() == name)
    }
}

/// La forme d'une extrémité de flèche.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ArrowEnd {
    /// Rien : le trait s'arrête.
    None,
    /// Une pointe.
    Arrow,
}

impl ArrowEnd {
    /// Le nom écrit dans le fichier.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::None => "none",
            Self::Arrow => "arrow",
        }
    }

    fn from_name(name: &str) -> Option<Self> {
        [Self::None, Self::Arrow]
            .into_iter()
            .find(|end| end.name() == name)
    }
}

/// Comment l'image d'arrière-plan d'un groupe remplit son cadre.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BackgroundStyle {
    /// Remplit tout le groupe.
    Cover,
    /// Garde les proportions.
    Ratio,
    /// Répète l'image à sa taille.
    Repeat,
}

impl BackgroundStyle {
    /// Le nom écrit dans le fichier.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Cover => "cover",
            Self::Ratio => "ratio",
            Self::Repeat => "repeat",
        }
    }

    fn from_name(name: &str) -> Option<Self> {
        [Self::Cover, Self::Ratio, Self::Repeat]
            .into_iter()
            .find(|style| style.name() == name)
    }
}

/// Ce que montre une carte.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum CardKind {
    /// Du Markdown.
    Text {
        /// Le texte.
        text: String,
    },
    /// Une note ou un média de l'espace de travail.
    File {
        /// Son chemin depuis la racine de l'espace de travail.
        file: String,
        /// L'ancre dans la note : `#Titre` ou `#^bloc`.
        subpath: Option<String>,
    },
    /// Une page web.
    Link {
        /// L'adresse.
        url: String,
    },
    /// Un cadre qui en regroupe d'autres.
    Group {
        /// Son nom.
        label: Option<String>,
        /// L'image d'arrière-plan, depuis la racine de l'espace de travail.
        background: Option<String>,
        /// Comment elle remplit le cadre.
        background_style: Option<BackgroundStyle>,
    },
}

/// Un champ que ce programme ne connaît pas, gardé tel quel.
pub type Extra = Vec<(String, Json)>;

/// Une carte du canvas.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanvasCard {
    /// Son identifiant, unique dans le fichier (cartes et flèches).
    pub id: String,
    /// Ce qu'elle montre.
    pub kind: CardKind,
    /// Position horizontale du coin haut gauche.
    pub x: i64,
    /// Position verticale du coin haut gauche.
    pub y: i64,
    /// Largeur.
    pub width: i64,
    /// Hauteur.
    pub height: i64,
    /// Sa couleur, telle qu'écrite : un préréglage `"1"` à `"6"` ou `#RRGGBB`.
    pub color: Option<String>,
    /// Les propriétés inconnues.
    pub extra: Extra,
}

/// Une flèche entre deux cartes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanvasArrow {
    /// Son identifiant.
    pub id: String,
    /// La carte de départ.
    pub from: String,
    /// Son côté de départ ; absent dans un fichier qui ne le dit pas.
    pub from_side: Option<Side>,
    /// L'extrémité côté départ (aucune par défaut).
    pub from_end: ArrowEnd,
    /// La carte d'arrivée.
    pub to: String,
    /// Son côté d'arrivée.
    pub to_side: Option<Side>,
    /// L'extrémité côté arrivée (une pointe par défaut).
    pub to_end: ArrowEnd,
    /// Sa couleur, telle qu'écrite.
    pub color: Option<String>,
    /// Son étiquette.
    pub label: Option<String>,
    /// Les propriétés inconnues.
    pub extra: Extra,
}

/// Un canvas : ses cartes (la première est au fond) et ses flèches.
#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct Canvas {
    /// Les cartes, du fond au premier plan.
    pub cards: Vec<CanvasCard>,
    /// Les flèches.
    pub arrows: Vec<CanvasArrow>,
    /// Les propriétés inconnues de la racine.
    pub extra: Extra,
}

/// Le fichier n'est pas un canvas valide : ce qui est faux, dit en clair.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CanvasError(pub String);

impl fmt::Display for CanvasError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "ce fichier n'est pas un canvas valide : {}", self.0)
    }
}

impl std::error::Error for CanvasError {}

fn fail<T>(message: impl Into<String>) -> Result<T, CanvasError> {
    Err(CanvasError(message.into()))
}

impl Canvas {
    /// Le canvas du texte `text`.
    ///
    /// # Errors
    ///
    /// [`CanvasError`] si le texte n'est pas du JSON, si la racine n'est pas un objet, si une carte
    /// ou une flèche n'a pas ses champs obligatoires, si un nombre n'est pas entier, si un côté,
    /// une extrémité ou un style est inconnu, si deux identifiants sont les mêmes ou si une flèche
    /// désigne une carte absente (`doc/specs/canvas.md`, § 8). Une couleur hors des préréglages et
    /// des hexadécimaux est gardée telle quelle.
    pub fn parse(text: &str) -> Result<Self, CanvasError> {
        let root = Json::parse(text).map_err(|e| CanvasError(e.to_string()))?;
        let Json::Object(fields) = root else {
            return fail("la racine n'est pas un objet");
        };
        let mut canvas = Self::default();
        for (key, value) in fields {
            match (key.as_str(), value) {
                ("nodes", Json::Array(items)) => {
                    canvas.cards = items.iter().map(card).collect::<Result<_, _>>()?;
                }
                ("edges", Json::Array(items)) => {
                    canvas.arrows = items.iter().map(arrow).collect::<Result<_, _>>()?;
                }
                ("nodes" | "edges", _) => return fail(format!("« {key} » n'est pas un tableau")),
                (_, value) => canvas.extra.push((key, value)),
            }
        }
        canvas.check_links()?;
        Ok(canvas)
    }

    fn check_links(&self) -> Result<(), CanvasError> {
        let mut ids = HashSet::new();
        let all = self
            .cards
            .iter()
            .map(|c| &c.id)
            .chain(self.arrows.iter().map(|a| &a.id));
        for id in all {
            if !ids.insert(id.as_str()) {
                return fail(format!("l'identifiant « {id} » est employé deux fois"));
            }
        }
        for arrow in &self.arrows {
            for end in [&arrow.from, &arrow.to] {
                if !self.cards.iter().any(|c| &c.id == end) {
                    return fail(format!(
                        "la flèche « {} » désigne la carte « {end} », qui n'existe pas",
                        arrow.id
                    ));
                }
            }
        }
        Ok(())
    }

    /// La carte d'identifiant `id`.
    #[must_use]
    pub fn card(&self, id: &str) -> Option<&CanvasCard> {
        self.cards.iter().find(|card| card.id == id)
    }

    /// Le même canvas, où chaque flèche sans côté reçoit ceux que déduit [`deduce_sides`].
    #[must_use]
    pub fn with_deduced_sides(mut self) -> Self {
        let rects: Vec<(String, Rect)> = self
            .cards
            .iter()
            .map(|c| (c.id.clone(), Rect::of(c)))
            .collect();
        let find = |id: &str| rects.iter().find(|(i, _)| i == id).map(|(_, r)| *r);
        for arrow in &mut self.arrows {
            if let (Some(from), Some(to)) = (find(&arrow.from), find(&arrow.to)) {
                let (from_side, to_side) = deduce_sides(from, to);
                arrow.from_side.get_or_insert(from_side);
                arrow.to_side.get_or_insert(to_side);
            }
        }
        self
    }
}

/// Ce que la recherche lit d'un canvas, un élément par ligne : le texte de ses cartes texte, les noms
/// de ses groupes, les étiquettes de ses flèches, le nom des fichiers et les adresses de ses
/// cartes. Rien pour un fichier qui n'est pas un canvas valide.
#[must_use]
pub fn searchable_text(content: &str) -> String {
    let Ok(canvas) = Canvas::parse(content) else {
        return String::new();
    };
    let mut lines: Vec<&str> = Vec::new();
    for card in &canvas.cards {
        match &card.kind {
            CardKind::Text { text } => lines.push(text),
            CardKind::File { file, .. } => lines.push(file),
            CardKind::Link { url } => lines.push(url),
            CardKind::Group { label, .. } => lines.extend(label.as_deref()),
        }
    }
    lines.extend(canvas.arrows.iter().filter_map(|a| a.label.as_deref()));
    lines.join("\n")
}

/// Ce que l'index de mots garde d'un canvas : son titre (le nom du fichier) puis [`searchable_text`].
#[must_use]
pub fn indexed_text(title: &str, content: &str) -> String {
    format!("{title}\n{}", searchable_text(content))
}

fn object(item: &Json, what: &str) -> Result<Vec<(String, Json)>, CanvasError> {
    match item {
        Json::Object(fields) => Ok(fields.clone()),
        _ => fail(format!("{what} n'est pas un objet")),
    }
}

fn take(fields: &mut Vec<(String, Json)>, key: &str) -> Option<Json> {
    let at = fields.iter().position(|(k, _)| k == key)?;
    Some(fields.remove(at).1)
}

fn text_of(
    fields: &mut Vec<(String, Json)>,
    key: &str,
    owner: &str,
) -> Result<Option<String>, CanvasError> {
    match take(fields, key) {
        None => Ok(None),
        Some(Json::String(text)) => Ok(Some(text)),
        Some(_) => fail(format!("{owner} : « {key} » n'est pas un texte")),
    }
}

fn required(
    fields: &mut Vec<(String, Json)>,
    key: &str,
    owner: &str,
) -> Result<String, CanvasError> {
    text_of(fields, key, owner)?.map_or_else(|| fail(format!("{owner} n'a pas de « {key} »")), Ok)
}

fn whole(fields: &mut Vec<(String, Json)>, key: &str, owner: &str) -> Result<i64, CanvasError> {
    match take(fields, key) {
        Some(Json::Number(text)) => text
            .parse::<i64>()
            .or_else(|_| fail(format!("{owner} : « {key} » n'est pas un entier"))),
        Some(_) => fail(format!("{owner} : « {key} » n'est pas un nombre")),
        None => fail(format!("{owner} n'a pas de « {key} »")),
    }
}

fn card(item: &Json) -> Result<CanvasCard, CanvasError> {
    let mut f = object(item, "une carte")?;
    let id = required(&mut f, "id", "une carte")?;
    let owner = format!("la carte « {id} »");
    let kind = match required(&mut f, "type", &owner)?.as_str() {
        "text" => CardKind::Text {
            text: required(&mut f, "text", &owner)?,
        },
        "file" => CardKind::File {
            file: required(&mut f, "file", &owner)?,
            subpath: subpath(&mut f, &owner)?,
        },
        "link" => CardKind::Link {
            url: required(&mut f, "url", &owner)?,
        },
        "group" => CardKind::Group {
            label: text_of(&mut f, "label", &owner)?,
            background: text_of(&mut f, "background", &owner)?,
            background_style: match text_of(&mut f, "backgroundStyle", &owner)? {
                None => None,
                Some(name) => Some(BackgroundStyle::from_name(&name).map_or_else(
                    || fail(format!("{owner} : style d'arrière-plan « {name} » inconnu")),
                    Ok,
                )?),
            },
        },
        other => return fail(format!("{owner} : type « {other} » inconnu")),
    };
    Ok(CanvasCard {
        x: whole(&mut f, "x", &owner)?,
        y: whole(&mut f, "y", &owner)?,
        width: whole(&mut f, "width", &owner)?,
        height: whole(&mut f, "height", &owner)?,
        color: text_of(&mut f, "color", &owner)?,
        extra: f,
        id,
        kind,
    })
}

fn subpath(f: &mut Vec<(String, Json)>, owner: &str) -> Result<Option<String>, CanvasError> {
    let found = text_of(f, "subpath", owner)?;
    if found.as_deref().is_some_and(|s| !s.starts_with('#')) {
        return fail(format!("{owner} : « subpath » ne commence pas par #"));
    }
    Ok(found)
}

fn side(f: &mut Vec<(String, Json)>, key: &str, owner: &str) -> Result<Option<Side>, CanvasError> {
    match text_of(f, key, owner)? {
        None => Ok(None),
        Some(name) => Side::from_name(&name)
            .map(Some)
            .map_or_else(|| fail(format!("{owner} : côté « {name} » inconnu")), Ok),
    }
}

fn end(
    f: &mut Vec<(String, Json)>,
    key: &str,
    default: ArrowEnd,
    owner: &str,
) -> Result<ArrowEnd, CanvasError> {
    match text_of(f, key, owner)? {
        None => Ok(default),
        Some(name) => ArrowEnd::from_name(&name).map_or_else(
            || fail(format!("{owner} : extrémité « {name} » inconnue")),
            Ok,
        ),
    }
}

fn arrow(item: &Json) -> Result<CanvasArrow, CanvasError> {
    let mut f = object(item, "une flèche")?;
    let id = required(&mut f, "id", "une flèche")?;
    let owner = format!("la flèche « {id} »");
    Ok(CanvasArrow {
        from: required(&mut f, "fromNode", &owner)?,
        from_side: side(&mut f, "fromSide", &owner)?,
        from_end: end(&mut f, "fromEnd", ArrowEnd::None, &owner)?,
        to: required(&mut f, "toNode", &owner)?,
        to_side: side(&mut f, "toSide", &owner)?,
        to_end: end(&mut f, "toEnd", ArrowEnd::Arrow, &owner)?,
        color: text_of(&mut f, "color", &owner)?,
        label: text_of(&mut f, "label", &owner)?,
        extra: f,
        id,
    })
}

#[cfg(test)]
#[path = "canvas_tests.rs"]
mod tests;
