const expoConfig = require("eslint-config-expo/flat");

module.exports = [
  ...expoConfig,
  {
    ignores: ["ios/**", "android/**", ".expo/**"],
  },
];
