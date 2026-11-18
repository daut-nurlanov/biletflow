const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Local SDKs, AVD images and Gradle caches are not application sources. Watching
// these large, frequently changing files can stall Metro during device QA.
const defaults = config.resolver.blockList;
config.resolver.blockList = [
  ...(Array.isArray(defaults) ? defaults : defaults ? [defaults] : []),
  /(?:^|[\\/])\.expo[\\/]device-qa(?:[\\/]|$)/,
];

module.exports = config;
