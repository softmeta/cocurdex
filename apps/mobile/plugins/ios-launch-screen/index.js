const { withInfoPlist } = require("expo/config-plugins");

module.exports = function withIosLaunchScreen(config) {
  // Expo runs these mods in reverse registration order. Register before expo-splash-screen.
  return withInfoPlist(config, (config) => {
    // iOS 27 can retain the old system storyboard snapshot after reinstall.
    // Expo still loads SplashScreen.storyboard as its in-app overlay.
    delete config.modResults.UILaunchStoryboardName;
    config.modResults.UILaunchScreen = {
      UIColorName: "SplashScreenBackground",
    };
    return config;
  });
};
