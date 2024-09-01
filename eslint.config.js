import js from "@eslint/js";
import tsEslint from "typescript-eslint";
import reactEslint from "eslint-plugin-react";
import reactHooksEslint from "eslint-plugin-react-hooks";

export default tsEslint.config(
  {
    ignores: ["**/dist/**/*", "**/*.test-d.ts"],
  },
  js.configs.recommended,
  {
    files: ["**/*.ts", "**/*.tsx"],
    extends: [
      ...tsEslint.configs.recommendedTypeChecked,
      ...tsEslint.configs.stylisticTypeChecked,
      ...tsEslint.configs.strictTypeChecked,
      tsEslint.configs.eslintRecommended,
      reactEslint.configs.flat.recommended,
      {
        plugins: {
          "react-hooks": reactHooksEslint,
        },
        rules: reactHooksEslint.configs.recommended.rules,
      },
    ],
    plugins: {
      "@typescript-eslint": tsEslint.plugin,
    },
    languageOptions: {
      parser: tsEslint.parser,
      ecmaVersion: 5,
      sourceType: "script",
      parserOptions: {
        projectService: true,
      },
    },
    settings: {
      react: {
        version: "18",
      },
    },
    rules: {
      // Problematic in terms of conciseness when chaining a lot
      "@typescript-eslint/no-confusing-void-expression": "off",
      // We are throwing promises and other things, makes no sense to pretend
      // Error is the only thrown thing.
      "@typescript-eslint/prefer-promise-reject-errors": "off",
      "@typescript-eslint/only-throw-error": "off",
      "react/react-in-jsx-scope": "off",
    },
  },
  {
    files: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      // act() does return a promise
      "@typescript-eslint/await-thenable": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
    },
  },
);
