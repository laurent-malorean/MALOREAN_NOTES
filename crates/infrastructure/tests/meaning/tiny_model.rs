//! Outils des tests du moteur de sens : un TOUT PETIT modèle fabriqué ici (réglages minuscules,
//! découpeur de texte construit par code, poids tirés au hasard d'une graine fixée), pour jouer
//! le vrai calcul sans télécharger de modèle.

#![expect(
    clippy::unwrap_used,
    reason = "code de test : un échec doit arrêter le test"
)]

use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::sync::{Arc, Mutex};

use candle_core::{DType, Device, Shape, Tensor};
use candle_nn::{Init, VarBuilder, var_builder::SimpleBackend};
use candle_transformers::models::bert::{self, BertModel};
use candle_transformers::models::xlm_roberta::{self, XLMRobertaModel};
use domain::{Architecture, MeaningModel, ModelFile};
use serde_json::json;
use tokenizers::models::wordlevel::WordLevel;
use tokenizers::normalizers::Lowercase;
use tokenizers::pre_tokenizers::split::{Split, SplitPattern};
use tokenizers::processors::template::TemplateProcessing;
use tokenizers::{SplitDelimiterBehavior, Tokenizer};

/// Les réglages du tout petit modèle : les dimensions du vrai (384 ou 1 024), mais une seule
/// couche, très peu de mots (un par caractère) et une couche intermédiaire minuscule.
fn config(model: MeaningModel) -> serde_json::Value {
    let (hidden, heads, positions, kinds, pad, kind) = match model.architecture() {
        Architecture::Bert => (384, 6, 512, 2, 0, "bert"),
        Architecture::XlmRoberta => (1_024, 16, 514, 1, 1, "xlm-roberta"),
    };
    json!({
        "attention_probs_dropout_prob": 0.1,
        "hidden_act": "gelu",
        "hidden_dropout_prob": 0.1,
        "hidden_size": hidden,
        "initializer_range": 0.02,
        "intermediate_size": 64,
        "layer_norm_eps": 1e-5,
        "max_position_embeddings": positions,
        "model_type": kind,
        "num_attention_heads": heads,
        "num_hidden_layers": 1,
        "pad_token_id": pad,
        "position_embedding_type": "absolute",
        "type_vocab_size": kinds,
        "vocab_size": VOCAB_SIZE,
    })
}

/// Les jetons spéciaux, dans l'ordre des vrais modèles E5 (`<s>` 0, `<pad>` 1, `</s>` 2).
const SPECIALS: [&str; 4] = ["<s>", "<pad>", "</s>", "<unk>"];

/// Les caractères connus : l'espace et les signes, les chiffres, les lettres minuscules.
fn characters() -> Vec<char> {
    (32_u8..127)
        .map(char::from)
        .filter(|c| !c.is_ascii_uppercase())
        .collect()
}

const VOCAB_SIZE: usize = 4 + 69;

/// Écrit `tokenizer.json` : un jeton par caractère, majuscules ramenées en minuscules, `<s>` au
/// début et `</s>` à la fin, comme E5.
fn write_tokenizer(path: &Path) {
    let vocab: Vec<(String, u32)> = SPECIALS
        .iter()
        .map(|token| (*token).to_owned())
        .chain(characters().into_iter().map(String::from))
        .zip(0..)
        .collect();
    assert_eq!(vocab.len(), VOCAB_SIZE);
    let model = WordLevel::builder()
        .vocab(vocab.into_iter().collect())
        .unk_token("<unk>".to_owned())
        .build()
        .unwrap();
    let mut tokenizer = Tokenizer::new(model);
    tokenizer.with_normalizer(Some(Lowercase));
    tokenizer.with_pre_tokenizer(Some(
        Split::new(
            SplitPattern::Regex(".".to_owned()),
            SplitDelimiterBehavior::Isolated,
            false,
        )
        .unwrap(),
    ));
    tokenizer.with_post_processor(Some(
        TemplateProcessing::builder()
            .try_single("<s> $A </s>")
            .unwrap()
            .special_tokens(vec![("<s>", 0), ("</s>", 2)])
            .build()
            .unwrap(),
    ));
    tokenizer.save(path, false).unwrap();
}

