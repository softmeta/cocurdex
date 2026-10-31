const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const MODULE_FILES = {
  "isomorphic-webcrypto/src/react-native": path.join(
    __dirname,
    "src/notes/editor/lib0-webcrypto.ts",
  ),
};

config.resolver.resolveRequest = (context, moduleName, platform) => {
  const filePath = MODULE_FILES[moduleName];
  if (filePath) return { type: "sourceFile", filePath };
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
