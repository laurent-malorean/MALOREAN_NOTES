import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Mêmes limites qu'en Rust (doc/developpement/code.md).
export default tseslint.config(
  {
    ignores: ["node_modules/", "src/bridge/generated/"],
  },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    // Analyse typée : les règles qui ont besoin des types du projet (doc/developpement/code.md).
    languageOptions: {
      parserOptions: {
        projectService: { allowDefaultProject: ["eslint.config.js", "vitest.stryker.config.ts"] },
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/switch-exhaustiveness-check": [
        "error",
        { considerDefaultExhaustiveForUnions: false, requireDefaultForNonUnion: false },
      ],
      "@typescript-eslint/prefer-readonly": "error",
      "max-lines-per-function": ["error", { max: 60, skipBlankLines: true, skipComments: true }],
      "max-lines": ["error", { max: 600 }],
      complexity: ["error", 10],
      "max-params": ["error", 6],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/ban-ts-comment": [
        "error",
        { "ts-expect-error": "allow-with-description" },
      ],
      "eslint-comments/require-description": "off",
    },
  },
  {
    files: ["**/*.test.ts"],
    rules: { "max-lines-per-function": "off" },
  },
);
