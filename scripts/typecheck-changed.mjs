import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

function git(args, cwd = process.cwd()) {
  return execFileSync("git", args, { encoding: "utf8", cwd });
}

function findConfig(file, root) {
  let directory = path.dirname(file);
  while (true) {
    const candidate = path.join(directory, "tsconfig.json");
    if (existsSync(candidate)) {
      return candidate;
    }
    if (directory === root || directory === path.dirname(directory)) {
      throw new Error(`No tsconfig.json owns ${file}`);
    }
    directory = path.dirname(directory);
  }
}

function loadTypeScript(directory, root) {
  for (const candidate of [directory, path.join(root, "apps/desktop")]) {
    const require = createRequire(path.join(candidate, "package.json"));
    let resolved;
    try {
      resolved = require.resolve("typescript");
    } catch (error) {
      if (error.code !== "MODULE_NOT_FOUND") {
        throw error;
      }
      continue;
    }
    return require(resolved);
  }
  throw new Error(
    "No installed TypeScript found in the package or desktop workspace",
  );
}

function checkProject(configPath, files, root) {
  const directory = path.dirname(configPath);
  const ts = loadTypeScript(directory, root);
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsed = ts.parseJsonConfigFileContent(
    config.config ?? {},
    ts.sys,
    directory,
    { noEmit: true, incremental: false },
    configPath,
  );
  const configErrors = [config.error, ...parsed.errors].filter(Boolean);
  const formatHost = {
    getCurrentDirectory: () => directory,
    getCanonicalFileName: (file) => file,
    getNewLine: () => "\n",
  };
  if (configErrors.length > 0) {
    console.error(
      ts.formatDiagnosticsWithColorAndContext(configErrors, formatHost),
    );
    return false;
  }
  const host = ts.createCompilerHost(parsed.options);
  host.getCurrentDirectory = () => directory;
  host.writeFile = () => {
    throw new Error("Changed-file checking must not emit files");
  };
  const program = ts.createProgram({
    rootNames: parsed.fileNames,
    options: parsed.options,
    projectReferences: parsed.projectReferences,
    host,
  });
  const diagnostics = [
    ...program.getOptionsDiagnostics(),
    ...program.getGlobalDiagnostics(),
  ];
  for (const file of files) {
    const source = program.getSourceFile(file);
    if (!source) {
      throw new Error(`${file} is not included by ${configPath}`);
    }
    diagnostics.push(
      ...program.getSyntacticDiagnostics(source),
      ...program.getSemanticDiagnostics(source),
    );
  }
  console.log(
    `${path.relative(root, configPath)}: ${files.length} selected files, ${diagnostics.length} diagnostics`,
  );
  if (diagnostics.length > 0) {
    console.error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, formatHost),
    );
  }
  return diagnostics.length === 0;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes("--help")) {
    console.log("Usage: node scripts/typecheck-changed.mjs [file.ts ...]");
    console.log(
      "Default: staged, unstaged, and untracked TypeScript files in this worktree.",
    );
    console.log("Explicit paths are relative to the current directory.");
    console.log(
      "Reports selected-file and config/global diagnostics; does not check all consumers.",
    );
    return;
  }
  if (args.some((arg) => arg.startsWith("-"))) {
    throw new Error("Unknown option. Use --help for usage.");
  }
  const root = git(["rev-parse", "--show-toplevel"]).trim();
  const selected =
    args.length > 0
      ? args.map((file) => path.resolve(file))
      : [
          ...git(
            ["diff", "HEAD", "--name-only", "--diff-filter=ACMR", "-z"],
            root,
          ).split("\0"),
          ...git(
            ["ls-files", "--others", "--exclude-standard", "-z"],
            root,
          ).split("\0"),
        ]
          .filter(Boolean)
          .map((file) => path.join(root, file));
  const groups = new Map();
  for (const file of new Set(selected)) {
    if (!/\.(?:ts|tsx|mts|cts)$/.test(file)) {
      if (args.length > 0) {
        throw new Error(`Not a TypeScript file: ${file}`);
      }
      continue;
    }
    const relative = path.relative(root, file);
    if (relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
      throw new Error(`File is outside the current worktree: ${file}`);
    }
    if (!existsSync(file)) {
      throw new Error(`File does not exist: ${file}`);
    }
    const configPath = findConfig(file, root);
    const files = groups.get(configPath) ?? [];
    files.push(file);
    groups.set(configPath, files);
  }
  if (groups.size === 0) {
    console.log("No changed TypeScript files.");
    return;
  }
  let passed = true;
  for (const [configPath, files] of groups) {
    if (!checkProject(configPath, files, root)) {
      passed = false;
    }
  }
  process.exitCode = passed ? 0 : 1;
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
