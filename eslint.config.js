import js from "@eslint/js";
import globals from "globals";

// §10: lint every file. `npm run lint` runs this plus `prettier --check .`.
export default [
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // `const { dropped, ...rest } = obj` is the idiom for omitting a field.
      "no-unused-vars": ["error", { ignoreRestSiblings: true }],
    },
  },
];
