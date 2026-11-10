const { withMainActivity } = require("expo/config-plugins");

// expo-splash-screen always sets an exit animation listener, which opts the
// app into Android 12+'s splash handover. On some devices (HyperOS on Android
// 16) the first app frame shows before the handed-over splash view does, so
// the content blinks between the system splash and the fade. Clearing the
// listener before the first resume lets the system remove the splash itself.
// Upstream: https://github.com/expo/expo/issues/53033
const SUPER_ON_CREATE = /^(\s*)super\.onCreate\(.*\)\s*$/m;
const CLEAR_LISTENER =
  "if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) splashScreen.clearOnExitAnimationListener()";

function withClearedListener(source) {
  if (source.includes(CLEAR_LISTENER)) return source;
  if (!SUPER_ON_CREATE.test(source)) {
    throw new Error("android-splash-handover: MainActivity has no onCreate");
  }
  const cleared = source.replace(
    SUPER_ON_CREATE,
    (line, indent) => `${line}\n${indent}${CLEAR_LISTENER}`,
  );
  if (cleared.includes("import android.os.Build\n")) return cleared;
  return cleared.replace(/^(package .+\n)/, "$1import android.os.Build\n");
}

module.exports = function withAndroidSplashHandover(config) {
  return withMainActivity(config, (modConfig) => {
    if (modConfig.modResults.language !== "kt") {
      throw new Error("android-splash-handover: MainActivity must be Kotlin");
    }
    modConfig.modResults.contents = withClearedListener(
      modConfig.modResults.contents,
    );
    return modConfig;
  });
};
