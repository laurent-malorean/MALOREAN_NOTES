//! Le vecteur de sens : ce que le modèle de sens donne à un texte, ramené à une longueur de 1.

use std::error::Error;
use std::fmt;

/// Pourquoi une suite de nombres ne peut pas être un vecteur de sens.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum InvalidMeaningVector {
    /// Aucune valeur.
    Empty,
    /// Une valeur n'est pas un nombre fini.
    NotFinite,
    /// Toutes les valeurs sont nulles : il n'y a pas de direction.
    ZeroNorm,
}

impl fmt::Display for InvalidMeaningVector {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(match self {
            Self::Empty => "vecteur de sens vide",
            Self::NotFinite => "vecteur de sens avec une valeur qui n'est pas un nombre fini",
            Self::ZeroNorm => "vecteur de sens de norme nulle",
        })
    }
}

impl Error for InvalidMeaningVector {}

/// Un vecteur de sens, de longueur 1.
#[derive(Debug, Clone, PartialEq)]
pub struct MeaningVector(Vec<f32>);

impl MeaningVector {
    /// Le vecteur de sens de direction `values`, ramené à une longueur de 1.
    ///
    /// # Errors
    ///
    /// [`InvalidMeaningVector`] si `values` est vide, contient une valeur non finie, ou ne
    /// contient que des zéros.
    pub fn new(values: Vec<f32>) -> Result<Self, InvalidMeaningVector> {
        if values.is_empty() {
            return Err(InvalidMeaningVector::Empty);
        }
        if values.iter().any(|value| !value.is_finite()) {
            return Err(InvalidMeaningVector::NotFinite);
        }
        let norm = values
            .iter()
            .map(|value| f64::from(*value).powi(2))
            .sum::<f64>()
            .sqrt();
        if norm == 0.0 {
            return Err(InvalidMeaningVector::ZeroNorm);
        }
        #[expect(
            clippy::cast_possible_truncation,
            reason = "valeur entre -1 et 1 : f32 suffit"
        )]
        let normalized = values
            .iter()
            .map(|value| (f64::from(*value) / norm) as f32)
            .collect();
        Ok(Self(normalized))
    }

    /// Les valeurs, dans l'ordre.
    #[must_use]
    pub fn values(&self) -> &[f32] {
        &self.0
    }

    /// La ressemblance avec `other` : le produit scalaire, de -1 à 1 (1 pour le même sens).
    /// 0 si les dimensions diffèrent : deux vecteurs de modèles différents ne se comparent pas.
    #[must_use]
    pub fn similarity(&self, other: &Self) -> f32 {
        if self.0.len() != other.0.len() {
            return 0.0;
        }
        dot_product(&self.0, &other.0)
    }
}

/// Le produit scalaire de deux suites de même longueur (la plus courte décide sinon) : les
/// produits sont additionnés dans l'ordre, pour que chaque calcul donne le même résultat.
#[must_use]
pub fn dot_product(a: &[f32], b: &[f32]) -> f32 {
    a.iter().zip(b).map(|(a, b)| a * b).sum()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_dot_product_adds_the_products_in_order() {
        assert_eq!(dot_product(&[1.0, 2.0, 3.0], &[4.0, 5.0, 6.0]), 32.0);
        assert_eq!(dot_product(&[], &[]), 0.0);
        assert_eq!(dot_product(&[2.0], &[-3.0]), -6.0);
    }

    fn vector(values: &[f32]) -> MeaningVector {
        MeaningVector::new(values.to_vec()).unwrap()
    }

    #[test]
    fn a_vector_is_scaled_to_length_one() {
        let v = vector(&[3.0, 4.0]);
        assert_eq!(v.values(), [0.6, 0.8]);
    }

    #[test]
    fn a_negative_value_keeps_its_sign() {
        assert_eq!(vector(&[0.0, -2.0]).values(), [0.0, -1.0]);
    }

    #[test]
    fn huge_and_tiny_values_are_still_scaled() {
        assert_eq!(vector(&[1e30, 0.0]).values(), [1.0, 0.0]);
        assert_eq!(vector(&[0.0, 1e-30]).values(), [0.0, 1.0]);
    }

    #[test]
    fn an_empty_vector_is_refused() {
        assert_eq!(MeaningVector::new(vec![]), Err(InvalidMeaningVector::Empty));
    }

    #[test]
    fn a_value_that_is_not_finite_is_refused() {
        for bad in [f32::NAN, f32::INFINITY, f32::NEG_INFINITY] {
            assert_eq!(
                MeaningVector::new(vec![1.0, bad]),
                Err(InvalidMeaningVector::NotFinite)
            );
        }
    }

    #[test]
    fn a_vector_of_zeros_is_refused() {
        assert_eq!(
            MeaningVector::new(vec![0.0, 0.0]),
            Err(InvalidMeaningVector::ZeroNorm)
        );
    }

    #[test]
    fn the_refusals_are_told_in_words() {
        assert_eq!(
            InvalidMeaningVector::Empty.to_string(),
            "vecteur de sens vide"
        );
        assert_eq!(
            InvalidMeaningVector::NotFinite.to_string(),
            "vecteur de sens avec une valeur qui n'est pas un nombre fini"
        );
        assert_eq!(
            InvalidMeaningVector::ZeroNorm.to_string(),
            "vecteur de sens de norme nulle"
        );
    }

    #[test]
    fn similarity_is_one_for_the_same_direction_zero_for_orthogonal_minus_one_for_opposite() {
        let a = vector(&[1.0, 0.0]);
        assert!((a.similarity(&vector(&[5.0, 0.0])) - 1.0).abs() < 1e-6);
        assert!(a.similarity(&vector(&[0.0, 2.0])).abs() < 1e-6);
        assert!((a.similarity(&vector(&[-3.0, 0.0])) + 1.0).abs() < 1e-6);
    }

    #[test]
    fn similarity_adds_the_products_of_every_dimension() {
        let a = vector(&[1.0, 1.0, 0.0]);
        let b = vector(&[0.0, 1.0, 1.0]);
        assert!((a.similarity(&b) - 0.5).abs() < 1e-6);
    }

    #[test]
    fn vectors_of_different_dimensions_do_not_resemble_each_other() {
        assert_eq!(
            vector(&[1.0, 0.0]).similarity(&vector(&[1.0, 0.0, 0.0])),
            0.0
        );
        assert_eq!(vector(&[1.0]).similarity(&vector(&[1.0, 0.0])), 0.0);
    }
}
