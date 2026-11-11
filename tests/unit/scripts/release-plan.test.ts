import { parseDaemonMethods } from "@scripts/release/lines.mjs";
import { buildPlan as buildPlanUntyped } from "@scripts/release/plan.mjs";
import { parseAppTag } from "@scripts/release/tags.mjs";
import { describe, expect, it } from "vitest";

const MAIN = "a".repeat(40);
const BETA_COMMIT = "b".repeat(40);
const STABLE_COMMIT = "c".repeat(40);

type Change = { label: string; signals: string[] };
type Plan = {
  steps: { kind: string; line: string; tag?: string; commit?: string }[];
  held: { line: string; reason: string }[];
  blockers: string[];
  notes: string[];
};

const buildPlan = (input: ReturnType<typeof facts>): Plan =>
  buildPlanUntyped(input);

const change = (label: string, signals: string[] = []): Change => ({
  label,
  signals,
});

function facts(overrides: {
  promote?: boolean;
  skip?: string[];
  ci?: { status: string; conclusion: string | null } | null;
  canRunIosFlows?: boolean;
  latest?: string;
  latestPublished?: boolean;
  latestCommit?: string;
  appPending?: Change[];
  relayPending?: Change[];
  webLast?: string | null;
  webPending?: Change[];
  missingAtStable?: string[];
  missingAtBeta?: string[];
  pushLast?: string | null;
  pushPending?: Change[];
}) {
  const latest = overrides.latest ?? "v0.1.103-beta.12";
  return {
    mainSha: MAIN,
    promote: overrides.promote ?? false,
    skip: overrides.skip ?? [],
    ci:
      overrides.ci === undefined
        ? { status: "completed", conclusion: "success" }
        : overrides.ci,
    host: { canRunIosFlows: overrides.canRunIosFlows ?? true },
    app: {
      latest: parseAppTag(latest),
      latestCommit: overrides.latestCommit ?? BETA_COMMIT,
      latestPublished: overrides.latestPublished ?? true,
      latestDate: "2026-11-10",
      latestStableCommit: STABLE_COMMIT,
      pending: overrides.appPending ?? [],
    },
    relay: {
      last: "relay-v0.2.2",
      pending: overrides.relayPending ?? [],
    },
    web: {
      last: overrides.webLast === undefined ? "web-v0.1.0" : overrides.webLast,
      pending: overrides.webPending ?? [],
      missingMethodsAt: {
        [STABLE_COMMIT]: overrides.missingAtStable ?? [],
        [BETA_COMMIT]: overrides.missingAtBeta ?? [],
      },
    },
    push: {
      last:
        overrides.pushLast === undefined ? "push-v0.1.0" : overrides.pushLast,
      pending: overrides.pushPending ?? [],
    },
  };
}

const stepSummary = (plan: Plan) =>
  plan.steps.map((step) => `${step.kind}:${step.line}:${step.tag ?? ""}`);

