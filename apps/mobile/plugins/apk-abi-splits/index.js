const { withAppBuildGradle } = require("expo/config-plugins");

const ABIS_ENV = "COCURDEX_ANDROID_APK_ABIS";
const SUPPORTED_ABIS = new Set(["arm64-v8a", "armeabi-v7a", "x86", "x86_64"]);
const ANDROID_BLOCK = /^android \{$/m;

function apkAbis() {
  const raw = process.env[ABIS_ENV];
  if (raw === undefined || raw.trim() === "") return null;
  const abis = raw.split(",").map((abi) => abi.trim());
  const unsupported = abis.filter((abi) => !SUPPORTED_ABIS.has(abi));
  if (unsupported.length > 0) {
    throw new Error(
      `apk-abi-splits: unsupported ${ABIS_ENV} entries ${unsupported.join(", ")}`,
    );
  }
  return abis;
}

function withAbiSplits(gradle, abis) {
  if (!ANDROID_BLOCK.test(gradle)) {
    throw new Error("apk-abi-splits: app/build.gradle has no android block");
  }
  const include = abis.map((abi) => `"${abi}"`).join(", ");
  const splits = [
    "android {",
    "    splits {",
    "        abi {",
    "            enable true",
    "            reset()",
    `            include ${include}`,
    "            universalApk false",
    "        }",
    "    }",
  ].join("\n");
  return gradle.replace(ANDROID_BLOCK, splits);
}

module.exports = function withApkAbiSplits(config) {
  const abis = apkAbis();
  if (abis === null) return config;
  return withAppBuildGradle(config, (modConfig) => {
    modConfig.modResults.contents = withAbiSplits(
      modConfig.modResults.contents,
      abis,
    );
    return modConfig;
  });
};
