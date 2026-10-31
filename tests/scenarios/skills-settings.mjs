import { lstat, mkdir, readdir, readlink, symlink } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { openScenarioApp } from "./lib/app.mjs";
import { check, readScenarioArgs, runScenario } from "./lib/app-session.mjs";
import { clearColorScheme, emulateColorScheme } from "./lib/appearance.mjs";
import { daemonRequest } from "./lib/daemon-rpc.mjs";
import {
  centerOf,
  clickByRole,
  clickPoint,
  waitForNoRole,
  waitForRole,
} from "./lib/locate.mjs";
import { openSettingsSection, translate } from "./lib/navigate.mjs";

const UI_TIMEOUT_MS = 30_000;
const FIXTURE_SOURCE = path.dirname(
  path.dirname(
    createRequire(import.meta.url).resolve(
      "./fixtures/skills/scenario-alpha/SKILL.md",
    ),
  ),
);
const FIXTURE_SKILLS = ["scenario-alpha", "scenario-beta"];
const BROKEN_SKILL = "scenario-broken";
const PRODUCT_SKILLS_ROOT = path.dirname(
  path.dirname(
    createRequire(import.meta.url).resolve(
      "../../packages/product-skills/skills/cocurdex-issue/SKILL.md",
    ),
  ),
);

async function bundledSkillCount() {
  const entries = await readdir(PRODUCT_SKILLS_ROOT, { withFileTypes: true });
  return entries.filter((entry) => entry.isDirectory()).length;
}

const args = readScenarioArgs();

async function activeWorkspaceId(session) {
  const workspaces = await daemonRequest(session, "workspace.list");
  const [latest] = [...workspaces].sort((left, right) =>
    String(right.lastOpenedAt).localeCompare(String(left.lastOpenedAt)),
  );
  return latest?.id ?? null;
}

async function listWorkspaceSkills(session, workspaceId) {
  const library = await daemonRequest(session, "skills.list", { workspaceId });
  return library.skills.filter((skill) => skill.scope === "workspace");
}

async function removeFixtureSkills(session, workspaceId) {
  for (const skill of await listWorkspaceSkills(session, workspaceId)) {
    if ([...FIXTURE_SKILLS, BROKEN_SKILL].includes(skill.name)) {
      await daemonRequest(session, "skills.remove", {
        name: skill.name,
        scope: skill.scope,
        workspaceId,
      });
    }
  }
  return true;
}

async function pathKind(target) {
  try {
    const stats = await lstat(target);
    return stats.isSymbolicLink() ? "link" : "directory";
  } catch {
    return null;
  }
}

function claudeLinkPath(workspaceRoot, name) {
  return path.join(workspaceRoot, ".claude", "skills", name);
}

async function createBrokenLinks(workspaceRoot, name) {
  const missing = path.join(workspaceRoot, ".missing-skill-target", name);
  const links = [
    path.join(workspaceRoot, ".agents", "skills", name),
    claudeLinkPath(workspaceRoot, name),
  ];
  for (const link of links) {
    await mkdir(path.dirname(link), { recursive: true });
    await symlink(
      missing,
      link,
      process.platform === "win32" ? "junction" : "dir",
    );
  }
  return links;
}

function readBrokenDetail(name) {
  const detail = document.querySelector(`[data-skill-detail="${name}"]`);
  return {
    linkRows: [...(detail?.querySelectorAll("[data-item-path]") ?? [])].map(
      (row) => row.dataset.itemPath,
    ),
    text: detail?.textContent ?? "",
  };
}

