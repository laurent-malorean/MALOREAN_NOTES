//! Les gestes que l'interface fait sur un canvas, appliqués à un [`Canvas`] (fiche 0079) : ajouter,
//! changer, déplacer, redimensionner et retirer une carte, ajouter, changer et retirer une flèche,
//! ajouter et changer un groupe. L'interface les fabrique en TypeScript (`ui/src/state/canvas-model.ts`) ;
//! les mêmes règles sont écrites ici pour les outils des IA, et un test compare leurs constantes.
//! Chaque geste vérifie tout avant de changer quoi que ce soit : un geste refusé ne change rien.

use std::collections::HashSet;

use crate::canvas::{Canvas, CanvasArrow, CanvasCard, CardKind, Rect};
pub use crate::canvas_edit_input::*;
use crate::canvas_edit_input::{address, file_path, listed, position, random, refuse, size_of};

impl Canvas {
    /// Un identifiant neuf : 16 chiffres hexadécimaux minuscules, différent de tous ceux du canvas.
    #[must_use]
    pub fn fresh_id(&self) -> String {
        self.fresh_id_with(random)
    }

    /// Comme [`Canvas::fresh_id`], avec un tirage donné : le premier nombre qui ne donne pas un
    /// identifiant déjà pris.
    #[must_use]
    pub fn fresh_id_with(&self, mut draw: impl FnMut() -> u64) -> String {
        let taken: HashSet<&str> = self
            .cards
            .iter()
            .map(|card| card.id.as_str())
            .chain(self.arrows.iter().map(|arrow| arrow.id.as_str()))
            .collect();
        loop {
            let id = format!("{:016x}", draw());
            if !taken.contains(id.as_str()) {
                return id;
            }
        }
    }

    fn card_at(&self, id: &str) -> Result<usize, CanvasEditError> {
        self.cards.iter().position(|card| card.id == id).map_or_else(
            || {
                refuse(format!(
                    "la carte « {id} » n'existe pas dans ce canvas (cartes : {}) : lisez-le avec \
                     read_canvas",
                    listed(self.cards.iter().map(|card| card.id.clone()))
                ))
            },
            Ok,
        )
    }

    fn arrow_at(&self, id: &str) -> Result<usize, CanvasEditError> {
        self.arrows
            .iter()
            .position(|arrow| arrow.id == id)
            .map_or_else(
                || {
                    refuse(format!(
                        "la flèche « {id} » n'existe pas dans ce canvas (flèches : {}) : lisez-le \
                     avec read_canvas",
                        listed(self.arrows.iter().map(|arrow| arrow.id.clone()))
                    ))
                },
                Ok,
            )
    }

    fn not_a_group(&self, at: usize, tool: &str) -> Result<(), CanvasEditError> {
        let card = &self.cards[at];
        if matches!(card.kind, CardKind::Group { .. }) {
            return refuse(format!(
                "la carte « {} » est un groupe : {tool} ne s'applique pas à un groupe",
                card.id
            ));
        }
        Ok(())
    }

