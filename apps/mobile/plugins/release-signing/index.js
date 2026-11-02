const { withXcodeProject } = require("expo/config-plugins");

const PROFILES_ENV = "COCURDEX_IOS_PROVISIONING_PROFILES";
const SIGNING_IDENTITY = "Apple Distribution";

function provisioningProfiles() {
  const raw = process.env[PROFILES_ENV];
  if (raw === undefined || raw === "") return null;
  const parsed = JSON.parse(raw);
  const entries = Object.entries(parsed);
  const valid =
    entries.length > 0 &&
    entries.every(
      ([bundleId, profile]) =>
        typeof bundleId === "string" &&
        typeof profile === "string" &&
        profile !== "",
    );
  if (!valid) {
    throw new Error(
      `release-signing: ${PROFILES_ENV} must map bundle identifiers to profile names`,
    );
  }
  return new Map(entries);
}

function unquote(value) {
  return typeof value === "string" ? value.replace(/^"|"$/g, "") : value;
}

function targetConfigurations(project, target) {
  const section = project.pbxXCBuildConfigurationSection();
  return project
    .pbxXCConfigurationList()
    [target.buildConfigurationList].buildConfigurations.map(
      (entry) => section[entry.value],
    );
}

function signTargets(project, profiles) {
  const signed = new Set();
  const targets = Object.values(project.pbxNativeTargetSection()).filter(
    (entry) => typeof entry === "object",
  );
  for (const target of targets) {
    for (const configuration of targetConfigurations(project, target)) {
      const settings = configuration.buildSettings;
      const bundleId = unquote(settings.PRODUCT_BUNDLE_IDENTIFIER);
      const profile = profiles.get(bundleId);
      if (configuration.name !== "Release" || profile === undefined) continue;
      settings.CODE_SIGN_STYLE = "Manual";
      settings.CODE_SIGN_IDENTITY = `"${SIGNING_IDENTITY}"`;
      settings['"CODE_SIGN_IDENTITY[sdk=iphoneos*]"'] = `"${SIGNING_IDENTITY}"`;
      settings.PROVISIONING_PROFILE_SPECIFIER = `"${profile}"`;
      signed.add(bundleId);
    }
  }
  const missing = [...profiles.keys()].filter((id) => !signed.has(id));
  if (missing.length > 0) {
    throw new Error(
      `release-signing: no Release target for ${missing.join(", ")}`,
    );
  }
}

module.exports = function withReleaseSigning(config) {
  const profiles = provisioningProfiles();
  if (profiles === null) return config;
  return withXcodeProject(config, (modConfig) => {
    signTargets(modConfig.modResults, profiles);
    return modConfig;
  });
};
