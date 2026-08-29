#!/usr/bin/env node
/*
 * Design-token lint.
 *
 * Forbids three classes of arbitrary Tailwind utilities that bypass the
 * project's design token scale:
 *
 *   - text-[Npx]      → use named scale: text-2xs/meta/body/display/title
 *                       (or Tailwind defaults text-xs/sm/base/lg/xl)
 *   - rounded-[Npx]   → use semantic aliases: rounded-control/card/panel/overlay
 *                       (or Tailwind defaults rounded-sm/md/lg/xl/2xl)
 *   - bg-[#hex]       → use a CSS variable–backed color: bg-card / bg-muted /
 *                       bg-chat-surface / etc. defined in theme-tailwind.css
 *
 * Run with `pnpm lint:design-tokens` from the repo root. Exits non-zero when
 * any violation is found so the script can gate CI / pre-commit.
 *
 * A small allow-list covers intentional design one-offs (e.g. composer pill,
 * image preview frame). When extending it, prefer adding a new semantic token
 * to theme-tailwind.css over expanding the allow-list.
 */
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCAN_ROOTS = ["apps/desktop/src", "packages"];
const EXTS = new Set([".ts", ".tsx"]);
const SKIP_DIR_NAMES = new Set([
  "node_modules",
  "dist",
  "build",
  ".turbo",
  "src-tauri",
  "target",
]);

/*
 * Allow-list. Each entry is `relative/path/to/file.tsx::pattern-id` so the
 * exception is pinned to a specific file. When the file moves the entry has
 * to move with it — that is intentional friction. Prefer a token over an entry.
 */
const ALLOW_LIST = new Set([
  // Composer input pill — unique 28px curvature that does not fit the scale.
  "apps/desktop/src/features/composer/chat-composer.tsx::rounded-px",
  // Image preview frame — unique 18px curvature, not reused elsewhere.
  "apps/desktop/src/features/composer/image-attachments.tsx::rounded-px",
  // shadcn Checkbox — 4px corner radius is the upstream component default.
  "apps/desktop/src/components/ui/checkbox.tsx::rounded-px",
  // shadcn Tooltip arrow — 2px corner radius is the upstream component default.
  "apps/desktop/src/components/ui/tooltip.tsx::rounded-px",
]);

const RULES = [
  {
    id: "text-px",
    pattern: /text-\[\d+px\]/g,
    message:
      "text-[Npx] is forbidden — use the named scale (text-2xs / text-meta / text-body / text-display / text-title) or a Tailwind default.",
  },
  {
    id: "rounded-px",
    pattern: /rounded-(?:\w+-)?\[\d+px\]/g,
    message:
      "rounded-[Npx] is forbidden — use a semantic alias (rounded-control / rounded-card / rounded-panel / rounded-overlay) or a Tailwind default. If the value is a one-off, allow-list it explicitly in scripts/lint-design-tokens.mjs.",
  },
  {
    id: "bg-hex",
    pattern: /bg-\[#[0-9a-fA-F]+(?:\/\d+)?\]/g,
    message:
      "bg-[#hex] is forbidden — use a CSS variable–backed color (bg-card, bg-muted, bg-chat-surface, etc.) so it tracks the active theme.",
  },
];

async function* walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith(".")) continue;
    if (SKIP_DIR_NAMES.has(entry.name)) continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile()) {
      const dot = entry.name.lastIndexOf(".");
      if (dot >= 0 && EXTS.has(entry.name.slice(dot))) {
        yield full;
      }
    }
  }
}

async function lintFile(absPath, repoRelPath) {
  const source = await readFile(absPath, "utf-8");
  const lines = source.split("\n");
  const violations = [];
  for (const rule of RULES) {
    const allowKey = `${repoRelPath}::${rule.id}`;
    if (ALLOW_LIST.has(allowKey)) continue;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const matches = line.match(rule.pattern);
      if (!matches) continue;
      for (const match of matches) {
        violations.push({
          rule: rule.id,
          file: repoRelPath,
          line: i + 1,
          match,
          message: rule.message,
        });
      }
    }
  }
  return violations;
}

async function main() {
  const allViolations = [];
  for (const root of SCAN_ROOTS) {
    const abs = join(REPO_ROOT, root);
    try {
      for await (const file of walk(abs)) {
        const rel = relative(REPO_ROOT, file);
        const violations = await lintFile(file, rel);
        allViolations.push(...violations);
      }
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        continue; // Optional scan root that does not exist yet.
      }
      throw error;
    }
  }

  if (allViolations.length === 0) {
    console.log(
      "✔ design tokens clean (no text-[Npx] / rounded-[Npx] / bg-[#hex] violations)",
    );
    return;
  }

  const grouped = new Map();
  for (const v of allViolations) {
    if (!grouped.has(v.rule)) grouped.set(v.rule, []);
    grouped.get(v.rule).push(v);
  }
  for (const [rule, list] of grouped) {
    console.error(`\n✖ ${rule} — ${list.length} violation(s)`);
    console.error(`  ${list[0].message}`);
    for (const v of list) {
      console.error(`    ${v.file}:${v.line}  ${v.match}`);
    }
  }
  console.error(`\n${allViolations.length} total violation(s)`);
  process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(2);
});
