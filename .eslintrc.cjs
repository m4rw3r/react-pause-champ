module.exports = {
  ignorePatterns: ["**/dist/**/*"],
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/eslint-recommended",
    "plugin:@typescript-eslint/stylistic-type-checked",
    "plugin:@typescript-eslint/strict-type-checked",
  ],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    project: true,
    tsconfigRootDir: __dirname,
  },
  plugins: ["@typescript-eslint"],
  root: true,
  rules: {
    // Problematic in terms of conciseness when chaining a lot
    "@typescript-eslint/no-confusing-void-expression": "off",
    // We are throwing promises and other things, makes no sense to pretend
    // Error is the only thrown thing.
    "@typescript-eslint/prefer-promise-reject-errors": "off",
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx"],
      rules: {
        // act() does return a promise
        "@typescript-eslint/await-thenable": "off",
        //"@typescript-eslint/no-non-null-assertion": "off",
        //"@typescript-eslint/no-unsafe-member-access": "off",
      },
    },
  ],
};