/// Un « modèle » dont chaque poids est tiré au hasard, avec les mêmes graines à chaque fois ;
/// il garde ce qu'on lui a demandé pour l'écrire en `safetensors`.
struct RandomWeights {
    seed: u64,
    asked: Arc<Mutex<HashMap<String, Tensor>>>,
}

fn next(state: &mut u64) -> f32 {
    // xorshift64 : de quoi tirer des nombres sans crate de plus.
    *state ^= *state << 13;
    *state ^= *state >> 7;
    *state ^= *state << 17;
    #[expect(
        clippy::cast_precision_loss,
        reason = "tirage grossier : 24 bits suffisent"
    )]
    let unit = (*state >> 40) as f32 / 16_777_216.0;
    unit - 0.5
}

impl SimpleBackend for RandomWeights {
    fn get(
        &self,
        shape: Shape,
        name: &str,
        hint: Init,
        dtype: DType,
        device: &Device,
    ) -> candle_core::Result<Tensor> {
        let count = shape.elem_count();
        let values: Vec<f32> = match hint {
            Init::Const(value) => {
                #[expect(clippy::cast_possible_truncation, reason = "constante simple")]
                let value = value as f32;
                vec![value; count]
            }
            _ => {
                let mut state = name.bytes().fold(self.seed, |state, byte| {
                    state.wrapping_mul(31).wrapping_add(u64::from(byte))
                }) | 1;
                (0..count).map(|_| next(&mut state) * 0.6).collect()
            }
        };
        let tensor = Tensor::from_vec(values, shape, device)?.to_dtype(dtype)?;
        self.asked
            .lock()
            .unwrap()
            .insert(name.to_owned(), tensor.clone());
        Ok(tensor)
    }

    fn get_unchecked(&self, name: &str, _: DType, _: &Device) -> candle_core::Result<Tensor> {
        Err(candle_core::Error::Msg(format!("{name} : non prévu")))
    }

    fn contains_tensor(&self, name: &str) -> bool {
        self.asked.lock().unwrap().contains_key(name)
    }
}

/// Écrit `model.safetensors` : les poids que demande le vrai code de chargement, tirés au hasard.
fn write_weights(model: MeaningModel, config: &serde_json::Value, seed: u64, path: &Path) {
    let asked = Arc::new(Mutex::new(HashMap::new()));
    let backend = RandomWeights {
        seed,
        asked: Arc::clone(&asked),
    };
    let builder = VarBuilder::from_backend(Box::new(backend), DType::F32, Device::Cpu);
    match model.architecture() {
        Architecture::Bert => {
            let config: bert::Config = serde_json::from_value(config.clone()).unwrap();
            BertModel::load(builder, &config).unwrap();
        }
        Architecture::XlmRoberta => {
            let config: xlm_roberta::Config = serde_json::from_value(config.clone()).unwrap();
            XLMRobertaModel::new(&config, builder).unwrap();
        }
    }
    let tensors = asked.lock().unwrap().clone();
    candle_core::safetensors::save(&tensors, path).unwrap();
}

/// Fabrique dans `folder` les trois fichiers d'un tout petit `model`, de poids tirés de `seed`.
pub(crate) fn write_tiny_model(model: MeaningModel, folder: &Path, seed: u64) {
    fs::create_dir_all(folder).unwrap();
    let config = config(model);
    fs::write(
        folder.join(ModelFile::Config.name()),
        serde_json::to_vec(&config).unwrap(),
    )
    .unwrap();
    write_tokenizer(&folder.join(ModelFile::Tokenizer.name()));
    write_weights(
        model,
        &config,
        seed,
        &folder.join(ModelFile::Weights.name()),
    );
}
