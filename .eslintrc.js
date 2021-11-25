module.exports = {
  extends: ["react-app", "plugin:import/typescript"],
  parser: "@typescript-eslint/parser",
  plugins: ["@typescript-eslint", "import"],
  settings: {
    "import/resolver": {
      typescript: {}
    }
  },
  overrides: [
    {
      files: [],
      rules: {
        "no-restricted-globals": "off"
      }
    }
  ],
  rules: {
    "@typescript-eslint/consistent-type-imports": "error",

    "import/order": [
      "error",
      {
        "newlines-between": "always",
        groups: [
          ["builtin", "external", "internal"],
          ["parent", "sibling", "index"]
        ]
      }
    ]
  }
};