    /// Ajoute la carte, au premier plan ; rend son identifiant.
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] si la carte est un groupe, si une position ou une taille sort des
    /// limites, si l'adresse n'est pas une adresse web ou si le chemin du fichier est vide.
    pub fn add_card(&mut self, new: NewCard) -> Result<String, CanvasEditError> {
        position(new.x, new.y)?;
        let (kind, default) = match new.kind {
            CardKind::Text { text } => (CardKind::Text { text }, TEXT_SIZE),
            CardKind::File { file, .. } => (
                CardKind::File {
                    file: file_path(&file)?,
                    subpath: None,
                },
                FILE_SIZE,
            ),
            CardKind::Link { url } => (
                CardKind::Link {
                    url: address(&url)?,
                },
                FILE_SIZE,
            ),
            CardKind::Group { .. } => {
                return refuse("un groupe se crée avec add_canvas_group, pas comme une carte");
            }
        };
        let size = size_of(new.width, new.height, default)?;
        let id = self.fresh_id();
        self.cards.push(CanvasCard {
            id: id.clone(),
            kind,
            x: new.x,
            y: new.y,
            width: size.width,
            height: size.height,
            color: new.color.and_then(ColorChoice::written),
            extra: Vec::new(),
        });
        Ok(id)
    }

    /// Change la carte `id` : son texte, son adresse, son fichier (l'ancre est retirée) ou sa
    /// couleur.
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] si la carte n'existe pas, est un groupe, si rien n'est donné, si un champ
    /// ne va pas avec le type de la carte ou si l'adresse ou le fichier est refusé.
    pub fn change_card(&mut self, id: &str, change: CardChange) -> Result<(), CanvasEditError> {
        let at = self.card_at(id)?;
        self.not_a_group(at, "change_canvas_card (utilisez change_canvas_group)")?;
        if change == CardChange::default() {
            return refuse(
                "rien à changer : donnez au moins l'un de « text », « url », « file » ou « color »",
            );
        }
        let card = &self.cards[at];
        let (kind_name, field) = match &card.kind {
            CardKind::Text { .. } => ("texte", "text"),
            CardKind::File { .. } => ("fichier", "file"),
            CardKind::Link { .. } => ("page web", "url"),
            CardKind::Group { .. } => unreachable!("un groupe est refusé plus haut"),
        };
        for (given, name, wanted) in [
            (change.text.is_some(), "text", "une carte texte"),
            (change.url.is_some(), "url", "une carte de page web"),
            (change.file.is_some(), "file", "une carte de fichier"),
        ] {
            if given && name != field {
                return refuse(format!(
                    "la carte « {id} » est une carte {kind_name} : « {name} » ne s'applique qu'à \
                     {wanted}"
                ));
            }
        }
        let new_kind = match &card.kind {
            CardKind::Text { .. } => change.text.map(|text| CardKind::Text { text }),
            CardKind::Link { .. } => change
                .url
                .map(|url| address(&url).map(|url| CardKind::Link { url }))
                .transpose()?,
            CardKind::File { .. } => change
                .file
                .map(|file| {
                    file_path(&file).map(|file| CardKind::File {
                        file,
                        subpath: None,
                    })
                })
                .transpose()?,
            CardKind::Group { .. } => None,
        };
        let card = &mut self.cards[at];
        if let Some(kind) = new_kind {
            card.kind = kind;
        }
        if let Some(color) = change.color {
            card.color = color.written();
        }
        Ok(())
    }

    /// Déplace la carte `id` au coin `x`, `y` ; les cartes d'un groupe suivent leur groupe. Rend
    /// les identifiants des cartes déplacées, la carte d'abord.
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] si la carte n'existe pas ou si la position sort des limites.
    pub fn move_card(&mut self, id: &str, x: i64, y: i64) -> Result<Vec<String>, CanvasEditError> {
        let at = self.card_at(id)?;
        position(x, y)?;
        let (dx, dy) = (x - self.cards[at].x, y - self.cards[at].y);
        let mut moved = vec![id.to_owned()];
        moved.extend(self.members_of(id).iter().map(|member| member.id.clone()));
        for card in &mut self.cards {
            if moved.contains(&card.id) {
                card.x += dx;
                card.y += dy;
            }
        }
        Ok(moved)
    }

    /// Donne à la carte `id` cette largeur et cette hauteur ; son coin haut gauche ne bouge pas.
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] si la carte n'existe pas ou si une taille sort des limites.
    pub fn resize_card(
        &mut self,
        id: &str,
        width: i64,
        height: i64,
    ) -> Result<(), CanvasEditError> {
        let at = self.card_at(id)?;
        let size = size_of(Some(width), Some(height), TEXT_SIZE)?;
        self.cards[at].width = size.width;
        self.cards[at].height = size.height;
        Ok(())
    }

    /// Retire la carte `id` et les flèches qui y touchent ; rend l'identifiant de ces flèches.
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] si la carte n'existe pas.
    pub fn remove_card(&mut self, id: &str) -> Result<Vec<String>, CanvasEditError> {
        let at = self.card_at(id)?;
        self.cards.remove(at);
        let (gone, kept): (Vec<_>, Vec<_>) = std::mem::take(&mut self.arrows)
            .into_iter()
            .partition(|arrow| arrow.from == id || arrow.to == id);
        self.arrows = kept;
        Ok(gone.into_iter().map(|arrow| arrow.id).collect())
    }

    fn rect_of(&self, id: &str) -> Result<Rect, CanvasEditError> {
        Ok(Rect::of(&self.cards[self.card_at(id)?]))
    }

    /// Ajoute la flèche ; rend son identifiant.
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] si une carte n'existe pas ou si les deux cartes sont la même.
    pub fn add_arrow(&mut self, new: NewArrow) -> Result<String, CanvasEditError> {
        let (from, to) = (self.rect_of(&new.from)?, self.rect_of(&new.to)?);
        if new.from == new.to {
            return refuse("une flèche relie deux cartes différentes");
        }
        let (deduced_from, deduced_to) = crate::canvas::deduce_sides(from, to);
        let (from_end, to_end) = new.sense.unwrap_or(ArrowSense::Single).ends();
        let id = self.fresh_id();
        self.arrows.push(CanvasArrow {
            id: id.clone(),
            from: new.from,
            from_side: Some(new.from_side.unwrap_or(deduced_from)),
            from_end,
            to: new.to,
            to_side: Some(new.to_side.unwrap_or(deduced_to)),
            to_end,
            color: new.color.and_then(ColorChoice::written),
            label: new.label.filter(|label| !label.is_empty()),
            extra: Vec::new(),
        });
        Ok(id)
    }

    /// Change la flèche `id` : ses cartes (reconnectées, le côté de l'extrémité déplacée étant
    /// déduit des positions s'il n'est pas donné), ses côtés, son sens, son étiquette ou sa
    /// couleur.
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] si la flèche ou une carte n'existe pas, si rien n'est donné ou si la
    /// flèche relierait une carte à elle-même.
    pub fn change_arrow(&mut self, id: &str, change: ArrowChange) -> Result<(), CanvasEditError> {
        let at = self.arrow_at(id)?;
        if change == ArrowChange::default() {
            return refuse(
                "rien à changer : donnez au moins l'un de « sense », « label », « color », « from », \
                 « from_side », « to » ou « to_side »",
            );
        }
        let arrow = &self.arrows[at];
        let from = change.from.clone().unwrap_or_else(|| arrow.from.clone());
        let to = change.to.clone().unwrap_or_else(|| arrow.to.clone());
        let (from_rect, to_rect) = (self.rect_of(&from)?, self.rect_of(&to)?);
        if from == to {
            return refuse("une flèche relie deux cartes différentes");
        }
        let (deduced_from, deduced_to) = crate::canvas::deduce_sides(from_rect, to_rect);
        let from_side = change.from_side.or_else(|| {
            if change.from.is_some() {
                Some(deduced_from)
            } else {
                arrow.from_side
            }
        });
        let to_side = change.to_side.or_else(|| {
            if change.to.is_some() {
                Some(deduced_to)
            } else {
                arrow.to_side
            }
        });
        let arrow = &mut self.arrows[at];
        (arrow.from, arrow.to, arrow.from_side, arrow.to_side) = (from, to, from_side, to_side);
        if let Some(sense) = change.sense {
            (arrow.from_end, arrow.to_end) = sense.ends();
        }
        if let Some(label) = change.label {
            arrow.label = (!label.is_empty()).then_some(label);
        }
        if let Some(color) = change.color {
            arrow.color = color.written();
        }
        Ok(())
    }

    /// Retire la flèche `id`.
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] si la flèche n'existe pas.
    pub fn remove_arrow(&mut self, id: &str) -> Result<(), CanvasEditError> {
        let at = self.arrow_at(id)?;
        self.arrows.remove(at);
        Ok(())
    }

    /// Ajoute le groupe, sous les autres cartes ; rend son identifiant.
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] si une carte à entourer n'existe pas ou si la liste est vide, si une
    /// position ou une taille sort des limites.
    pub fn add_group(&mut self, new: NewGroup) -> Result<String, CanvasEditError> {
        let (x, y, size) = match new.place {
            GroupPlace::At {
                x,
                y,
                width,
                height,
            } => {
                position(x, y)?;
                (x, y, size_of(width, height, GROUP_SIZE)?)
            }
            GroupPlace::Around(ids) => {
                let rects = ids
                    .iter()
                    .map(|id| self.rect_of(id))
                    .collect::<Result<Vec<_>, _>>()?;
                let Some(frame) = bounds(&rects) else {
                    return refuse("« cards » est vide : donnez les cartes à entourer");
                };
                (
                    frame.x - GROUP_MARGIN,
                    frame.y - GROUP_MARGIN,
                    Size {
                        width: frame.width + 2 * GROUP_MARGIN,
                        height: frame.height + 2 * GROUP_MARGIN,
                    },
                )
            }
        };
        let id = self.fresh_id();
        self.cards.insert(
            0,
            CanvasCard {
                id: id.clone(),
                kind: CardKind::Group {
                    label: new.label.filter(|label| !label.is_empty()),
                    background: None,
                    background_style: None,
                },
                x,
                y,
                width: size.width,
                height: size.height,
                color: new.color.and_then(ColorChoice::written),
                extra: Vec::new(),
            },
        );
        Ok(id)
    }

    /// Change le nom (vide : le retire) et la couleur du groupe `id`.
    ///
    /// # Errors
    ///
    /// [`CanvasEditError`] si la carte n'existe pas, n'est pas un groupe, ou si rien n'est donné.
    pub fn change_group(
        &mut self,
        id: &str,
        label: Option<String>,
        color: Option<ColorChoice>,
    ) -> Result<(), CanvasEditError> {
        let at = self.card_at(id)?;
        if !matches!(self.cards[at].kind, CardKind::Group { .. }) {
            return refuse(format!(
                "la carte « {id} » n'est pas un groupe : change_canvas_group ne change que les \
                 groupes (utilisez change_canvas_card)"
            ));
        }
        if label.is_none() && color.is_none() {
            return refuse("rien à changer : donnez au moins l'un de « label » ou « color »");
        }
        let card = &mut self.cards[at];
        if let (Some(label), CardKind::Group { label: current, .. }) = (label, &mut card.kind) {
            *current = (!label.is_empty()).then_some(label);
        }
        if let Some(color) = color {
            card.color = color.written();
        }
        Ok(())
    }
}

/// Le plus petit rectangle qui contient ces rectangles ; rien s'il n'y en a pas.
fn bounds(rects: &[Rect]) -> Option<Rect> {
    let x = rects.iter().map(|r| r.x).min()?;
    let y = rects.iter().map(|r| r.y).min()?;
    let right = rects.iter().map(|r| r.x + r.width).max()?;
    let bottom = rects.iter().map(|r| r.y + r.height).max()?;
    Some(Rect {
        x,
        y,
        width: right - x,
        height: bottom - y,
    })
}

#[cfg(test)]
#[path = "canvas_edit_tests.rs"]
mod tests;

#[cfg(test)]
#[path = "canvas_edit_arrows_tests.rs"]
mod arrows_tests;
