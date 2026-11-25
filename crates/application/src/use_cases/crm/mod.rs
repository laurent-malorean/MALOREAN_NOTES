//! Le CRM (spécification `doc/specs/crm.md`, fiche 0058) : le créer, le lire, et changer ses fiches
//! geste par geste. Chaque cas d'usage lit le fichier le plus récent, décide avec les règles pures du
//! domaine, puis écrit ; un geste qui change plusieurs fichiers les écrit tous ensemble ou aucun.

mod gesture;

pub use gesture::{ApplyGesture, RecoverGestures};
