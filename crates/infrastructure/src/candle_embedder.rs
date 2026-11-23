//! Le moteur de sens : un modèle E5 exécuté par `candle`, sur le processeur du Mac
//! (fiche 0043 : plus rapide que Metal pour le petit modèle). Les poids se lisent en mémoire (`from_buffered_safetensors`,
//! sans `unsafe`). Les préfixes de E5 (« query : », « passage : ») sont posés ici, jamais par
//! l'appelant.

use std::fmt;
use std::fs;
use std::path::Path;

use application::{Embedder, MeaningError};
use candle_core::{DType, Device, Tensor};
use candle_nn::VarBuilder;
use candle_transformers::models::bert::{self, BertModel};
use candle_transformers::models::xlm_roberta::{self, XLMRobertaModel};
use domain::{Architecture, MeaningModel, MeaningVector, ModelFile};
use tokenizers::{PaddingParams, Tokenizer, TruncationParams};

/// Le nombre de segments calculés ensemble : un lot plus grand ne va pas plus vite et gonfle la mémoire.
const BATCH_SIZE: usize = 16;

/// Ce que E5 demande devant une question.
const QUERY_PREFIX: &str = "query: ";

/// Ce que E5 demande devant un segment.
const SEGMENT_PREFIX: &str = "passage: ";

/// Le réseau de neurones chargé, selon la famille du modèle.
enum Network {
    Bert(BertModel),
    XlmRoberta(XLMRobertaModel),
}

/// Un modèle E5 chargé en mémoire.
pub struct CandleEmbedder {
    model: MeaningModel,
    network: Network,
    tokenizer: Tokenizer,
    device: Device,
}

impl fmt::Debug for CandleEmbedder {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("CandleEmbedder")
            .field("model", &self.model.name())
            .finish_non_exhaustive()
    }
}

fn failed(error: impl fmt::Display) -> MeaningError {
    MeaningError::ComputationFailed(error.to_string())
}

fn read(folder: &Path, file: ModelFile) -> Result<Vec<u8>, MeaningError> {
    fs::read(folder.join(file.name()))
        .map_err(|e| failed(format!("lecture de {} : {e}", file.name())))
}

impl CandleEmbedder {
    /// Charge `model` depuis son dossier (`config.json`, `tokenizer.json`, `model.safetensors`),
    /// pour un calcul sur le processeur.
    ///
    /// # Errors
    ///
    /// [`MeaningError::ComputationFailed`] si un fichier manque ou est inutilisable.
    pub fn load(model: MeaningModel, folder: &Path) -> Result<Self, MeaningError> {
        let device = Device::Cpu;
        let config = read(folder, ModelFile::Config)?;
        let weights = read(folder, ModelFile::Weights)?;
        let tokenizer = Self::tokenizer(folder)?;
        let weights =
            VarBuilder::from_buffered_safetensors(weights, DType::F32, &device).map_err(failed)?;
        let network = match model.architecture() {
            Architecture::Bert => {
                let config: bert::Config = serde_json::from_slice(&config).map_err(failed)?;
                Network::Bert(BertModel::load(weights, &config).map_err(failed)?)
            }
            Architecture::XlmRoberta => {
                let config: xlm_roberta::Config =
                    serde_json::from_slice(&config).map_err(failed)?;
                Network::XlmRoberta(XLMRobertaModel::new(&config, weights).map_err(failed)?)
            }
        };
        Ok(Self {
            model,
            network,
            tokenizer,
            device,
        })
    }

    /// Le découpeur de texte : remplissage jusqu'au texte le plus long du lot et troncature à 512
    /// jetons, la limite par défaut de `tokenizers` et celle que les modèles E5 ont apprise. Le
    /// jeton de remplissage importe peu : le masque d'attention l'écarte du calcul et de la moyenne.
    fn tokenizer(folder: &Path) -> Result<Tokenizer, MeaningError> {
        let mut tokenizer =
            Tokenizer::from_file(folder.join(ModelFile::Tokenizer.name())).map_err(failed)?;
        tokenizer.with_padding(Some(PaddingParams::default()));
        tokenizer
            .with_truncation(Some(TruncationParams::default()))
            .map_err(failed)?;
        Ok(tokenizer)
    }

    /// Les vecteurs de `texts`, dans l'ordre reçu : calculés par lots de textes de longueurs
    /// voisines (moins de remplissage), puis remis à leur place.
    fn embed_all(&self, texts: &[String]) -> Result<Vec<MeaningVector>, MeaningError> {
        let mut order: Vec<usize> = (0..texts.len()).collect();
        order.sort_by_key(|&index| texts[index].len());
        let mut computed: Vec<(usize, MeaningVector)> = Vec::with_capacity(texts.len());
        for lot in order.chunks(BATCH_SIZE) {
            let batch: Vec<&str> = lot.iter().map(|&index| texts[index].as_str()).collect();
            let rows = self.embed_batch(batch).map_err(failed)?;
            for (&index, row) in lot.iter().zip(rows) {
                computed.push((index, MeaningVector::new(row).map_err(failed)?));
            }
        }
        computed.sort_by_key(|(index, _)| *index);
        Ok(computed.into_iter().map(|(_, vector)| vector).collect())
    }

    /// Le calcul d'un lot : moyenne des jetons (sans le remplissage), puis longueur 1.
    fn embed_batch(&self, batch: Vec<&str>) -> candle_core::Result<Vec<Vec<f32>>> {
        let encodings = self
            .tokenizer
            .encode_batch(batch, true)
            .map_err(candle_core::Error::msg)?;
        let ids: Vec<Vec<u32>> = encodings.iter().map(|e| e.get_ids().to_vec()).collect();
        let masks: Vec<Vec<u32>> = encodings
            .iter()
            .map(|e| e.get_attention_mask().to_vec())
            .collect();
        let ids = Tensor::new(ids, &self.device)?;
        let mask = Tensor::new(masks, &self.device)?;
        let kinds = ids.zeros_like()?;
        let tokens = match &self.network {
            Network::Bert(network) => network.forward(&ids, &kinds, Some(&mask))?,
            Network::XlmRoberta(network) => {
                network.forward(&ids, &mask, &kinds, None, None, None)?
            }
        };
        let mask = mask.to_dtype(DType::F32)?.unsqueeze(2)?;
        let sum = tokens.broadcast_mul(&mask)?.sum(1)?;
        let mean = sum.broadcast_div(&mask.sum(1)?)?;
        let norm = mean.sqr()?.sum_keepdim(1)?.sqrt()?;
        mean.broadcast_div(&norm)?.to_vec2::<f32>()
    }
}

impl Embedder for CandleEmbedder {
    fn model(&self) -> MeaningModel {
        self.model
    }

    fn embed_segments(&self, segments: &[String]) -> Result<Vec<MeaningVector>, MeaningError> {
        let texts: Vec<String> = segments
            .iter()
            .map(|segment| format!("{SEGMENT_PREFIX}{segment}"))
            .collect();
        self.embed_all(&texts)
    }

    fn embed_query(&self, query: &str) -> Result<MeaningVector, MeaningError> {
        let mut vectors = self.embed_all(&[format!("{QUERY_PREFIX}{query}")])?;
        vectors
            .pop()
            .ok_or_else(|| failed("aucun vecteur pour la question"))
    }
}
