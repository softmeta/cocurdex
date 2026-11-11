import { spawnSync } from "node:child_process";
import { gh, git, pushTag, ROOT } from "./git.mjs";
import { lineByName } from "./lines.mjs";

const RUN_APPEAR_TIMEOUT_MS = 5 * 60 * 1000;
const POLL_MS = 10 * 1000;

function describeStep(step) {
  if (step.kind === "ios-flows") {
    return `run the iOS mobile flows on ${step.commit.slice(0, 7)}`;
  }
  if (step.kind === "deploy") {
    return `deploy ${step.tag} on ${lineByName(step.line).deploy.host}`;
  }
  return `tag ${step.tag} at ${step.commit.slice(0, 7)} → ${step.workflow}`;
}

export function formatPlan(plan) {
  const lines = [`Release plan for origin/main ${plan.mainSha.slice(0, 7)}`];
  if (plan.blockers.length > 0) {
    lines.push("", "Blocked:", ...plan.blockers.map((b) => `  - ${b}`));
  }
  if (plan.steps.length > 0) {
    lines.push("", "Steps, in order:");
    plan.steps.forEach((step, index) => {
      lines.push(`  ${index + 1}. [${step.line}] ${describeStep(step)}`);
      for (const change of step.changes ?? []) {
        const flags =
          change.signals.length > 0 ? ` [${change.signals.join(", ")}]` : "";
        lines.push(`       - ${change.label}${flags}`);
      }
    });
  } else if (plan.blockers.length === 0) {
    lines.push("", "Nothing to release.");
  }
  if (plan.held.length > 0) {
    lines.push(
      "",
      "Not released:",
      ...plan.held.map((h) => `  - ${h.line}: ${h.reason}`),
    );
  }
  if (plan.notes.length > 0) {
    lines.push("", "Notes:", ...plan.notes.map((n) => `  - ${n}`));
  }
  return lines.join("\n");
}

function inherit(command, args) {
  const result = spawnSync(command, args, { cwd: ROOT, stdio: "inherit" });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} exited with ${result.status}`,
    );
  }
}

function waitForRunId(workflow, tag) {
  const deadline = Date.now() + RUN_APPEAR_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const out = gh([
      "run",
      "list",
      "--workflow",
      workflow,
      "--branch",
      tag,
      "--limit",
      "1",
      "--json",
      "databaseId",
    ]);
    const [run] = JSON.parse(out);
    if (run) {
      return String(run.databaseId);
    }
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, POLL_MS);
  }
  throw new Error(`${workflow} did not start for ${tag} within 5 minutes`);
}

function verifyRelease(step) {
  const release = JSON.parse(
    gh(["release", "view", step.tag, "--json", "isDraft,isPrerelease,assets"]),
  );
  const expectPrerelease = step.line === "app" && step.tag.includes("-beta.");
  if (
    release.isDraft ||
    release.isPrerelease !== expectPrerelease ||
    release.assets.length === 0
  ) {
    throw new Error(
      `${step.tag} published as draft=${release.isDraft} prerelease=${release.isPrerelease} with ${release.assets.length} assets`,
    );
  }
  console.log(`  ${step.tag} published with ${release.assets.length} assets`);
}

function assertCheckedOut(commit) {
  const head = git(["rev-parse", "HEAD"]);
  const dirty = git(["status", "--porcelain", "--untracked-files=no"]);
  if (head !== commit || dirty) {
    throw new Error(
      `The iOS flows run from this checkout, which must be a clean checkout of ${commit.slice(0, 7)}`,
    );
  }
}

const EXECUTORS = {
  "ios-flows": (step) => {
    assertCheckedOut(step.commit);
    inherit("pnpm", [
      "--filter",
      "@cocurdex/mobile-e2e",
      "flows",
      "--",
      "--platform",
      "ios",
      "--build",
    ]);
  },
  tag: (step) => {
    pushTag(step.tag, step.commit);
    const runId = waitForRunId(step.workflow, step.tag);
    console.log(`  ${step.workflow} run ${runId}`);
    inherit("gh", ["run", "watch", runId, "--exit-status", "--interval", "30"]);
    verifyRelease(step);
  },
  deploy: (step) => {
    const { host, command } = lineByName(step.line).deploy;
    inherit("ssh", [host, command, "deploy", step.tag]);
  },
};

export function executePlan(plan) {
  if (plan.blockers.length > 0) {
    throw new Error("The plan is blocked; nothing was released");
  }
  plan.steps.forEach((step, index) => {
    console.log(
      `\n${index + 1}/${plan.steps.length} [${step.line}] ${describeStep(step)}`,
    );
    EXECUTORS[step.kind](step);
  });
  console.log(
    plan.steps.length > 0 ? "\nAll steps finished." : "\nNothing to release.",
  );
}
