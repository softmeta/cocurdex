const fs = require("node:fs");
const path = require("node:path");
const { withDangerousMod, withXcodeProject } = require("expo/config-plugins");

const TARGET_NAME = "CocurdexNotificationService";
const APP_GROUPS_KEY = "com.apple.security.application-groups";
const SOURCE_FILES = ["NotificationService.swift", "SealedMessage.swift"];
const INFO_PLIST = "Info.plist";
const ENTITLEMENTS = `${TARGET_NAME}.entitlements`;
const EXTENSION_SOURCE = path.join(__dirname, "extension");

function appGroup(config) {
  const groups = config.ios?.entitlements?.[APP_GROUPS_KEY];
  if (!Array.isArray(groups) || typeof groups[0] !== "string") {
    throw new Error(
      `push-notifications: set ios.entitlements["${APP_GROUPS_KEY}"] in app.json`,
    );
  }
  return groups[0];
}

function entitlementsPlist(group) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">',
    '<plist version="1.0">',
    "<dict>",
    `\t<key>${APP_GROUPS_KEY}</key>`,
    "\t<array>",
    `\t\t<string>${group}</string>`,
    "\t</array>",
    "</dict>",
    "</plist>",
    "",
  ].join("\n");
}

function withExtensionFiles(config) {
  return withDangerousMod(config, [
    "ios",
    (modConfig) => {
      const target = path.join(
        modConfig.modRequest.platformProjectRoot,
        TARGET_NAME,
      );
      fs.mkdirSync(target, { recursive: true });
      for (const file of [...SOURCE_FILES, INFO_PLIST]) {
        fs.copyFileSync(
          path.join(EXTENSION_SOURCE, file),
          path.join(target, file),
        );
      }
      fs.writeFileSync(
        path.join(target, ENTITLEMENTS),
        entitlementsPlist(appGroup(modConfig)),
        "utf8",
      );
      return modConfig;
    },
  ]);
}

function unquote(value) {
  return typeof value === "string" ? value.replace(/^"|"$/g, "") : value;
}

function mainTargetSettings(project) {
  const main = project.getFirstTarget().firstTarget;
  const configurations = project
    .pbxXCConfigurationList()
    [main.buildConfigurationList].buildConfigurations.map(
      (entry) => entry.value,
    );
  const section = project.pbxXCBuildConfigurationSection();
  const release = configurations
    .map((key) => section[key])
    .find((entry) => entry.name === "Release");
  return release?.buildSettings ?? {};
}

function extensionBuildSettings(config, main) {
  return {
    INFOPLIST_FILE: `${TARGET_NAME}/${INFO_PLIST}`,
    CODE_SIGN_ENTITLEMENTS: `${TARGET_NAME}/${ENTITLEMENTS}`,
    CODE_SIGN_STYLE: "Automatic",
    PRODUCT_BUNDLE_IDENTIFIER: `"${config.ios.bundleIdentifier}.NotificationService"`,
    COCURDEX_KEYCHAIN_GROUP: `"${appGroup(config)}"`,
    SWIFT_VERSION: "5.0",
    IPHONEOS_DEPLOYMENT_TARGET: main.IPHONEOS_DEPLOYMENT_TARGET ?? "16.0",
    TARGETED_DEVICE_FAMILY: main.TARGETED_DEVICE_FAMILY ?? '"1"',
    MARKETING_VERSION: config.version,
    CURRENT_PROJECT_VERSION: config.ios.buildNumber ?? "1",
    APPLICATION_EXTENSION_API_ONLY: "YES",
    CLANG_ENABLE_MODULES: "YES",
    ...(main.DEVELOPMENT_TEAM
      ? { DEVELOPMENT_TEAM: unquote(main.DEVELOPMENT_TEAM) }
      : {}),
  };
}

function addExtensionTarget(config, project) {
  const files = [...SOURCE_FILES, INFO_PLIST, ENTITLEMENTS];
  const group = project.addPbxGroup(files, TARGET_NAME, TARGET_NAME);
  const mainGroup = project.getFirstProject().firstProject.mainGroup;
  project.addToPbxGroup(group.uuid, mainGroup);
  for (const key of ["PBXTargetDependency", "PBXContainerItemProxy"]) {
    const objects = project.hash.project.objects;
    objects[key] = objects[key] ?? {};
  }
  const target = project.addTarget(
    TARGET_NAME,
    "app_extension",
    TARGET_NAME,
    `${config.ios.bundleIdentifier}.NotificationService`,
  );
  project.addBuildPhase(
    SOURCE_FILES,
    "PBXSourcesBuildPhase",
    "Sources",
    target.uuid,
  );
  project.addBuildPhase([], "PBXResourcesBuildPhase", "Resources", target.uuid);
  project.addBuildPhase(
    [],
    "PBXFrameworksBuildPhase",
    "Frameworks",
    target.uuid,
  );
  return target.uuid;
}

function applyBuildSettings(project, targetUuid, settings) {
  const target = project.pbxNativeTargetSection()[targetUuid];
  const configurations = project
    .pbxXCConfigurationList()
    [target.buildConfigurationList].buildConfigurations.map(
      (entry) => entry.value,
    );
  const section = project.pbxXCBuildConfigurationSection();
  for (const key of configurations) {
    Object.assign(section[key].buildSettings, settings);
  }
}

function withExtensionTarget(config) {
  return withXcodeProject(config, (modConfig) => {
    const project = modConfig.modResults;
    const existing = project.pbxTargetByName(TARGET_NAME);
    const targetUuid = existing
      ? project.findTargetKey(TARGET_NAME)
      : addExtensionTarget(modConfig, project);
    applyBuildSettings(
      project,
      targetUuid,
      extensionBuildSettings(modConfig, mainTargetSettings(project)),
    );
    return modConfig;
  });
}

module.exports = function withPushNotifications(config) {
  appGroup(config);
  return withExtensionTarget(withExtensionFiles(config));
};
