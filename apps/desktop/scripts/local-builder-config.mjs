const SHARED_APP_OUTPUT = "out/**";
const SHARED_CLI_RESOURCES = "resources/cli";
const APP_MANIFEST = "package.json";

export function stagedLocalBuilderConfig(
  build,
  { stagedOutDir, stagedCliDir, outputDir },
) {
  if (!build.files.includes(SHARED_APP_OUTPUT)) {
    throw new Error(`Expected build.files to package ${SHARED_APP_OUTPUT}`);
  }
  if (
    !build.extraResources.some((entry) => entry.from === SHARED_CLI_RESOURCES)
  ) {
    throw new Error(
      `Expected build.extraResources to copy ${SHARED_CLI_RESOURCES}`,
    );
  }
  return {
    ...build,
    directories: { ...build.directories, output: outputDir },
    files: [
      ...build.files.map((entry) =>
        entry === SHARED_APP_OUTPUT ? APP_MANIFEST : entry,
      ),
      { from: stagedOutDir, to: "out", filter: ["**/*"] },
    ],
    extraResources: build.extraResources.map((entry) =>
      entry.from === SHARED_CLI_RESOURCES
        ? { ...entry, from: stagedCliDir }
        : entry,
    ),
    mac: { ...build.mac, notarize: false },
  };
}
