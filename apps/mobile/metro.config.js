// Config Metro pour monorepo (npm workspaces) — cf. https://docs.expo.dev/guides/monorepos/
// Sans ça, Metro ne trouve pas les paquets hissés à la racine (expo lui-même,
// @blindtest/game-logic, @blindtest/ui), ce qui provoque des erreurs du type
// "main field ... points to an unresolvable path" ou "Unable to resolve module".
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// 1. Surveiller tout le monorepo, pas seulement apps/mobile
config.watchFolders = [workspaceRoot];
// 2. Chercher les modules d'abord en local, puis à la racine du monorepo
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(workspaceRoot, "node_modules"),
];

module.exports = config;
