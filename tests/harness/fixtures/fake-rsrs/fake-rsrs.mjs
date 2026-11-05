import { existsSync, readFileSync, writeFileSync } from "node:fs";

const args = process.argv.slice(2).filter((arg) => arg !== "--json");
const command = args[0];
const statePath = process.env.FAKE_RSRS_STATE;
const send = (value) => process.stdout.write(JSON.stringify(value));

const HELP = `rsrs 1.0.0

Commands:
  recall           Recall memories
  remember         Remember something
  show             Show one memory
  list             List memories
  update           Edit a memory
  forget           Delete a memory
  restore          Restore a deleted memory
  history          Show the change log
  memory-revision  Print the library revision
  inject           Distribute the inject source
  prompt           Print the memory workflow
`;

const INJECT_HOSTS = ["claude", "codex", "opencode", "pi"];

function readState() {
  if (!statePath || !existsSync(statePath)) {
    return { revision: 0, live: [], deleted: [], log: [] };
  }
  return JSON.parse(readFileSync(statePath, "utf8"));
}

function writeState(state) {
  if (statePath) writeFileSync(statePath, JSON.stringify(state), "utf8");
}

function flag(name) {
  const index = args.indexOf(`--${name}`);
  return index === -1 ? undefined : args[index + 1];
}

function fail(message) {
  send({
    command: "cli",
    status: "fail",
    summary: { reason: "runtime_error" },
    errors: [message],
  });
  process.exitCode = 1;
}

function record(state, entry, action) {
  state.revision += 1;
  state.log.unshift({
    entry_id: entry.id,
    action,
    title: entry.title,
    actor: "scenario",
    ts: new Date().toISOString(),
  });
  writeState(state);
}

function words(text) {
  return text.toLowerCase().split(/\W+/).filter(Boolean);
}

function recallCommand(state) {
  const query = args.at(-1) ?? "";
  const project = flag("project") ?? null;
  const limit = Number(flag("limit") ?? 8);
  const terms = new Set(words(query));
  const details = state.live
    .filter((entry) => !project || entry.project === project)
    .map((entry) => ({
      entry,
      score: words(`${entry.title} ${entry.content}`).filter((word) =>
        terms.has(word),
      ).length,
    }))
    .filter((match) => match.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ entry, score }) => ({ id: entry.id, title: entry.title, score }));
  state.recalls = [...(state.recalls ?? []), { query, project }];
  writeState(state);
  send({ command, status: "ok", summary: { count: details.length }, details });
}

function rememberCommand(state) {
  const entry = {
    id: `m-${state.revision + 1}`,
    title: flag("title") ?? "",
    content: args.at(-1) ?? "",
    project: flag("project") ?? null,
    tags: (flag("tags") ?? "").split(",").filter(Boolean),
    updated_at: new Date().toISOString(),
  };
  state.live.unshift(entry);
  record(state, entry, "create");
  send({
    command,
    status: "ok",
    summary: { action: "created", id: entry.id, title: entry.title },
  });
}

function injectTargetsCommand(state) {
  const injected = new Set(state.injected ?? []);
  send({
    command,
    status: "ok",
    summary: { count: INJECT_HOSTS.length },
    details: INJECT_HOSTS.map((id) => ({
      id,
      state: injected.has(id) ? "present" : "absent",
    })),
  });
}

function libraryCommand(state) {
  const id = args[1];
  const live = state.live.find((entry) => entry.id === id);
  if (command === "list") {
    const limit = Number(flag("limit") ?? 50);
    const details = state.live.slice(0, limit);
    send({
      command,
      status: "ok",
      summary: { count: details.length },
      details,
    });
    return true;
  }
  if (command === "show") {
    if (!live) {
      fail(`memory #${id} not found`);
      return true;
    }
    send({ command, status: "ok", details: { entry: live } });
    return true;
  }
  if (command === "update") {
    if (!live) {
      fail(`memory #${id} not found`);
      return true;
    }
    if (flag("title") !== undefined) live.title = flag("title");
    if (flag("content") !== undefined) live.content = flag("content");
    if (flag("tags") !== undefined) {
      live.tags = flag("tags").split(",").filter(Boolean);
    }
    live.updated_at = new Date().toISOString();
    record(state, live, "update");
    send({ command, status: "ok", summary: { id } });
    return true;
  }
  if (command === "forget") {
    if (!live) {
      fail(`memory #${id} not found`);
      return true;
    }
    state.live = state.live.filter((entry) => entry.id !== id);
    state.deleted.push(live);
    record(state, live, "delete");
    send({ command, status: "ok", summary: { id } });
    return true;
  }
  if (command === "restore") {
    const deleted = state.deleted.find((entry) => entry.id === id);
    if (!deleted) {
      fail(`memory #${id} is not deleted`);
      return true;
    }
    state.deleted = state.deleted.filter((entry) => entry.id !== id);
    state.live.unshift(deleted);
    record(state, deleted, "restore");
    send({ command, status: "ok", summary: { id } });
    return true;
  }
  if (command === "history") {
    const target = id && !id.startsWith("--") ? id : null;
    const limit = Number(flag("limit") ?? 50);
    const details = state.log
      .filter((row) => !target || row.entry_id === target)
      .slice(0, limit);
    send({ command, status: "ok", details });
    return true;
  }
  if (command === "recall") {
    recallCommand(state);
    return true;
  }
  if (command === "remember") {
    rememberCommand(state);
    return true;
  }
  if (command === "inject" && args.includes("--targets")) {
    injectTargetsCommand(state);
    return true;
  }
  if (command === "memory-revision") {
    send({ command, status: "ok", summary: { revision: state.revision } });
    return true;
  }
  return false;
}

if (command === "--version" || command === "v") {
  process.stdout.write("rsrs 1.0.0\n");
} else if (command === "--help") {
  process.stdout.write(HELP);
} else if (command === "status") {
  send({
    command: "status",
    status: "ok",
    summary: {
      data_dir: "rsrs-scenario",
      autosync: false,
      offline: false,
      remote_configured: false,
      session: {
        user: "local",
        has_session: false,
        has_token: false,
        has_local_keys: true,
      },
      sync_live: { phase: "ok", pending: 0, conflicts: 0, error: "" },
    },
  });
} else if (command === "prompt") {
  process.stdout.write("Fake memory policy.\n");
} else if (command === "doctor") {
  send({
    command: "doctor",
    status: "ok",
    summary: { total: 1, pass: 1, warn: 0, fail: 0, skip: 0, version: "1.0.0" },
    items: [{ name: "store", status: "ok", value: "ok" }],
  });
} else if (!libraryCommand(readState())) {
  send({ command, status: "ok" });
}
