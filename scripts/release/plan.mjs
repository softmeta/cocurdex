import { lineByName } from "./lines.mjs";
import {
  formatAppTag,
  nextBetaTag,
  nextServiceTag,
  parseAppTag,
} from "./tags.mjs";

const MAX_LISTED_METHODS = 5;

function hasSignal(changes, label) {
  return changes.some((change) => change.signals.includes(label));
}

function listMethods(methods) {
  const shown = methods.slice(0, MAX_LISTED_METHODS).join(", ");
  const rest = methods.length - MAX_LISTED_METHODS;
  return rest > 0 ? `${shown} and ${rest} more` : shown;
}

function tagStep(lineName, tag, commit, changes) {
  const line = lineByName(lineName);
  return {
    kind: "tag",
    line: lineName,
    tag,
    commit,
    workflow: line.workflow,
    changes,
  };
}

function planApp(facts, plan) {
  const { app, mainSha, host } = facts;
  let latest = app.latest;
  let stableCommit = app.latestStableCommit;

  if (facts.promote) {
    if (latest.beta === null) {
      plan.blockers.push(
        `promote: ${latest.tag} is already stable; there is no beta to promote`,
      );
      return { stableCommit };
    }
    const stable = formatAppTag({ ...latest, beta: null });
    plan.steps.push(tagStep("app", stable, app.latestCommit, []));
    latest = parseAppTag(stable);
    stableCommit = app.latestCommit;
  } else if (latest.beta !== null) {
    plan.notes.push(
      `${latest.tag} (${app.latestDate}) can be promoted to stable; promotion is manual: run --promote`,
    );
  }

  if (app.pending.length === 0) {
    if (!facts.promote) {
      plan.held.push({
        line: "app",
        reason: `no app changes since ${app.latest.tag}`,
      });
    }
    return { stableCommit };
  }
  if (hasSignal(app.pending, "mobile")) {
    if (!host.canRunIosFlows) {
      plan.held.push({
        line: "app",
        reason:
          "the pending changes touch apps/mobile and the iOS flows need an Apple Silicon Mac",
      });
      return { stableCommit };
    }
    plan.steps.push({ kind: "ios-flows", line: "app", commit: mainSha });
  }
  plan.steps.push(
    tagStep("app", nextBetaTag(latest, "patch"), mainSha, app.pending),
  );
  return { stableCommit };
}

function planRelay(facts, plan, { stableCommit }) {
  const { relay, mainSha } = facts;
  if (relay.pending.length === 0) {
    plan.held.push({
      line: "relay",
      reason: `no relay changes since ${relay.last}`,
    });
    return;
  }
  if (!stableCommit) {
    plan.held.push({
      line: "relay",
      reason: "no stable app release serves the web client yet",
    });
    return;
  }
  const missing = relay.missingMethodsAt[stableCommit] ?? [];
  if (missing.length > 0) {
    const unblockedByPromote =
      !facts.promote &&
      facts.app.latest.beta !== null &&
      (relay.missingMethodsAt[facts.app.latestCommit] ?? []).length === 0;
    const hint = unblockedByPromote
      ? `; promoting ${facts.app.latest.tag} would unblock it`
      : "";
    plan.held.push({
      line: "relay",
      reason: `the web client calls daemon methods the stable app lacks: ${listMethods(missing)}${hint}`,
    });
    return;
  }
  const tag = nextServiceTag(lineByName("relay").tagPrefix, relay.last);
  plan.steps.push(tagStep("relay", tag, mainSha, relay.pending));
  plan.steps.push({ kind: "deploy", line: "relay", tag });
}

function planPush(facts, plan) {
  const { push, mainSha } = facts;
  if (!push.last) {
    plan.held.push({
      line: "push",
      reason:
        "never released; the first push gateway release needs a host and APNs credentials, so it is tagged by hand",
    });
    return;
  }
  if (push.pending.length === 0) {
    plan.held.push({
      line: "push",
      reason: `no push changes since ${push.last}`,
    });
    return;
  }
  const tag = nextServiceTag(lineByName("push").tagPrefix, push.last);
  plan.steps.push(tagStep("push", tag, mainSha, push.pending));
}

export function buildPlan(facts) {
  const plan = {
    mainSha: facts.mainSha,
    steps: [],
    held: [],
    blockers: [],
    notes: [],
  };
  if (facts.ci?.status !== "completed" || facts.ci?.conclusion !== "success") {
    const state = facts.ci
      ? `${facts.ci.status} ${facts.ci.conclusion ?? ""}`.trim()
      : "no run";
    plan.blockers.push(
      `CI on main ${facts.mainSha.slice(0, 7)} is ${state}, not a completed success`,
    );
    return plan;
  }
  const skip = new Set(facts.skip ?? []);
  if (skip.has("app") && facts.promote) {
    plan.blockers.push("promote: the app line is skipped");
    return plan;
  }
  for (const line of skip) {
    plan.held.push({ line, reason: "skipped on request" });
  }
  const appResult = skip.has("app")
    ? { stableCommit: facts.app.latestStableCommit }
    : planApp(facts, plan);
  if (!skip.has("relay")) {
    planRelay(facts, plan, appResult);
  }
  if (!skip.has("push")) {
    planPush(facts, plan);
  }
  return plan;
}