describe("buildPlan", () => {
  it("releases nothing while main CI is not green", () => {
    const plan = buildPlan(
      facts({
        ci: { status: "in_progress", conclusion: null },
        appPending: [change("#1 fix")],
      }),
    );
    expect(plan.steps).toEqual([]);
    expect(plan.blockers).toHaveLength(1);
  });

  it("cuts the next beta of the open line at the main tip", () => {
    const plan = buildPlan(facts({ appPending: [change("#1 fix")] }));
    expect(stepSummary(plan)).toEqual(["tag:app:v0.1.103-beta.13"]);
    expect(plan.steps[0].commit).toBe(MAIN);
    expect(plan.notes.join()).toContain(
      "v0.1.103-beta.12 (2026-11-10) can be promoted",
    );
  });

  it("opens a new beta line after a stable release", () => {
    const plan = buildPlan(
      facts({ latest: "v0.1.103", appPending: [change("#1 fix")] }),
    );
    expect(stepSummary(plan)).toEqual(["tag:app:v0.1.104-beta.1"]);
  });

  it("runs the iOS flows before a beta that touches apps/mobile", () => {
    const plan = buildPlan(
      facts({ appPending: [change("#1 mobile fix", ["mobile"])] }),
    );
    expect(stepSummary(plan)).toEqual([
      "ios-flows:app:",
      "tag:app:v0.1.103-beta.13",
    ]);
  });

  it("holds a mobile beta on a host that cannot run the iOS flows", () => {
    const plan = buildPlan(
      facts({
        canRunIosFlows: false,
        appPending: [change("#1 mobile fix", ["mobile"])],
      }),
    );
    expect(plan.steps).toEqual([]);
    expect(plan.held.map((h) => h.line)).toContain("app");
  });

  it("promotes the beta commit unchanged, then opens the next line with pending work", () => {
    const plan = buildPlan(
      facts({ promote: true, appPending: [change("#2 later fix")] }),
    );
    expect(stepSummary(plan)).toEqual([
      "tag:app:v0.1.103",
      "tag:app:v0.1.104-beta.1",
    ]);
    expect(plan.steps[0].commit).toBe(BETA_COMMIT);
    expect(plan.steps[1].commit).toBe(MAIN);
  });

  it("refuses to promote when the latest app tag is already stable", () => {
    const plan = buildPlan(facts({ promote: true, latest: "v0.1.103" }));
    expect(plan.blockers.join()).toContain("already stable");
  });

  it("holds the web client while it needs methods the stable app lacks", () => {
    const plan = buildPlan(
      facts({
        webPending: [change("#3 web change")],
        missingAtStable: ["issue.views.list"],
        missingAtBeta: [],
      }),
    );
    expect(plan.steps).toEqual([]);
    const web = plan.held.find((h) => h.line === "web");
    expect(web?.reason).toContain("issue.views.list");
    expect(web?.reason).toContain(
      "promoting v0.1.103-beta.12 would unblock it",
    );
  });

  it("releases and deploys the web client after the promotion that serves its methods", () => {
    const plan = buildPlan(
      facts({
        promote: true,
        webPending: [change("#3 web change")],
        missingAtStable: ["issue.views.list"],
        missingAtBeta: [],
      }),
    );
    expect(stepSummary(plan)).toEqual([
      "tag:app:v0.1.103",
      "tag:web:web-v0.1.1",
      "deploy:web:web-v0.1.1",
    ]);
  });

  it("releases the web client and the relay with the app", () => {
    const plan = buildPlan(
      facts({
        appPending: [change("#1 fix")],
        webPending: [change("#1 fix")],
        relayPending: [change("#2 relay fix")],
      }),
    );
    expect(stepSummary(plan)).toEqual([
      "tag:app:v0.1.103-beta.13",
      "tag:web:web-v0.1.1",
      "deploy:web:web-v0.1.1",
      "tag:relay:relay-v0.2.3",
      "deploy:relay:relay-v0.2.3",
    ]);
  });

  it("releases the relay regardless of the methods the web client needs", () => {
    const plan = buildPlan(
      facts({
        relayPending: [change("#2 relay fix")],
        webPending: [change("#3 web change")],
        missingAtStable: ["issue.views.list"],
      }),
    );
    expect(stepSummary(plan)).toEqual([
      "tag:relay:relay-v0.2.3",
      "deploy:relay:relay-v0.2.3",
    ]);
  });

  it("never cuts the first web release, and holds the relay that stopped serving it", () => {
    const plan = buildPlan(
      facts({
        webLast: null,
        webPending: [change("#3 web change")],
        relayPending: [change("#2 relay fix")],
      }),
    );
    expect(plan.steps).toEqual([]);
    expect(plan.held.find((h) => h.line === "web")?.reason).toContain(
      "never released",
    );
    expect(plan.held.find((h) => h.line === "relay")?.reason).toContain(
      "first web release",
    );
  });

  it("never cuts the first push gateway release", () => {
    const plan = buildPlan(
      facts({ pushLast: null, pushPending: [change("#4 gateway")] }),
    );
    expect(plan.steps).toEqual([]);
    expect(plan.held.find((h) => h.line === "push")?.reason).toContain(
      "never released",
    );
  });

  it("cuts the next push gateway patch once it has shipped before", () => {
    const plan = buildPlan(facts({ pushPending: [change("#4 gateway")] }));
    expect(stepSummary(plan)).toEqual(["tag:push:push-v0.1.1"]);
  });
});

describe("buildPlan when the latest beta never published", () => {
  it("refuses to promote it", () => {
    const plan = buildPlan(facts({ promote: true, latestPublished: false }));
    expect(plan.steps).toEqual([]);
    expect(plan.blockers.join()).toContain(
      "v0.1.103-beta.12 has no published release",
    );
  });

  it("cuts the next beta on a newer main tip even without app changes", () => {
    const plan = buildPlan(facts({ latestPublished: false }));
    expect(stepSummary(plan)).toEqual(["tag:app:v0.1.103-beta.13"]);
    expect(plan.notes.join()).not.toContain("can be promoted");
  });

  it("blocks when main has not moved, since mobile build numbers would repeat", () => {
    const plan = buildPlan(
      facts({ latestPublished: false, latestCommit: MAIN }),
    );
    expect(plan.steps).toEqual([]);
    expect(plan.blockers.join()).toContain("merge a commit");
  });
});

describe("buildPlan with skipped lines", () => {
  it("holds a skipped line and still plans the others", () => {
    const plan = buildPlan(
      facts({
        skip: ["relay"],
        appPending: [change("#1 fix")],
        relayPending: [change("#2 relay fix")],
      }),
    );
    expect(stepSummary(plan)).toEqual(["tag:app:v0.1.103-beta.13"]);
    expect(plan.held).toContainEqual({
      line: "relay",
      reason: "skipped on request",
    });
  });

  it("refuses to promote a skipped app line", () => {
    const plan = buildPlan(facts({ promote: true, skip: ["app"] }));
    expect(plan.steps).toEqual([]);
    expect(plan.blockers).toHaveLength(1);
  });
});

describe("parseDaemonMethods", () => {
  it("reads every method key of the scope table", () => {
    const source = `export const DAEMON_METHOD_SCOPES: Record<DaemonMethod, HostAccessScope> = {
  "daemon.status": "read",
  "agent.setEnabled": "host.admin",
};`;
    expect([...parseDaemonMethods(source)]).toEqual([
      "daemon.status",
      "agent.setEnabled",
    ]);
  });
});
