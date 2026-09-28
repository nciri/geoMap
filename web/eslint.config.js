import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default tseslint.config(
  { ignores: ["dist", "node_modules", "public"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    rules: { ...reactHooks.configs.recommended.rules },
  },
  { files: ["e2e/**/*.mjs"], languageOptions: { globals: globals.node } },
);
