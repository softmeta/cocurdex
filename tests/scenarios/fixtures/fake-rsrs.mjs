const args = process.argv.slice(2);
const command = args[0];
const send = (value) => process.stdout.write(JSON.stringify(value));

if (command === "--version" || command === "v") {
  process.stdout.write("rsrs 1.0.0\n");
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
} else if (command === "doctor") {
  send({
    command: "doctor",
    status: "ok",
    summary: { total: 1, pass: 1, warn: 0, fail: 0, skip: 0, version: "1.0.0" },
    items: [{ name: "store", status: "ok", value: "ok" }],
  });
} else if (command === "list") {
  send({ command: "list", status: "ok", summary: { count: 0 }, details: [] });
} else {
  send({ command, status: "ok" });
}
