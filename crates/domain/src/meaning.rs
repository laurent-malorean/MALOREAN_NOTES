//! Les modèles de sens de la recherche par le sens : lequel, quels fichiers télécharger, d'où,
//! et avec quelle somme de contrôle (fiche 0042).

/// Famille d'architecture d'un modèle de sens : elle dit à l'adaptateur quel calcul lancer.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Architecture {
    /// `model_type: bert`.
    Bert,
    /// `model_type: xlm-roberta` (les positions commencent après le remplissage).
    XlmRoberta,
}

/// Un fichier d'un modèle de sens à télécharger ; jamais un chemin libre.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ModelFile {
    /// Les réglages du modèle (`config.json`).
    Config,
    /// Le découpage du texte en jetons (`tokenizer.json`).
    Tokenizer,
    /// Les poids appris (`model.safetensors`).
    Weights,
}

impl ModelFile {
    /// Les fichiers d'un modèle, dans l'ordre de téléchargement.
    pub const ALL: [Self; 3] = [Self::Config, Self::Tokenizer, Self::Weights];

    /// Le nom du fichier, sur le serveur comme sur le disque.
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Config => "config.json",
            Self::Tokenizer => "tokenizer.json",
            Self::Weights => "model.safetensors",
        }
    }
}

/// Ce qu'on sait d'un fichier avant de le télécharger : sa taille et sa somme SHA-256.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ModelFileInfo {
    file: ModelFile,
    size: u64,
    sha256: &'static str,
}

impl ModelFileInfo {
    /// Le fichier décrit.
    #[must_use]
    pub fn file(&self) -> ModelFile {
        self.file
    }

    /// Sa taille, en octets.
    #[must_use]
    pub fn size(&self) -> u64 {
        self.size
    }

    /// Sa somme SHA-256, en hexadécimal minuscule : un fichier qui ne la porte pas est refusé.
    #[must_use]
    pub fn sha256(&self) -> &'static str {
        self.sha256
    }
}

const fn info(file: ModelFile, size: u64, sha256: &'static str) -> ModelFileInfo {
    ModelFileInfo { file, size, sha256 }
}

const SMALL_FILES: [ModelFileInfo; 3] = [
    info(
        ModelFile::Config,
        655,
        "69137736cab8b8903a07fe8afaafdda25aac55415a12a55d1bffa9f581abf959",
    ),
    info(
        ModelFile::Tokenizer,
        17_082_730,
        "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39",
    ),
    info(
        ModelFile::Weights,
        470_641_600,
        "1a55775f53449dac10a2bcbc312469fac40b96d53198c407081a831f81c98477",
    ),
];

const LARGE_FILES: [ModelFileInfo; 3] = [
    info(
        ModelFile::Config,
        690,
        "e42d98d0c211928d788467aa951000391017f647c76ca8ce2ef6dd8d0c9ce5ca",
    ),
    info(
        ModelFile::Tokenizer,
        17_082_660,
        "62c24cdc13d4c9952d63718d6c9fa4c287974249e16b7ade6d5a85e7bbb75626",
    ),
    info(
        ModelFile::Weights,
        2_239_611_368,
        "020afdebf2762b29fcaf286629a96c3b3b65af241f6a08226b1cfee60a21def6",
    ),
];

/// Le modèle de sens qui transforme un texte en vecteur de sens.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum MeaningModel {
    /// E5 petit : 470 Mo, 384 dimensions.
    #[default]
    Small,
    /// E5 grand : 2,2 Go, 1 024 dimensions.
    Large,
}

impl MeaningModel {
    /// Les modèles proposés.
    pub const ALL: [Self; 2] = [Self::Small, Self::Large];

    /// Le modèle choisi tant que l'utilisateur n'a rien réglé.
    pub const DEFAULT: Self = Self::Small;