async function clickDataRow(session, selector) {
  await session.waitUntil(
    (value) => Boolean(document.querySelector(value)),
    selector,
    UI_TIMEOUT_MS,
  );
  const point = await session.run((value) => {
    const row = document.querySelector(value);
    row.scrollIntoView({ block: "center" });
    const rect = row.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, selector);
  await clickPoint(session, point);
}

function waitForDetail(session, name) {
  return session.waitUntil(
    (value) =>
      Boolean(document.querySelector(`[data-skill-detail="${value}"]`)),
    name,
    UI_TIMEOUT_MS,
  );
}

function visibleSkillRows() {
  return [...document.querySelectorAll("[data-skill]")].map(
    (row) => row.dataset.skill,
  );
}

function readLayout(filterLabel) {
  const rectOf = (element) => element?.getBoundingClientRect() ?? null;
  const filter = rectOf(window.__scenario.byLabel(filterLabel));
  const detail = rectOf(document.querySelector("[data-skill-detail]"));
  const rows = [
    ...document.querySelectorAll("[data-skill], [data-skill-pack]"),
  ].map((row) => {
    const rect = row.getBoundingClientRect();
    return { left: rect.left, right: rect.right };
  });
  return {
    filterTop: filter?.top ?? null,
    detailTop: detail?.top ?? null,
    listRight: rows[0]?.right ?? null,
    detailLeft: detail?.left ?? null,
    rows,
    pageOverflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  };
}

runScenario("skills-settings", {
  open: () => openScenarioApp(args),
  setup: async ({ session }) => {
    const workspaceId = await activeWorkspaceId(session);
    if (!workspaceId) throw new Error("Scenario needs an active workspace");
    await removeFixtureSkills(session, workspaceId);
    await openSettingsSection(session, "skills");
    const t = (key, options) => translate(session, `settings:${key}`, options);
    return { t, workspaceId };
  },
  steps: [
    [
      "the page opens on the Cocurdex pack",
      async ({ session, t }) => {
        await waitForRole(
          session,
          { role: "tab", name: await t("skills.tabs.discover") },
          UI_TIMEOUT_MS,
        );
        await waitForDetail(session, "cocurdex");
        const scopes = await session.run(() =>
          [...document.querySelectorAll("[data-skill-pack-scope]")].map(
            (row) => row.dataset.skillPackScope,
          ),
        );
        check(scopes.includes("global"), "pack scope rows", scopes);
        const expectedCount = await bundledSkillCount();
        const packSkillCount = await session
          .waitUntil(
            (count) =>
              document.querySelectorAll(
                '[data-skill-detail="cocurdex"] [data-item-path]',
              ).length === count,
            expectedCount,
            UI_TIMEOUT_MS,
          )
          .then(
            () => expectedCount,
            () => 0,
          );
        check(
          packSkillCount === expectedCount,
          "pack lists bundled skills",
          packSkillCount,
        );
        return { scopes, packSkills: packSkillCount };
      },
    ],
    [
      "a bundled skill opens with a rendered document and reopens from cache",
      async ({ session, t }) => {
        const name = "cocurdex-issue";
        const section = `[data-skill-pack-skill="${name}"]`;
        await clickDataRow(
          session,
          `[data-skill-detail="cocurdex"] [data-item-path="${name}"]`,
        );
        await session.waitUntil(
          (value) =>
            Boolean(
              document.querySelector(
                `${value} [data-skill-document="preview"]`,
              ),
            ),
          section,
          UI_TIMEOUT_MS,
        );
        const preview = await session.run((value) => {
          const node = document.querySelector(
            `${value} [data-skill-document="preview"]`,
          );
          return {
            headings: node.querySelectorAll("h1, h2, h3").length,
            showsFrontmatter: node.textContent.includes(`name: cocurdex-`),
          };
        }, section);
        check(preview.headings > 0, "preview renders headings", preview);
        check(!preview.showsFrontmatter, "preview hides frontmatter", preview);
        await clickByRole(session, {
          role: "button",
          name: await t("skills.document.source"),
        });
        const source = await session.waitUntil(
          (value) =>
            document
              .querySelector(`${value} [data-skill-document="source"]`)
              ?.textContent.startsWith("---") ?? false,
          section,
          UI_TIMEOUT_MS,
        );
        check(source, "source view shows raw SKILL.md", source);

        await clickDataRow(session, "[data-skill-pack]");
        await waitForDetail(session, "cocurdex");
        await session.run((value) => {
          window.__skillDocMissingFrame = false;
          const observer = new MutationObserver(() => {
            const node = document.querySelector(value);
            if (node && !node.querySelector("[data-skill-document]")) {
              window.__skillDocMissingFrame = true;
            }
          });
          observer.observe(document.body, { childList: true, subtree: true });
          window.__skillDocObserver = observer;
        }, section);
        await clickDataRow(
          session,
          `[data-skill-detail="cocurdex"] [data-item-path="${name}"]`,
        );
        await session.waitUntil(
          (value) =>
            Boolean(document.querySelector(`${value} [data-skill-document]`)),
          section,
          UI_TIMEOUT_MS,
        );
        const missingFrame = await session.run(() => {
          window.__skillDocObserver.disconnect();
          return window.__skillDocMissingFrame;
        });
        check(!missingFrame, "reopened skill renders from cache", missingFrame);
        await clickDataRow(session, "[data-skill-pack]");
        await waitForDetail(session, "cocurdex");
        return { preview, missingFrame };
      },
    ],
    [
      "a local folder installs two skills into the workspace",
      async ({ session, t, workspaceId }) => {
        await clickByRole(session, {
          role: "button",
          name: await t("skills.add.open"),
        });
        const [field] = await waitForRole(
          session,
          { role: "textbox", name: await t("skills.add.sourceLabel") },
          UI_TIMEOUT_MS,
        );
        await clickPoint(session, await centerOf(session, field.backendNodeId));
        await session.run(
          (text) => window.__scenario.setInput(document.activeElement, text),
          FIXTURE_SOURCE,
        );
        await clickByRole(session, {
          role: "button",
          name: await t("skills.add.read"),
        });
        await session.waitUntil(
          (count) =>
            document.querySelectorAll("[data-skill-source-path]").length ===
            count,
          FIXTURE_SKILLS.length,
          UI_TIMEOUT_MS,
        );
        const library = await daemonRequest(session, "skills.list", {
          workspaceId,
        });
        const workspaceName = library.workspace?.name ?? "";
        await clickByRole(session, {
          role: "button",
          name: await t("skills.install.workspace", {
            workspace: workspaceName,
          }),
        });
        await clickByRole(session, {
          role: "button",
          name: await t("skills.add.install", { count: FIXTURE_SKILLS.length }),
        });
        await waitForNoRole(session, { role: "dialog" }, UI_TIMEOUT_MS);
        await session.waitUntil(
          (names) =>
            names.every((name) =>
              document.querySelector(
                `[data-skill="${name}"][data-skill-scope="workspace"]`,
              ),
            ),
          FIXTURE_SKILLS,
          UI_TIMEOUT_MS,
        );
        const skills = await listWorkspaceSkills(session, workspaceId);
        const alpha = skills.find((skill) => skill.name === "scenario-alpha");
        check(alpha?.source?.kind === "local", "local source", alpha);
        const beta = skills.find((skill) => skill.name === "scenario-beta");
        check(beta?.scriptCount === 1, "beta script count", beta);
        const workspaceRoot = path.dirname(
          path.dirname(path.dirname(alpha.path)),
        );
        const link = claudeLinkPath(workspaceRoot, "scenario-alpha");
        check(
          (await pathKind(link)) === "link",
          "claude code link created",
          link,
        );
        return { workspaceRoot, target: await readlink(link) };
      },
    ],
    [
      "the filter narrows the list to matching skills",
      async ({ session, t }) => {
        const [filter] = await waitForRole(session, {
          role: "textbox",
          name: await t("skills.list.filter"),
        });
        await clickPoint(
          session,
          await centerOf(session, filter.backendNodeId),
        );
        await session.run(
          (text) => window.__scenario.setInput(document.activeElement, text),
          "scenario-al",
        );
        await session.waitUntil(
          () => {
            const rows = [...document.querySelectorAll("[data-skill]")];
            return (
              rows.length === 1 &&
              rows[0].dataset.skill === "scenario-alpha" &&
              !document.querySelector("[data-skill-pack]")
            );
          },
          null,
          UI_TIMEOUT_MS,
        );
        await session.run(
          (text) => window.__scenario.setInput(document.activeElement, text),
          "",
        );
        await session.waitUntil(
          () => Boolean(document.querySelector("[data-skill-pack]")),
          null,
          UI_TIMEOUT_MS,
        );
        return { rows: (await session.run(visibleSkillRows)).length };
      },
    ],
    [
      "the detail shows the skill and its agent links",
      async ({ session }) => {
        await clickDataRow(
          session,
          '[data-skill="scenario-alpha"][data-skill-scope="workspace"]',
        );
        await waitForDetail(session, "scenario-alpha");
        await waitForRole(
          session,
          { role: "switch", name: "Claude Code" },
          UI_TIMEOUT_MS,
        );
        const shared = await session.run(() =>
          Boolean(
            document.querySelector(
              '[data-skill-detail="scenario-alpha"] [data-skill-agent="shared"]',
            ),
          ),
        );
        check(shared, "shared agents row", shared);
        return {};
      },
    ],
    [
      "the Claude Code switch removes and restores the link",
      async ({ session, workspaceId }) => {
        const [alpha] = (
          await listWorkspaceSkills(session, workspaceId)
        ).filter((skill) => skill.name === "scenario-alpha");
        const workspaceRoot = path.dirname(
          path.dirname(path.dirname(alpha.path)),
        );
        const link = claudeLinkPath(workspaceRoot, "scenario-alpha");
        await clickByRole(session, { role: "switch", name: "Claude Code" });
        await session.waitUntil(
          () =>
            document
              .querySelector('[data-skill-agent="claude-code"] [role="switch"]')
              ?.getAttribute("aria-checked") === "false",
          null,
          UI_TIMEOUT_MS,
        );
        check((await pathKind(link)) === null, "link removed", link);
        await clickByRole(session, { role: "switch", name: "Claude Code" });
        await session.waitUntil(
          () =>
            document
              .querySelector('[data-skill-agent="claude-code"] [role="switch"]')
              ?.getAttribute("aria-checked") === "true",
          null,
          UI_TIMEOUT_MS,
        );
        check((await pathKind(link)) === "link", "link restored", link);
        return {};
      },
    ],
    [
      "the two columns align and nothing overflows in both themes",
      async ({ session, t }) => {
        const filterLabel = await t("skills.list.filter");
        const results = {};
        for (const theme of ["light", "dark"]) {
          await emulateColorScheme(session, theme);
          await session.waitUntil(
            () =>
              document
                .getAnimations()
                .every((animation) => animation.playState !== "running"),
            null,
            UI_TIMEOUT_MS,
          );
          const layout = await session.run(readLayout, filterLabel);
          check(
            Math.abs(layout.filterTop - layout.detailTop) < 0.5,
            "list and detail tops differ",
            layout,
          );
          check(
            layout.listRight < layout.detailLeft,
            "columns overlap",
            layout,
          );
          check(
            new Set(layout.rows.map((row) => row.left)).size === 1 &&
              new Set(layout.rows.map((row) => row.right)).size === 1,
            "rows misaligned",
            layout,
          );
          check(layout.pageOverflow === 0, "page overflows", layout);
          results[theme] = { ...layout, rows: layout.rows.length };
        }
        await clearColorScheme(session);
        return results;
      },
    ],
    [
      "removing a skill asks for confirmation and deletes its folder",
      async ({ session, t, workspaceId }) => {
        const [alpha] = (
          await listWorkspaceSkills(session, workspaceId)
        ).filter((skill) => skill.name === "scenario-alpha");
        await clickByRole(session, {
          role: "button",
          name: await t("skills.actions.remove"),
        });
        await clickByRole(session, {
          role: "button",
          name: await t("skills.actions.remove"),
          within: { role: "dialog" },
        });
        await session.waitUntil(
          () =>
            !document.querySelector(
              '[data-skill="scenario-alpha"][data-skill-scope="workspace"]',
            ),
          null,
          UI_TIMEOUT_MS,
        );
        check(
          (await pathKind(alpha.path)) === null,
          "skill folder removed",
          alpha.path,
        );
        const remaining = await listWorkspaceSkills(session, workspaceId);
        check(
          remaining.some((skill) => skill.name === "scenario-beta"),
          "other skill kept",
          remaining.map((skill) => skill.name),
        );
        return {};
      },
    ],
    [
      "a skill left with only broken links explains and cleans them up",
      async ({ session, t, workspaceId }) => {
        const [beta] = (await listWorkspaceSkills(session, workspaceId)).filter(
          (skill) => skill.name === "scenario-beta",
        );
        const workspaceRoot = path.dirname(
          path.dirname(path.dirname(beta.path)),
        );
        const links = await createBrokenLinks(workspaceRoot, BROKEN_SKILL);
        await openSettingsSection(session, "general");
        await openSettingsSection(session, "skills");
        await clickDataRow(
          session,
          `[data-skill="${BROKEN_SKILL}"][data-skill-scope="workspace"]`,
        );
        await waitForDetail(session, BROKEN_SKILL);
        const detail = await session.run(readBrokenDetail, BROKEN_SKILL);
        check(
          links.every((link) => detail.linkRows.includes(link)),
          "every broken link listed once",
          detail.linkRows,
        );
        check(
          detail.text.includes(
            await t("skills.problems.brokenLinkTitle", { count: 2 }),
          ) &&
            detail.text.includes(
              await t("skills.problems.brokenLinkRemovableDescription"),
            ),
          "one merged broken link group",
          detail.text,
        );
        check(
          !detail.text.includes(await t("skills.files.title", { count: 0 })),
          "no empty files section",
          detail.text,
        );
        await clickByRole(session, {
          role: "button",
          name: await t("skills.actions.remove"),
        });
        await waitForRole(session, { role: "dialog" }, UI_TIMEOUT_MS);
        const dialogText = await session.run(
          () => document.querySelector('[role="dialog"]')?.textContent ?? "",
        );
        check(
          dialogText.includes(
            await t("skills.detail.removeBrokenDescription", {
              name: BROKEN_SKILL,
            }),
          ),
          "broken link removal copy",
          dialogText,
        );
        await clickByRole(session, {
          role: "button",
          name: await t("skills.actions.remove"),
          within: { role: "dialog" },
        });
        await session.waitUntil(
          (name) =>
            !document.querySelector(
              `[data-skill="${name}"][data-skill-scope="workspace"]`,
            ),
          BROKEN_SKILL,
          UI_TIMEOUT_MS,
        );
        for (const link of links) {
          check((await pathKind(link)) === null, "broken link removed", link);
        }
        return { links: links.length };
      },
    ],
    [
      "renderer has no errors",
      async ({ session }) => {
        const errors = await session.run(() => window.__scenario.errors);
        check(errors.length === 0, "renderer errors", errors);
        return {};
      },
    ],
  ],
  teardown: async ({ session, workspaceId }) => {
    await removeFixtureSkills(session, workspaceId);
    return {};
  },
});
