const { execFileSync } = require("node:child_process");

function commitCount() {
  try {
    return execFileSync("git", ["rev-list", "--count", "HEAD"], {
      cwd: __dirname,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return undefined;
  }
}

function buildNumber() {
  const raw = process.env.COCURDEX_MOBILE_BUILD_NUMBER ?? commitCount() ?? "1";
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`Mobile build number must be a positive integer: ${raw}`);
  }
  return value;
}

module.exports = ({ config }) => {
  const build = buildNumber();
  return {
    ...config,
    ios: { ...config.ios, buildNumber: String(build) },
    android: { ...config.android, versionCode: build },
  };
};