    /// Le nom stable du modèle (réglages, index, dossier de téléchargement).
    #[must_use]
    pub fn name(self) -> &'static str {
        match self {
            Self::Small => "e5-small",
            Self::Large => "e5-large",
        }
    }

    /// Le modèle de ce nom, s'il existe.
    #[must_use]
    pub fn from_name(name: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|model| model.name() == name)
    }

    /// Le nom montré à l'utilisateur.
    #[must_use]
    pub fn label(self) -> &'static str {
        match self {
            Self::Small => "E5 petit",
            Self::Large => "E5 grand",
        }
    }

    /// La longueur de ses vecteurs de sens.
    #[must_use]
    pub fn dimensions(self) -> usize {
        match self {
            Self::Small => 384,
            Self::Large => 1_024,
        }
    }

    /// Sa famille d'architecture.
    #[must_use]
    pub fn architecture(self) -> Architecture {
        match self {
            Self::Small => Architecture::Bert,
            Self::Large => Architecture::XlmRoberta,
        }
    }

    /// Son dépôt sur Hugging Face.
    #[must_use]
    pub fn repository(self) -> &'static str {
        match self {
            Self::Small => "intfloat/multilingual-e5-small",
            Self::Large => "intfloat/multilingual-e5-large",
        }
    }

    /// La révision figée du dépôt : ce qu'on télécharge ne change pas.
    #[must_use]
    pub fn revision(self) -> &'static str {
        match self {
            Self::Small => "614241f622f53c4eeff9890bdc4f31cfecc418b3",
            Self::Large => "3d7cfbdacd47fdda877c5cd8a79fbcc4f2a574f3",
        }
    }

    /// Ses fichiers à télécharger, avec taille et somme de contrôle.
    #[must_use]
    pub fn files(self) -> &'static [ModelFileInfo] {
        match self {
            Self::Small => &SMALL_FILES,
            Self::Large => &LARGE_FILES,
        }
    }

    /// L'adresse de `file` : `https://huggingface.co/<dépôt>/resolve/<révision>/<fichier>`.
    #[must_use]
    pub fn download_url(self, file: ModelFile) -> String {
        format!(
            "https://huggingface.co/{}/resolve/{}/{}",
            self.repository(),
            self.revision(),
            file.name()
        )
    }

    /// Le poids total à télécharger, en octets.
    #[must_use]
    pub fn total_size(self) -> u64 {
        self.files().iter().map(ModelFileInfo::size).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn the_default_model_is_the_small_one() {
        assert_eq!(MeaningModel::DEFAULT, MeaningModel::Small);
        assert_eq!(MeaningModel::default(), MeaningModel::Small);
        assert_eq!(
            MeaningModel::ALL,
            [MeaningModel::Small, MeaningModel::Large]
        );
    }

    #[test]
    fn a_model_is_found_again_by_its_name() {
        assert_eq!(MeaningModel::Small.name(), "e5-small");
        assert_eq!(MeaningModel::Large.name(), "e5-large");
        for model in MeaningModel::ALL {
            assert_eq!(MeaningModel::from_name(model.name()), Some(model));
        }
        assert_eq!(MeaningModel::from_name("e5-medium"), None);
        assert_eq!(MeaningModel::from_name(""), None);
    }

    #[test]
    fn each_model_has_its_label_dimensions_and_architecture() {
        assert_eq!(MeaningModel::Small.label(), "E5 petit");
        assert_eq!(MeaningModel::Large.label(), "E5 grand");
        assert_eq!(MeaningModel::Small.dimensions(), 384);
        assert_eq!(MeaningModel::Large.dimensions(), 1_024);
        assert_eq!(MeaningModel::Small.architecture(), Architecture::Bert);
        assert_eq!(MeaningModel::Large.architecture(), Architecture::XlmRoberta);
    }

    #[test]
    fn each_model_has_its_repository_and_frozen_revision() {
        assert_eq!(
            MeaningModel::Small.repository(),
            "intfloat/multilingual-e5-small"
        );
        assert_eq!(
            MeaningModel::Large.repository(),
            "intfloat/multilingual-e5-large"
        );
        assert_eq!(
            MeaningModel::Small.revision(),
            "614241f622f53c4eeff9890bdc4f31cfecc418b3"
        );
        assert_eq!(
            MeaningModel::Large.revision(),
            "3d7cfbdacd47fdda877c5cd8a79fbcc4f2a574f3"
        );
    }

    #[test]
    fn the_files_are_the_config_the_tokenizer_and_the_weights_in_order() {
        for model in MeaningModel::ALL {
            let files: Vec<_> = model.files().iter().map(ModelFileInfo::file).collect();
            assert_eq!(files, ModelFile::ALL);
        }
        let names: Vec<_> = ModelFile::ALL.iter().map(|file| file.name()).collect();
        assert_eq!(
            names,
            ["config.json", "tokenizer.json", "model.safetensors"]
        );
    }

    #[test]
    fn the_sizes_and_checksums_are_the_recorded_ones() {
        let small: Vec<_> = MeaningModel::Small
            .files()
            .iter()
            .map(ModelFileInfo::size)
            .collect();
        assert_eq!(small, [655, 17_082_730, 470_641_600]);
        let large: Vec<_> = MeaningModel::Large
            .files()
            .iter()
            .map(ModelFileInfo::size)
            .collect();
        assert_eq!(large, [690, 17_082_660, 2_239_611_368]);
        assert_eq!(
            MeaningModel::Small.files()[2].sha256(),
            "1a55775f53449dac10a2bcbc312469fac40b96d53198c407081a831f81c98477"
        );
        assert_eq!(
            MeaningModel::Large.files()[2].sha256(),
            "020afdebf2762b29fcaf286629a96c3b3b65af241f6a08226b1cfee60a21def6"
        );
        let sums = |model: MeaningModel| -> Vec<&str> {
            model.files().iter().map(ModelFileInfo::sha256).collect()
        };
        assert_eq!(
            sums(MeaningModel::Small)[..2],
            [
                "69137736cab8b8903a07fe8afaafdda25aac55415a12a55d1bffa9f581abf959",
                "0b44a9d7b51c3c62626640cda0e2c2f70fdacdc25bbbd68038369d14ebdf4c39",
            ]
        );
        assert_eq!(
            sums(MeaningModel::Large)[..2],
            [
                "e42d98d0c211928d788467aa951000391017f647c76ca8ce2ef6dd8d0c9ce5ca",
                "62c24cdc13d4c9952d63718d6c9fa4c287974249e16b7ade6d5a85e7bbb75626",
            ]
        );
    }

    #[test]
    fn the_total_size_adds_the_files() {
        assert_eq!(MeaningModel::Small.total_size(), 487_724_985);
        assert_eq!(MeaningModel::Large.total_size(), 2_256_694_718);
    }

    #[test]
    fn the_download_address_names_repository_revision_and_file() {
        assert_eq!(
            MeaningModel::Small.download_url(ModelFile::Weights),
            "https://huggingface.co/intfloat/multilingual-e5-small/resolve/614241f622f53c4eeff9890bdc4f31cfecc418b3/model.safetensors"
        );
        assert_eq!(
            MeaningModel::Large.download_url(ModelFile::Config),
            "https://huggingface.co/intfloat/multilingual-e5-large/resolve/3d7cfbdacd47fdda877c5cd8a79fbcc4f2a574f3/config.json"
        );
    }
}
